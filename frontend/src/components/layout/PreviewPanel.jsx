import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { parsePSD } from '../../lib/psdUtils';
import { ImageRegionSelector } from '../picker/ImageRegionSelector';
import { PSDCanvas } from '../psd/PSDCanvas';

const DEVICES = [
  { name: 'iPhone 14', width: 375, height: 812 },
  { name: 'iPhone Pro', width: 390, height: 844 },
  { name: 'Android', width: 360, height: 780 },
];

export function PreviewPanel({ onTogglePicker, onToggleColorPicker, iframeRef, onIframeLoad, onRegionAction }) {
  const currentFile = useAppStore((s) => s.currentFile);
  const currentProjectId = useAppStore((s) => s.config.currentProject ?? s.getCurrentProjectId());
  const isPickerActive = useAppStore((s) => s.isPickerActive);
  const isColorPickerActive = useAppStore((s) => s.isColorPickerActive);
  const isImageRegionSelecting = useAppStore((s) => s.isImageRegionSelecting);
  const zoom = useAppStore((s) => s.zoom);
  const setZoom = useAppStore((s) => s.setZoom);

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

  const imgRef = useRef(null);
  const psdLoadedForPath = useRef(null);

  const [device, setDevice] = useState(DEVICES[0]);
  const [psdCropMode, setPsdCropMode] = useState(false);

  const zoomScale = zoom / 100;

  const adjustZoom = (delta) => {
    setZoom(zoom + Math.round(delta * 100));
  };

  const resetZoom = () => setZoom(100);

  const previewInfo = currentFile
    ? `${currentFile.name || currentFile.path.split('/').pop()} (${device.width}x${device.height})`
    : '未选择文件';

  // iframe src
  const iframeSrc = currentFile
    ? currentFile.sourceType === 'html'
      ? `/html/${currentProjectId}/${currentFile.path}` : null
    : null;

  const isImageMode = currentFile?.sourceType === 'image';
  const isPsdMode = currentFile?.sourceType === 'psd';
  const isPsdLayers = isPsdMode && psdMode === 'layers';
  const showPsdCanvas = isPsdLayers && psdData;

  const iframeWidth = device.width / zoomScale;
  const iframeHeight = device.height / zoomScale;

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

  // PSD 图层选中回调
  const handlePsdSelectLayer = useCallback((layer) => {
    setPsdSelectedLayer(layer);
  }, [setPsdSelectedLayer]);

  // PSD 切图标记点击回调
  const handlePsdClickSlice = useCallback((id) => {
    setPsdSelectedSliceId(id);
  }, [setPsdSelectedSliceId]);

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
              className={`crop-btn ${psdCropMode ? 'active' : ''}`}
              onClick={() => setPsdCropMode(v => !v)}
              title={psdCropMode ? '退出框选' : '框选标记切图'}
            >
              <Icon name={psdCropMode ? 'x' : 'crop'} size="sm" />
              <span>{psdCropMode ? '取消框选' : '框选切图'}</span>
            </button>
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
            onClick={onTogglePicker}
            disabled={isPsdLayers}
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
              cropMode={psdCropMode}
              onCropDone={(rect) => {
                setPsdCropMode(false);
                window.dispatchEvent(new CustomEvent('psd-crop-done', { detail: rect }));
              }}
            />
          ) : null}
        </div>
      ) : (
      <div className="preview-frame-wrapper">
        <div className="phone-frame">
          <div
            className={`phone-screen ${isImageMode || isPsdMode ? 'image-mode' : ''} ${isImageRegionSelecting ? 'image-selecting' : ''}`}
            style={{ width: device.width, height: device.height, position: 'relative' }}
          >
            {iframeSrc ? (
              <iframe
                ref={iframeRef}
                src={iframeSrc}
                title="preview"
                onLoad={onIframeLoad}
                style={{
                  width: iframeWidth,
                  height: iframeHeight,
                  transform: `scale(${zoomScale})`,
                  transformOrigin: 'top left',
                }}
              />
            ) : (isImageMode || isPsdMode) && currentFile ? (
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
                  />
                )}
              </>
            ) : (
              <div className="empty-preview">
                <div className="empty-preview-icon">
                  <Icon name="fileEmpty" size="xl" />
                </div>
                <p>选择文件预览</p>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </main>
  );
}
