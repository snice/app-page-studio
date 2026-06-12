const express = require('express');
const path = require('path');
const fs = require('fs');
const Psd = require('psd');
const AdmZip = require('adm-zip');
const multer = require('multer');
const router = express.Router();
const {
  HTML_CACHES_DIR,
  resolveSafe,
  asyncHandler,
  ensureProjectReadable,
  ensureProjectWritable,
  sendWriteGuardError,
  broadcastProjectEvent
} = require('./utils');

const psdUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const isPsd = file.mimetype === 'image/vnd.adobe.photoshop' ||
      file.mimetype === 'application/octet-stream' ||
      /\.psd$/i.test(file.originalname);
    const isZip = file.mimetype === 'application/zip' || /\.zip$/i.test(file.originalname);
    if (isPsd || isZip) {
      cb(null, true);
    } else {
      cb(new Error('只支持 PSD 或 ZIP 文件'));
    }
  }
});

function ensurePsdDir(projectId) {
  const dir = path.join(HTML_CACHES_DIR, String(projectId), '__psd__');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function convertPsdToPreview(psdFilePath) {
  const previewPath = psdFilePath.replace(/\.psd$/i, '.png');
  if (fs.existsSync(previewPath)) return previewPath;
  try {
    const psd = await Psd.open(psdFilePath);
    await psd.image?.saveAsPng(previewPath);
    return previewPath;
  } catch (e) {
    console.error('PSD 转换失败:', psdFilePath, e.message);
    return null;
  }
}

router.post('/upload-psd', psdUpload.array('psdFiles', 20), asyncHandler(async (req, res) => {
  const projectId = parseInt(req.query.projectId, 10);
  if (!projectId) {
    res.status(400).json({ error: '缺少项目 ID' });
    return;
  }
  if (!req.files || req.files.length === 0) {
    res.status(400).json({ error: '未选择文件' });
    return;
  }

  const guard = ensureProjectWritable(req, projectId);
  if (!guard.ok) return sendWriteGuardError(res, guard);

  const psdDir = ensurePsdDir(projectId);
  const saved = [];

  // 写入一个 PSD 并生成预览，返回结果条目
  const savePsd = async (buffer, originalName) => {
    const nonce = Math.random().toString(36).slice(2, 8);
    const fileName = `${Date.now()}_${nonce}.psd`;
    const targetPath = path.join(psdDir, fileName);
    fs.writeFileSync(targetPath, buffer);

    const previewPath = await convertPsdToPreview(targetPath);
    saved.push({
      name: fileName,
      originalName,
      path: `__psd__/${fileName}`,
      previewPath: previewPath ? `__psd__/${path.basename(previewPath)}` : null
    });
  };

  for (const file of req.files) {
    const lower = file.originalname.toLowerCase();

    if (lower.endsWith('.zip')) {
      const zip = new AdmZip(file.buffer);
      const entries = zip.getEntries();
      for (const entry of entries) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName;
        if (/\/__MACOSX\//.test(entryName) || /^__MACOSX\//.test(entryName)) continue;
        const parts = entryName.split('/');
        if (parts.some(p => p.startsWith('.'))) continue;
        if (!/\.psd$/i.test(entryName)) continue;

        await savePsd(entry.getData(), path.basename(entryName));
      }
    } else {
      await savePsd(file.buffer, file.originalname);
    }
  }

  broadcastProjectEvent(req, projectId, {
    type: 'files:changed',
    reason: 'psd-uploaded',
    files: saved
  });

  res.json({ files: saved });
}));

router.get('/list-psd', (req, res) => {
  const projectId = parseInt(req.query.projectId, 10);
  if (!projectId) {
    res.status(400).json({ error: '缺少项目 ID' });
    return;
  }

  const readable = ensureProjectReadable(req, projectId);
  if (!readable.ok) return sendWriteGuardError(res, readable);

  const psdDir = path.join(HTML_CACHES_DIR, String(projectId), '__psd__');
  if (!fs.existsSync(psdDir)) {
    res.json({ files: [] });
    return;
  }

  const files = fs.readdirSync(psdDir)
    .filter(name => /\.psd$/i.test(name))
    .map(name => {
      const previewName = name.replace(/\.psd$/i, '.png');
      const hasPreview = fs.existsSync(path.join(psdDir, previewName));
      return {
        name,
        path: `__psd__/${name}`,
        previewPath: hasPreview ? `__psd__/${previewName}` : null
      };
    });

  res.json({ files });
});

router.get('/psd-preview', asyncHandler(async (req, res) => {
  const projectId = parseInt(req.query.projectId, 10);
  const psdPath = req.query.path;
  if (!projectId || !psdPath) {
    res.status(400).json({ error: '缺少参数' });
    return;
  }

  const readable = ensureProjectReadable(req, projectId);
  if (!readable.ok) return sendWriteGuardError(res, readable);

  const projectRoot = path.join(HTML_CACHES_DIR, String(projectId));
  const fullPath = resolveSafe(projectRoot, psdPath);
  if (!fullPath) {
    res.status(400).json({ error: '非法路径' });
    return;
  }
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'PSD 文件不存在' });
    return;
  }

  const previewPath = await convertPsdToPreview(fullPath);
  if (!previewPath) {
    res.status(500).json({ error: 'PSD 转换失败' });
    return;
  }

  const relativePath = path.relative(projectRoot, previewPath);
  res.json({ previewPath: relativePath });
}));


module.exports = router;
