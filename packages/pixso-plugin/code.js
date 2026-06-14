const PLUGIN_VERSION = '0.1.0';
const STORAGE_KEY = 'app-page-studio-pixso-exporter-settings-v1';
const MAX_PAGES = 20;
const MAX_SLICES_PER_PAGE = 120;
const hostApi = typeof pixso !== 'undefined'
  ? pixso
  : (typeof figma !== 'undefined' ? figma : null);

if (!hostApi) {
  throw new Error('Pixso plugin API is unavailable.');
}

hostApi.showUI(__html__, { width: 380, height: 670 });

init();

async function init() {
  const settings = await readSettings();
  hostApi.ui.postMessage({ type: 'settings', settings: settings || {} });
}

async function readSettings() {
  try {
    return await hostApi.clientStorage.getAsync(STORAGE_KEY);
  } catch (error) {
    return null;
  }
}

async function writeSettings(settings) {
  try {
    await hostApi.clientStorage.setAsync(STORAGE_KEY, settings);
  } catch (error) {
    // Development plugins may not have a plugin ID, which disables clientStorage.
  }
}

hostApi.ui.onmessage = async (message) => {
  try {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'close') {
      hostApi.closePlugin();
      return;
    }
    if (message.type === 'save-settings') {
      const settingsInput = message.settings || {};
      const settings = {
        serverUrl: settingsInput.serverUrl || '',
        token: settingsInput.token || ''
      };
      await writeSettings(settings);
      return;
    }
    if (message.type === 'scan') {
      const pages = getPageNodes(message.options).map((node) => summarizePage(node, message.options));
      hostApi.ui.postMessage({ type: 'scan-result', requestId: message.requestId, pages });
      return;
    }
    if (message.type === 'export') {
      const payload = await exportPayload(message.options || {});
      hostApi.ui.postMessage({ type: 'export-done', payload });
    }
  } catch (error) {
    hostApi.ui.postMessage({
      type: 'error',
      operation: message && message.type ? message.type : null,
      requestId: message && message.requestId ? message.requestId : null,
      message: error && error.message ? error.message : String(error)
    });
  }
};

function isExportableNode(node) {
  return !!node && typeof node.exportAsync === 'function' && !!node.absoluteBoundingBox;
}

function isPageNode(node) {
  if (!isExportableNode(node)) return false;
  return ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE', 'GROUP', 'SECTION'].includes(node.type);
}

function nearestPageNode(node) {
  let current = node;
  while (current && current.type !== 'PAGE') {
    if (isPageNode(current)) return current;
    current = current.parent;
  }
  return null;
}

function uniqueNodes(nodes) {
  const seen = new Set();
  const result = [];
  for (const node of nodes) {
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    result.push(node);
  }
  return result;
}

function getPageNodes(options = {}) {
  const scope = options.scope || 'selection';
  if (scope === 'current-page') {
    return hostApi.currentPage.children.filter(isPageNode).slice(0, MAX_PAGES);
  }

  const selected = hostApi.currentPage.selection
    .map(nearestPageNode)
    .filter(Boolean);
  return uniqueNodes(selected).slice(0, MAX_PAGES);
}

function walkChildren(node, visit) {
  if (!node || !('children' in node)) return;
  for (const child of node.children) {
    visit(child);
    walkChildren(child, visit);
  }
}

function hasExportSettings(node) {
  return Array.isArray(node.exportSettings) && node.exportSettings.length > 0;
}

function isNamedSlice(node) {
  const name = String((node && node.name) || '').trim().toLowerCase();
  return (
    name.startsWith('@slice') ||
    name.startsWith('#slice') ||
    name.startsWith('[slice]') ||
    name.startsWith('slice/') ||
    name.startsWith('slice:') ||
    name.startsWith('slice_') ||
    name.startsWith('slice-')
  );
}

