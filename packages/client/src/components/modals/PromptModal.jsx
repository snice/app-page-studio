import React, { useState } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { api } from '../../lib/api';
import { copyText } from '../../lib/clipboard';
import { ModalOverlay } from './ModalOverlay';

const PLATFORM_ALIASES = {
  reactNative: 'react-native',
  react_native: 'react-native',
  rn: 'react-native',
  'uni-app': 'uniapp',
};

function normalizePlatformValue(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return PLATFORM_ALIASES[trimmed] || trimmed;
}

function normalizePlatformList(value) {
  const source = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const result = [];
  for (const item of source) {
    const platform = normalizePlatformValue(item);
    if (!platform || seen.has(platform)) continue;
    seen.add(platform);
    result.push(platform);
  }
  return result;
}

function normalizePlatformOptions(platforms) {
  if (!Array.isArray(platforms)) return [];
  const seen = new Set();
  const result = [];
  for (const item of platforms) {
    const value = normalizePlatformValue(item?.value);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push({
      value,
      label: item?.label || value,
    });
  }
  return result;
}

// ==================== Prompt Modal ====================
export function PromptModal({ isOpen, onClose }) {
  const pagesConfig = useAppStore((s) => s.pagesConfig);
  const currentFile = useAppStore((s) => s.currentFile);
  const selectedFiles = useAppStore((s) => s.selectedFiles);
  const showToast = useAppStore((s) => s.showToast);
  const configuredTargetPlatforms = React.useMemo(
    () => normalizePlatformList(pagesConfig?.targetPlatform),
    [pagesConfig?.targetPlatform]
  );
  const [platform, setPlatform] = useState('');
  const [platformOptions, setPlatformOptions] = useState([]);
  const [platformsLoading, setPlatformsLoading] = useState(false);
  const [platformsError, setPlatformsError] = useState('');
  const [filterMode, setFilterMode] = useState('status');
  const [statusFilters, setStatusFilters] = useState({ pending: false, developing: true, completed: false });
  const [promptText, setPromptText] = useState('点击"生成"按钮生成提示词');

  React.useEffect(() => {
    if (!isOpen) return undefined;
    let ignored = false;
    setPromptText('点击"生成"按钮生成提示词');
    setPlatformsLoading(true);
    setPlatformsError('');

    api.getPromptPlatforms()
      .then((res) => {
        if (ignored) return;
        if (res.error) {
          setPlatformOptions([]);
          setPlatformsError(res.error);
          return;
        }
        const options = normalizePlatformOptions(res.platforms);
        setPlatformOptions(options);
        setPlatformsError(options.length > 0 ? '' : '接口未返回可用目标平台');
      })
      .catch(() => {
        if (!ignored) {
          setPlatformOptions([]);
          setPlatformsError('目标平台加载失败');
        }
      })
      .finally(() => {
        if (!ignored) setPlatformsLoading(false);
      });

    return () => { ignored = true; };
  }, [isOpen]);

  const platformChoices = React.useMemo(() => {
    return platformOptions;
  }, [platformOptions]);

  React.useEffect(() => {
    if (!isOpen) return;
    const configuredPlatform = platformChoices.find((option) => configuredTargetPlatforms.includes(option.value))?.value;
    const nextPlatform = configuredPlatform || platformChoices[0]?.value || '';
    if (!platformChoices.some((option) => option.value === platform)) {
      setPlatform(nextPlatform);
    }
  }, [configuredTargetPlatforms, isOpen, platform, platformChoices]);

  const generate = async () => {
    if (!platform) {
      showToast(platformsError || '暂无可用目标平台');
      return;
    }

    const currentOnly = filterMode === 'current';
    const selectedOnly = filterMode === 'selected';

    if (currentOnly && !currentFile) {
      showToast('请先选择当前页面');
      return;
    }
    if (selectedOnly && (!selectedFiles || selectedFiles.size === 0)) {
      showToast('请先在左侧文件列表勾选页面');
      return;
    }

    let pagesForPrompt = pagesConfig;
    if (currentOnly) {
      pagesForPrompt = {
        ...pagesConfig,
        htmlFiles: (pagesConfig.htmlFiles || []).filter(f => f.path === currentFile.path),
      };
    } else if (selectedOnly) {
      pagesForPrompt = {
        ...pagesConfig,
        htmlFiles: (pagesConfig.htmlFiles || []).filter(f => selectedFiles.has(f.path)),
      };
    }

    const project = useAppStore.getState().getCurrentProject();
    const designSystem = project?.designSystem || null;

    const activeFilters = Object.entries(statusFilters).filter(([_, v]) => v).map(([k]) => k);
    const useStatusFilter = filterMode === 'status';

    const res = await api.generatePrompt({
      pages: pagesForPrompt,
      targetPlatform: platform,
      designSystem,
      statusFilters: useStatusFilter ? (activeFilters.length > 0 ? activeFilters : null) : null,
    });
    if (res.error) { showToast(res.error); return; }
    setPromptText(res.prompt || '生成失败');
    showToast('提示词已生成');
  };

  const copy = async () => {
    const ok = await copyText(promptText);
    showToast(ok ? '已复制到剪贴板' : '复制失败，请手动选择文本复制');
  };

  const download = () => {
    const blob = new Blob([promptText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'pages-prompt.md'; a.click();
    URL.revokeObjectURL(url);
  };

  const isStatusMode = filterMode === 'status';
  const selectedCount = selectedFiles?.size || 0;
  const disableGenerate = platformsLoading || platformChoices.length === 0;

  return (
    <ModalOverlay isOpen={isOpen} onClose={onClose}>
      <div className="modal wide">
        <div className="modal-header">
          <span className="modal-title">生成 AI 提示词</span>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">目标平台</label>
            <div className="dev-status-radio-group">
              {platformChoices.map((option) => (
                <label className="radio-label" key={option.value}>
                  <input
                    type="radio"
                    name="platform"
                    value={option.value}
                    checked={platform === option.value}
                    onChange={(e) => setPlatform(e.target.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
              {platformsLoading && <span className="platform-load-state">正在加载目标平台...</span>}
              {!platformsLoading && platformsError && <span className="platform-load-state">{platformsError}</span>}
              {!platformsLoading && !platformsError && platformChoices.length === 0 && (
                <span className="platform-load-state">暂无可用目标平台</span>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">筛选页面</label>
            <div className="dev-status-radio-group">
              <label className="radio-label">
                <input type="radio" checked={filterMode === 'status'} onChange={() => setFilterMode('status')} />
                <span>开发状态</span>
              </label>
              <label className="radio-label">
                <input type="radio" checked={filterMode === 'current'} onChange={() => setFilterMode('current')} />
                <span>当前页</span>
              </label>
              <label className="radio-label">
                <input type="radio" checked={filterMode === 'selected'} onChange={() => setFilterMode('selected')} />
                <span>已选页面{selectedCount > 0 ? ` (${selectedCount})` : ''}</span>
              </label>
            </div>
          </div>
          <div className={`form-group${!isStatusMode ? ' is-disabled' : ''}`}>
            <label className="form-label">开发状态筛选</label>
            <div className="dev-status-filter">
              {['pending', 'developing', 'completed'].map((s) => (
                <label className="checkbox-label" key={s}>
                  <input type="checkbox" checked={statusFilters[s]} disabled={!isStatusMode}
                    onChange={(e) => setStatusFilters({ ...statusFilters, [s]: e.target.checked })} />
                  <span className={`dev-status-badge ${s}`}>
                    {s === 'pending' ? '待开发' : s === 'developing' ? '开发中' : '已完成'}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">生成的提示词</label>
            <pre className="prompt-preview">{promptText}</pre>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={generate} disabled={disableGenerate}><Icon name="refresh" /> 生成</button>
          <button className="btn btn-primary" onClick={copy}><Icon name="copy" /> 复制</button>
          <button className="btn btn-primary" onClick={download}><Icon name="download" /> 下载</button>
        </div>
      </div>
    </ModalOverlay>
  );
}
