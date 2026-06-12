import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from '../common/Icon';
import { Picker, highlightElement } from '../../lib/picker';
import { copyText } from '../../lib/clipboard';

// ==================== Style extraction helpers ====================

const TEXT_TAGS = new Set(['span','p','h1','h2','h3','h4','h5','h6','a','label','strong','em','b','i','u','small','mark','del','ins','sub','sup','code','pre','blockquote','li','dt','dd','th','td','caption','figcaption','cite','q','abbr','time','var','samp','kbd']);

function formatBoxValue(top, right, bottom, left) {
  const t = parseFloat(top) || 0, r = parseFloat(right) || 0;
  const b = parseFloat(bottom) || 0, l = parseFloat(left) || 0;
  if (t === 0 && r === 0 && b === 0 && l === 0) return '0';
  if (t === r && r === b && b === l) return `${t}px`;
  if (t === b && l === r) return `${t}px ${r}px`;
  return `${t}px ${r}px ${b}px ${l}px`;
}

function formatBorder(style) {
  const w = style.borderTopWidth, s = style.borderTopStyle;
  if (s === 'none' || parseFloat(w) === 0) return 'none';
  return `${w} ${s}`;
}

function formatBorderRadius(style) {
  const tl = parseFloat(style.borderTopLeftRadius) || 0;
  const tr = parseFloat(style.borderTopRightRadius) || 0;
  const br = parseFloat(style.borderBottomRightRadius) || 0;
  const bl = parseFloat(style.borderBottomLeftRadius) || 0;
  if (tl === 0 && tr === 0 && br === 0 && bl === 0) return '0';
  if (tl === tr && tr === br && br === bl) return `${tl}px`;
  return `${tl}px ${tr}px ${br}px ${bl}px`;
}

function rgbaToHex(rgba) {
  const m = rgba.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return rgba;
  return '#' + [m[1], m[2], m[3]].map(x => parseInt(x).toString(16).padStart(2, '0')).join('').toLowerCase();
}

function extractElementStyles(el, style) {
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    lineHeight: style.lineHeight,
    letterSpacing: style.letterSpacing,
    color: style.color,
    textAlign: style.textAlign,
    textDecoration: style.textDecoration,
    width: style.width,
    height: style.height,
    padding: formatBoxValue(style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft),
    margin: formatBoxValue(style.marginTop, style.marginRight, style.marginBottom, style.marginLeft),
    border: formatBorder(style),
    borderRadius: formatBorderRadius(style),
    backgroundColor: style.backgroundColor,
    backgroundImage: style.backgroundImage,
    opacity: style.opacity,
    boxShadow: style.boxShadow === 'none' ? 'none' : '有阴影',
    display: style.display,
    position: style.position,
    flexDirection: style.flexDirection,
    justifyContent: style.justifyContent,
    alignItems: style.alignItems,
    gap: style.gap,
    overflow: style.overflow,
    zIndex: style.zIndex,
  };
}

// ==================== Sub-components ====================

function StyleRow({ label, value, onCopy }) {
  if (!value || value === 'none' || value === 'normal' || value === 'auto' || value === 'static') return null;
  const display = value.length > 30 ? value.slice(0, 30) + '…' : value;
  return (
    <div className="styles-row">
      <span className="styles-label">{label}</span>
      <span
        className="styles-value copyable"
        title={`点击复制: ${value}`}
        onClick={() => onCopy(value)}
      >{display}</span>
    </div>
  );
}

function ColorRow({ label, colorValue, onCopy }) {
  if (!colorValue || colorValue === 'transparent' || colorValue === 'rgba(0, 0, 0, 0)') return null;
  const hex = rgbaToHex(colorValue);
  return (
    <div className="styles-row">
      <span className="styles-label">{label}</span>
      <span className="styles-value color-value" title={`点击复制: ${hex}`} onClick={() => onCopy(hex)}>
        <span className="color-swatch" style={{ background: colorValue }} />
        <span>{hex}</span>
      </span>
    </div>
  );
}

function ImageRow({ label, url, onPreview }) {
  if (!url) return null;
  return (
    <div className="styles-row bg-image-row">
      <span className="styles-label">{label}</span>
      <span className="styles-value bg-image-value" title="点击放大查看" onClick={() => onPreview(url)}>
        <img src={url} className="bg-image-thumbnail" alt={label} onError={e => e.target.style.display = 'none'} />
        <span className="bg-image-hint">点击放大</span>
      </span>
    </div>
  );
}

