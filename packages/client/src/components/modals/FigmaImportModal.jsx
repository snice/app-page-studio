import React, { useEffect, useState } from 'react';
import { Icon } from '../common/Icon';
import { ModalOverlay } from './ModalOverlay';
import { useAppStore } from '../../lib/state';
import { api } from '../../lib/api';

const LOCAL_TOKEN_KEY = 'appPageStudio_figmaImportTokensV3';

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

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatScope(token) {
  if (token?.projectScope === 'all') return '全部项目';
  return `${token?.projectCount ?? token?.allowedProjectIds?.length ?? 0} 个项目`;
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

export function FigmaImportModal({ isOpen, onClose }) {
  const showToast = useAppStore((s) => s.showToast);
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [tokenData, setTokenData] = useState(null);
  const [tokens, setTokens] = useState([]);
  const [localTokens, setLocalTokens] = useState({});
  const [serverUrl, setServerUrl] = useState('');

  const loadTokens = async () => {
    setListLoading(true);
    try {
      setLocalTokens(readLocalTokenCache());
      const res = await api.listFigmaImportTokens();
      if (res.error) {
        showToast(res.error);
        return;
      }
      setServerUrl(res.serverUrl || window.location.origin);
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
      const res = await api.createFigmaImportToken();
      if (res.error) {
        showToast(res.error);
        return;
      }
      writeLocalToken(res);
      setLocalTokens(readLocalTokenCache());
      setServerUrl(res.serverUrl || window.location.origin);
      setTokenData(res);
      showToast('Figma 上传令牌已生成');
      await loadTokens();
    } finally {
      setLoading(false);
    }
  };

  const revokeToken = async (token) => {
    if (!token?.id) return;
    const message = token.status === 'active'
      ? '删除后该令牌将无法继续用于 Figma 上传，确定删除？'
      : '确定删除这个令牌记录？';
    if (!window.confirm(message)) return;

    const res = await api.deleteFigmaImportToken(token.id);
    if (res.error) {
      showToast(res.error);
      return;
    }
    removeLocalToken(token.id);
    setLocalTokens(readLocalTokenCache());
    if (tokenData?.id === token.id) setTokenData(null);
    await loadTokens();
    showToast('Figma 令牌已删除');
  };

  const getLocalToken = (token) => {
    if (!token?.id) return null;
    if (tokenData?.id === token.id && tokenData.token) return tokenData;
    return localTokens[token.id] || null;
  };

  const activeCount = tokens.filter((token) => token.status === 'active').length;
  const latestExpiry = tokenData?.expiresAt ? formatDate(tokenData.expiresAt) : '';
  const effectiveServerUrl = serverUrl || window.location.origin;

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
            <button className="btn btn-sm btn-secondary" type="button" onClick={loadTokens} disabled={listLoading}>
              <Icon name="refresh" size="sm" />
              刷新
            </button>
          </div>

          <div className="figma-token-list">
            {tokens.length === 0 ? (
              <div className="figma-token-row empty">暂无 Figma 上传令牌</div>
            ) : tokens.map((token) => {
              const local = getLocalToken(token);
              const canCopy = !!local?.token && token.status === 'active';
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
                      onClick={() => copyText(local?.token)}
                      disabled={!canCopy}
                      title={canCopy ? '复制 token' : '无法复制：无完整 token 或已失效'}
                    >
                      <Icon name="copy" size="sm" />
                      复制
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      type="button"
                      onClick={() => revokeToken(token)}
                      disabled={!isCurrentEditor || token.status === 'revoked'}
                      title={isCurrentEditor ? '删除令牌' : '当前为只读'}
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
