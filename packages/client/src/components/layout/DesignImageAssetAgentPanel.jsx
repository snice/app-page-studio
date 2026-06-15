import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../common/Icon';
import { api } from '../../lib/api';
import { useAppStore } from '../../lib/state';

function fileTitle(file) {
  if (!file) return '未选择设计图';
  return file.stateName || file.name || file.path?.split('/').pop() || '未命名设计图';
}

function formatDuration(ms) {
  const safeMs = Math.max(0, Math.round(Number(ms) || 0));
  if (safeMs < 1000) return `${safeMs} 毫秒`;
  const seconds = safeMs / 1000;
  if (seconds < 60) return `${seconds.toFixed(seconds >= 10 ? 1 : 2)} 秒`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds - minutes * 60;
  return `${minutes} 分 ${restSeconds.toFixed(restSeconds >= 10 ? 0 : 1)} 秒`;
}

function formatRegion(region) {
  const image = region?.image || {};
  const x = Number.parseInt(image.x, 10) || 0;
  const y = Number.parseInt(image.y, 10) || 0;
  const width = Number.parseInt(image.width, 10) || 0;
  const height = Number.parseInt(image.height, 10) || 0;
  return `${width}x${height} @ ${x},${y}`;
}

function sanitizeAssetName(value, fallback) {
  const raw = String(value || '').trim() || fallback;
  return raw
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48) || fallback;
}

function cropRegionToPngDataUrl(img, region) {
  const image = region?.image || {};
  const x = Math.max(0, Number.parseInt(image.x, 10) || 0);
  const y = Math.max(0, Number.parseInt(image.y, 10) || 0);
  const width = Math.max(1, Number.parseInt(image.width, 10) || 0);
  const height = Math.max(1, Number.parseInt(image.height, 10) || 0);
  const naturalWidth = img.naturalWidth || 0;
  const naturalHeight = img.naturalHeight || 0;
  if (!naturalWidth || !naturalHeight || !width || !height) {
    throw new Error('选区尺寸无效');
  }

  const sx = Math.min(x, naturalWidth - 1);
  const sy = Math.min(y, naturalHeight - 1);
  const sw = Math.max(1, Math.min(width, naturalWidth - sx));
  const sh = Math.max(1, Math.min(height, naturalHeight - sy));
  if (sw !== sh) {
    throw new Error('AI 切图区域必须是正方形');
  }
  const side = sw;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, side, side, 0, 0, side, side);
  return {
    dataUrl: canvas.toDataURL('image/png'),
    size: side,
  };
}

