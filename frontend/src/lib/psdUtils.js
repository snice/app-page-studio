/**
 * PSD 工具模块
 * 基于 ag-psd 解析 PSD 文件，提供图层操作、合成等工具函数
 */
import { readPsd, initializeCanvas } from 'ag-psd';

/**
 * @typedef {Object} LayerInfo
 * @property {string} id
 * @property {string} name
 * @property {'group'|'text'|'shape'|'image'|'unknown'} type
 * @property {boolean} visible
 * @property {number} opacity
 * @property {number} left
 * @property {number} top
 * @property {number} width
 * @property {number} height
 * @property {LayerInfo[]} [children]
 * @property {HTMLCanvasElement} [canvas]
 * @property {string} [text]
 * @property {HTMLCanvasElement} [maskCanvas]
 * @property {number} [maskLeft]
 * @property {number} [maskTop]
 * @property {boolean} [maskDisabled]
 * @property {boolean} [maskRelativeToLayer]
 * @property {number} [maskDefaultColor]
 * @property {boolean} [clipping]
 */

/**
 * @typedef {Object} PSDData
 * @property {number} width
 * @property {number} height
 * @property {HTMLCanvasElement} canvas
 * @property {LayerInfo[]} layers
 */

function detectLayerType(layer) {
  if (layer.children) return 'group';
  if (layer.text) return 'text';
  if (layer.vectorOrigination || layer.vectorMask) return 'shape';
  if (layer.canvas) return 'image';
  return 'unknown';
}

let layerCounter = 0;

function mapLayer(layer) {
  const id = `layer-${++layerCounter}`;
  const width = layer.right !== undefined && layer.left !== undefined ? layer.right - layer.left : 0;
  const height = layer.bottom !== undefined && layer.top !== undefined ? layer.bottom - layer.top : 0;
  return {
    id,
    name: layer.name || `图层 ${id}`,
    type: detectLayerType(layer),
    visible: !layer.hidden,
    opacity: layer.opacity ?? 1,
    left: layer.left ?? 0,
    top: layer.top ?? 0,
    width,
    height,
    clipping: layer.clipping,
    maskCanvas: layer.mask?.canvas,
    maskLeft: layer.mask?.left,
    maskTop: layer.mask?.top,
    maskDisabled: layer.mask?.disabled,
    maskRelativeToLayer: layer.mask?.positionRelativeToLayer,
    maskDefaultColor: layer.mask?.defaultColor,
    children: layer.children?.map(mapLayer),
    canvas: layer.canvas,
    text: layer.text?.text,
  };
}

/**
 * 解析 PSD 文件
 * @param {ArrayBuffer} buffer
 * @returns {Promise<PSDData>}
 */
export async function parsePSD(buffer) {
  layerCounter = 0;

  initializeCanvas((width, height) => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  });

  const psd = readPsd(buffer, { skipCompositeImageData: false, skipLayerImageData: false });

  const mainCanvas = document.createElement('canvas');
  mainCanvas.width = psd.width;
  mainCanvas.height = psd.height;
  const ctx = mainCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, psd.width, psd.height);
  if (psd.canvas) {
    ctx.drawImage(psd.canvas, 0, 0);
  }

  const layers = (psd.children ?? []).map(mapLayer);
  return { width: psd.width, height: psd.height, canvas: mainCanvas, layers };
}

/**
 * 扁平化图层树
 * @param {LayerInfo[]} layers
 * @returns {LayerInfo[]}
 */
export function flattenLayers(layers) {
  return layers.flatMap(l => [l, ...(l.children ? flattenLayers(l.children) : [])]);
}

/**
 * 计算多个图层的包围盒
 * @param {LayerInfo[]} layers
 * @returns {{left: number, top: number, width: number, height: number}}
 */
export function unionBBox(layers) {
  const valid = layers.filter(l => l.width > 0 && l.height > 0);
  if (!valid.length) return { left: 0, top: 0, width: 0, height: 0 };
  const left = Math.min(...valid.map(l => l.left));
  const top = Math.min(...valid.map(l => l.top));
  const right = Math.max(...valid.map(l => l.left + l.width));
  const bottom = Math.max(...valid.map(l => l.top + l.height));
  return { left, top, width: right - left, height: bottom - top };
}

/**
 * 收集图层下所有可绘制叶子图层
 * @param {LayerInfo} layer
 * @returns {LayerInfo[]}
 */
export function collectDrawableLayers(layer) {
  if (layer.children?.length) {
    return layer.children.flatMap(collectDrawableLayers);
  }
  if (layer.canvas && layer.width > 0 && layer.height > 0) return [layer];
  return [];
}

/**
 * 获取图层标记切图时的目标和包围盒
 * @param {LayerInfo} layer
 * @returns {{bbox: {left:number,top:number,width:number,height:number}, layerIds: string[]}}
 */
export function layerMarkTargets(layer) {
  const drawable = collectDrawableLayers(layer);
  if (drawable.length > 0) {
    return { bbox: unionBBox(drawable), layerIds: drawable.map(l => l.id) };
  }
  return {
    bbox: { left: layer.left, top: layer.top, width: layer.width, height: layer.height },
    layerIds: [layer.id],
  };
}

