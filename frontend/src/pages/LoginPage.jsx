import React, { useState } from 'react';
import { Icon } from '../components/common/Icon';
import { useTheme } from '../hooks/useTheme';
import { api } from '../lib/api';

export function LoginPage({ onLoggedIn }) {
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSubmitting(true);
    setError(null);
    try {
      const data = await api.login(username.trim(), password);
      if (data.error) {
        setError(data.error || '登录失败');
        return;
      }
      onLoggedIn?.(data.user);
    } catch (err) {
      setError(err.message || '网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-page">
      <button
        className="btn btn-icon btn-secondary login-theme-toggle"
        type="button"
        onClick={toggleTheme}
        title="切换主题"
        aria-label="切换主题"
      >
        <Icon name={theme === 'light' ? 'sun' : 'moon'} size="md" />
      </button>

      <form className="login-card" onSubmit={submit}>
        <div className="login-heading">
          <div className="logo-icon login-logo" aria-hidden="true">
            <Icon name="appstudio" size="lg" />
          </div>
          <div>
            <h1 className="login-title">登录 App Page Studio</h1>
            <p className="login-subtitle">请使用管理员分配的账号登录</p>
          </div>
        </div>

        <label className="login-field">
          <span>用户名</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </label>

        <label className="login-field">
          <span>密码</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button
          className="btn btn-primary login-submit"
          type="submit"
          disabled={submitting}
        >
          {submitting ? '登录中…' : '登录'}
        </button>
      </form>
    </div>
  );
}
