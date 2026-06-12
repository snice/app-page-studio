/**
 * 项目管理 API 路由
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const router = express.Router();
const { Users } = require('../db');
const {
  HTML_CACHES_DIR,
  upload,
  extractZipToDir,
  getHtmlExtractDir,
  shouldSkipZipEntry,
  ensureProjectReadable,
  ensureProjectWritable,
  sendWriteGuardError,
  Projects
} = require('./utils');

function inspectZipContents(zipBuffer) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  let hasHtml = false;
  let hasImages = false;
  let hasPsd = false;

  for (const entry of entries) {
    if (entry.isDirectory) continue;
    if (shouldSkipZipEntry(entry.entryName)) continue;
    const lower = entry.entryName.toLowerCase();
    if (lower.endsWith('.html') || lower.endsWith('.htm')) {
      hasHtml = true;
    }
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
      hasImages = true;
    }
    if (lower.endsWith('.psd')) {
      hasPsd = true;
    }
  }

  return { hasHtml, hasImages, hasPsd };
}

function serializeProject(p) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    designSystem: p.designSystem,
    ownerUserId: p.ownerUserId,
    memberRole: p.memberRole,
    createdAt: p.created_at,
    updatedAt: p.updated_at
  };
}

function listProjectsResponse(req) {
  return { projects: Projects.getAll(req.authUser).map(serializeProject) };
}

function serializeMember(m) {
  return {
    userId: m.user_id,
    username: m.username,
    role: m.role,
    userRole: m.user_role,
    createdAt: m.created_at
  };
}

function canManageMembers(req, projectId) {
  return Projects.userCanManageMembers(projectId, req.authUser);
}

function requireProjectMemberManager(req, res, projectId) {
  const readable = ensureProjectReadable(req, projectId);
  if (!readable.ok) {
    res.status(readable.status || 404).json({ error: readable.error || '项目不存在' });
    return null;
  }
  if (!canManageMembers(req, projectId)) {
    res.status(403).json({ error: '需要项目 owner 或管理员权限' });
    return null;
  }
  return readable.project;
}

// 获取所有项目（/api/config 为历史别名，等价于 /api/projects）
router.get(['/projects', '/config'], (req, res) => {
  res.json(listProjectsResponse(req));
});

// 获取单个项目
router.get('/projects/:id', (req, res) => {
  const project = Projects.getById(parseInt(req.params.id), req.authUser);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  res.json(serializeProject(project));
});

// 获取项目共创成员
router.get('/projects/:id/members', (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const readable = ensureProjectReadable(req, projectId);
  if (!readable.ok) {
    return res.status(readable.status || 404).json({ error: readable.error || '项目不存在' });
  }

  const canManage = canManageMembers(req, projectId);
  res.json({
    members: Projects.listMembers(projectId).map(serializeMember),
    users: canManage ? Users.list() : [],
    canManage
  });
});

// 添加或更新项目共创成员
router.post('/projects/:id/members', (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const project = requireProjectMemberManager(req, res, projectId);
  if (!project) return;

  const userId = Number.parseInt(req.body?.userId, 10);
  const role = req.body?.role || 'editor';
  const result = Projects.setMember(projectId, userId, role);
  if (!result.ok) return res.status(400).json({ error: result.error || '保存成员失败' });

  res.json({
    success: true,
    members: Projects.listMembers(projectId).map(serializeMember)
  });
});

// 更新项目共创成员角色
router.put('/projects/:id/members/:userId', (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const project = requireProjectMemberManager(req, res, projectId);
  if (!project) return;

  const userId = Number.parseInt(req.params.userId, 10);
  const result = Projects.setMember(projectId, userId, req.body?.role);
  if (!result.ok) return res.status(400).json({ error: result.error || '更新成员失败' });

  res.json({
    success: true,
    members: Projects.listMembers(projectId).map(serializeMember)
  });
});

// 移除项目共创成员
router.delete('/projects/:id/members/:userId', (req, res) => {
  const projectId = parseInt(req.params.id, 10);
  const project = requireProjectMemberManager(req, res, projectId);
  if (!project) return;

  const userId = Number.parseInt(req.params.userId, 10);
  const result = Projects.removeMember(projectId, userId);
  if (!result.ok) return res.status(400).json({ error: result.error || '移除成员失败' });

  res.json({
    success: true,
    members: Projects.listMembers(projectId).map(serializeMember)
  });
});

// 创建项目（带 ZIP 上传）
router.post('/projects', upload.single('htmlZip'), (req, res, next) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: '项目名称不能为空' });
  }

  try {
    const zipContents = req.file ? inspectZipContents(req.file.buffer) : null;
    if (zipContents && !zipContents.hasHtml && !zipContents.hasImages && !zipContents.hasPsd) {
      return res.status(400).json({ error: 'ZIP 未包含 HTML、图片或 PSD 文件' });
    }

    // 创建项目记录
    const projectId = Projects.create(name, description || '', req.authUser?.id);

    // 如果有上传 ZIP 文件，解压到项目目录
    if (req.file) {
      const projectDir = path.join(HTML_CACHES_DIR, String(projectId));

      if (zipContents.hasHtml) {
        extractZipToDir(req.file.buffer, path.join(projectDir, '__html__'));
      } else if (zipContents.hasImages) {
        const designDir = path.join(projectDir, '__design__');
        extractZipToDir(req.file.buffer, designDir);
      } else if (zipContents.hasPsd) {
        const psdDir = path.join(projectDir, '__psd__');
        extractZipToDir(req.file.buffer, psdDir);
      }
    }

    res.json({
      success: true,
      project: {
        id: projectId,
        name,
        description: description || ''
      }
    });
  } catch (e) {
    next(e);
  }
});

// 更新项目信息
router.put('/projects/:id', (req, res) => {
  const projectId = parseInt(req.params.id);
  const { name, description, designSystem } = req.body;

  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) return sendWriteGuardError(res, guard);
  const project = guard.project;

  Projects.update(
    projectId,
    name || project.name,
    description !== undefined ? description : project.description,
    designSystem !== undefined ? designSystem : project.designSystem
  );

  res.json({ success: true });
});

// 替换项目 HTML（上传新的 ZIP）
router.post('/projects/:id/html', upload.single('htmlZip'), (req, res, next) => {
  const projectId = parseInt(req.params.id);

  if (!req.file) {
    return res.status(400).json({ error: '请上传 ZIP 文件' });
  }

  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) return sendWriteGuardError(res, guard);

  try {
    const htmlDir = getHtmlExtractDir(projectId);

    // 清空现有 HTML 子目录（保留 __design__/__assets__/__psd__）
    if (fs.existsSync(htmlDir)) {
      fs.rmSync(htmlDir, { recursive: true });
    }

    // 解压新的 ZIP 到 __html__
    extractZipToDir(req.file.buffer, htmlDir);

    // 更新时间
    Projects.touch(projectId);

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

// 删除项目
router.delete('/projects/:id', (req, res, next) => {
  const projectId = parseInt(req.params.id);

  const project = requireProjectMemberManager(req, res, projectId);
  if (!project) return;

  try {
    // 删除 HTML 缓存目录
    const projectDir = path.join(HTML_CACHES_DIR, String(projectId));
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true });
    }

    // 删除数据库记录
    Projects.delete(projectId);

    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