function extractBgImageUrl(bgImage) {
  if (!bgImage || bgImage === 'none') return null;
  const m = bgImage.match(/url\(["']?([^"')]+)["']?\)/);
  return m ? m[1] : null;
}

function ImagePreviewOverlay({ url, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="image-preview-overlay" onClick={onClose}>
      <div className="image-preview-container" onClick={e => e.stopPropagation()}>
        <button className="image-preview-close" onClick={onClose}><Icon name="x" /></button>
        <img src={url} className="image-preview-img" alt="背景图预览" />
      </div>
    </div>
  );
}

// ==================== Main panel ====================

export function ElementStylesPanel({ selector, iframeRef, onClose }) {
  const panelRef = useRef(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  // Extract styles from selected element in iframe
  const el = Picker.selectedElement;

  // Compute styles synchronously (panel is mounted right after element click)
  const styleInfo = useRef(null);
  const tagName = useRef('');
  const isTextEl = useRef(false);
  const textContent = useRef('');

  if (!styleInfo.current) {
    const iframe = iframeRef?.current;
    if (iframe?.contentDocument && el) {
      const doc = iframe.contentDocument;
      const cs = doc.defaultView.getComputedStyle(el);
      tagName.current = el.tagName.toLowerCase();
      isTextEl.current = TEXT_TAGS.has(tagName.current);
      textContent.current = isTextEl.current ? (el.textContent || '').trim().slice(0, 50) : '';
      styleInfo.current = extractElementStyles(el, cs);
      const resolveUrl = (raw) => {
        if (!raw) return '';
        try { return new URL(raw, doc.baseURI).href; } catch { return raw; }
      };
      if (tagName.current === 'img') {
        styleInfo.current.imgSrc = resolveUrl(el.getAttribute('src'));
      }
      const bgUrl = extractBgImageUrl(styleInfo.current.backgroundImage);
      if (bgUrl) styleInfo.current.bgImageUrl = resolveUrl(bgUrl);
    }
  }

  const info = styleInfo.current;

  // Drag logic
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const header = panel.querySelector('.styles-panel-header');
    if (!header) return;

    let dragging = false, startX, startY, px, py, pw, ph;
    let pendingX = 0, pendingY = 0, rafId = 0;

    const flush = () => {
      rafId = 0;
      panel.style.transform = `translate3d(${pendingX}px, ${pendingY}px, 0)`;
    };

    const onDown = (e) => {
      if (e.target.closest('.modal-close')) return;
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      const r = panel.getBoundingClientRect();
      px = r.left; py = r.top; pw = r.width; ph = r.height;
      panel.style.right = 'auto';
      panel.style.left = px + 'px';
      panel.style.top = py + 'px';
      panel.style.transform = 'translate3d(0,0,0)';
      panel.style.willChange = 'transform';
      pendingX = 0; pendingY = 0;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      e.preventDefault();
    };

    const onMove = (e) => {
      if (!dragging) return;
      let dx = e.clientX - startX;
      let dy = e.clientY - startY;
      const minDx = -px;
      const maxDx = window.innerWidth - pw - px;
      const minDy = -py;
      const maxDy = window.innerHeight - ph - py;
      pendingX = Math.max(minDx, Math.min(dx, maxDx));
      pendingY = Math.max(minDy, Math.min(dy, maxDy));
      if (!rafId) rafId = requestAnimationFrame(flush);
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
      panel.style.left = (px + pendingX) + 'px';
      panel.style.top = (py + pendingY) + 'px';
      panel.style.transform = '';
      panel.style.willChange = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };

    header.addEventListener('mousedown', onDown);
    return () => {
      header.removeEventListener('mousedown', onDown);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const copyToClipboard = useCallback((value) => {
    copyText(value);
  }, []);

  const handleHighlight = useCallback(() => {
    highlightElement(iframeRef?.current, selector);
  }, [iframeRef, selector]);

  if (!info) return null;

  const isFlex = info.display === 'flex' || info.display === 'inline-flex';

  return (
    <>
      <div className="element-styles-panel" ref={panelRef}>
        <div className="styles-panel-header">
          <div className="styles-panel-title">
            <Icon name="code" size="md" />
            <span>元素样式</span>
          </div>
          <button className="modal-close" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="styles-panel-body">

          <div className="styles-section">
            <div className="styles-section-title">基本信息</div>
            <div className="styles-row">
              <span className="styles-label">标签</span>
              <span className="styles-value tag-value">&lt;{tagName.current}&gt;</span>
            </div>
            <div className="styles-row">
              <span className="styles-label">选择器</span>
              <span className="styles-value selector-value" title="点击定位元素" onClick={handleHighlight}>{selector}</span>
            </div>
            {textContent.current && (
              <div className="styles-row">
                <span className="styles-label">文本内容</span>
                <span className="styles-value text-content">
                  {textContent.current}{textContent.current.length >= 50 ? '…' : ''}
                </span>
              </div>
            )}
          </div>

          {isTextEl.current && (
            <div className="styles-section">
              <div className="styles-section-title">
                <Icon name="type" size="sm" />
                文字样式
              </div>
              <StyleRow label="字体" value={info.fontFamily} onCopy={copyToClipboard} />
              <StyleRow label="字号" value={info.fontSize} onCopy={copyToClipboard} />
              <StyleRow label="字重" value={info.fontWeight} onCopy={copyToClipboard} />
              <StyleRow label="行高" value={info.lineHeight} onCopy={copyToClipboard} />
              <StyleRow label="字间距" value={info.letterSpacing} onCopy={copyToClipboard} />
              <ColorRow label="文字颜色" colorValue={info.color} onCopy={copyToClipboard} />
              <StyleRow label="对齐" value={info.textAlign} onCopy={copyToClipboard} />
              <StyleRow label="装饰" value={info.textDecoration} onCopy={copyToClipboard} />
            </div>
          )}

          <div className="styles-section">
            <div className="styles-section-title">
              <Icon name="package" size="sm" />
              盒模型
            </div>
            <StyleRow label="宽度" value={info.width} onCopy={copyToClipboard} />
            <StyleRow label="高度" value={info.height} onCopy={copyToClipboard} />
            <StyleRow label="内边距" value={info.padding} onCopy={copyToClipboard} />
            <StyleRow label="外边距" value={info.margin} onCopy={copyToClipboard} />
            <StyleRow label="边框" value={info.border} onCopy={copyToClipboard} />
            <StyleRow label="圆角" value={info.borderRadius} onCopy={copyToClipboard} />
          </div>

          <div className="styles-section">
            <div className="styles-section-title">
              <Icon name="palette" size="sm" />
              背景与视觉
            </div>
            <ColorRow label="背景色" colorValue={info.backgroundColor} onCopy={copyToClipboard} />
            <ImageRow label="图片" url={info.imgSrc} onPreview={setPreviewUrl} />
            <ImageRow label="背景图" url={info.bgImageUrl} onPreview={setPreviewUrl} />
            <StyleRow label="透明度" value={info.opacity} onCopy={copyToClipboard} />
            <StyleRow label="阴影" value={info.boxShadow} onCopy={copyToClipboard} />
          </div>

          <div className="styles-section">
            <div className="styles-section-title">
              <Icon name="target" size="sm" />
              布局
            </div>
            <StyleRow label="显示" value={info.display} onCopy={copyToClipboard} />
            <StyleRow label="定位" value={info.position} onCopy={copyToClipboard} />
            {isFlex && <>
              <StyleRow label="主轴方向" value={info.flexDirection} onCopy={copyToClipboard} />
              <StyleRow label="主轴对齐" value={info.justifyContent} onCopy={copyToClipboard} />
              <StyleRow label="交叉轴对齐" value={info.alignItems} onCopy={copyToClipboard} />
              <StyleRow label="间距" value={info.gap} onCopy={copyToClipboard} />
            </>}
            <StyleRow label="溢出" value={info.overflow} onCopy={copyToClipboard} />
            <StyleRow label="层级" value={info.zIndex} onCopy={copyToClipboard} />
          </div>

        </div>
      </div>

      {previewUrl && <ImagePreviewOverlay url={previewUrl} onClose={() => setPreviewUrl(null)} />}
    </>
  );
}
