import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/appStore';
import type { ModelConfig, Conversation, Message } from '../types';

export default function ChatPage() {
  const {
    activeAccountId, models, activeModel, setActiveModel,
    conversations, activeConversationId, messages,
    streaming, streamingContent, error,
    sendMessage, selectConversation, newConversation,
  } = useStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;
    const msg = input.trim();
    setInput('');
    await sendMessage(msg);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeAccountId) {
    return (
      <div className="chat-page">
        <div className="empty-state">请先在左侧选择或添加账号</div>
      </div>
    );
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <select value={activeModel} onChange={e => setActiveModel(e.target.value)}>
          {models.map((m: ModelConfig) => (
            <option key={m.model} value={m.model}>
              {m.name} {m.isDefault ? '(默认)' : ''} {m.isNew ? '(新)' : ''}
            </option>
          ))}
          {models.length === 0 && <option value={activeModel}>{activeModel}</option>}
        </select>
        <button className="btn-new" onClick={newConversation}>新建对话</button>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {conversations.slice(0, 5).map((c: Conversation) => (
            <button
              key={c.id}
              className="btn-new"
              style={{
                background: c.id === activeConversationId ? '#4a6cf7' : undefined,
                color: c.id === activeConversationId ? '#fff' : undefined,
                fontSize: 12,
                padding: '4px 8px',
              }}
              onClick={() => selectConversation(c.id)}
              title={c.title || '对话'}
            >
              {(c.title || '对话').slice(0, 10)}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="error-bar">{error}</div>}

      <div className="messages">
        {messages.length === 0 && !streaming && (
          <div className="empty-state">开始新的对话吧</div>
        )}
        {messages.map((m: Message, i: number) => (
          <div key={i} className={`message ${m.role}`}>
            {m.content}
          </div>
        ))}
        {streaming && streamingContent && (
          <div className="message assistant streaming">
            {streamingContent}<span className="cursor" />
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息..."
          disabled={streaming}
          rows={1}
        />
        <button onClick={handleSend} disabled={streaming || !input.trim()}>
          {streaming ? '生成中...' : '发送'}
        </button>
      </div>
    </div>
  );
}
