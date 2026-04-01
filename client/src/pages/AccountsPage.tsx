import { useState } from 'react';
import { useStore } from '../store/appStore';

export default function AccountsPage() {
  const { accounts, createAccount, deleteAccount } = useStore();
  const [name, setName] = useState('');
  const [token, setToken] = useState('');
  const [cookie, setCookie] = useState('');
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !token.trim()) return;
    setCreating(true);
    try {
      await createAccount(name.trim(), token.trim(), cookie.trim());
      setName('');
      setToken('');
      setCookie('');
    } catch (err: any) {
      alert('创建失败: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除这个账号吗？')) return;
    try {
      await deleteAccount(id);
    } catch (err: any) {
      alert('删除失败: ' + err.message);
    }
  };

  return (
    <div className="accounts-page">
      <h2>账号管理</h2>

      <div className="account-form">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="账号名称"
        />
        <input
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Token (xiaomichatbot_ph 值)"
        />
        <textarea
          value={cookie}
          onChange={e => setCookie(e.target.value)}
          placeholder="Cookie（从浏览器 F12 → Network → Request Headers → Cookie 复制整行）"
          rows={3}
          style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 12 }}
        />
        <button onClick={handleCreate} disabled={creating || !name.trim() || !token.trim()}>
          {creating ? '添加中...' : '添加账号'}
        </button>
      </div>

      <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 13 }}>
        <strong>如何获取 Cookie：</strong>
        <ol style={{ margin: '6px 0 0 20px', lineHeight: 1.8 }}>
          <li>浏览器打开 <a href="https://aistudio.xiaomimimo.com" target="_blank">aistudio.xiaomimimo.com</a> 并登录</li>
          <li>按 F12 打开开发者工具 → Network 标签</li>
          <li>刷新页面，随便点一个请求</li>
          <li>在 Request Headers 找到 <code>Cookie:</code> 那一行</li>
          <li>复制整行 Cookie 值粘贴到上面的输入框</li>
        </ol>
      </div>

      <div className="account-list">
        {accounts.map(a => (
          <div key={a.id} className="account-card">
            <div className="account-info">
              <div className="account-name">{a.name}</div>
              <div className="account-token">Token: {a.token.slice(0, 20)}...</div>
              {a.cookie && <div className="account-token" style={{ color: '#52c41a' }}>Cookie: 已设置</div>}
              {!a.cookie && <div className="account-token" style={{ color: '#ff4d4f' }}>Cookie: 未设置</div>}
            </div>
            <button onClick={() => handleDelete(a.id)}>删除</button>
          </div>
        ))}
        {accounts.length === 0 && (
          <div style={{ color: '#999', textAlign: 'center', padding: 40 }}>
            还没有账号，请添加一个
          </div>
        )}
      </div>
    </div>
  );
}
