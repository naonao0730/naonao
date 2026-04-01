import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { useStore } from './store/appStore';
import type { Account } from './types';
import ChatPage from './pages/ChatPage';
import AccountsPage from './pages/AccountsPage';
import ClawPage from './pages/ClawPage';
import ApiProxyPage from './pages/ApiProxyPage';
import './App.css';

export default function App() {
  const { accounts, activeAccountId, loadAccounts, setActiveAccount } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccounts().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="loading">加载中...</div>;
  }

  return (
    <BrowserRouter>
      <div className="app">
        <aside className="sidebar">
          <div className="sidebar-header">
            <h1>MiMo Studio</h1>
          </div>

          <div className="account-selector">
            <select
              value={activeAccountId || ''}
              onChange={e => setActiveAccount(e.target.value)}
            >
              <option value="">选择账号</option>
              {accounts.map((a: Account) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <nav className="nav">
            <NavLink to="/" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'} end>
              聊天
            </NavLink>
            <NavLink to="/claw" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              工作空间
            </NavLink>
            <NavLink to="/proxy" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              API 中转
            </NavLink>
            <NavLink to="/accounts" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
              账号管理
            </NavLink>
          </nav>
        </aside>

        <main className="main">
          <Routes>
            <Route path="/" element={<ChatPage />} />
            <Route path="/claw" element={<ClawPage />} />
            <Route path="/proxy" element={<ApiProxyPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
