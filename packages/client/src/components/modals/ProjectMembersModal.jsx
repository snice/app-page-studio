import { useEffect, useMemo, useState } from 'react';
import { ComboBox } from '@heroui/react/combo-box';
import { Input } from '@heroui/react/input';
import { ListBox } from '@heroui/react/list-box';
import { Icon } from '../common/Icon';
import { AppSelect } from '../common/AppSelect';
import { ModalOverlay } from './ModalOverlay';
import { ConfirmModal } from './ConfirmModal';
import { api } from '../../lib/api';
import { useAppStore } from '../../lib/state';

const ROLE_LABELS = {
  owner: 'Owner',
  editor: '可编辑',
  viewer: '只读',
};

const PROJECT_ROLE_OPTIONS = [
  { value: 'owner', label: 'Owner' },
  { value: 'editor', label: '可编辑' },
  { value: 'viewer', label: '只读' },
];

export function ProjectMembersModal({ isOpen, project, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const [members, setMembers] = useState([]);
  const [users, setUsers] = useState([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState({ userId: '', role: 'editor' });
  const [removeTarget, setRemoveTarget] = useState(null);

  const projectId = project?.id;

  const loadMembers = async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const res = await api.getProjectMembers(projectId);
      if (res.error) throw new Error(res.error);
      setMembers(res.members || []);
      setUsers(res.users || []);
      setCanManage(!!res.canManage);
    } catch (e) {
      showToast('加载共创用户失败: ' + (e.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setMembers([]);
    setUsers([]);
    setCanManage(false);
    setDraft({ userId: '', role: 'editor' });
    loadMembers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, projectId]);

  const memberUserIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const candidateUsers = useMemo(
    () => users.filter((user) => !memberUserIds.has(user.id)),
    [users, memberUserIds]
  );

  useEffect(() => {
    if (!canManage) return;
    if (draft.userId || candidateUsers.length === 0) return;
    setDraft((s) => ({ ...s, userId: String(candidateUsers[0].id) }));
  }, [canManage, candidateUsers, draft.userId]);

  const saveMember = async (event) => {
    event.preventDefault();
    const userId = Number.parseInt(draft.userId, 10);
    if (!userId) {
      showToast('请选择用户');
      return;
    }
    try {
      const res = await api.addProjectMember(projectId, userId, draft.role);
      if (res.error) throw new Error(res.error);
      setDraft({ userId: '', role: 'editor' });
      await loadMembers();
      showToast('共创用户已添加');
    } catch (e) {
      showToast('添加失败: ' + (e.message || '未知错误'));
    }
  };

  const updateRole = async (member, role) => {
    try {
      const res = await api.updateProjectMember(projectId, member.userId, role);
      if (res.error) throw new Error(res.error);
      await loadMembers();
      showToast('成员角色已更新');
    } catch (e) {
      showToast('更新失败: ' + (e.message || '未知错误'));
      loadMembers();
    }
  };

  const confirmRemoveMember = async () => {
    if (!removeTarget) return;
    try {
      const res = await api.deleteProjectMember(projectId, removeTarget.userId);
      if (res.error) throw new Error(res.error);
      await loadMembers();
      showToast('共创用户已移除');
    } catch (e) {
      showToast('移除失败: ' + (e.message || '未知错误'));
    }
  };

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal wide project-members-modal">
        <div className="modal-header">
          <span className="modal-title">共创用户</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="project-members-title">
            <div>
              <strong>{project?.name || '项目'}</strong>
              <span>{canManage ? '配置项目访问与编辑权限' : '当前项目成员'}</span>
            </div>
          </div>

          {canManage && (
            <form className="project-member-add" onSubmit={saveMember}>
              <ComboBox
                aria-label="选择共创用户"
                className="page-group-combobox"
                fullWidth
                isDisabled={candidateUsers.length === 0}
                menuTrigger="focus"
                selectedKey={draft.userId ? String(draft.userId) : null}
                onSelectionChange={(key) => {
                  if (key == null) return;
                  setDraft((s) => ({ ...s, userId: String(key) }));
                }}
              >
                <ComboBox.InputGroup className="page-group-combobox-input-group">
                  <Input
                    className="page-group-combobox-input"
                    placeholder={candidateUsers.length === 0 ? '暂无可添加用户' : '搜索或选择用户'}
                  />
                  <ComboBox.Trigger className="page-group-combobox-trigger" aria-label="打开共创用户列表">
                    <Icon name="chevronDown" size="sm" />
                  </ComboBox.Trigger>
                </ComboBox.InputGroup>
                <ComboBox.Popover className="page-group-combobox-popover" placement="bottom start">
                  <ListBox className="page-group-combobox-list" items={candidateUsers.map((u) => ({ id: String(u.id), name: u.username }))}>
                    {(item) => (
                      <ListBox.Item
                        key={item.id}
                        id={item.id}
                        textValue={item.name}
                        className="page-group-combobox-item"
                      >
                        <span className="page-group-combobox-item-content">
                          <span className="page-group-combobox-item-title">{item.name}</span>
                        </span>
                        <ListBox.ItemIndicator className="page-group-combobox-item-indicator" />
                      </ListBox.Item>
                    )}
                  </ListBox>
                </ComboBox.Popover>
              </ComboBox>
              <AppSelect
                ariaLabel="共创用户角色"
                value={draft.role}
                options={PROJECT_ROLE_OPTIONS}
                onValueChange={(value) => setDraft((s) => ({ ...s, role: value }))}
              />
              <button className="btn btn-primary" type="submit" disabled={candidateUsers.length === 0}>
                <Icon name="plus" size="sm" />
                添加
              </button>
            </form>
          )}

          <div className="project-member-list" aria-busy={loading}>
            {loading ? (
              <div className="project-member-empty">加载中...</div>
            ) : members.length === 0 ? (
              <div className="project-member-empty">暂无共创用户</div>
            ) : members.map((member) => (
              <div className="project-member-row" key={member.userId}>
                <div className="project-member-user">
                  <span className="user-avatar"><Icon name="user" size="sm" /></span>
                  <div>
                    <strong>{member.username}</strong>
                    <small>{member.userRole === 'admin' ? '系统管理员' : '普通用户'}</small>
                  </div>
                </div>
                {canManage ? (
                  <AppSelect
                    ariaLabel={`${member.username} 的项目角色`}
                    value={member.role}
                    options={PROJECT_ROLE_OPTIONS}
                    onValueChange={(value) => updateRole(member, value)}
                  />
                ) : (
                  <span className="project-member-role">{ROLE_LABELS[member.role] || member.role}</span>
                )}
                {canManage && (
                  <button
                    className="btn btn-danger btn-sm"
                    type="button"
                    onClick={() => setRemoveTarget(member)}
                  >
                    <Icon name="trash" size="sm" />
                    移除
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>关闭</button>
        </div>
      </div>
      <ConfirmModal
        isOpen={!!removeTarget}
        title="移除共创用户"
        message={<>确定移除「<b>{removeTarget?.username}</b>」的共创权限？</>}
        confirmText="移除"
        danger
        onConfirm={confirmRemoveMember}
        onClose={() => setRemoveTarget(null)}
      />
    </ModalOverlay>
  );
}
