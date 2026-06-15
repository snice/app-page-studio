const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const {
  getHtmlDir,
  resolveSafe,
  ensureProjectWritable,
  broadcastProjectEvent,
  Projects
} = require('../utils');
const { getImageAgentConfig } = require('./config');
const { requestError } = require('./errors');
const { normalizeRelPath, pickSourceImageRelPath } = require('./paths');

const MAX_REGIONS = 12;
const MAX_REGION_IMAGE_BYTES = 8 * 1024 * 1024;
const PNG_SIGNATURE = '89504e470d0a1a0a';

function defaultPagesConfig(projectName = 'My App') {
  return {
    projectName,
    targetPlatform: ['flutter'],
    designSystem: {},
    sharedComponents: [],
    htmlFiles: [],
    pageGroups: []
  };
}

function getRequestProjectId(req) {
  const projectId = Number.parseInt(req.body?.projectId, 10);
  if (!projectId) throw requestError(400, '缺少项目 ID');
  return projectId;
}

function assertProjectWritable(req, projectId) {
  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) throw requestError(guard.status || 403, guard.error || '无权修改此项目');
  return guard;
}

function buildActor(guard) {
  return {
    sessionId: guard.sessionId || null,
    editorName: guard.editorName || null
  };
}

function sanitizeFileName(value, fallback = 'ai_cutout') {
  const name = String(value || fallback)
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return name || fallback;
}

function parseDataUrl(value) {
  const match = String(value || '').match(/^data:(image\/png);base64,([a-zA-Z0-9+/=\s]+)$/);
  if (!match) throw requestError(400, '选区图片必须是 PNG data URL');
  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0) throw requestError(400, '选区图片为空');
  if (buffer.length > MAX_REGION_IMAGE_BYTES) throw requestError(413, '单个选区图片超过 8MB');
  if (buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    throw requestError(400, '选区图片格式无效');
  }
  return buffer;
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) return null;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return { width, height };
}

function normalizeRegion(region) {
  const image = region?.image || {};
  const device = region?.device || {};
  return {
    image: {
      x: Number.parseInt(image.x, 10) || 0,
      y: Number.parseInt(image.y, 10) || 0,
      width: Number.parseInt(image.width, 10) || 0,
      height: Number.parseInt(image.height, 10) || 0,
      unit: 'px',
      base: image.base || null
    },
    device: {
      x: Number.parseInt(device.x, 10) || 0,
      y: Number.parseInt(device.y, 10) || 0,
      width: Number.parseInt(device.width, 10) || 0,
      height: Number.parseInt(device.height, 10) || 0,
      unit: 'px',
      base: device.base || null
    }
  };
}

function buildImagePrompt({ file, region, instruction }) {
  const sourcePath = pickSourceImageRelPath(file);
  const image = region.image || {};
  const userInstruction = String(instruction || '').trim();
  return [
    'Create a production UI asset as a transparent-background PNG cutout.',
    'Use the provided selected design region as the visual source. Preserve the main component shape, colors, text/icon details, proportions, and pixel-clean edges.',
    'Remove all surrounding page background outside the selected element. The final image must have an alpha channel and no solid canvas background.',
    'Do not add shadows, decorations, labels, borders, or content that are not present in the selected region unless explicitly requested.',
    `Source design path: ${sourcePath || 'unknown'}. Region in source image: x=${image.x}, y=${image.y}, width=${image.width}, height=${image.height}.`,
    userInstruction ? `User requirement: ${userInstruction}` : ''
  ].filter(Boolean).join('\n');
}

function sdkRequestError(error) {
  const status = error?.status || error?.response?.status || 500;
  const detail = error?.error
    ? JSON.stringify({ error: error.error })
    : (error?.message || String(error));
  const wrapped = requestError(status >= 500 ? 502 : status, `AI 图片生成失败: ${detail}`);
  wrapped.responseStatus = status;
  wrapped.responseText = detail;
  return wrapped;
}

function extractImageBuffer(data) {
  const item = data?.data?.[0] || data?.output?.[0] || data?.images?.[0] || {};
  const b64 = item.b64_json || item.b64 || item.image_base64 || data?.b64_json;
  if (b64) return Buffer.from(String(b64), 'base64');

  const dataUrl = item.data_url || item.url || data?.url || '';
  if (String(dataUrl).startsWith('data:image/')) {
    const comma = String(dataUrl).indexOf(',');
    if (comma > 0) return Buffer.from(String(dataUrl).slice(comma + 1), 'base64');
  }
  return null;
}