function cleanSliceName(name) {
  return String(name || 'slice')
    .replace(/^(@slice|#slice|\[slice\]|slice[/:_-])\s*/i, '')
    .trim() || 'slice';
}

function getSliceNodes(pageNode, options = {}) {
  const includeExportSettings = options.includeExportSettings !== false;
  const includeNamedSlices = options.includeNamedSlices !== false;
  const slices = [];
  walkChildren(pageNode, (node) => {
    if (!isExportableNode(node)) return;
    if (node.visible === false) return;
    const byExport = includeExportSettings && hasExportSettings(node);
    const byName = includeNamedSlices && isNamedSlice(node);
    if (byExport || byName) slices.push(node);
  });
  return slices.slice(0, MAX_SLICES_PER_PAGE);
}

function summarizePage(node, options = {}) {
  const box = node.absoluteBoundingBox || { width: 0, height: 0 };
  return {
    nodeId: node.id,
    name: node.name,
    type: node.type,
    width: Math.round(box.width || 0),
    height: Math.round(box.height || 0),
    slices: getSliceNodes(node, options).length
  };
}

function postProgress(done, total, label) {
  hostApi.ui.postMessage({ type: 'export-progress', done, total, label });
}

async function exportPayload(options = {}) {
  const pages = getPageNodes(options);
  if (pages.length === 0) {
    throw new Error('请选择一个 Frame/Component/Group，或切换为当前页顶层 Frame。');
  }

  const pageScale = normalizeScale(options.pageScale, 1);
  const sliceScale = normalizeScale(options.sliceScale, 1);
  const sliceMap = new Map(pages.map((page) => [page.id, getSliceNodes(page, options)]));
  const total = pages.length + Array.from(sliceMap.values()).reduce((sum, list) => sum + list.length, 0);
  let done = 0;

  const exportedPages = [];
  for (const page of pages) {
    const box = page.absoluteBoundingBox;
    postProgress(done, total, `导出 ${page.name}`);
    const imageBytes = await page.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: pageScale }
    });
    done += 1;
    postProgress(done, total, `已导出 ${page.name}`);

    const exportedPage = {
      nodeId: page.id,
      name: page.name,
      type: page.type,
      width: Math.round(box.width || 0),
      height: Math.round(box.height || 0),
      scale: pageScale,
      image: {
        mimeType: 'image/png',
        data: bytesToBase64(imageBytes)
      },
      slices: []
    };

    const slices = sliceMap.get(page.id) || [];
    for (const slice of slices) {
      postProgress(done, total, `导出切图 ${slice.name}`);
      const sliceBytes = await slice.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: sliceScale }
      });
      done += 1;
      postProgress(done, total, `已导出切图 ${slice.name}`);
      exportedPage.slices.push(buildSlicePayload(page, slice, sliceScale, sliceBytes));
    }

    exportedPages.push(exportedPage);
  }

  return {
    source: {
      tool: 'pixso',
      fileKey: typeof hostApi.fileKey === 'string' ? hostApi.fileKey : null,
      fileName: hostApi.root && hostApi.root.name ? hostApi.root.name : null,
      pageId: hostApi.currentPage && hostApi.currentPage.id ? hostApi.currentPage.id : null,
      pageName: hostApi.currentPage && hostApi.currentPage.name ? hostApi.currentPage.name : null,
      pluginVersion: PLUGIN_VERSION
    },
    pages: exportedPages
  };
}

function buildSlicePayload(pageNode, sliceNode, scale, bytes) {
  const pageBox = pageNode.absoluteBoundingBox || { x: 0, y: 0 };
  const box = sliceNode.absoluteBoundingBox || { x: 0, y: 0, width: 0, height: 0 };
  return {
    nodeId: sliceNode.id,
    name: cleanSliceName(sliceNode.name),
    rawName: sliceNode.name,
    type: sliceNode.type,
    x: Math.round((box.x || 0) - (pageBox.x || 0)),
    y: Math.round((box.y || 0) - (pageBox.y || 0)),
    width: Math.round(box.width || 0),
    height: Math.round(box.height || 0),
    scale,
    image: {
      mimeType: 'image/png',
      data: bytesToBase64(bytes)
    }
  };
}

function normalizeScale(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(0.5, Math.min(4, n));
}

function bytesToBase64(bytes) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const parts = [];
  let chunk = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    chunk +=
      alphabet[(triplet >> 18) & 63] +
      alphabet[(triplet >> 12) & 63] +
      alphabet[(triplet >> 6) & 63] +
      alphabet[triplet & 63];
    if (chunk.length > 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }

  const remaining = bytes.length - i;
  if (remaining === 1) {
    const triplet = bytes[i] << 16;
    chunk += alphabet[(triplet >> 18) & 63] + alphabet[(triplet >> 12) & 63] + '==';
  } else if (remaining === 2) {
    const triplet = (bytes[i] << 16) | (bytes[i + 1] << 8);
    chunk += alphabet[(triplet >> 18) & 63] + alphabet[(triplet >> 12) & 63] + alphabet[(triplet >> 6) & 63] + '=';
  }

  if (chunk) parts.push(chunk);
  return parts.join('');
}
