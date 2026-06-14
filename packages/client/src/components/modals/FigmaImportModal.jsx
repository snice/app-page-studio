import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon';
import { AppSelect } from '../common/AppSelect';
import { ModalOverlay } from './ModalOverlay';
import { useAppStore } from '../../lib/state';
import { api } from '../../lib/api';

const LOCAL_TOKEN_KEY = 'appPageStudio_figmaImportTokensV3';
const TTL_OPTIONS = [
  { value: '60', label: '1 小时' },
  { value: '720', label: '12 小时' },
  { value: '1440', label: '1 天' },
  { value: '10080', label: '7 天' },
  { value: '43200', label: '30 天' },
];

function readLocalTokenCache() {
  try {
    const raw = localStorage.getItem(LOCAL_TOKEN_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalToken(tokenData) {
  if (!tokenData?.id || !tokenData?.token) return;
  try {
    const tokens = readLocalTokenCache();
    tokens[tokenData.id] = {
      token: tokenData.token,
      expiresAt: tokenData.expiresAt,
      tokenPreview: tokenData.tokenPreview || '',
    };
    const now = Date.now();
    for (const [id, item] of Object.entries(tokens)) {
      const expiresAt = Date.parse(item?.expiresAt || '');
      if (Number.isFinite(expiresAt) && expiresAt <= now) delete tokens[id];
    }
    localStorage.setItem(LOCAL_TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    // ignore storage failures
  }
}

function removeLocalToken(tokenId) {
  if (!tokenId) return;
  try {
    const tokens = readLocalTokenCache();
    delete tokens[tokenId];
    localStorage.setItem(LOCAL_TOKEN_KEY, JSON.stringify(tokens));
  } catch {
    // ignore storage failures
  }
}

function updateLocalTokenExpiry(tokenId, expiresAt) {
  if (!tokenId || !expiresAt) return;
  try {
    const tokens = readLocalTokenCache();
    if (tokens[tokenId]) {
      tokens[tokenId] = { ...tokens[tokenId], expiresAt };
      localStorage.setItem(LOCAL_TOKEN_KEY, JSON.stringify(tokens));
    }
  } catch {
    // ignore storage failures
  }
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatTtl(value) {
  return TTL_OPTIONS.find((item) => item.value === String(value))?.label || `${value} 分钟`;
}

function formatScope(token) {
  if (token?.projectScope === 'all') return '全部项目';
  return `${token?.projectCount ?? token?.allowedProjectIds?.length ?? 0} 个项目`;
}

function isLocalBackendUrl(url) {
  return url?.protocol === 'http:'
    && url?.port === '3000'
    && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

function isLocalBrowserHost(hostname) {
  return ['localhost', '127.0.0.1', '::1'].includes(hostname)
    || /^10\./.test(hostname)
    || /^192\.168\./.test(hostname)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
}

function getFigmaServerUrl(apiServerUrl = '') {
  if (typeof window === 'undefined') return apiServerUrl;

  try {
    const browserUrl = new URL(window.location.href);
    const apiUrl = apiServerUrl ? new URL(apiServerUrl) : null;
    const usesViteDevServer = browserUrl.protocol === 'http:' && browserUrl.port === '5173';
    const shouldUseLocalBackendPort = isLocalBrowserHost(browserUrl.hostname)
      && (usesViteDevServer || isLocalBackendUrl(apiUrl));

    browserUrl.pathname = '';
    browserUrl.search = '';
    browserUrl.hash = '';

    if (shouldUseLocalBackendPort) {
      browserUrl.port = '3000';
    }

    return browserUrl.origin;
  } catch {
    return apiServerUrl || window.location.origin;
  }
}

function TokenStatus({ token }) {
  const status = token?.status || 'expired';
  const label = status === 'active' ? '有效' : status === 'revoked' ? '已吊销' : '已过期';
  return (
    <span className={`figma-token-status ${status}`}>
      {label}
    </span>
  );
}

function TokenField({ token, onCopy }) {
  return (
    <label className="figma-token-field">
      <span className="form-label">Token</span>
      <div className="figma-token-input-row">
        <textarea className="form-textarea figma-token-textarea" value={token || ''} readOnly />
        <button className="btn btn-icon btn-secondary" type="button" onClick={() => onCopy(token)} disabled={!token} title="复制">
          <Icon name="copy" size="sm" />
        </button>
      </div>
    </label>
  );
}

export function FigmaImportModal({ isOpen, onClose, onRequestConfirm }) {
  const showToast = useAppStore((s) => s.showToast);
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [tokenData, setTokenData] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [localTokens, setLocalTokens] = useState({});
  const [serverUrl, setServerUrl] = useState('');
  const [ttlMinutes, setTtlMinutes] = useState('720');
  const [manageTtlMinutes, setManageTtlMinutes] = useState('720');
  const [busyTokenId, setBusyTokenId] = useState(null);

  const loadTokens = async () => {
    setListLoading(true);
    try {
      setLocalTokens(readLocalTokenCache());
      const res = await api.listFigmaImportTokens();
      if (res.error) {
        showToast(res.error);
        return;
      }
      setServerUrl(getFigmaServerUrl(res.serverUrl));
      setTokens(res.tokens || []);
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    loadTokens();
  }, [isOpen]);

  const copyText = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast('已复制');
    } catch {
      showToast('复制失败');
    }
  };

  const createToken = async () => {
    if (!isCurrentEditor) {
      showToast('当前为只读，不能生成 Figma 上传令牌');
      return;
    }
    setLoading(true);
    try {
      const res = await api.createFigmaImportToken(ttlMinutes);
      if (res.error) {
        showToast(res.error);
        return;
      }
      writeLocalToken(res);
      setLocalTokens(readLocalTokenCache());
      setServerUrl(getFigmaServerUrl(res.serverUrl));
      setTokenData(res);
      showToast('Figma 上传令牌已生成');
      await loadTokens();
    } finally {
      setLoading(false);
    }
  };

  const applyUpdatedToken = (updatedToken) => {
    if (!updatedToken?.id) return;
    setTokens((current) => current.map((item) => (
      item.id === updatedToken.id ? { ...item, ...updatedToken } : item
    )));
    updateLocalTokenExpiry(updatedToken.id, updatedToken.expiresAt);
    setLocalTokens(readLocalTokenCache());
    setTokenData((current) => (
      current?.id === updatedToken.id ? { ...current, ...updatedToken } : current
    ));
  };

  const updateTokenExpiry = async (token) => {
    if (!token?.id || token.status === 'revoked') return;
    setBusyTokenId(`${token.id}:expiry`);
    try {
      const res = await api.updateFigmaImportTokenExpiry(token.id, manageTtlMinutes);
      if (res.error) {
        showToast(res.error);
        return;
      }
      applyUpdatedToken(res.token);
      showToast(`有效期已改为从现在起 ${formatTtl(manageTtlMinutes)}`);
    } finally {
      setBusyTokenId(null);
    }
  };

  const renewToken = async (token) => {
    if (!token?.id || token.status === 'revoked') return;
    setBusyTokenId(`${token.id}:renew`);
    try {
      const res = await api.renewFigmaImportToken(token.id, manageTtlMinutes);
      if (res.error) {
        showToast(res.error);
        return;
      }
      applyUpdatedToken(res.token);
      showToast(`已续期 ${formatTtl(manageTtlMinutes)}`);
    } finally {
      setBusyTokenId(null);
    }
  };

  const deleteToken = async (token) => {
    if (!token?.id) return;
    const confirmed = await onRequestConfirm?.({
      title: '删除 Figma 令牌',
      message: '确定彻底删除这个 Figma 上传令牌？',
      hint: '删除后该令牌记录会从服务端移除，当前 token 也会立即失效。',
      confirmText: '删除令牌',
      danger: true,
    });
    if (!confirmed) return;

    setBusyTokenId(`${token.id}:delete`);
    try {
      const res = await api.deleteFigmaImportToken(token.id);
      if (res.error) {
        showToast(res.error);
        return;
      }
      removeLocalToken(token.id);
      setLocalTokens(readLocalTokenCache());
      if (tokenData?.id === token.id) setTokenData(null);
      await loadTokens();
      showToast('Figma 令牌已彻底删除');
    } finally {
      setBusyTokenId(null);
    }
  };

  const getLocalToken = (token) => {
    if (!token?.id) return null;
    if (tokenData?.id === token.id && tokenData.token) return tokenData;
    return localTokens[token.id] || null;
  };

  const activeCount = tokens.filter((token) => token.status === 'active').length;
  const latestExpiry = tokenData?.expiresAt ? formatDate(tokenData.expiresAt) : '';
  const effectiveServerUrl = serverUrl || getFigmaServerUrl();

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal wide figma-import-modal">
        <div className="modal-header">
          <span className="modal-title">Figma 导入令牌</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="figma-import-summary">
            <div>
              <strong>插件填写服务器地址和 Token</strong>
              <span>服务器地址用于连接当前部署，Token 只负责授权可导入的项目。</span>
            </div>
            <div className="figma-token-create-controls">
              <label className="figma-token-duration">
                <span>有效期</span>
                <AppSelect
                  value={ttlMinutes}
                  options={TTL_OPTIONS}
                  compact
                  ariaLabel="Figma token 有效期"
                  onValueChange={setTtlMinutes}
                />
              </label>
              <button
                className="btn btn-primary"
                type="button"
                onClick={createToken}
                disabled={loading || !isCurrentEditor}
                title={isCurrentEditor ? '生成上传令牌' : '当前为只读'}
              >
                <Icon name="key" />
                {loading ? '生成中' : '生成令牌'}
              </button>
            </div>
          </div>

          <div className="figma-setup-card">
            <div className="figma-setup-row">
              <span className="figma-setup-icon"><Icon name="link" size="sm" /></span>
              <div className="figma-setup-main">
                <span className="figma-setup-label">服务器地址</span>
                <code>{effectiveServerUrl}</code>
              </div>
              <button className="btn btn-sm btn-secondary" type="button" onClick={() => copyText(effectiveServerUrl)}>
                <Icon name="copy" size="sm" />
                复制
              </button>
            </div>
            <div className="figma-setup-row muted">
              <span className="figma-setup-icon"><Icon name="package" size="sm" /></span>
              <div className="figma-setup-main">
                <span className="figma-setup-label">本地插件</span>
                <code>packages/figma-plugin/manifest.json</code>
              </div>
            </div>
          </div>

          {tokenData ? (
            <div className="figma-token-grid">
              <div className="figma-token-section-title">最新生成</div>
              <TokenField token={tokenData.token} onCopy={copyText} />
              <div className="figma-token-expiry">
                <Icon name="clock" size="sm" />
                <span>有效期至 {latestExpiry}，授权范围：{formatScope(tokenData)}</span>
              </div>
            </div>
          ) : (
            <div className="figma-token-empty">
              <Icon name="layers" size="xl" />
              <span>生成令牌后，把服务器地址和 token 填到 Figma 插件右下角设置中。</span>
            </div>
          )}

          <div className="figma-token-list-header">
            <div>
              <strong>令牌列表</strong>
              <span>{listLoading ? '加载中' : `${tokens.length} 条，${activeCount} 条有效`}</span>
            </div>
            <div className="figma-token-list-tools">
              <label className="figma-token-duration compact">
                <span>调整时长</span>
                <AppSelect
                  value={manageTtlMinutes}
                  options={TTL_OPTIONS}
                  compact
                  ariaLabel="Figma token 调整时长"
                  onValueChange={setManageTtlMinutes}
                />
              </label>
              <button className="btn btn-sm btn-secondary" type="button" onClick={loadTokens} disabled={listLoading}>
                <Icon name="refresh" size="sm" />
                刷新
              </button>
            </div>
          </div>

          <div className="figma-token-list">
            {tokens.length === 0 ? (
              <div className="figma-token-row empty">暂无 Figma 上传令牌</div>
            ) : tokens.map((token) => {
              const local = getLocalToken(token);
              const canCopy = !!local?.token && token.status === 'active';
              const actionBusy = busyTokenId && busyTokenId.startsWith(`${token.id}:`);
              const canManageToken = isCurrentEditor && token.status !== 'revoked' && !actionBusy;
              return (
                <div className="figma-token-row" key={token.id}>
                  <div className="figma-token-row-main">
                    <div className="figma-token-row-title">
                      <span>#{token.id} {token.tokenPreview || 'token'}</span>
                      <TokenStatus token={token} />
                    </div>
                    <div className="figma-token-row-meta">
                      授权：{formatScope(token)} · 过期：{formatDate(token.expiresAt)}
                    </div>
                    <div className="figma-token-row-meta">
                      创建人：{token.username || token.createdByName || '-'} · 最近使用：{formatDate(token.lastUsedAt)}
                    </div>
                    <div className="figma-token-row-note">
                      {local?.token ? '本机保存了完整 token，可再次复制。' : '完整 token 不会从服务端返回；需要使用时请重新生成。'}
                    </div>
                  </div>
                  <div className="figma-token-row-actions">
                    <button
                      className="btn btn-sm btn-secondary"
                      type="button"
                      onClick={() => updateTokenExpiry(token)}
                      disabled={!canManageToken}
                      title={canManageToken ? `改为从现在起 ${formatTtl(manageTtlMinutes)} 过期` : '无法修改'}
                    >
                      <Icon name="edit" size="sm" />
                      改有效期
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      type="button"
                      onClick={() => renewToken(token)}
                      disabled={!canManageToken}
                      title={canManageToken ? `在当前有效期上续 ${formatTtl(manageTtlMinutes)}` : '无法续期'}
                    >
                      <Icon name="refresh" size="sm" />
                      续期
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      type="button"
                      onClick={() => copyText(local?.token)}
                      disabled={!canCopy || actionBusy}
                      title={canCopy ? '复制 token' : '无法复制：无完整 token 或已失效'}
                    >
                      <Icon name="copy" size="sm" />
                      复制
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      type="button"
                      onClick={() => deleteToken(token)}
                      disabled={!isCurrentEditor || actionBusy}
                      title={isCurrentEditor ? '彻底删除令牌' : '当前为只读'}
                    >
                      <Icon name="trash" size="sm" />
                      删除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="modal-footer">
          {tokenData?.token && (
            <button className="btn btn-secondary" type="button" onClick={() => copyText(tokenData.token)}>
              <Icon name="copy" />
              复制最新 Token
            </button>
          )}
          <button className="btn btn-secondary" type="button" onClick={onClose}>关闭</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
