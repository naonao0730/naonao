import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '../store/appStore';
import { api } from '../api/client';

interface ClawState {
  status: string;
  expireTime: number | null;
  files: Array<{ name: string; type: string }>;
  loading: boolean;
  installing: boolean;
  installLogs: string[];
  installResult: { shortCodes: string[]; apiKeys: string[] } | null;
}

function ClawCard({ accountId, accountName }: { accountId: string; accountName: string }) {
  const [state, setState] = useState<ClawState>({
    status: 'NOT_CREATED',
    expireTime: null,
    files: [],
    loading: false,
    installing: false,
    installLogs: [],
    installResult: null,
  });
  const [remain, setRemain] = useState('');

  const updateState = (partial: Partial<ClawState>) => {
    setState(prev => ({ ...prev, ...partial }));
  };

  const pollStatus = useCallback(async () => {
    try {
      const res = await api.getClawStatus(accountId) as any;
      const s = res?.data?.status || 'NOT_CREATED';
      updateState({
        status: s,
        expireTime: res?.data?.expireTime || null,
      });
      return s;
    } catch {
      return 'UNKNOWN';
    }
  }, [accountId]);

  useEffect(() => {
    pollStatus();
    // 加载持久化的安装状态
    api.getInstallStatus(accountId).then((s: any) => {
      if (s) {
        updateState({
          installLogs: s.logs || [],
          installResult: s.result || null,
          installing: s.status === 'running',
        });
      }
    }).catch(() => {});
  }, [pollStatus]);

  // 倒计时 + 过期自动刷新
  useEffect(() => {
    if (!state.expireTime || state.status !== 'AVAILABLE') {
      setRemain('');
      return;
    }
    const tick = () => {
      const diff = state.expireTime! - Date.now();
      if (diff <= 0) {
        setRemain('已过期');
        pollStatus();
        return false;
      }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemain(`${m}分${s}秒`);
      return true;
    };
    if (!tick()) return;
    const timer = setInterval(() => { if (!tick()) clearInterval(timer); }, 1000);
    return () => clearInterval(timer);
  }, [state.expireTime, state.status, pollStatus]);

  const handleCreate = async () => {
    if (state.loading) return;
    updateState({ loading: true });
    try {
      await api.createClaw(accountId);
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const s = await pollStatus();
        if (s === 'AVAILABLE') break;
      }
    } catch (err: any) {
      alert('创建失败: ' + err.message);
    } finally {
      updateState({ loading: false });
    }
  };

  const handleDestroy = async () => {
    if (state.loading) return;
    updateState({ loading: true });
    try {
      await api.destroyClaw(accountId);
      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const s = await pollStatus();
        if (s === 'DESTROYED' || s === 'NOT_CREATED') break;
      }
      updateState({ files: [] });
    } catch (err: any) {
      alert('销毁失败: ' + err.message);
    } finally {
      updateState({ loading: false });
    }
  };

  const handleLoadFiles = async () => {
    try {
      const res = await api.getClawFiles(accountId) as any;
      updateState({ files: res?.data?.items || [] });
    } catch (err: any) {
      alert('获取文件列表失败: ' + err.message);
    }
  };

  const handleInstallUv = async () => {
    if (state.installing) return;
    updateState({ installing: true, installLogs: [], installResult: null });

    try {
      const response = await api.installUv(accountId);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';
      const logs: string[] = [];
      let result: { shortCodes: string[]; apiKeys: string[] } | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        buffer += text;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const data = line.slice(6);
            try {
              const parsed = JSON.parse(data);
              if (currentEvent === 'log' && parsed.log) {
                logs.push(parsed.log);
                updateState({ installLogs: [...logs] });
              } else if (currentEvent === 'result') {
                result = { shortCodes: parsed.shortCodes, apiKeys: parsed.apiKeys };
                updateState({ installResult: result });
              } else if (currentEvent === 'error') {
                logs.push(`错误: ${parsed.error}`);
                updateState({ installLogs: [...logs] });
              }
            } catch { /* ignore */ }
            currentEvent = '';
          }
        }
      }

      if (buffer.trim()) {
        for (const line of buffer.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(line.slice(6));
              if (parsed.log) {
                logs.push(parsed.log);
                updateState({ installLogs: [...logs] });
              }
              if (parsed.shortCodes) {
                result = { shortCodes: parsed.shortCodes, apiKeys: parsed.apiKeys };
                updateState({ installResult: result });
              }
              if (parsed.error) {
                logs.push(`错误: ${parsed.error}`);
                updateState({ installLogs: [...logs] });
              }
            } catch { /* ignore */ }
          }
        }
      }
    } catch (err: any) {
      updateState({ installLogs: [...state.installLogs, `错误: ${err.message}`] });
    } finally {
      updateState({ installing: false });
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      const el = document.activeElement as HTMLElement;
      if (el) {
        const orig = el.textContent;
        el.textContent = '已复制';
        setTimeout(() => { el.textContent = orig; }, 1000);
      }
    });
  };

  const { status, expireTime, files, loading, installing, installLogs, installResult } = state;

  return (
    <div className="claw-card">
      <div className="claw-card-header">
        <span className="claw-account-name">{accountName}</span>
        <span className={`status-label status-${status}`}>{status}</span>
      </div>

      {expireTime && status === 'AVAILABLE' && (
        <div style={{ fontSize: 13, color: '#666', marginBottom: 8 }}>
          剩余时间: <span style={{ color: remain === '已过期' ? '#dc3545' : '#333', fontWeight: 600 }}>{remain}</span>
        </div>
      )}

      <div className="claw-controls">
        <button className="btn-create" onClick={handleCreate} disabled={loading || status === 'AVAILABLE' || status === 'CREATING'}>
          {loading ? '操作中...' : '创建'}
        </button>
        <button className="btn-destroy" onClick={handleDestroy} disabled={loading || status !== 'AVAILABLE'}>
          销毁
        </button>
        {status === 'AVAILABLE' && (
          <button className="btn-new" onClick={handleLoadFiles}>
            文件列表
          </button>
        )}
        {status === 'AVAILABLE' && (
          <button className="btn-install-uv" onClick={handleInstallUv} disabled={installing}>
            {installing ? '安装中...' : '安装 uv'}
          </button>
        )}
      </div>

      {files.length > 0 && (
        <div className="claw-files">
          <h4 style={{ marginBottom: 8 }}>工作空间文件</h4>
          <ul className="file-list">
            {files.map((f, i) => (
              <li key={i}>
                {f.type === 'directory' ? '[DIR]' : '[FILE]'} {f.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(installLogs.length > 0 || installResult) && (
        <div className="install-section">
          <h4 style={{ marginBottom: 8 }}>安装 uv</h4>
          {installLogs.length > 0 && (
            <div className="install-logs">
              {installLogs.map((log, i) => (
                <div key={i} className="log-line">{log}</div>
              ))}
            </div>
          )}
          {installResult && (
            <div className="install-result">
              <h4>提取结果</h4>
              {installResult.shortCodes.map((code, i) => (
                <div key={i} className="api-key-row">
                  <span className="short-code">短码: {code}</span>
                  {installResult.apiKeys[i] ? (
                    <>
                      <code className="api-key-value">{installResult.apiKeys[i]}</code>
                      <button className="copy-btn" onClick={() => handleCopy(installResult.apiKeys[i])}>
                        复制
                      </button>
                    </>
                  ) : (
                    <span className="no-key">未获取到 Key</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ClawPage() {
  const { accounts } = useStore();

  if (accounts.length === 0) {
    return (
      <div className="claw-page">
        <h2>工作空间管理</h2>
        <div className="empty-state">请先添加账号</div>
      </div>
    );
  }

  return (
    <div className="claw-page">
      <h2>工作空间管理</h2>
      <div className="claw-grid">
        {accounts.map(acc => (
          <ClawCard key={acc.id} accountId={acc.id} accountName={acc.name} />
        ))}
      </div>
    </div>
  );
}
