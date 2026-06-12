import { highlightElement, highlightElements } from '../../../lib/picker';

export const UNGROUPED_KEY = '__ungrouped__';

/** 格式化区域标签 - 显示 device 坐标 */
export function formatRegionLabel(item) {
  if (item.selector && item.selector !== '区域') return item.selector;
  if (item.region) {
    const r = item.region.device || item.region.image || item.region;
    if (r && r.x !== undefined) return `区域 [${r.x}, ${r.y}, ${r.width}, ${r.height}]`;
  }
  return '(未选择)';
}

/** 在图片上高亮区域 */
export function highlightImageRegion(region) {
  const screen = document.querySelector('.phone-screen');
  const img = document.querySelector('.design-image');
  if (!screen || !img) return;
  if (!region || !region.image) return;

  const rect = img.getBoundingClientRect();
  const imageW = img.naturalWidth || rect.width;
  const imageH = img.naturalHeight || rect.height;
  if (!imageW || !imageH) return;
  const scale = Math.min(rect.width / imageW, rect.height / imageH);
  const drawW = imageW * scale;
  const drawH = imageH * scale;
  const offsetX = (rect.width - drawW) / 2;
  const offsetY = (rect.height - drawH) / 2;

  const imgR = region.image;
  const x = imgR.x * scale + offsetX;
  const y = imgR.y * scale + offsetY;
  const w = imgR.width * scale;
  const h = imgR.height * scale;

  screen.querySelectorAll('.image-region-highlight').forEach(el => el.remove());

  const highlight = document.createElement('div');
  highlight.className = 'image-region-highlight';
  highlight.style.left = `${x}px`;
  highlight.style.top = `${y}px`;
  highlight.style.width = `${w}px`;
  highlight.style.height = `${h}px`;
  screen.appendChild(highlight);

  const highlightTop = y;
  const highlightBottom = y + h;
  const scrollTop = screen.scrollTop;
  const screenH = screen.clientHeight;

  if (highlightTop < scrollTop) {
    screen.scrollTo({ top: Math.max(0, highlightTop - 20), behavior: 'smooth' });
  } else if (highlightBottom > scrollTop + screenH) {
    screen.scrollTo({ top: highlightBottom - screenH + 20, behavior: 'smooth' });
  }

  setTimeout(() => highlight.remove(), 3000);
}

/** 高亮交互项（区域或元素） */
export function highlightItem(item, iframeRef) {
  if (item.region) {
    highlightImageRegion(item.region);
  } else if (item.selector && item.selector !== '区域') {
    highlightElement(iframeRef?.current, item.selector);
  }
}

/** 同时高亮多个交互项（区域 + 元素） */
export function highlightItems(items, iframeRef) {
  if (!Array.isArray(items) || items.length === 0) return;
  const selectors = items
    .filter(it => !it.region && it.selector && it.selector !== '区域')
    .map(it => it.selector);
  highlightElements(iframeRef?.current, selectors);

  const screen = document.querySelector('.phone-screen');
  const img = document.querySelector('.design-image');
  if (!screen || !img) return;
  screen.querySelectorAll('.image-region-highlight').forEach(el => el.remove());
  const rect = img.getBoundingClientRect();
  const imageW = img.naturalWidth || rect.width;
  const imageH = img.naturalHeight || rect.height;
  if (!imageW || !imageH) return;
  const scale = Math.min(rect.width / imageW, rect.height / imageH);
  const offsetX = (rect.width - imageW * scale) / 2;
  const offsetY = (rect.height - imageH * scale) / 2;
  const created = [];
  for (const it of items) {
    const r = it.region?.image;
    if (!r) continue;
    const div = document.createElement('div');
    div.className = 'image-region-highlight';
    div.style.left = `${r.x * scale + offsetX}px`;
    div.style.top = `${r.y * scale + offsetY}px`;
    div.style.width = `${r.width * scale}px`;
    div.style.height = `${r.height * scale}px`;
    screen.appendChild(div);
    created.push(div);
  }
  if (created.length > 0) {
    setTimeout(() => created.forEach(el => el.remove()), 3000);
  }
}
