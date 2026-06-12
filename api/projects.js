/**
 * 项目管理 API 路由
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const router = express.Router();
const {
  HTML_CACHES_DIR,
  upload,
  extractZipToDir,
  shouldSkipZipEntry,
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
        extractZipToDir(req.file.buffer, projectDir);
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
    const projectDir = path.join(HTML_CACHES_DIR, String(projectId));

    // 清空现有目录
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true });
    }

    // 解压新的 ZIP
    extractZipToDir(req.file.buffer, projectDir);

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

  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) return sendWriteGuardError(res, guard);

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
