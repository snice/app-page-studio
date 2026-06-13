/**
 * Figma 插件导入 API
 *
 * 网页端登录后生成短期随机 token；Figma 插件用 Bearer token 上传整页 PNG 与切图元数据。
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const router = express.Router();
const { Projects, FigmaImportTokens } = require('../db');
const { requireAuth } = require('./auth');
const {
  getHtmlDir,
  broadcastProjectEvent
} = require('./utils');

const MAX_PAGES_PER_IMPORT = 20;
const MAX_SLICES_PER_PAGE = 120;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const IMAGE_MIME_EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp'
};

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

function normalizePagesConfig(pagesConfig, projectName) {
  const fallback = defaultPagesConfig(projectName);
  return {
    ...fallback,
    ...(pagesConfig || {}),
    targetPlatform: pagesConfig?.targetPlatform || fallback.targetPlatform,
    designSystem: pagesConfig?.designSystem || fallback.designSystem,
    sharedComponents: pagesConfig?.sharedComponents || fallback.sharedComponents,
    htmlFiles: Array.isArray(pagesConfig?.htmlFiles) ? pagesConfig.htmlFiles : [],
    pageGroups: Array.isArray(pagesConfig?.pageGroups) ? pagesConfig.pageGroups : []
  };
}

function requestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function setFigmaCors(req, res, next) {
  const origin = req.get('origin');
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '600');
  next();
}

function sanitizeName(name, fallback = 'figma') {
  const raw = String(name || fallback)
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return raw || fallback;
}

function shortHash(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex').slice(0, 10);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

function getServerUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function decodeImage(image, label) {
  if (!image || typeof image !== 'object') {
    throw requestError(400, `${label} 缺少图片数据`);
  }
  const mimeType = String(image.mimeType || 'image/png').toLowerCase();
  if (!IMAGE_MIME_EXT[mimeType]) {
    throw requestError(400, `${label} 图片类型不支持`);
  }
  const rawData = String(image.data || '').replace(/^data:[^;]+;base64,/, '');
  if (!rawData) {
    throw requestError(400, `${label} 图片内容为空`);
  }
  const buffer = Buffer.from(rawData, 'base64');
  if (buffer.length === 0) {
    throw requestError(400, `${label} 图片内容无效`);
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw requestError(413, `${label} 图片超过 20MB`);
  }
  return { buffer, mimeType, ext: IMAGE_MIME_EXT[mimeType] };
}

function roundRect(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function normalizeRect(rect) {
  return {
    x: roundRect(rect?.x),
    y: roundRect(rect?.y),
    width: Math.max(0, roundRect(rect?.width)),
    height: Math.max(0, roundRect(rect?.height))
  };
}

function buildRegion(page, slice) {
  const logicalRect = normalizeRect(slice);
  const pageWidth = Math.max(1, roundRect(page.width));
  const pageHeight = Math.max(1, roundRect(page.height));
  const scale = Math.max(1, Number(page.scale) || 1);
  return {
    device: {
      ...logicalRect,
      unit: 'px',
      base: { width: pageWidth, height: pageHeight }
    },
    image: {
      x: Math.round(logicalRect.x * scale),
      y: Math.round(logicalRect.y * scale),
      width: Math.round(logicalRect.width * scale),
      height: Math.round(logicalRect.height * scale),
      unit: 'px',
      base: {
        width: Math.round(pageWidth * scale),
        height: Math.round(pageHeight * scale)
      }
    }
  };
}

function mergeImageReplacements(existingItems, figmaItems) {
  const previousFigma = new Map();
  const manualItems = [];
  for (const item of Array.isArray(existingItems) ? existingItems : []) {
    if (item?.source === 'figma' || item?.figmaNodeId) {
      const key = item.figmaNodeId || item.selector;
      if (key) previousFigma.set(key, item);
    } else {
      manualItems.push(item);
    }
  }

  const mergedFigma = figmaItems.map((item) => {
    const previous = previousFigma.get(item.figmaNodeId) || previousFigma.get(item.selector);
    return {
      ...item,
      description: previous?.description || item.description || ''
    };
  });
  return [...mergedFigma, ...manualItems];
}

function buildPageFileName(page, source, mode) {
  const base = sanitizeName(page.name || page.nodeName || 'page', 'page');
  const hash = shortHash(`${source?.fileKey || ''}:${page.nodeId || page.id || page.name}`);
  const suffix = mode === 'append' ? `_${Date.now()}_${crypto.randomBytes(3).toString('hex')}` : '';
  return `figma_${base}_${hash}${suffix}.png`;
}

function buildSliceFileName(page, slice, source, mode) {
  const pageHash = shortHash(`${source?.fileKey || ''}:${page.nodeId || page.name}`);
  const base = sanitizeName(slice.name || 'slice', 'slice');
  const sliceHash = shortHash(`${page.nodeId || page.name}:${slice.nodeId || slice.id || slice.name}`);
  const suffix = mode === 'append' ? `_${Date.now()}_${crypto.randomBytes(3).toString('hex')}` : '';
  return `figma_${pageHash}_${base}_${sliceHash}${suffix}.png`;
}

function buildProjectOption(project) {
  const record = Projects.getPagesRecord(project.id);
  const pagesConfig = normalizePagesConfig(record?.pagesConfig, project.name);
  return {
    id: project.id,
    name: project.name,
    description: project.description || '',
    groups: (pagesConfig.pageGroups || []).map((group) => ({
      id: group.id,
      name: group.name || '未命名分组',
      description: group.description || '',
      route: group.route || ''
    }))
  };
}

function buildTokenProjects(token) {
  return FigmaImportTokens.projectsForToken(token).map(buildProjectOption);
}

function verifyFigmaToken(req) {
  const tokenValue = getBearerToken(req);
  const token = FigmaImportTokens.verify(tokenValue);
  if (!token) throw requestError(401, 'Figma 上传令牌无效或已过期');
  return token;
}

function verifyFigmaProject(req) {
  const token = verifyFigmaToken(req);

  const requestedProjectId = Number.parseInt(req.body?.projectId, 10);
  if (!requestedProjectId) {
    throw requestError(400, '缺少项目 ID');
  }
  if (!FigmaImportTokens.tokenCanAccessProject(token, requestedProjectId)) {
    throw requestError(403, '令牌无权导入此项目');
  }

  const project = Projects.getById(requestedProjectId);
  if (!project) throw requestError(404, '项目不存在');

  return { token, project, projectId: requestedProjectId };
}

router.post('/figma/token', requireAuth, (req, res) => {
  const writableProjects = Projects.getAll(req.authUser)
    .filter((project) => Projects.userCanWrite(project.id, req.authUser));
  if (writableProjects.length === 0) {
    return res.status(403).json({ error: '当前账号没有可导入的项目' });
  }

  const requestedIds = Array.isArray(req.body?.projectIds)
    ? req.body.projectIds.map((id) => Number.parseInt(id, 10)).filter((id) => Number.isFinite(id) && id > 0)
    : [];
  const writableIds = new Set(writableProjects.map((project) => project.id));
  const selectedIds = requestedIds.length > 0
    ? requestedIds.filter((id) => writableIds.has(id))
    : [...writableIds];
  if (selectedIds.length === 0) {
    return res.status(400).json({ error: '没有可授权的项目' });
  }

  const projectScope = req.body?.projectScope === 'all' && req.authUser?.role === 'admin'
    ? 'all'
    : 'selected';
  const ttlMinutes = Number.parseInt(req.body?.ttlMinutes, 10) || 720;
  const token = FigmaImportTokens.create({
    createdByUser: req.authUser,
    allowedProjectIds: projectScope === 'all' ? [] : selectedIds,
    projectScope,
    ttlMinutes
  });
  if (!token) return res.status(500).json({ error: '创建 Figma 上传令牌失败' });

  res.json({
    id: token.id,
    token: token.token,
    tokenPreview: token.tokenPreview,
    tokenId: token.tokenId,
    projectScope: token.projectScope,
    projectCount: token.projectCount,
    allowedProjectIds: token.allowedProjectIds,
    expiresAt: token.expiresAt,
    serverUrl: getServerUrl(req)
  });
});

router.get('/figma/tokens', requireAuth, (req, res) => {
  res.json({
    serverUrl: getServerUrl(req),
    tokens: FigmaImportTokens.listForUser(req.authUser)
  });
});

router.delete('/figma/tokens/:id', requireAuth, (req, res) => {
  const tokenId = Number.parseInt(req.params.id, 10);
  if (!tokenId) return res.status(400).json({ error: '缺少令牌 ID' });

  const revokedCount = FigmaImportTokens.revokeForUser(tokenId, req.authUser);
  if (!revokedCount) return res.status(404).json({ error: '令牌不存在或无权删除' });
  res.json({ success: true, revokedCount, id: tokenId });
});

router.options('/figma/verify', setFigmaCors, (req, res) => res.sendStatus(204));
router.post('/figma/verify', setFigmaCors, (req, res, next) => {
  try {
    const token = verifyFigmaToken(req);
    res.json({
      ok: true,
      token: {
        id: token.id,
        tokenId: token.tokenId,
        tokenPreview: token.tokenPreview,
        projectScope: token.projectScope,
        projectCount: token.projectCount,
        expiresAt: token.expiresAt,
        createdByName: token.createdByName || token.username || null,
        lastUsedAt: token.lastUsedAt || null
      },
      projects: buildTokenProjects(token)
    });
  } catch (error) {
    next(error);
  }
});

router.options('/figma/import', setFigmaCors, (req, res) => res.sendStatus(204));
router.post('/figma/import', setFigmaCors, (req, res, next) => {
  try {
    const { token, project, projectId } = verifyFigmaProject(req);
    const source = req.body?.source && typeof req.body.source === 'object' ? req.body.source : {};
    const pages = Array.isArray(req.body?.pages) ? req.body.pages.slice(0, MAX_PAGES_PER_IMPORT) : [];
    if (pages.length === 0) throw requestError(400, '没有可导入的 Figma 页面');

    const mode = req.body?.mode === 'append' ? 'append' : 'upsert';
    const projectDir = getHtmlDir(projectId);
    const designDir = path.join(projectDir, '__design__');
    const assetsDir = path.join(projectDir, '__assets__');
    ensureDir(designDir);
    ensureDir(assetsDir);

    const record = Projects.getPagesRecord(projectId);
    const currentConfig = normalizePagesConfig(record?.pagesConfig, project.name);
    const hasGroupSelection = Object.prototype.hasOwnProperty.call(req.body || {}, 'groupId');
    const requestedGroupId = req.body?.groupId == null || req.body?.groupId === '' ? null : String(req.body.groupId);
    const selectedGroupId = requestedGroupId && (currentConfig.pageGroups || []).some((group) => String(group.id) === requestedGroupId)
      ? requestedGroupId
      : null;
    const htmlFiles = [...(currentConfig.htmlFiles || [])];
    const importedFiles = [];
    const importedAssets = [];

    for (const page of pages) {
      if (!page || typeof page !== 'object') continue;
      const pageImage = decodeImage(page.image, `页面 ${page.name || page.nodeId || ''}`);
      const pageFileName = buildPageFileName(page, source, mode);
      const pagePath = `__design__/${pageFileName}`;
      fs.writeFileSync(path.join(designDir, pageFileName), pageImage.buffer);

      const existingIndex = mode === 'upsert'
        ? htmlFiles.findIndex((file) =>
            file?.path === pagePath ||
            (page.nodeId && file?.figma?.nodeId === page.nodeId)
          )
        : -1;
      const existingFile = existingIndex >= 0 ? htmlFiles[existingIndex] : null;
      const slices = Array.isArray(page.slices) ? page.slices.slice(0, MAX_SLICES_PER_PAGE) : [];
      const figmaItems = [];

      for (const slice of slices) {
        if (!slice || typeof slice !== 'object') continue;
        const sliceImage = decodeImage(slice.image, `切图 ${slice.name || slice.nodeId || ''}`);
        const sliceFileName = buildSliceFileName(page, slice, source, mode);
        const slicePath = `__assets__/${sliceFileName}`;
        fs.writeFileSync(path.join(assetsDir, sliceFileName), sliceImage.buffer);
        importedAssets.push({
          name: sliceFileName,
          path: slicePath,
          size: sliceImage.buffer.length,
          mimetype: sliceImage.mimeType
        });
        figmaItems.push({
          selector: slice.name || 'Figma Slice',
          imagePath: slicePath,
          description: slice.description || '',
          region: buildRegion(page, slice),
          source: 'figma',
          figmaNodeId: slice.nodeId || null,
          figmaNodeName: slice.name || null
        });
      }

      const nextFile = {
        ...(existingFile || {}),
        path: pagePath,
        name: pageFileName,
        sourceType: 'image',
        imagePath: pagePath,
        previewPath: null,
        stateName: existingFile?.stateName || page.name || '',
        description: existingFile?.description || '',
        groupId: hasGroupSelection ? selectedGroupId : (existingFile?.groupId ?? null),
        isPrimaryState: !!existingFile?.isPrimaryState,
        devStatus: existingFile?.devStatus || 'pending',
        interactions: existingFile?.interactions || [],
        functionDescriptions: existingFile?.functionDescriptions || [],
        dataSources: existingFile?.dataSources || [],
        imageReplacements: mergeImageReplacements(existingFile?.imageReplacements, figmaItems),
        figma: {
          ...(existingFile?.figma || {}),
          source: 'figma-plugin',
          importedAt: new Date().toISOString(),
          fileKey: source.fileKey || null,
          fileName: source.fileName || null,
          pageId: source.pageId || null,
          pageName: source.pageName || null,
          nodeId: page.nodeId || null,
          nodeName: page.name || null,
          width: roundRect(page.width),
          height: roundRect(page.height),
          scale: Number(page.scale) || 1,
          sliceCount: figmaItems.length,
          pluginVersion: source.pluginVersion || null
        }
      };

      if (existingIndex >= 0) htmlFiles[existingIndex] = nextFile;
      else htmlFiles.push(nextFile);

      importedFiles.push({
        name: pageFileName,
        path: pagePath,
        size: pageImage.buffer.length,
        mimetype: pageImage.mimeType,
        slices: figmaItems.length
      });
    }

    if (importedFiles.length === 0) throw requestError(400, '没有成功导入的 Figma 页面');

    const nextConfig = {
      ...currentConfig,
      htmlFiles
    };
    Projects.savePagesJson(projectId, nextConfig, {
      editorName: token.createdByName || token.username || 'Figma',
      sessionId: `figma-token:${token.id}`
    });
    Projects.touch(projectId);
    FigmaImportTokens.markUsed(token.tokenId, projectId);

    const savedRecord = Projects.getPagesRecord(projectId);
    const entityHashes = Projects.getPagesHashes(savedRecord?.pagesConfig || nextConfig);

    broadcastProjectEvent(req, projectId, {
      type: 'files:changed',
      reason: 'figma-imported',
      files: importedFiles,
      assets: importedAssets.length
    });
    broadcastProjectEvent(req, projectId, {
      type: 'pages:full-saved',
      projectId,
      revision: savedRecord?.revision || 0,
      updatedAt: savedRecord?.updatedAt || null,
      savedBy: { sessionId: `figma-token:${token.id}`, editorName: token.createdByName || token.username || 'Figma' }
    });

    res.json({
      success: true,
      imported: importedFiles.length,
      assets: importedAssets.length,
      files: importedFiles,
      revision: savedRecord?.revision || 0,
      entityHashes,
      expiresAt: token.expiresAt
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