async function fetchImageUrlBuffer(url) {
  if (!/^https?:\/\//i.test(String(url || ''))) return null;
  const res = await fetch(url);
  if (!res.ok) throw requestError(502, `AI 图片下载失败: HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function generateOneAsset(client, config, item, index, file) {
  const sourceBuffer = parseDataUrl(item.imageDataUrl);
  const sourceSize = parsePngDimensions(sourceBuffer);
  if (!sourceSize) throw requestError(400, `第 ${index + 1} 个区域图片尺寸无效`);
  if (sourceSize.width !== sourceSize.height) {
    throw requestError(400, `第 ${index + 1} 个区域必须是正方形`);
  }
  const region = normalizeRegion(item.region);
  if (region.image.width <= 0 || region.image.height <= 0) {
    throw requestError(400, `第 ${index + 1} 个区域尺寸无效`);
  }
  if (region.image.width !== region.image.height) {
    throw requestError(400, `第 ${index + 1} 个区域必须是正方形`);
  }

  const imageFile = await OpenAI.toFile(sourceBuffer, `region-${index + 1}.png`, { type: 'image/png' });
  const prompt = buildImagePrompt({
    file,
    region,
    instruction: item.instruction || item.prompt || ''
  });

  const basePayload = {
    model: config.model,
    image: imageFile,
    prompt,
    n: 1,
    // FIXME: 目前OpenAI仅支持1024x1024
    size: '1024x1024' // `${sourceSize.width}x${sourceSize.height}`
  };

  let data;
  try {
    data = await client.images.edit({ ...basePayload, response_format: 'b64_json' });
  } catch (error) {
    const detail = String(error?.message || error?.error?.message || '');
    if (!/response_format|unknown parameter|unsupported/i.test(detail)) throw sdkRequestError(error);
    try {
      data = await client.images.edit(basePayload);
    } catch (retryError) {
      throw sdkRequestError(retryError);
    }
  }

  let buffer = extractImageBuffer(data);
  if (!buffer) {
    const url = data?.data?.[0]?.url || data?.url || '';
    buffer = await fetchImageUrlBuffer(url);
  }
  if (!buffer || buffer.length === 0) throw requestError(502, 'AI 图片响应为空');
  if (buffer.subarray(0, 8).toString('hex') !== PNG_SIGNATURE) {
    throw requestError(502, 'AI 未返回有效 PNG 图片');
  }

  return {
    buffer,
    region,
    name: sanitizeFileName(item.name, `ai_cutout_${index + 1}`)
  };
}

async function generateDesignAssets(req, { onStage = null } = {}) {
  const projectId = getRequestProjectId(req);
  const guard = assertProjectWritable(req, projectId);

  const file = req.body?.file || {};
  const filePath = normalizeRelPath(file.path || file.imagePath || file.previewPath || '');
  if (!filePath) throw requestError(400, '缺少页面路径');
  const sourcePath = normalizeRelPath(pickSourceImageRelPath(file));
  if (!sourcePath) throw requestError(400, '缺少设计图路径');

  const projectDir = getHtmlDir(projectId);
  const sourceAbsPath = resolveSafe(projectDir, sourcePath);
  if (!sourceAbsPath || !fs.existsSync(sourceAbsPath) || !fs.statSync(sourceAbsPath).isFile()) {
    throw requestError(404, '设计图不存在');
  }

  const regions = Array.isArray(req.body?.regions) ? req.body.regions.slice(0, MAX_REGIONS) : [];
  if (regions.length === 0) throw requestError(400, '请至少选择一个区域');

  const config = getImageAgentConfig();
  if (!config.apiKey) throw requestError(503, '未配置 AI_AGENT_API_KEY 或 OPENAI_API_KEY');

  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });

  const assetsDir = path.join(projectDir, '__assets__');
  fs.mkdirSync(assetsDir, { recursive: true });

  const total = regions.length;
  const files = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    if (typeof onStage === 'function') {
      const label = total > 1 ? `正在生成 ${index + 1}/${total}` : '正在生成切图';
      onStage('region-progress', label, {
        current: index + 1,
        total,
        regionId: region?.id || null
      });
    }
    const generated = await generateOneAsset(client, config, region, index, file);
    const nonce = Math.random().toString(36).slice(2, 7);
    const fileName = `ai_${generated.name}_${Date.now()}_${nonce}.png`;
    const relPath = `__assets__/${fileName}`;
    const absPath = resolveSafe(projectDir, relPath);
    if (!absPath) throw requestError(400, '资源路径无效');
    fs.writeFileSync(absPath, generated.buffer);
    files.push({
      name: fileName,
      path: relPath,
      size: generated.buffer.length,
      mimetype: 'image/png',
      region: generated.region,
      regionId: region?.id || null
    });
  }

  const updatedAt = new Date().toISOString();
  const description = String(req.body?.prompt || '').trim() || '';
  const imageReplacements = files.map((asset) => ({
    selector: '区域',
    imagePath: asset.path,
    description,
    region: asset.region,
    aiGenerated: true,
    generatedAt: updatedAt
  }));
  const mergeResult = Projects.mergePageImageReplacements(
    projectId,
    filePath,
    imageReplacements,
    guard,
    file,
    defaultPagesConfig(guard.project?.name)
  );
  const savedFile = mergeResult.fileConfig || null;
  const pageSave = {
    success: true,
    scope: 'file',
    path: filePath,
    fileConfig: savedFile,
    fileHash: mergeResult.fileHash || null,
    revision: mergeResult.record?.revision || 0,
    updatedAt: mergeResult.record?.updatedAt || null,
    updatedBy: mergeResult.record?.updatedBy || null,
    updatedBySession: mergeResult.record?.updatedBySession || null,
    entityHashes: Projects.getPagesHashes(mergeResult.record?.pagesConfig || defaultPagesConfig(guard.project?.name)),
    addedCount: mergeResult.addedCount || 0
  };

  broadcastProjectEvent(req, projectId, {
    type: 'files:changed',
    reason: 'ai-design-assets-generated',
    files,
    sourcePath,
    updatedAt
  });
  broadcastProjectEvent(req, projectId, {
    type: 'pages:file-saved',
    projectId,
    path: filePath,
    fileConfig: savedFile,
    fileHash: pageSave.fileHash,
    revision: pageSave.revision,
    updatedAt: pageSave.updatedAt,
    savedBy: buildActor(guard)
  });

  return {
    files,
    count: files.length,
    sourcePath,
    updatedAt,
    pageSave
  };
}

module.exports = {
  generateDesignAssets
};
