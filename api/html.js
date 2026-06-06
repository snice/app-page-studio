/**
 * HTML 扫描和分析 API 路由
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const cheerio = require('cheerio');
const AdmZip = require('adm-zip');
const router = express.Router();
const { getHtmlDir, upload, extractZipToDir, HTML_CACHES_DIR } = require('./utils');

// 上传 HTML ZIP（合并到项目目录，根目录图片自动移入 __design__）
router.post('/upload-html', upload.single('htmlZip'), (req, res) => {
  const projectId = parseInt(req.query.projectId);
  if (!projectId) {
    res.status(400).json({ error: '缺少项目 ID' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: '请上传 ZIP 文件' });
    return;
  }

  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

  try {
    const projectDir = path.join(HTML_CACHES_DIR, String(projectId));
    extractZipToDir(req.file.buffer, projectDir);

    // 将根目录下的图片移到 __design__
    const items = fs.readdirSync(projectDir);
    let movedCount = 0;
    for (const item of items) {
      const ext = path.extname(item).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;
      const fullPath = path.join(projectDir, item);
      if (!fs.statSync(fullPath).isFile()) continue;
      const designDir = path.join(projectDir, '__design__');
      if (!fs.existsSync(designDir)) fs.mkdirSync(designDir, { recursive: true });

      const nonce = Math.random().toString(36).slice(2, 8);
      const fileName = `${Date.now()}_${nonce}${ext}`;
      const targetPath = path.join(designDir, fileName);
      fs.renameSync(fullPath, targetPath);
      movedCount++;
    }

    res.json({ success: true, movedImages: movedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 删除指定页面（同时删除磁盘文件）
router.post('/delete-files', (req, res) => {
  const projectId = parseInt(req.body.projectId);
  const files = Array.isArray(req.body.files) ? req.body.files : [];

  if (!projectId || files.length === 0) {
    res.status(400).json({ error: '缺少 projectId 或 files' });
    return;
  }

  const htmlDir = getHtmlDir(projectId);
  if (!fs.existsSync(htmlDir)) {
    res.status(404).json({ error: '项目目录不存在' });
    return;
  }

  const htmlRoot = path.resolve(htmlDir);
  let deletedCount = 0;

  for (const item of files) {
    if (!item || !item.path) continue;
    const relPath = String(item.path).replace(/^[/\\]+/, '');
    const absPath = path.resolve(htmlDir, relPath);
    if (absPath !== htmlRoot && !absPath.startsWith(htmlRoot + path.sep)) continue;
    if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) continue;
    try {
      const relPosix = relPath.replace(/\\/g, '/');
      const isSpecialDir = relPosix.startsWith('__design__/') || relPosix.startsWith('__assets__/') || relPosix.startsWith('__psd__/');
      if (isSpecialDir) {
        fs.unlinkSync(absPath);
        // PSD 删除时同步删除同名预览 PNG
        if (relPosix.startsWith('__psd__/') && /\.psd$/i.test(absPath)) {
          const previewPng = absPath.replace(/\.psd$/i, '.png');
          if (fs.existsSync(previewPng)) fs.unlinkSync(previewPng);
        }
      } else {
        const parentDir = path.dirname(absPath);
        const relParent = path.relative(htmlDir, parentDir);
        if (relParent && relParent !== '.' && relParent !== '..') {
          fs.rmSync(parentDir, { recursive: true, force: true });
        } else {
          fs.unlinkSync(absPath);
        }
      }
      deletedCount += 1;
    } catch { }
  }

  res.json({ success: true, deletedCount });
});

// 扫描 HTML 文件
router.get('/scan-html', (req, res) => {
  const projectId = parseInt(req.query.projectId);
  const htmlDir = getHtmlDir(projectId);
  const htmlRoot = path.resolve(htmlDir);
  console.log('扫描 HTML 目录:', htmlDir);

  if (!fs.existsSync(htmlDir)) {
    res.json({ files: [], htmlPath: htmlDir });
    return;
  }

  const scanDir = (dir, basePath = '') => {
    const files = [];
    try {
      const items = fs.readdirSync(dir);

      for (const item of items) {
        const fullPath = path.join(dir, item);
        const relativePath = path.join(basePath, item);
        try {
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            files.push(...scanDir(fullPath, relativePath));
          } else if (item.endsWith('.html') || item.endsWith('.htm')) {
            files.push({
              name: item,
              path: relativePath.replace(/\\/g, '/'),
              // fullPath: fullPath,
              size: stat.size,
              modified: stat.mtime
            });
          }
        } catch { }
      }
    } catch { }
    return files;
  };

  const psdDir = path.join(htmlDir, '__psd__');
  const psdFiles = [];
  if (fs.existsSync(psdDir)) {
    try {
      const items = fs.readdirSync(psdDir);
      for (const item of items) {
        if (!/\.psd$/i.test(item)) continue;
        const fullPath = path.join(psdDir, item);
        try {
          const stat = fs.statSync(fullPath);
          const previewName = item.replace(/\.psd$/i, '.png');
          const hasPreview = fs.existsSync(path.join(psdDir, previewName));
          psdFiles.push({
            name: item,
            path: `__psd__/${item}`,
            size: stat.size,
            modified: stat.mtime,
            sourceType: 'psd',
            previewPath: hasPreview ? `__psd__/${previewName}` : null
          });
        } catch { }
      }
    } catch { }
  }

  res.json({ files: scanDir(htmlDir), psdFiles, htmlPath: htmlDir });
});

// 读取 HTML 内容（用于元素选择器）
router.get('/html-content', (req, res) => {
  const projectId = parseInt(req.query.projectId);
  const htmlDir = getHtmlDir(projectId);
  const htmlPath = path.join(htmlDir, req.query.path);

  if (!fs.existsSync(htmlPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  res.json({ html });
});

// 分析 HTML 结构
router.get('/analyze-html', (req, res) => {
  const projectId = parseInt(req.query.projectId);
  const htmlDir = getHtmlDir(projectId);
  const htmlPath = path.join(htmlDir, req.query.path);

  if (!fs.existsSync(htmlPath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const $ = cheerio.load(html);

  // 提取颜色
  const colors = new Set();
  const colorRegex = /#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|rgba\([^)]+\)/g;

  $('[style]').each((_, el) => {
    const style = $(el).attr('style') || '';
    const matches = style.match(colorRegex);
    if (matches) matches.forEach(c => colors.add(c));
  });

  // 从 style 标签提取
  $('style').each((_, el) => {
    const css = $(el).html() || '';
    const matches = css.match(colorRegex);
    if (matches) matches.forEach(c => colors.add(c));
  });

  // 提取可交互元素
  const interactiveElements = [];
  $('button, a, input, textarea, select, [onclick], [role="button"], [class*="btn"], [class*="button"], [class*="link"], [class*="tab"], [class*="nav"]').each((_, el) => {
    const $el = $(el);
    const classes = ($el.attr('class') || '').split(' ').filter(Boolean);

    interactiveElements.push({
      tag: el.tagName.toLowerCase(),
      text: $el.text().trim().substring(0, 50),
      class: $el.attr('class'),
      id: $el.attr('id'),
      selector: generateSelector($, el),
      type: getElementType(el.tagName.toLowerCase(), classes)
    });
  });

  // 页面结构分析
  const structure = {
    hasHeader: $('header, [class*="header"], [class*="nav"]').length > 0,
    hasFooter: $('footer, [class*="footer"], [class*="tabbar"], [class*="tab-bar"]').length > 0,
    hasList: $('ul, ol, [class*="list"]').length > 0,
    hasForm: $('form, input, textarea').length > 0,
    hasModal: $('[class*="modal"], [class*="dialog"], [class*="popup"]').length > 0,
    hasCard: $('[class*="card"]').length > 0
  };

  res.json({
    colors: Array.from(colors),
    interactiveElements,
    structure,
    title: $('title').text() || path.basename(htmlPath, '.html')
  });
});

// 打包下载设计稿（HTML + 设计图 + PSD + 切图）
router.post('/download-design-zip', (req, res) => {
  const projectId = parseInt(req.body.projectId);
  const files = Array.isArray(req.body.files) ? req.body.files : [];
  const psdSliceExports = req.body.psdSliceExports || {}; // { psdPath: [{name, ext, data(base64)}] }

  if (!projectId || files.length === 0) {
    res.status(400).json({ error: '缺少 projectId 或 files' });
    return;
  }

  const htmlDir = getHtmlDir(projectId);
  if (!fs.existsSync(htmlDir)) {
    res.status(404).json({ error: '项目目录不存在' });
    return;
  }

  const htmlRoot = path.resolve(htmlDir);
  const zip = new AdmZip();
  let addedCount = 0;
  const addedPaths = new Set();

  const toPosix = (p) => p.replace(/\\/g, '/');
  const stripLeading = (p) => p.replace(/^[/\\]+/, '');

  // 递归添加目录下所有文件
  const addDirRecursive = (dirAbsPath, zipPrefix) => {
    if (!fs.existsSync(dirAbsPath) || !fs.statSync(dirAbsPath).isDirectory()) return;
    const entries = fs.readdirSync(dirAbsPath, { withFileTypes: true });
    for (const entry of entries) {
      const entryAbsPath = path.join(dirAbsPath, entry.name);
      const zipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        addDirRecursive(entryAbsPath, zipPath);
      } else if (entry.isFile()) {
        if (!addedPaths.has(zipPath)) {
          zip.addFile(zipPath, fs.readFileSync(entryAbsPath));
          addedPaths.add(zipPath);
          addedCount += 1;
        }
      }
    }
  };

  for (const item of files) {
    if (!item || !item.path) continue;
    const relPath = stripLeading(String(item.path));
    const absPath = path.resolve(htmlDir, relPath);
    // 安全检查：必须在项目目录内
    if (absPath !== htmlRoot && !absPath.startsWith(htmlRoot + path.sep)) continue;
    if (!fs.existsSync(absPath)) continue;

    const posixPath = toPosix(relPath);
    const isPsd = item.sourceType === 'psd' || posixPath.endsWith('.psd');
    const isHtml = !isPsd && item.sourceType !== 'image' && !posixPath.match(/\.(png|jpe?g|webp|gif)$/i);

    if (isHtml) {
      // HTML 文件：打包其所在目录下的所有关联资源（CSS、JS、图片等）
      const parentDir = path.dirname(absPath);
      const parentRel = path.dirname(relPath);
      const zipPrefix = toPosix(parentRel);
      addDirRecursive(parentDir, zipPrefix);
    } else {
      // 图片：直接添加文件，保持原始路径
      if (!isPsd && !addedPaths.has(posixPath)) {
        zip.addFile(posixPath, fs.readFileSync(absPath));
        addedPaths.add(posixPath);
        addedCount += 1;
      }
      // PSD 文件：跳过 .psd 源文件（对代码生成无用），只包含预览 PNG 和切图
      if (isPsd) {
        const previewPng = posixPath.replace(/\.psd$/i, '.png');
        const previewAbsPath = path.resolve(htmlDir, previewPng);
        if (fs.existsSync(previewAbsPath) && !addedPaths.has(previewPng)) {
          zip.addFile(previewPng, fs.readFileSync(previewAbsPath));
          addedPaths.add(previewPng);
          addedCount += 1;
        }

        // 添加导出的切图文件
        const slices = psdSliceExports[posixPath];
        if (slices && slices.length > 0) {
          const psdBaseName = path.basename(posixPath, path.extname(posixPath));
          const slicesPrefix = `__psd__/${psdBaseName}_slices`;
          for (const slice of slices) {
            if (!slice.data) continue;
            const sliceFileName = `${slice.name}.${slice.ext || 'png'}`;
            const sliceZipPath = `${slicesPrefix}/${sliceFileName}`;
            if (!addedPaths.has(sliceZipPath)) {
              const buffer = Buffer.from(slice.data, 'base64');
              zip.addFile(sliceZipPath, buffer);
              addedPaths.add(sliceZipPath);
              addedCount += 1;
            }
          }
        }
      }
    }
  }

  if (addedCount === 0) {
    res.status(400).json({ error: '未找到可打包的文件' });
    return;
  }

  const zipBuffer = zip.toBuffer();
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="design-pack-${projectId}.zip"`);
  res.send(zipBuffer);
});

// 生成 CSS 选择器
function generateSelector($, el) {
  const $el = $(el);
  const id = $el.attr('id');
  if (id) return `#${id}`;

  const classes = ($el.attr('class') || '').trim().split(/\s+/).filter(Boolean);
  if (classes.length > 0) {
    return `.${classes.slice(0, 2).join('.')}`;
  }

  return el.tagName.toLowerCase();
}

// 获取元素类型
function getElementType(tag, classes) {
  const classStr = classes.join(' ').toLowerCase();

  if (tag === 'button' || classStr.includes('btn') || classStr.includes('button')) return 'button';
  if (tag === 'a' || classStr.includes('link')) return 'link';
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return 'input';
  if (classStr.includes('tab')) return 'tab';
  if (classStr.includes('nav')) return 'navigation';
  if (classStr.includes('card')) return 'card';
  if (classStr.includes('list') || classStr.includes('item')) return 'list-item';

  return 'interactive';
}

module.exports = router;
