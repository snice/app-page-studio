import { useState, useRef, useCallback, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { parsePSD } from '../../lib/psdUtils';
import { ImageRegionSelector } from '../picker/ImageRegionSelector';
import { PSDCanvas } from '../psd/PSDCanvas';
import { DesignHtmlAgentPanel } from './DesignHtmlAgentPanel';
import { DesignImageAssetAgentPanel } from './DesignImageAssetAgentPanel';

const DEVICES = [
  { name: 'iPhone 14', width: 375, height: 815 },
  { name: 'iPhone Pro', width: 390, height: 844 },
  { name: 'Android', width: 360, height: 780 },
];

export function PreviewPanel({ onTogglePicker, onToggleColorPicker, iframeRef, onIframeLoad, onRegionAction }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const currentProjectId = useAppStore((s) => s.config.currentProject ?? s.getCurrentProjectId());
  const isCurrentEditor = useAppStore((s) => s.session.isCurrentEditor);
  const isPickerActive = useAppStore((s) => s.isPickerActive);
  const isColorPickerActive = useAppStore((s) => s.isColorPickerActive);
  const isImageRegionSelecting = useAppStore((s) => s.isImageRegionSelecting);
  const setIsImageRegionSelecting = useAppStore((s) => s.setIsImageRegionSelecting);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);
  const zoomLockBySourceType = useAppStore((s) => s.zoomLockBySourceType);
  const toggleZoomLockBySourceType = useAppStore((s) => s.toggleZoomLockBySourceType);

  // PSD state
  const psdMode = useAppStore((s) => s.psdMode);
  const setPsdMode = useAppStore((s) => s.setPsdMode);
  const psdData = useAppStore((s) => s.psdData);
  const setPsdData = useAppStore((s) => s.setPsdData);
  const psdLoading = useAppStore((s) => s.psdLoading);
  const setPsdLoading = useAppStore((s) => s.setPsdLoading);
  const psdSelectedLayer = useAppStore((s) => s.psdSelectedLayer);
  const setPsdSelectedLayer = useAppStore((s) => s.setPsdSelectedLayer);
  const psdHiddenLayerIds = useAppStore((s) => s.psdHiddenLayerIds);
  const psdMarkedSlices = useAppStore((s) => s.psdMarkedSlices);
  const psdSelectedSliceId = useAppStore((s) => s.psdSelectedSliceId);
  const setPsdSelectedSliceId = useAppStore((s) => s.setPsdSelectedSliceId);
  const psdShowSlices = useAppStore((s) => s.psdShowSlices);
  const setActivePanelTab = useAppStore((s) => s.setActivePanelTab);
  const designAssetRegionSelectHandler = useAppStore((s) => s.designAssetRegionSelectHandler);
  const setDesignAssetRegionSelectHandler = useAppStore((s) => s.setDesignAssetRegionSelectHandler);
  const designAssetOverlayRegions = useAppStore((s) => s.designAssetOverlayRegions);

  const imgRef = useRef(null);
  const psdLoadedForPath = useRef(null);

  const [device, setDevice] = useState(DEVICES[0]);
  const [psdCropMode, setPsdCropMode] = useState(false);
  const [designPreviewState, setDesignPreviewState] = useState({ path: null, mode: 'design' });
  const [htmlIrReloadKey, setHtmlIrReloadKey] = useState(0);
  const [htmlIrFrameMissing, setHtmlIrFrameMissing] = useState(false);

  const zoomScale = zoom / 100;

  const adjustZoom = (delta) => {
    setZoom(zoom + Math.round(delta * 100));
  };

  const resetZoom = () => setZoom(100);

  const previewInfo = currentFile
    ? `${currentFile.name || currentFile.path.split('/').pop()} (${device.width}x${device.height})`
    : '未选择文件';

  const isImageMode = currentFile?.sourceType === 'image';
  const isPsdMode = currentFile?.sourceType === 'psd';
  const isPsdLayers = isPsdMode && psdMode === 'layers';
  const showPsdCanvas = isPsdLayers && psdData;
  const isDesignFile = isImageMode || isPsdMode;
  const hasGeneratedHtml = !!currentFile?.generatedHtmlPath;
  const requestedDesignPreviewMode = designPreviewState.path === currentFile?.path
    ? designPreviewState.mode
    : 'design';
  const designPreviewMode = requestedDesignPreviewMode === 'html' ? 'html' : 'design';
  const isHtmlIrPreview = isDesignFile && designPreviewMode === 'html';
  const isDesignImagePreview = isDesignFile && !isHtmlIrPreview;
  const cropModeEnabled = isCurrentEditor && psdCropMode;

  // iframe src
  const iframeSrc = currentFile
    ? currentFile.sourceType === 'html'
      ? `/html/${currentProjectId}/${currentFile.path}`
      : isHtmlIrPreview
        ? hasGeneratedHtml
          ? `/html/${currentProjectId}/${currentFile.generatedHtmlPath}?ir=${htmlIrReloadKey}`
          : null
        : null
    : null;
  const showHtmlIrMissingOverlay = isHtmlIrPreview && (!hasGeneratedHtml || htmlIrFrameMissing);

  const iframeWidth = device.width / zoomScale;
  const iframeHeight = device.height / zoomScale;
  const setCurrentDesignPreviewMode = useCallback((mode) => {
    setDesignPreviewState({ path: currentFile?.path || null, mode });
  }, [currentFile?.path]);

  // 加载 PSD 数据
  const loadPsdData = useCallback(async () => {
    if (!currentFile || currentFile.sourceType !== 'psd') return;
    const filePath = currentFile.path;
    if (psdLoadedForPath.current === filePath && psdData) return;

    setPsdLoading(true);
    try {
      const url = `/html/${currentProjectId}/${filePath}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('PSD 文件加载失败');
      const buffer = await res.arrayBuffer();
      const data = await parsePSD(buffer);

      // 加载 preview PNG 作为裁剪源
      const previewUrl = `/html/${currentProjectId}/${currentFile.previewPath || currentFile.imagePath || filePath}`;
      try {
        const img = await new Promise((resolve, reject) => {
          const i = new Image();
          i.crossOrigin = 'anonymous';
          i.onload = () => resolve(i);
          i.onerror = reject;
          i.src = previewUrl;
        });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        data.previewCanvas = c;
      } catch (e) {
        console.warn('Preview PNG 加载失败，将使用 PSD canvas 作为裁剪源', e);
      }

      setPsdData(data);
      psdLoadedForPath.current = filePath;
    } catch (e) {
      console.error('PSD 解析失败:', e);
    } finally {
      setPsdLoading(false);
    }
  }, [currentFile?.path, currentFile?.previewPath, currentFile?.imagePath, currentProjectId]);

  // 切换到图层模式时自动加载 PSD
  useEffect(() => {
    if (isPsdMode && psdMode === 'layers' && !psdData && !psdLoading) {
      loadPsdData();
    }
  }, [isPsdMode, psdMode, psdData, psdLoading, loadPsdData]);

  // 切换 psdMode 时自动切换右侧 tab
  useEffect(() => {
    if (isPsdMode && psdMode === 'layers') {
      setActivePanelTab('layers');
    } else if (isPsdMode && psdMode === 'preview') {
      setActivePanelTab('file');
    }
  }, [psdMode, isPsdMode]);

  // 文件切换时清理 PSD 数据
  useEffect(() => {
    if (currentFile?.path !== psdLoadedForPath.current) {
      psdLoadedForPath.current = null;
    }
  }, [currentFile?.path]);

  useEffect(() => {
    if (!isCurrentEditor) {
      setIsImageRegionSelecting(false);
      setDesignAssetRegionSelectHandler(null);
    }
  }, [isCurrentEditor, setDesignAssetRegionSelectHandler, setIsImageRegionSelecting]);

  useEffect(() => {
    setHtmlIrFrameMissing(false);
  }, [iframeSrc, currentFile?.path]);

  // PSD 图层选中回调
  const handlePsdSelectLayer = useCallback((layer) => {
    setPsdSelectedLayer(layer);
  }, [setPsdSelectedLayer]);

  // PSD 切图标记点击回调
  const handlePsdClickSlice = useCallback((id) => {
    setPsdSelectedSliceId(id);
  }, [setPsdSelectedSliceId]);

  const handlePreviewIframeLoad = useCallback((event) => {
    onIframeLoad?.(event);
    if (!isHtmlIrPreview) return;
    try {
      const doc = event.currentTarget.contentDocument;
      const bodyText = doc?.body?.innerText?.trim() || '';
      const isMissing = /^(Cannot GET|File not found|Project not found|Not Found)/i.test(bodyText) ||
        /404|not found/i.test(doc?.title || '');
      setHtmlIrFrameMissing(isMissing);
    } catch {
      setHtmlIrFrameMissing(false);
    }
  }, [isHtmlIrPreview, onIframeLoad]);

  const startDesignAssetRegionSelect = useCallback((handler) => {
    setDesignAssetRegionSelectHandler(handler);
    setIsImageRegionSelecting(true);
  }, [setDesignAssetRegionSelectHandler, setIsImageRegionSelecting]);

  const cancelDesignAssetRegionSelect = useCallback(() => {
    setDesignAssetRegionSelectHandler(null);
    setIsImageRegionSelecting(false);
  }, [setDesignAssetRegionSelectHandler, setIsImageRegionSelecting]);

  const handleToggleGeneralPicker = useCallback(() => {
    if (designAssetRegionSelectHandler) {
      setDesignAssetRegionSelectHandler(null);
    }
    onTogglePicker?.();
  }, [designAssetRegionSelectHandler, onTogglePicker, setDesignAssetRegionSelectHandler]);

  return (
    <main className="preview-container">
      <div className="preview-toolbar">
        <div className="device-selector">
          {DEVICES.map((d) => (
            <button
              key={d.name}
              className={`device-btn ${device.name === d.name ? 'active' : ''}`}
              onClick={() => setDevice(d)}
              disabled={isPsdLayers}
            >
              {d.name}
            </button>
          ))}
          {/* PSD 模式切换 */}
          {isPsdMode && (
            <div className="psd-mode-toggle">
              <button
                className={`psd-mode-btn ${psdMode === 'preview' ? 'active' : ''}`}
                onClick={() => setPsdMode('preview')}
              >
                <Icon name="image" size="sm" />
                <span>预览</span>
              </button>
              <button
                className={`psd-mode-btn ${psdMode === 'layers' ? 'active' : ''}`}
                onClick={() => setPsdMode('layers')}
              >
                <Icon name="layers" size="sm" />
                <span>图层</span>
              </button>
            </div>
          )}
          {/* 框选切图按钮 - 仅图层模式显示 */}
          {isPsdLayers && psdData && (
            <button
              className={`crop-btn ${cropModeEnabled ? 'active' : ''}`}
              onClick={() => setPsdCropMode(v => !v)}
              disabled={!isCurrentEditor}
              title={!isCurrentEditor ? '当前为只读' : cropModeEnabled ? '退出框选' : '框选标记切图'}
            >
              <Icon name={cropModeEnabled ? 'x' : 'crop'} size="sm" />
              <span>{cropModeEnabled ? '取消框选' : '框选切图'}</span>
            </button>
          )}
          {isDesignFile && !isPsdLayers && (
            <div className="design-ir-controls">
              <div className="design-ir-segment">
                <button
                  className={`design-ir-segment-btn ${designPreviewMode === 'design' ? 'active' : ''}`}
                  onClick={() => setCurrentDesignPreviewMode('design')}
                >
                  设计图
                </button>
                <button
                  className={`design-ir-segment-btn ${isHtmlIrPreview ? 'active' : ''}`}
                  onClick={() => setCurrentDesignPreviewMode('html')}
                  title={hasGeneratedHtml ? '预览生成的 HTML IR' : '切换后可生成 HTML IR'}
                >
                  HTML IR
                </button>
              </div>
            </div>
          )}
        </div>
        <span className="preview-info">{previewInfo}</span>
        <div className={`preview-actions ${isPsdLayers ? 'is-disabled' : ''}`}>
          <div className="zoom-control">
            <button className="zoom-btn" onClick={() => adjustZoom(-0.02)} title="缩小" disabled={isPsdLayers}>
              <Icon name="minus" size="sm" />
            </button>
            <input
              type="range"
              className="zoom-slider"
              min="25"
              max="150"
              step="1"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              disabled={isPsdLayers}
            />
            <button className="zoom-btn" onClick={() => adjustZoom(0.02)} title="放大" disabled={isPsdLayers}>
              <Icon name="plus" size="sm" />
            </button>
            <span className="zoom-value">{zoom}%</span>
            <button className="zoom-btn" onClick={resetZoom} title="重置" disabled={isPsdLayers}>
              <Icon name="refresh" size="sm" />
            </button>
            <button
              className={`zoom-btn zoom-lock-btn ${zoomLockBySourceType ? 'active' : ''}`}
              onClick={toggleZoomLockBySourceType}
              title={zoomLockBySourceType
                ? `已锁定缩放：同类型 (${currentFile?.sourceType || '-'}) 文件统一使用此缩放`
                : '锁定缩放：同 sourceType 文件统一使用此缩放'}
              disabled={isPsdLayers}
            >
              <Icon name={zoomLockBySourceType ? 'link' : 'linkOff'} size="sm" />
            </button>
          </div>
          <button
            className={`color-picker-btn ${isColorPickerActive ? 'active' : ''}`}
            onClick={onToggleColorPicker}
            disabled={isPsdLayers}
          >
            <Icon name="pipette" />
            <span>{isColorPickerActive ? '停止取色' : '取色'}</span>
          </button>
          <button
            className={`picker-btn ${isPickerActive || isImageRegionSelecting ? 'active' : ''}`}
            onClick={handleToggleGeneralPicker}
            disabled={isPsdLayers || !isCurrentEditor || isHtmlIrPreview}
            title={!isCurrentEditor ? '当前为只读' : isHtmlIrPreview ? '切回设计图后标注交互或切图' : undefined}
          >
            <Icon name="target" />
            <span>{isPickerActive ? '取消选择' : isImageRegionSelecting ? '拖拽选择' : '添加交互'}</span>
          </button>
        </div>
      </div>
      {showPsdCanvas ? (
        /* PSD 图层模式：占满整个预览区域，不使用手机容器 */
        <div className="psd-fullscreen-wrapper">
          {psdLoading ? (
            <div className="psd-loading">
              <div className="psd-loading-spinner" />
              <p>正在解析 PSD 文件...</p>
            </div>
          ) : psdData ? (
            <PSDCanvas
              psdData={psdData}
              selectedLayer={psdSelectedLayer}
              slices={psdMarkedSlices}
              selectedSlice={psdMarkedSlices.find(s => s.id === psdSelectedSliceId) || null}
              showSlices={psdShowSlices}
              hiddenLayerIds={psdHiddenLayerIds}
              onSelectLayer={handlePsdSelectLayer}
              onClickSlice={handlePsdClickSlice}
              cropMode={cropModeEnabled}
              onCropDone={(rect) => {
                if (!isCurrentEditor) return;
                setPsdCropMode(false);
                window.dispatchEvent(new CustomEvent('psd-crop-done', { detail: rect }));
              }}
            />
          ) : null}
        </div>
      ) : (
        <div className={`preview-workspace ${isHtmlIrPreview || isDesignImagePreview ? 'with-agent' : ''}`}>
          <div className="preview-frame-wrapper">
            <div className="phone-frame">
              <div
                className={`phone-screen ${isDesignImagePreview ? 'image-mode' : ''} ${isImageRegionSelecting ? 'image-selecting' : ''}`}
                style={{ width: device.width, height: device.height, position: 'relative' }}
              >
                {iframeSrc ? (
                  <iframe
                    ref={iframeRef}
                    src={iframeSrc}
                    title="preview"
                    onLoad={handlePreviewIframeLoad}
                    style={{
                      width: iframeWidth,
                      height: iframeHeight,
                      transform: `scale(${zoomScale})`,
                      transformOrigin: 'top left',
                    }}
                  />
                ) : isDesignImagePreview && currentFile ? (
                  <>
                    <img
                      ref={imgRef}
                      className="design-image"
                      src={`/html/${currentProjectId}/${currentFile.imagePath || currentFile.previewPath || currentFile.path}`}
                      alt="design"
                      draggable={false}
                      style={{
                        width: device.width,
                        height: 'auto',
                        transform: `scale(${zoomScale})`,
                        transformOrigin: 'top left',
                      }}
                    />
                    {isImageRegionSelecting && (
                      <ImageRegionSelector
                        imgRef={imgRef}
                        deviceWidth={device.width}
                        deviceHeight={device.height}
                        zoomScale={zoomScale}
                        onRegionAction={onRegionAction}
                        onRegionSelected={designAssetRegionSelectHandler}
                        overlayRegions={designAssetRegionSelectHandler ? designAssetOverlayRegions : null}
                        squareSelection={!!designAssetRegionSelectHandler}
                      />
                    )}
                  </>
                ) : (
                  <div className="empty-preview">
                    <div className="empty-preview-icon">
                      <Icon name="fileEmpty" size="xl" />
                    </div>
                    <p>{isHtmlIrPreview ? '尚未生成 HTML IR' : '选择文件预览'}</p>
                  </div>
                )}
                {showHtmlIrMissingOverlay && (
                  <div className="html-ir-missing-overlay">
                    <div className="html-ir-missing-card">
                      <Icon name="fileEmpty" size="lg" />
                      <strong>HTML IR 文件不存在</strong>
                      <span>请在右侧面板生成 HTML IR</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          {isHtmlIrPreview && (
            <DesignHtmlAgentPanel
              key={`${currentFile?.path || 'none'}:${currentFile?.generatedHtmlPath || 'empty'}`}
              device={device}
              iframeRef={iframeRef}
              onGenerated={() => {
                setCurrentDesignPreviewMode('html');
                setHtmlIrReloadKey(Date.now());
              }}
            />
          )}
          {isDesignImagePreview && (
            <DesignImageAssetAgentPanel
              key={`${currentFile?.path || 'none'}:asset-agent`}
              imgRef={imgRef}
              onRequestRegionSelect={startDesignAssetRegionSelect}
              onCancelRegionSelect={cancelDesignAssetRegionSelect}
            />
          )}
        </div>
      )}
    </main>
  );
}
