/**
 * 页面配置 API 路由
 */

const express = require('express');
const router = express.Router();
const {
  Projects,
  ensureProjectReadable,
  ensureProjectWritable,
  sendWriteGuardError
} = require('./utils');

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

function buildPagesResponse(projectId, project, record) {
  const pagesConfig = record?.pagesConfig || defaultPagesConfig(project?.name);
  return {
    pagesConfig,
    entityHashes: Projects.getPagesHashes(pagesConfig),
    revision: record?.revision || 0,
    updatedAt: record?.updatedAt || null,
    updatedBy: record?.updatedBy || null,
    updatedBySession: record?.updatedBySession || null,
    projectId
  };
}

function broadcastProjectEvent(req, projectId, payload) {
  const broadcast = req.app?.get('broadcastProjectEvent');
  if (typeof broadcast === 'function') broadcast(projectId, payload);
}

function buildActor(guard) {
  return {
    sessionId: guard.sessionId || null,
    editorName: guard.editorName || null
  };
}

// 获取 pages.json（从 SQLite 读取）
router.get('/pages', (req, res) => {
  const projectId = parseInt(req.query.projectId);

  if (projectId) {
    const readable = ensureProjectReadable(req, projectId);
    if (!readable.ok) return sendWriteGuardError(res, readable);
    const pagesRecord = Projects.getPagesRecord(projectId);
    return res.json(buildPagesResponse(projectId, readable.project, pagesRecord));
  }

  // 返回默认配置
  const pagesConfig = defaultPagesConfig();
  res.json({
    pagesConfig,
    entityHashes: Projects.getPagesHashes(pagesConfig),
    revision: 0,
    updatedAt: null,
    updatedBy: null,
    updatedBySession: null,
    projectId: null
  });
});

// 保存 pages.json（到 SQLite）
router.post('/pages', (req, res) => {
  const projectId = parseInt(req.query.projectId);

  if (!projectId) {
    return res.status(400).json({ error: '请先选择项目' });
  }

  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) return sendWriteGuardError(res, guard);
  const project = guard.project;

  const payload = req.body?.pagesConfig ? req.body.pagesConfig : req.body;
  const expectedRevision = Number.parseInt(req.body?.expectedRevision, 10);
  if (!Number.isFinite(expectedRevision) || expectedRevision < 0) {
    return res.status(428).json({ error: '缺少 expectedRevision，无法安全保存' });
  }

  const result = Projects.savePagesJsonIfRevision(projectId, payload, expectedRevision, guard);
  if (!result.ok && result.conflict) {
    return res.status(409).json({
      error: '配置已被其他编辑者更新，请先重新加载最新版本',
      conflict: true,
      latest: buildPagesResponse(projectId, project, result.current)
    });
  }

  res.json({
    success: true,
    ...buildPagesResponse(projectId, project, result.record)
  });

  broadcastProjectEvent(req, projectId, {
    type: 'pages:full-saved',
    projectId,
    revision: result.record?.revision || 0,
    updatedAt: result.record?.updatedAt || null,
    savedBy: buildActor(guard)
  });
});

// 保存单个页面配置；仅当目标页面 hash 变化时冲突
router.patch('/pages/file', (req, res) => {
  const projectId = parseInt(req.query.projectId);
  const filePath = typeof req.body?.path === 'string' ? req.body.path : '';
  const fileConfig = req.body?.fileConfig;
  const baseHash = req.body?.baseHash || null;

  if (!projectId) {
    return res.status(400).json({ error: '请先选择项目' });
  }
  if (!filePath || !fileConfig || typeof fileConfig !== 'object') {
    return res.status(400).json({ error: '缺少页面路径或页面配置' });
  }

  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) return sendWriteGuardError(res, guard);
  const project = guard.project;

  const result = Projects.savePageFileIfHash(
    projectId,
    filePath,
    { ...fileConfig, path: filePath },
    baseHash,
    guard,
    defaultPagesConfig(project?.name)
  );

  if (!result.ok && result.conflict) {
    return res.status(409).json({
      error: '当前页面已被其他编辑者更新，请先处理冲突',
      conflict: true,
      scope: 'file',
      path: filePath,
      currentFile: result.currentFile || null,
      currentHash: result.currentHash || null,
      latest: buildPagesResponse(projectId, project, result.current)
    });
  }

  const response = {
    success: true,
    scope: 'file',
    path: filePath,
    fileHash: result.fileHash,
    ...buildPagesResponse(projectId, project, result.record)
  };

  const savedFile = response.pagesConfig.htmlFiles.find((file) => file.path === filePath) || null;
  broadcastProjectEvent(req, projectId, {
    type: 'pages:file-saved',
    projectId,
    path: filePath,
    fileConfig: savedFile,
    fileHash: result.fileHash,
    revision: response.revision,
    updatedAt: response.updatedAt,
    savedBy: buildActor(guard)
  });

  res.json(response);
});

// 保存分组结构；包含 pageGroups 与文件的 groupId/isPrimaryState 归属
router.patch('/pages/groups', (req, res) => {
  const projectId = parseInt(req.query.projectId);
  const pageGroups = Array.isArray(req.body?.pageGroups) ? req.body.pageGroups : null;
  const assignments = Array.isArray(req.body?.assignments) ? req.body.assignments : null;
  const baseHash = req.body?.baseHash || null;

  if (!projectId) {
    return res.status(400).json({ error: '请先选择项目' });
  }
  if (!pageGroups || !assignments) {
    return res.status(400).json({ error: '缺少分组配置' });
  }

  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) return sendWriteGuardError(res, guard);
  const project = guard.project;

  const result = Projects.savePageGroupsIfHash(
    projectId,
    pageGroups,
    assignments,
    baseHash,
    guard,
    defaultPagesConfig(project?.name)
  );

  if (!result.ok && result.conflict) {
    return res.status(409).json({
      error: '页面分组已被其他编辑者更新，请先处理冲突',
      conflict: true,
      scope: 'groups',
      currentHash: result.currentHash || null,
      latest: buildPagesResponse(projectId, project, result.current)
    });
  }

  const response = {
    success: true,
    scope: 'groups',
    groupsHash: result.groupsHash,
    ...buildPagesResponse(projectId, project, result.record)
  };

  broadcastProjectEvent(req, projectId, {
    type: 'pages:groups-saved',
    projectId,
    pageGroups: response.pagesConfig.pageGroups,
    assignments,
    groupsHash: result.groupsHash,
    revision: response.revision,
    updatedAt: response.updatedAt,
    savedBy: buildActor(guard)
  });

  res.json(response);
});

module.exports = router;
