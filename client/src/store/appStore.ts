import { create } from 'zustand';
import type { Account, Conversation, Message, ModelConfig } from '../types';
import { api } from '../api/client';

interface AppStore {
  // 账号
  accounts: Account[];
  activeAccountId: string | null;
  // 模型
  models: ModelConfig[];
  activeModel: string;
  // 会话
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  // 聊天状态
  streaming: boolean;
  streamingContent: string;
  error: string | null;

  // Actions
  loadAccounts: () => Promise<void>;
  setActiveAccount: (id: string) => Promise<void>;
  createAccount: (name: string, token: string, cookie?: string) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  setActiveModel: (model: string) => void;
  loadConversations: () => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  newConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
}

export const useStore = create<AppStore>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  models: [
    { name: 'mimo-v2-pro', model: 'clawl-alpha', temperature: 0.8, topP: 0.95, thinkingDefaultOn: true },
    { name: 'mimo-v2-flash', model: 'mimo-v2-flash-studio', temperature: 0.8, topP: 0.95, thinkingDefaultOn: true, isDefault: true },
  ],
  activeModel: 'mimo-v2-flash-studio',
  conversations: [],
  activeConversationId: null,
  messages: [],
  streaming: false,
  streamingContent: '',
  error: null,

  loadAccounts: async () => {
    const accounts = await api.getAccounts();
    set({ accounts });
    if (accounts.length > 0 && !get().activeAccountId) {
      await get().setActiveAccount(accounts[0].id);
    }
  },

  setActiveAccount: async (id: string) => {
    set({ activeAccountId: id, conversations: [], messages: [], activeConversationId: null });
    try {
      const modelsData = await api.getModels(id) as { data?: { modelConfigListNg?: ModelConfig[] } };
      const remote: ModelConfig[] = modelsData?.data?.modelConfigListNg || [];
      // 合并：硬编码模型为基础，接口返回的补充/覆盖
      const base = get().models;
      const remoteModels = remote.filter(r => !base.some(b => b.model === r.model));
      const merged = [...base, ...remoteModels];
      set({ models: merged });
      const defaultModel = merged.find(m => m.isDefault) || merged[0];
      set({ activeModel: defaultModel.model });
    } catch (e) {
      console.error('Failed to load models:', e);
    }
    await get().loadConversations();
  },

  createAccount: async (name: string, token: string, cookie?: string) => {
    await api.createAccount(name, token, cookie);
    await get().loadAccounts();
  },

  deleteAccount: async (id: string) => {
    await api.deleteAccount(id);
    const { activeAccountId } = get();
    if (activeAccountId === id) {
      set({ activeAccountId: null, models: [], conversations: [], messages: [] });
    }
    await get().loadAccounts();
  },

  setActiveModel: (model: string) => set({ activeModel: model }),

  loadConversations: async () => {
    const { activeAccountId } = get();
    if (!activeAccountId) return;
    const conversations = await api.getConversations(activeAccountId);
    set({ conversations });
  },

  selectConversation: async (id: string) => {
    const messages = await api.getMessages(id);
    set({ activeConversationId: id, messages });
  },

  newConversation: () => {
    set({ activeConversationId: null, messages: [] });
  },

  deleteConversation: async (id: string) => {
    await api.deleteConversation(id);
    const { activeConversationId } = get();
    if (activeConversationId === id) {
      set({ activeConversationId: null, messages: [] });
    }
    await get().loadConversations();
  },

  sendMessage: async (content: string) => {
    const { activeAccountId, activeModel, activeConversationId, messages } = get();
    if (!activeAccountId) {
      set({ error: '请先选择账号' });
      return;
    }

    const userMessage: Message = {
      id: Date.now(),
      conversation_id: activeConversationId || '',
      role: 'user',
      content,
      created_at: Date.now(),
    };
    set({ messages: [...messages, userMessage], streaming: true, streamingContent: '', error: null });

    try {
      const chatMessages = [...messages, userMessage].map(m => ({ role: m.role, content: m.content }));
      const response = await api.chat(activeAccountId, activeModel, chatMessages, activeConversationId || undefined);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let convId = activeConversationId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('event: conversationId')) {
            continue;
          }
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (parsed.conversationId) {
                convId = parsed.conversationId;
              }
              if (parsed.content) {
                assistantContent += parsed.content;
                set({ streamingContent: assistantContent });
              }
            } catch {
              // 非 JSON，可能是纯文本
            }
          }
        }
      }

      // 处理 buffer 中剩余的数据
      if (buffer.trim()) {
        for (const line of buffer.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.content) {
                assistantContent += parsed.content;
                set({ streamingContent: assistantContent });
              }
            } catch { /* ignore */ }
          }
        }
      }

      const assistantMessage: Message = {
        id: Date.now() + 1,
        conversation_id: convId || '',
        role: 'assistant',
        content: assistantContent || '(无响应内容)',
        created_at: Date.now(),
      };

      set((state: AppStore) => ({
        messages: [...state.messages, assistantMessage],
        streaming: false,
        streamingContent: '',
        activeConversationId: convId,
      }));

      await get().loadConversations();
    } catch (err: any) {
      set({ streaming: false, streamingContent: '', error: err.message || '发送失败' });
    }
  },
}));
