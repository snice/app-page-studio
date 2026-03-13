/**
 * 设计图（PNG）上传与管理 API 路由
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { imageUpload, HTML_CACHES_DIR } = require('./utils');

function ensureProjectImageDir(projectId) {
  const dir = path.join(HTML_CACHES_DIR, String(projectId), '__design__');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function ensureProjectAssetsDir(projectId) {
  const dir = path.join(HTML_CACHES_DIR, String(projectId), '__assets__');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

// 上传设计图（单张或多张）
router.post('/upload-image', imageUpload.array('images', 20), (req, res) => {
  const projectId = parseInt(req.query.projectId, 10);
  if (!projectId) {
    res.status(400).json({ error: '缺少项目 ID' });
    return;
  }

  if (!req.files || req.files.length === 0) {
    res.status(400).json({ error: '未选择图片文件' });
    return;
  }

  const targetDir = ensureProjectImageDir(projectId);
  const saved = [];

  for (const file of req.files) {
    const ext = path.extname(file.originalname || '.png') || '.png';
    const baseName = path.basename(file.originalname || `design_${Date.now()}`, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const nonce = Math.random().toString(36).slice(2, 6);
    const fileName = `${baseName}_${Date.now()}_${nonce}${ext}`;
    const targetPath = path.join(targetDir, fileName);
    fs.writeFileSync(targetPath, file.buffer);
    saved.push({
      name: fileName,
      path: `__design__/${fileName}`,
      size: file.size,
      mimetype: file.mimetype
    });
  }

  res.json({ files: saved });
});

// 列出已上传的设计图
router.get('/list-images', (req, res) => {
  const projectId = parseInt(req.query.projectId, 10);
  if (!projectId) {
    res.status(400).json({ error: '缺少项目 ID' });
    return;
  }

  const dir = ensureProjectImageDir(projectId);
  const files = fs.readdirSync(dir)
    .filter(name => /\.(png|jpg|jpeg|webp)$/i.test(name))
    .map(name => ({ name, path: `__design__/${name}` }));

  res.json({ files });
});

// 上传图片资源（用于切图标记）
router.post('/upload-asset', imageUpload.single('asset'), (req, res) => {
  const projectId = parseInt(req.query.projectId, 10);
  if (!projectId) {
    res.status(400).json({ error: '缺少项目 ID' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: '未选择图片文件' });
    return;
  }

  const targetDir = ensureProjectAssetsDir(projectId);
  const ext = path.extname(req.file.originalname || '.png') || '.png';
  const baseName = path.basename(req.file.originalname || `asset_${Date.now()}`, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const nonce = Math.random().toString(36).slice(2, 6);
  const fileName = `${baseName}_${Date.now()}_${nonce}${ext}`;
  const targetPath = path.join(targetDir, fileName);
  fs.writeFileSync(targetPath, req.file.buffer);

  res.json({
    file: {
      name: fileName,
      path: `__assets__/${fileName}`,
      size: req.file.size,
      mimetype: req.file.mimetype
    }
  });
});

module.exports = router;