/**
 * 检查图层是否已被标记为切图
 * @param {LayerInfo} layer
 * @param {Set<string>} markedIds
 * @returns {boolean}
 */
export function isLayerMarked(layer, markedIds) {
  if (markedIds.has(layer.id)) return true;
  if (!layer.children?.length) return false;
  const drawable = collectDrawableLayers(layer);
  return drawable.length > 0 && drawable.every(l => markedIds.has(l.id));
}

/**
 * 应用图层蒙版
 * @param {LayerInfo} layer
 * @param {HTMLCanvasElement} src
 * @returns {HTMLCanvasElement}
 */
export function applyLayerMask(layer, src) {
  if (!layer.maskCanvas || layer.maskDisabled) return src;

  const out = document.createElement('canvas');
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const data = ctx.getImageData(0, 0, out.width, out.height);
  const mc = layer.maskCanvas;
  const mctx = mc.getContext('2d');
  const mData = mctx.getImageData(0, 0, mc.width, mc.height).data;
  const maskRel = layer.maskRelativeToLayer ?? false;
  const defaultVisible = (layer.maskDefaultColor ?? 255) > 127;
  const maskLeft = maskRel ? 0 : (layer.maskLeft ?? 0);
  const maskTop = maskRel ? 0 : (layer.maskTop ?? 0);

  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const docX = layer.left + x;
      const docY = layer.top + y;
      const mx = maskRel ? x : docX - maskLeft;
      const my = maskRel ? y : docY - maskTop;
      let m;
      if (mx < 0 || my < 0 || mx >= mc.width || my >= mc.height) {
        m = defaultVisible ? 255 : 0;
      } else {
        m = mData[(my * mc.width + mx) * 4];
      }
      const i = (y * out.width + x) * 4;
      data.data[i + 3] = Math.round(data.data[i + 3] * m / 255);
    }
  }
  ctx.putImageData(data, 0, 0);
  return out;
}

/**
 * 合成指定图层的切图
 * @param {PSDData} psdData
 * @param {string[]} layerIds
 * @param {{left:number,top:number,width:number,height:number}} slice
 * @returns {HTMLCanvasElement}
 */
export function compositeSliceLayers(psdData, layerIds, slice) {
  const idSet = new Set(layerIds);
  const out = document.createElement('canvas');
  out.width = Math.max(1, slice.width);
  out.height = Math.max(1, slice.height);
  const ctx = out.getContext('2d');

  function drawLayer(layer) {
    if (!layer.canvas || !layer.visible || layer.width <= 0 || layer.height <= 0) return;
    const src = applyLayerMask(layer, layer.canvas);
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(src, layer.left - slice.left, layer.top - slice.top);
    ctx.globalAlpha = 1;
  }

  function walk(layers) {
    for (const layer of layers) {
      if (layer.children) {
        walk(layer.children);
      } else if (idSet.has(layer.id)) {
        drawLayer(layer);
      }
    }
  }

  walk(psdData.layers);
  return out;
}

/**
 * 导出切图为 dataURL
 * @param {PSDData} psdData
 * @param {{source:string,layerIds:string[],left:number,top:number,width:number,height:number,exportAs:string}} slice
 * @param {string} [forceFormat] - 强制输出格式（忽略 slice.exportAs），如 'png'/'jpg'
 * @returns {{dataUrl:string, ext:string}}
 */
export function exportSlice(psdData, slice, forceFormat) {
  let composited;
  if (slice.source === 'crop' || slice.layerIds.length === 0) {
    // crop 时优先使用 previewPng（PNG 预览图）
    const src = psdData.previewCanvas || psdData.canvas;
    composited = document.createElement('canvas');
    composited.width = Math.max(1, slice.width);
    composited.height = Math.max(1, slice.height);
    composited.getContext('2d').drawImage(
      src,
      slice.left, slice.top, slice.width, slice.height,
      0, 0, slice.width, slice.height,
    );
  } else {
    composited = compositeSliceLayers(psdData, slice.layerIds, slice);
  }

  const format = forceFormat || slice.exportAs || 'png';
  const isJpg = format === 'jpg';
  if (isJpg) {
    const tmp = document.createElement('canvas');
    tmp.width = composited.width;
    tmp.height = composited.height;
    const ctx = tmp.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, tmp.width, tmp.height);
    ctx.drawImage(composited, 0, 0);
    return { dataUrl: tmp.toDataURL('image/jpeg', 0.92), ext: 'jpg' };
  }
  if (format === 'svg') {
    const pngDataUrl = composited.toDataURL('image/png');
    const w = composited.width;
    const h = composited.height;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image href="${pngDataUrl}" width="${w}" height="${h}"/></svg>`;
    return { dataUrl: 'data:image/svg+xml;base64,' + btoa(svg), ext: 'svg' };
  }
  return { dataUrl: composited.toDataURL('image/png'), ext: 'png' };
}

/** 切图颜色列表 */
export const SLICE_COLORS = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#dda0dd', '#98d8c8'];
let colorIdx = 0;
export function nextSliceColor() { return SLICE_COLORS[colorIdx++ % SLICE_COLORS.length]; }
