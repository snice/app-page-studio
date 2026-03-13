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

// 上传 HTML ZIP（合并到项目目录）
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

  try {
    const projectDir = path.join(HTML_CACHES_DIR, String(projectId));
    extractZipToDir(req.file.buffer, projectDir);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
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
        } catch {}
      }
    } catch {}
    return files;
  };

  res.json({ files: scanDir(htmlDir), htmlPath: htmlDir });
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

// 打包下载设计稿（HTML + 设计图）
router.post('/download-design-zip', (req, res) => {
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

  const zip = new AdmZip();
  let addedCount = 0;

  const toPosix = (p) => p.replace(/\\/g, '/');
  const stripLeading = (p) => p.replace(/^[/\\]+/, '');
  const isImageFile = (name) => {
    const ext = path.extname(name).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
  };

  for (const item of files) {
    if (!item || !item.path) continue;
    const relPath = stripLeading(String(item.path));
    const absPath = path.resolve(htmlDir, relPath);
    if (absPath !== htmlRoot && !absPath.startsWith(htmlRoot + path.sep)) continue;
    if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) continue;

    const posixPath = toPosix(relPath);
    const isImage = item.sourceType === 'image' || isImageFile(posixPath);
    let targetPath = posixPath;
    if (isImage) {
      if (targetPath.startsWith('__design__/')) {
        targetPath = targetPath.slice('__design__/'.length);
      }
      targetPath = `__design__/${targetPath}`;
    } else {
      if (targetPath.startsWith('html/')) {
        targetPath = targetPath.slice('html/'.length);
      }
      targetPath = `html/${targetPath}`;
    }

    zip.addFile(targetPath, fs.readFileSync(absPath));
    addedCount += 1;
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
