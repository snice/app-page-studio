/**
 * API 工具模块
 * 提供共享的工具函数和配置
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { Projects } = require('../db');

// HTML 缓存目录
const HTML_CACHES_DIR = path.join(__dirname, '..', 'html_caches');
if (!fs.existsSync(HTML_CACHES_DIR)) {
  fs.mkdirSync(HTML_CACHES_DIR, { recursive: true });
}

// 文件上传配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB 限制
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/zip' || file.originalname.endsWith('.zip')) {
      cb(null, true);
    } else {
      cb(new Error('只支持 ZIP 文件'));
    }
  }
});

/**
 * 获取 HTML 目录路径（基于请求中的 projectId）
 * @param {number} projectId - 项目 ID
 * @returns {string}
 */
function getHtmlDir(projectId) {
  if (projectId) {
    const projectHtmlDir = path.join(HTML_CACHES_DIR, String(projectId));
    if (fs.existsSync(projectHtmlDir)) {
      return projectHtmlDir;
    }
  }
  return path.join(__dirname, '..', 'html');
}

/**
 * 解压 ZIP 文件到目录
 * @param {Buffer} zipBuffer - ZIP 文件 buffer
 * @param {string} targetDir - 目标目录
 */
function extractZipToDir(zipBuffer, targetDir) {
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // 创建目标目录
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 需要跳过的隐藏文件/文件夹模式
  const shouldSkip = (entryPath) => {
    const parts = entryPath.split('/');
    for (const part of parts) {
      // 跳过 macOS 特殊目录
      if (part === '__MACOSX') return true;
      // 跳过 .DS_Store 和其他以 . 开头的隐藏文件/文件夹
      if (part.startsWith('.')) return true;
    }
    return false;
  };

  // 过滤有效的条目
  const validEntries = entries.filter(e => !shouldSkip(e.entryName));

  // 检测是否所有文件都在一个根目录下
  const topLevelDirs = new Set();
  for (const entry of validEntries) {
    const parts = entry.entryName.split('/').filter(Boolean);
    if (parts.length > 0) {
      topLevelDirs.add(parts[0]);
    }
  }

  // 如果只有一个顶级目录，则跳过该目录层级
  const skipRoot = topLevelDirs.size === 1 && validEntries.some(e => e.isDirectory && e.entryName.replace(/\/$/, '') === [...topLevelDirs][0]);
  const rootPrefix = skipRoot ? [...topLevelDirs][0] + '/' : '';

  for (const entry of validEntries) {
    if (entry.isDirectory) continue;

    let entryPath = entry.entryName;

    // 跳过根目录前缀
    if (skipRoot && entryPath.startsWith(rootPrefix)) {
      entryPath = entryPath.substring(rootPrefix.length);
    }

    if (!entryPath) continue;

    const targetPath = path.join(targetDir, entryPath);
    const targetDirPath = path.dirname(targetPath);

    if (!fs.existsSync(targetDirPath)) {
      fs.mkdirSync(targetDirPath, { recursive: true });
    }

    fs.writeFileSync(targetPath, entry.getData());
  }
}

module.exports = {
  HTML_CACHES_DIR,
  upload,
  getHtmlDir,
  extractZipToDir,
  Projects
};
