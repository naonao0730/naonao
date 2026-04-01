import type { Account, Conversation, Message } from '../types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// 账号
export const api = {
  // 账号管理
  getAccounts: () => request<Account[]>('/accounts'),
  createAccount: (name: string, token: string, cookie?: string) =>
    request<Account>('/accounts', { method: 'POST', body: JSON.stringify({ name, token, cookie }) }),
  updateAccount: (id: string, name?: string, token?: string) =>
    request<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ name, token }) }),
  deleteAccount: (id: string) =>
    request<{ success: boolean }>(`/accounts/${id}`, { method: 'DELETE' }),
  getProfile: (accountId: string) =>
    request(`/accounts/${accountId}/profile`),
  getModels: (accountId: string) =>
    request(`/accounts/${accountId}/models`),

  // 会话
  getConversations: (accountId: string) =>
    request<Conversation[]>(`/conversations?accountId=${accountId}`),
  getMessages: (conversationId: string) =>
    request<Message[]>(`/conversations/${conversationId}/messages`),
  deleteConversation: (id: string) =>
    request<{ success: boolean }>(`/conversations/${id}`, { method: 'DELETE' }),

  // 聊天 (返回 fetch Response 用于 SSE 流)
  chat: (accountId: string, model: string, messages: Array<{ role: string; content: string }>, conversationId?: string) =>
    fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, model, messages, conversationId }),
    }),

  // Claw 工作空间
  createClaw: (accountId: string) =>
    request('/claw/create', { method: 'POST', body: JSON.stringify({ accountId }) }),
  destroyClaw: (accountId: string) =>
    request('/claw/destroy', { method: 'POST', body: JSON.stringify({ accountId }) }),
  getClawStatus: (accountId: string) =>
    request(`/claw/status?accountId=${accountId}`),
  getClawTicket: (accountId: string) =>
    request(`/claw/ticket?accountId=${accountId}`),
  getClawFiles: (accountId: string) =>
    request(`/claw/files?accountId=${accountId}`),

  // 安装 uv (返回 SSE 流)
  installUv: (accountId: string) =>
    fetch(`${BASE}/claw/install-uv`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    }),

  // 查询安装状态
  getInstallStatus: (accountId: string) =>
    request<any>(`/claw/install-status?accountId=${accountId}`),

  // 自动续期
  startAutoRenew: () =>
    request<{ running: boolean }>('/claw/auto-renew/start', { method: 'POST' }),
  stopAutoRenew: () =>
    request<{ running: boolean }>('/claw/auto-renew/stop', { method: 'POST' }),
  getAutoRenewStatus: () =>
    request<{ running: boolean; accounts: Array<{ account_id: string; status: string; error: string | null; updated_at: number }> }>('/claw/auto-renew/status'),

  // API 中转
  getChannels: () => request<any[]>('/proxy/channels'),
  deleteChannel: (id: string) =>
    request<{ success: boolean }>(`/proxy/channels/${id}`, { method: 'DELETE' }),
  getApiKeys: () => request<any[]>('/proxy/keys'),
  deleteApiKey: (id: string) =>
    request<{ success: boolean }>(`/proxy/keys/${id}`, { method: 'DELETE' }),
};
