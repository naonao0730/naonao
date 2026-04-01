import { useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

interface Channel {
  id: string;
  account_id: string;
  name: string;
  provider: string;
  base_url: string;
  api_key: string | null;
  model_whitelist: string | null;
  is_active: number;
  expire_time: number | null;
  key_count: number;
  created_at: number;
}

interface ApiKeyItem {
  id: string;
  channel_id: string;
  name: string;
  key_value: string;
  channel_name?: string;
  expired: boolean;
  is_active: number;
  expire_time: number | null;
  created_at: number;
}

function formatTime(ts: number | null): string {
  if (!ts) return '—';
  const diff = ts - Date.now();
  if (diff <= 0) return '已过期';
  const min = Math.floor(diff / 60000);
  const sec = Math.floor((diff % 60000) / 1000);
  return `${min}分${sec}秒`;
}

function ChannelSection({ channels }: { channels: Channel[] }) {
  return (
    <div className="proxy-section">
      <h3>通道管理</h3>
      <div className="channel-list">
        {channels.length === 0 && <div className="empty-hint">暂无通道，先创建工作空间并运行安装 uv</div>}
        {channels.map(ch => (
          <div key={ch.id} className={`channel-card ${ch.is_active ? '' : 'disabled'}`}>
            <div className="channel-info">
              <span className="channel-name">{ch.name}</span>
              <span className="channel-provider">{ch.provider}</span>
              <span className="channel-url">{ch.base_url}</span>
              <span className="channel-keys">{ch.key_count} 个 Key</span>
              <span className={`channel-status ${ch.is_active ? 'active' : 'inactive'}`}>
                {ch.is_active ? '启用' : '禁用'}
              </span>
              {ch.expire_time && (
                <span className={`channel-expire ${Date.now() > ch.expire_time ? 'expired' : ''}`}>
                  {formatTime(ch.expire_time)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function KeySection({ keys, reload }: { keys: ApiKeyItem[]; reload: () => void }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除该 Key？')) return;
    try {
      await api.deleteApiKey(id);
      reload();
    } catch (err: any) { alert('删除失败: ' + err.message); }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className="proxy-section">
      <h3>虚拟 Key 管理</h3>
      <div className="key-list">
        {keys.length === 0 && <div className="empty-hint">暂无虚拟 Key，运行安装 uv 后自动生成</div>}
        {keys.map(k => (
          <div key={k.id} className={`key-card ${k.expired ? 'key-expired' : ''}`}>
            <div className="key-info">
              <span className="key-channel">← {k.channel_name || '未知'}</span>
              {k.expire_time && (
                <span className={`key-expire ${k.expired ? 'expired' : ''}`}>
                  {formatTime(k.expire_time)}
                </span>
              )}
            </div>
            <div className="key-value-row">
              <code className="key-value">{k.key_value}</code>
              <button className="copy-btn" onClick={() => handleCopy(k.key_value, k.id)}>
                {copiedId === k.id ? '已复制' : '复制'}
              </button>
              <button className="btn-danger" onClick={() => handleDelete(k.id)}>删除</button>
            </div>
          </div>
        ))}
      </div>

      {keys.length > 0 && (
        <div className="proxy-usage">
          <h4>使用方式</h4>
          <pre>{`curl -X POST http://localhost:3001/v1/chat/completions \\
  -H "Authorization: Bearer ${keys[0]?.key_value || 'sk-mimo-xxx'}" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"mimo-v2-pro","messages":[{"role":"user","content":"hello"}],"stream":true}'`}</pre>
        </div>
      )}
    </div>
  );
}

const RENEW_STATUS_LABELS: Record<string, string> = {
  idle: '空闲',
  waiting: '等待 5 分钟冷却中...',
  destroying: '正在销毁旧容器...',
  creating: '正在创建新容器...',
  installing: '正在安装 uv...',
  error: '续期出错',
};

function AutoRenewSection() {
  const [running, setRunning] = useState(false);
  const [accounts, setAccounts] = useState<Array<{ account_id: string; status: string; error: string | null }>>([]);

  const load = useCallback(() => {
    api.getAutoRenewStatus().then(data => {
      setRunning(data.running);
      setAccounts(data.accounts);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [load]);

  const toggle = async () => {
    try {
      if (running) {
        const res = await api.stopAutoRenew();
        setRunning(res.running);
      } else {
        const res = await api.startAutoRenew();
        setRunning(res.running);
      }
    } catch (err: any) {
      alert('操作失败: ' + err.message);
    }
  };

  const activeAccounts = accounts.filter(a => a.status !== 'idle');

  return (
    <div className="proxy-section">
      <div className="auto-renew-header">
        <h3>自动续期</h3>
        <button className={running ? 'btn-danger' : 'btn-primary'} onClick={toggle}>
          {running ? '停止续期' : '启动续期'}
        </button>
      </div>
      <div className="auto-renew-status">
        <span className={`renew-indicator ${running ? 'active' : ''}`}>
          {running ? '运行中' : '已停止'}
        </span>
      </div>
      {activeAccounts.length > 0 && (
        <div className="renew-accounts">
          {activeAccounts.map(a => (
            <div key={a.account_id} className={`renew-account-card renew-${a.status}`}>
              <span className="renew-account-name">{a.account_id.slice(0, 8)}...</span>
              <span className="renew-account-status">{RENEW_STATUS_LABELS[a.status] || a.status}</span>
              {a.error && <span className="renew-error">{a.error}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ApiProxyPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);

  const load = useCallback(() => {
    api.getChannels().then(setChannels).catch(() => {});
    api.getApiKeys().then(setKeys).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="proxy-page">
      <h2>API 中转</h2>
      <AutoRenewSection />
      <ChannelSection channels={channels} />
      <KeySection keys={keys} reload={load} />
    </div>
  );
}