export function DesignImageAssetAgentPanel({
  imgRef,
  onRequestRegionSelect,
  onCancelRegionSelect,
  onGenerated,
}) {
  const currentFile = useAppStore((s) => s.currentFile);
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);
  const showToast = useAppStore((s) => s.showToast);
  const addImageReplacement = useAppStore((s) => s.addImageReplacement);
  const setActivePanelTab = useAppStore((s) => s.setActivePanelTab);
  const setDesignAssetOverlayRegions = useAppStore((s) => s.setDesignAssetOverlayRegions);
  const scanHtmlFiles = useAppStore((s) => s.scanHtmlFiles);
  const setPagesMeta = useAppStore((s) => s.setPagesMeta);
  const clearDirtyFile = useAppStore((s) => s.clearDirtyFile);

  const title = fileTitle(currentFile);
  const initialMessage = useMemo(() => ({
    role: 'assistant',
    content: '选择一个或多个设计图区域，输入要求后可批量生成透明底 PNG 切图。'
  }), []);

  const [collapsed, setCollapsed] = useState(true);
  const [selecting, setSelecting] = useState(false);
  const [regions, setRegions] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([initialMessage]);
  const operationStartedAtRef = useRef(0);

  useEffect(() => {
    setMessages([initialMessage]);
    setRegions([]);
    setInput('');
    setSelecting(false);
    setDesignAssetOverlayRegions([]);
    onCancelRegionSelect?.();
  }, [currentFile?.path, initialMessage, onCancelRegionSelect, setDesignAssetOverlayRegions]);

  useEffect(() => () => {
    setDesignAssetOverlayRegions([]);
    onCancelRegionSelect?.();
  }, [onCancelRegionSelect, setDesignAssetOverlayRegions]);

  useEffect(() => {
    setDesignAssetOverlayRegions(regions);
  }, [regions, setDesignAssetOverlayRegions]);

  const handleSelectedRegion = useCallback((region) => {
    setRegions((items) => {
      const next = {
        id: `region-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'image',
        index: items.length,
        region,
      };
      return [...items, next];
    });
  }, []);

  const toggleRegionSelect = () => {
    if (!isCurrentEditor) {
      showToast('当前为只读，不能生成切图');
      return;
    }
    if (selecting) {
      setSelecting(false);
      onCancelRegionSelect?.();
      return;
    }
    setSelecting(true);
    onRequestRegionSelect?.(handleSelectedRegion);
  };

  const clearRegions = () => {
    setRegions([]);
    setDesignAssetOverlayRegions([]);
    setSelecting(false);
    onCancelRegionSelect?.();
  };

  const removeRegion = (id) => {
    setRegions((items) => items.filter((item) => item.id !== id));
  };

  const generate = async () => {
    const instruction = input.trim();
    if (!currentFile) {
      showToast('请选择设计图');
      return;
    }
    if (!isCurrentEditor) {
      showToast('当前为只读，不能生成切图');
      return;
    }
    if (regions.length === 0) {
      showToast('请先选择设计图区域');
      return;
    }
    const img = imgRef?.current;
    if (!img) {
      showToast('设计图尚未加载完成');
      return;
    }

    setSelecting(false);
    onCancelRegionSelect?.();
    setBusy(true);
    operationStartedAtRef.current = Date.now();
    setMessages((items) => [...items, { role: 'user', content: `生成 ${regions.length} 个透明 PNG 切图${instruction ? `：${instruction}` : ''}` }]);

    try {
      const sourceName = sanitizeAssetName(currentFile.name || currentFile.path?.split('/').pop(), 'ai_asset');
      const payloadRegions = regions.map((item, index) => {
        const cropped = cropRegionToPngDataUrl(img, item.region);
        return {
          id: item.id,
          name: `${sourceName}_${index + 1}`,
          instruction,
          region: item.region,
          imageDataUrl: cropped.dataUrl,
          size: cropped.size,
        };
      });
      const res = await api.generateDesignAssets({
        file: currentFile,
        prompt: instruction,
        regions: payloadRegions,
      });
      if (res.error) throw new Error(res.error);

      const files = Array.isArray(res.files) ? res.files : [];
      const pageSave = res.pageSave || null;
      const savedPath = pageSave?.path || currentFile.path;
      const stateBeforeLocalMerge = useAppStore.getState();
      const isStillCurrentFile = stateBeforeLocalMerge.currentFile?.path === savedPath;
      const hadDirtyBeforeMarkers = !!stateBeforeLocalMerge.dirtyFiles?.[savedPath];
      if (isStillCurrentFile) {
        files.forEach((file, index) => {
          const sourceRegion = regions[index]?.region;
          addImageReplacement({
            selector: '区域',
            imagePath: file.path,
            description: instruction || 'AI 生成透明底 PNG 切图',
            region: sourceRegion,
            aiGenerated: true,
            generatedAt: res.updatedAt || new Date().toISOString(),
          });
        });
      }
      if (pageSave) {
        setPagesMeta(pageSave);
        if (isStillCurrentFile && !hadDirtyBeforeMarkers) clearDirtyFile(savedPath);
      }
      const durationMs = Date.now() - operationStartedAtRef.current;
      setMessages((items) => [
        ...items,
        {
          role: 'assistant',
          content: pageSave
            ? `已生成 ${files.length} 个切图，切图标记已由后台保存。`
            : `已生成 ${files.length} 个切图，并添加到页面切图标记。`,
          durationMs,
        }
      ]);
      setRegions([]);
      setDesignAssetOverlayRegions([]);
      setInput('');
      setActivePanelTab('file');
      scanHtmlFiles({ showResultToast: false }).catch(() => {});
      onGenerated?.(res);
      showToast(pageSave
        ? `已生成 ${files.length} 个透明 PNG 切图，后台已保存`
        : `已生成 ${files.length} 个透明 PNG 切图`);
    } catch (error) {
      const durationMs = Date.now() - operationStartedAtRef.current;
      setMessages((items) => [
        ...items,
        {
          role: 'error',
          content: `AI 调用失败：${error?.message || '生成失败'}`,
          durationMs,
        }
      ]);
      showToast(error?.message || 'AI 生成切图失败');
    } finally {
      setBusy(false);
      operationStartedAtRef.current = 0;
    }
  };

  if (collapsed) {
    return (
      <aside className="ai-html-agent-panel ai-html-agent-panel-collapsed design-asset-agent-panel" aria-label="AI切图">
        <button
          type="button"
          className="btn btn-icon btn-primary ai-html-agent-panel-expand"
          onClick={() => setCollapsed(false)}
          title="展开 AI 切图"
          aria-label="展开 AI 切图"
          disabled={!isCurrentEditor}
        >
          <Icon name="sparkles" size="md" />
          <span>AI</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="ai-html-agent-panel design-asset-agent-panel">
      <div className="ai-html-agent-panel-header">
        <div>
          <div className="ai-html-agent-panel-title">
            <Icon name="sparkles" size="sm" />
            <span>AI切图</span>
          </div>
          <div className="ai-html-agent-panel-subtitle">{title}</div>
        </div>
        <div className="ai-html-agent-panel-actions">
          <button
            type="button"
            className="btn btn-sm btn-icon btn-secondary ai-html-agent-panel-collapse"
            onClick={() => {
              setCollapsed(true);
              setSelecting(false);
              onCancelRegionSelect?.();
            }}
            title="收起 AI 切图"
            aria-label="收起 AI 切图"
          >
            <Icon name="chevronRight" size="sm" />
          </button>
        </div>
      </div>

      <div className="ai-html-agent-target-row">
        <div className="ai-html-agent-target-actions">
          <button
            className={`btn btn-sm ${selecting ? 'btn-primary' : 'btn-secondary'}`}
            onClick={toggleRegionSelect}
            disabled={busy || !isCurrentEditor}
            title={!isCurrentEditor ? '当前为只读' : undefined}
          >
            <Icon name="crop" size="sm" />
            {selecting ? '完成选择' : regions.length > 0 ? '继续选择' : '选择区域'}
          </button>
          {regions.length > 0 && (
            <button className="btn btn-sm btn-secondary" onClick={clearRegions} disabled={busy}>
              <Icon name="trash" size="sm" />
              清空
            </button>
          )}
        </div>
        <div className="ai-html-agent-target-list">
          {regions.length > 0 ? (
            regions.map((item, index) => (
              <button
                type="button"
                className="ai-html-agent-target-chip"
                onClick={() => removeRegion(item.id)}
                title={formatRegion(item.region)}
                key={item.id}
              >
                <span>{index + 1}. {formatRegion(item.region)}</span>
                <Icon name="x" size="sm" />
              </button>
            ))
          ) : (
            <span className="ai-html-agent-target-empty">
              {selecting ? '可连续框选多个方形区域' : '未选择区域'}
            </span>
          )}
        </div>
        <div className="design-asset-agent-note">
          目前 AI 只能生成方图，选区会保持正方形；已选区域可拖拽或四角缩放。
        </div>
      </div>

      <div className="ai-html-agent-panel-chat">
        {messages.map((message, index) => (
          <div className={`ai-html-agent-message ${message.role}`} key={`${message.role}-${index}`}>
            <div className="ai-html-agent-message-content">{message.content}</div>
            {Number.isFinite(message.durationMs) && (
              <div className="ai-html-agent-message-meta">
                耗时 {formatDuration(message.durationMs)}
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="ai-html-agent-progress">
            <div className="ai-html-agent-progress-head">
              <Icon name="clock" size="sm" />
              <span>正在生成透明 PNG 切图...</span>
            </div>
            <div className="ai-html-agent-progress-count">
              <span>共 {regions.length} 个区域</span>
            </div>
          </div>
        )}
      </div>

      <div className="ai-html-agent-panel-input-row">
        <textarea
          className="form-textarea ai-html-agent-panel-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="描述透明 PNG 的生成要求，例如：保留按钮主体，去掉背景和阴影外溢"
          disabled={busy || !isCurrentEditor}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') generate();
          }}
        />
        <button
          className="btn btn-primary ai-html-agent-panel-send"
          onClick={generate}
          disabled={busy || regions.length === 0 || !isCurrentEditor}
          title="生成透明 PNG"
        >
          <Icon name="arrowUp" size="sm" />
        </button>
      </div>
    </aside>
  );
}
