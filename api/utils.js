/**
 * API 工具模块
 * 提供共享的工具函数和配置
 */

const path = require('path');
const fs = require('fs');
const multer = require('multer');
const AdmZip = require('adm-zip');
const { Projects, EditSessions } = require('../db');

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

// 图片上传配置（设计图）
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB 限制
  fileFilter: (req, file, cb) => {
    const isImage = file.mimetype.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(file.originalname);
    if (isImage) {
      cb(null, true);
    } else {
      cb(new Error('只支持图片文件'));
    }
  }
});

/**
 * 获取项目 HTML 目录路径
 * @param {number} projectId
 * @returns {string} 项目目录绝对路径（即使不存在也返回，由调用方决定如何处理）
 */
function getHtmlDir(projectId) {
  return path.join(HTML_CACHES_DIR, String(projectId || ''));
}

/**
 * 在指定基目录内安全解析用户传入的相对路径，防止路径穿越（../）。
 * @param {string} baseDir - 允许访问的基目录（信任）
 * @param {string} userPath - 用户传入的相对路径（不信任）
 * @returns {string|null} 解析后的绝对路径；若越界或非法则返回 null
 */
function resolveSafe(baseDir, userPath) {
  if (typeof userPath !== 'string' || userPath.length === 0) return null;
  // 禁止绝对路径与空字节
  if (path.isAbsolute(userPath) || userPath.includes('\0')) return null;

  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, userPath);

  // 必须严格位于 base 内部（或等于 base）
  if (resolved !== base && !resolved.startsWith(base + path.sep)) return null;
  return resolved;
}

/**
 * 包装异步路由处理器，自动捕获 reject 并转交 Express 错误中间件。
 * @param {Function} fn - async (req, res, next) => {}
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function getRequestSessionInfo(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const query = req.query && typeof req.query === 'object' ? req.query : {};

  // sessionId 仍由客户端提供（区分多 tab），editorName 一律取登录用户名（防伪造）
  return {
    sessionId: req.get('x-session-id') || body.sessionId || query.sessionId || '',
    editorName: req.authUser?.username || req.session?.user?.username || null
  };
}

function getAuthUser(req) {
  return req.authUser || req.session?.user || null;
}

function getProjectForRequest(req, projectId) {
  return Projects.getById(projectId, getAuthUser(req));
}

function ensureProjectReadable(req, projectId) {
  const project = getProjectForRequest(req, projectId);
  if (!project) {
    return {
      ok: false,
      status: 404,
      error: '项目不存在'
    };
  }

  return { ok: true, project };
}

function ensureProjectWritable(req, projectId) {
  const readable = ensureProjectReadable(req, projectId);
  if (!readable.ok) return readable;

  if (!Projects.userCanWrite(projectId, getAuthUser(req))) {
    return {
      ok: false,
      status: 403,
      error: '无权修改此项目'
    };
  }

  const session = getRequestSessionInfo(req);
  const status = EditSessions.checkSession(projectId, session.sessionId || '');
  if (!status.isCurrentEditor) {
    return {
      ok: false,
      status: 423,
      error: `"${status.currentEditor || '其他用户'}" 正在编辑此项目，请接管后再操作`,
      currentEditor: status.currentEditor || '其他用户'
    };
  }

  return {
    ok: true,
    project: readable.project,
    sessionId: session.sessionId || null,
    editorName: session.editorName || status.currentEditor || null
  };
}

function sendProjectGuardError(res, guard) {
  return res.status(guard.status || 423).json({
    error: guard.error || '当前项目暂不可写',
    currentEditor: guard.currentEditor || null
  });
}

const sendWriteGuardError = sendProjectGuardError;

/**
 * 是否应跳过 ZIP 条目（macOS 元数据 / 隐藏文件）
 */
function shouldSkipZipEntry(entryPath) {
  const parts = entryPath.split('/');
  for (const part of parts) {
    if (part === '__MACOSX') return true;
    if (part.startsWith('.')) return true;
  }
  return false;
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

  // 过滤有效的条目
  const validEntries = entries.filter(e => !shouldSkipZipEntry(e.entryName));

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

    // 防 ZIP Slip：拒绝包含 .. 或绝对路径的条目，确认解压后仍在 targetDir 内
    if (entryPath.includes('\0') || path.isAbsolute(entryPath)) continue;
    const targetPath = path.resolve(targetDir, entryPath);
    const baseResolved = path.resolve(targetDir);
    if (targetPath !== baseResolved && !targetPath.startsWith(baseResolved + path.sep)) continue;

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
  imageUpload,
  getHtmlDir,
  resolveSafe,
  asyncHandler,
  getRequestSessionInfo,
  getAuthUser,
  getProjectForRequest,
  ensureProjectReadable,
  ensureProjectWritable,
  sendProjectGuardError,
  sendWriteGuardError,
  extractZipToDir,
  shouldSkipZipEntry,
  Projects
};
