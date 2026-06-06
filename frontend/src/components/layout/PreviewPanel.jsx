import React, { useState, useRef, useCallback } from 'react';
import { Icon } from '../common/Icon';
import { useAppStore } from '../../lib/state';
import { ImageRegionSelector } from '../picker/ImageRegionSelector';

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

  const imgRef = useRef(null);

  const [device, setDevice] = useState(DEVICES[0]);

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

  const isImageMode = currentFile?.sourceType === 'image' || currentFile?.sourceType === 'psd';

  const iframeWidth = device.width / zoomScale;
  const iframeHeight = device.height / zoomScale;

  return (
    <main className="preview-container">
      <div className="preview-toolbar">
        <div className="device-selector">
          {DEVICES.map((d) => (
            <button
              key={d.name}
              className={`device-btn ${device.name === d.name ? 'active' : ''}`}
              onClick={() => setDevice(d)}
            >
              {d.name}
            </button>
          ))}
        </div>
        <span className="preview-info">{previewInfo}</span>
        <div className="preview-actions">
          <div className="zoom-control">
            <button className="zoom-btn" onClick={() => adjustZoom(-0.02)} title="缩小">
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
            />
            <button className="zoom-btn" onClick={() => adjustZoom(0.02)} title="放大">
              <Icon name="plus" size="sm" />
            </button>
            <span className="zoom-value">{zoom}%</span>
            <button className="zoom-btn" onClick={resetZoom} title="重置">
              <Icon name="refresh" size="sm" />
            </button>
          </div>
          <button
            className={`color-picker-btn ${isColorPickerActive ? 'active' : ''}`}
            onClick={onToggleColorPicker}
          >
            <Icon name="pipette" />
            <span>{isColorPickerActive ? '停止取色' : '取色'}</span>
          </button>
          <button
            className={`picker-btn ${isPickerActive || isImageRegionSelecting ? 'active' : ''}`}
            onClick={onTogglePicker}
          >
            <Icon name="target" />
            <span>{isPickerActive ? '取消选择' : isImageRegionSelecting ? '拖拽选择' : '添加交互'}</span>
          </button>
        </div>
      </div>
      <div className="preview-frame-wrapper">
        <div className="phone-frame">
          <div
            className={`phone-screen ${isImageMode ? 'image-mode' : ''} ${isImageRegionSelecting ? 'image-selecting' : ''}`}
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
            ) : isImageMode && currentFile ? (
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
    </main>
  );
}
