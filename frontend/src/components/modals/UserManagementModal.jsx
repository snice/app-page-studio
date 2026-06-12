import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon';
import { ModalOverlay } from './ModalOverlay';
import { api } from '../../lib/api';
import { useAppStore } from '../../lib/state';

export function UserManagementModal({ isOpen, onClose, currentUser }) {
  const showToast = useAppStore((s) => s.showToast);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draft, setDraft] = useState({ username: '', password: '', role: 'user' });
  const [passwordDrafts, setPasswordDrafts] = useState({});

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await api.listUsers();
      if (res.error) throw new Error(res.error);
      setUsers(res.users || []);
    } catch (e) {
      showToast('加载用户失败: ' + (e.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setDraft({ username: '', password: '', role: 'user' });
    setPasswordDrafts({});
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const createUser = async (event) => {
    event.preventDefault();
    if (!draft.username.trim() || !draft.password) {
      showToast('请输入用户名和密码');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createUser({
        username: draft.username.trim(),
        password: draft.password,
        role: draft.role,
      });
      if (res.error) throw new Error(res.error);
      showToast('用户已创建');
      setDraft({ username: '', password: '', role: 'user' });
      await loadUsers();
    } catch (e) {
      showToast('创建失败: ' + (e.message || '未知错误'));
    } finally {
      setSubmitting(false);
    }
  };

  const updateRole = async (user, role) => {
    if (user.id === currentUser?.id) return;
    try {
      const res = await api.updateUser(user.id, { role });
      if (res.error) throw new Error(res.error);
      showToast('角色已更新');
      await loadUsers();
    } catch (e) {
      showToast('更新失败: ' + (e.message || '未知错误'));
    }
  };

  const updatePassword = async (user) => {
    const password = passwordDrafts[user.id] || '';
    if (password.length < 6) {
      showToast('密码至少 6 位');
      return;
    }
    try {
      const res = await api.updateUser(user.id, { password });
      if (res.error) throw new Error(res.error);
      showToast('密码已更新');
      setPasswordDrafts((s) => ({ ...s, [user.id]: '' }));
    } catch (e) {
      showToast('更新失败: ' + (e.message || '未知错误'));
    }
  };

  const deleteUser = async (user) => {
    if (user.id === currentUser?.id) return;
    if (!window.confirm(`确定删除用户「${user.username}」？`)) return;
    try {
      const res = await api.deleteUser(user.id);
      if (res.error) throw new Error(res.error);
      showToast('用户已删除');
      await loadUsers();
    } catch (e) {
      showToast('删除失败: ' + (e.message || '未知错误'));
    }
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal wide user-management-modal">
        <div className="modal-header">
          <span className="modal-title">用户管理</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <form className="user-create-form" onSubmit={createUser}>
            <input
              className="form-input"
              value={draft.username}
              onChange={(e) => setDraft((s) => ({ ...s, username: e.target.value }))}
              placeholder="用户名"
              autoComplete="off"
            />
            <input
              className="form-input"
              type="password"
              value={draft.password}
              onChange={(e) => setDraft((s) => ({ ...s, password: e.target.value }))}
              placeholder="初始密码"
              autoComplete="new-password"
            />
            <select
              className="form-select"
              value={draft.role}
              onChange={(e) => setDraft((s) => ({ ...s, role: e.target.value }))}
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
            <button className="btn btn-primary" type="submit" disabled={submitting}>
              <Icon name="plus" size="sm" />
              新建用户
            </button>
          </form>

          <div className="user-table" aria-busy={loading}>
            <div className="user-table-head">
              <span>用户</span>
              <span>角色</span>
              <span>重置密码</span>
              <span>操作</span>
            </div>
            {loading ? (
              <div className="user-table-empty">加载中...</div>
            ) : users.length === 0 ? (
              <div className="user-table-empty">暂无用户</div>
            ) : users.map((user) => {
              const isSelf = user.id === currentUser?.id;
              return (
                <div className="user-table-row" key={user.id}>
                  <div className="user-identity">
                    <span className="user-avatar"><Icon name="user" size="sm" /></span>
                    <div>
                      <strong>{user.username}</strong>
                      {isSelf && <small>当前账号</small>}
                    </div>
                  </div>
                  <select
                    className="form-select"
                    value={user.role}
                    disabled={isSelf}
                    onChange={(e) => updateRole(user, e.target.value)}
                  >
                    <option value="user">普通用户</option>
                    <option value="admin">管理员</option>
                  </select>
                  <div className="user-password-reset">
                    <input
                      className="form-input"
                      type="password"
                      placeholder="新密码"
                      autoComplete="new-password"
                      value={passwordDrafts[user.id] || ''}
                      onChange={(e) => setPasswordDrafts((s) => ({ ...s, [user.id]: e.target.value }))}
                    />
                    <button className="btn btn-secondary btn-sm" type="button" onClick={() => updatePassword(user)}>
                      保存
                    </button>
                  </div>
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    disabled={isSelf}
                    onClick={() => deleteUser(user)}
                  >
                    <Icon name="trash" size="sm" />
                    删除
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
