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
    revision: record?.revision || 0,
    updatedAt: record?.updatedAt || null,
    updatedBy: record?.updatedBy || null,
    updatedBySession: record?.updatedBySession || null,
    projectId
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
  res.json({
    pagesConfig: defaultPagesConfig(),
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
});

// 获取 pages.json 历史版本
router.get('/pages/history', (req, res) => {
  const projectId = parseInt(req.query.projectId);
  const limit = parseInt(req.query.limit, 10) || 30;

  if (!projectId) {
    return res.status(400).json({ error: '缺少项目 ID' });
  }

  const readable = ensureProjectReadable(req, projectId);
  if (!readable.ok) return sendWriteGuardError(res, readable);

  const current = Projects.getPagesRecord(projectId);
  res.json({
    revisions: Projects.getPageRevisions(projectId, limit),
    currentRevision: current?.revision || 0
  });
});

// 恢复 pages.json 历史版本
router.post('/pages/restore', (req, res) => {
  const projectId = parseInt(req.query.projectId);
  const revision = Number.parseInt(req.body?.revision, 10);
  const expectedRevision = Number.parseInt(req.body?.expectedRevision, 10);

  if (!projectId || !Number.isFinite(revision)) {
    return res.status(400).json({ error: '缺少项目 ID 或历史版本号' });
  }

  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) return sendWriteGuardError(res, guard);
  const project = guard.project;

  const current = Projects.getPagesRecord(projectId);
  if (Number.isFinite(expectedRevision) && current?.revision !== expectedRevision) {
    return res.status(409).json({
      error: '配置已被其他编辑者更新，请先重新加载最新版本',
      conflict: true,
      latest: buildPagesResponse(projectId, project, current)
    });
  }

  const record = Projects.restorePageRevision(projectId, revision, guard);
  if (!record) {
    return res.status(404).json({ error: '历史版本不存在' });
  }

  res.json({
    success: true,
    ...buildPagesResponse(projectId, project, record)
  });
});

module.exports = router;
