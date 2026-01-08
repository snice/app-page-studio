/**
 * 项目管理 API 路由
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const {
  HTML_CACHES_DIR,
  upload,
  extractZipToDir,
  Projects
} = require('./utils');

// 获取配置（返回项目列表）
router.get('/config', (req, res) => {
  const projects = Projects.getAll();
  res.json({
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      designSystem: p.designSystem,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }))
  });
});

// 获取所有项目
router.get('/projects', (req, res) => {
  const projects = Projects.getAll();
  res.json({
    projects: projects.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description,
      designSystem: p.designSystem,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }))
  });
});

// 获取单个项目
router.get('/projects/:id', (req, res) => {
  const project = Projects.getById(parseInt(req.params.id));
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }
  res.json({
    id: project.id,
    name: project.name,
    description: project.description,
    designSystem: project.designSystem,
    createdAt: project.created_at,
    updatedAt: project.updated_at
  });
});

// 创建项目（带 ZIP 上传）
router.post('/projects', upload.single('htmlZip'), (req, res) => {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: '项目名称不能为空' });
  }

  try {
    // 创建项目记录
    const projectId = Projects.create(name, description || '');

    // 如果有上传 ZIP 文件，解压到项目目录
    if (req.file) {
      const projectDir = path.join(HTML_CACHES_DIR, String(projectId));
      extractZipToDir(req.file.buffer, projectDir);
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
    res.status(500).json({ error: e.message });
  }
});

// 更新项目信息
router.put('/projects/:id', (req, res) => {
  const projectId = parseInt(req.params.id);
  const { name, description, designSystem } = req.body;

  const project = Projects.getById(projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }

  Projects.update(
    projectId,
    name || project.name,
    description !== undefined ? description : project.description,
    designSystem !== undefined ? designSystem : project.designSystem
  );

  res.json({ success: true });
});

// 替换项目 HTML（上传新的 ZIP）
router.post('/projects/:id/html', upload.single('htmlZip'), (req, res) => {
  const projectId = parseInt(req.params.id);

  const project = Projects.getById(projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }

  if (!req.file) {
    return res.status(400).json({ error: '请上传 ZIP 文件' });
  }

  try {
    const projectDir = path.join(HTML_CACHES_DIR, String(projectId));

    // 清空现有目录
    if (fs.existsSync(projectDir)) {
      fs.rmSync(projectDir, { recursive: true });
    }

    // 解压新的 ZIP
    extractZipToDir(req.file.buffer, projectDir);

    // 更新时间
    Projects.update(projectId, project.name, project.description, project.designSystem);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除项目
router.delete('/projects/:id', (req, res) => {
  const projectId = parseInt(req.params.id);

  const project = Projects.getById(projectId);
  if (!project) {
    return res.status(404).json({ error: '项目不存在' });
  }

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
    res.status(500).json({ error: e.message });
  }
});

// 浏览目录
router.get('/browse', (req, res) => {
  const dirPath = req.query.path || process.env.HOME || '/';

  try {
    if (!fs.existsSync(dirPath)) {
      res.json({ error: '路径不存在', path: dirPath, items: [] });
      return;
    }

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      res.json({ error: '不是目录', path: dirPath, items: [] });
      return;
    }

    const items = fs.readdirSync(dirPath)
      .filter(name => !name.startsWith('.'))
      .map(name => {
        const fullPath = path.join(dirPath, name);
        try {
          const itemStat = fs.statSync(fullPath);
          return {
            name,
            path: fullPath,
            isDirectory: itemStat.isDirectory(),
            size: itemStat.size,
            modified: itemStat.mtime
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    res.json({
      path: dirPath,
      parent: path.dirname(dirPath),
      items
    });
  } catch (e) {
    res.json({ error: e.message, path: dirPath, items: [] });
  }
});

module.exports = router;
