const path = require('path');

function normalizeRelPath(value) {
  return String(value || '').replace(/^[/\\]+/, '').replace(/\\/g, '/');
}

function pickSourceImageRelPath(file) {
  if (!file || typeof file !== 'object') return '';
  if (file.sourceType === 'psd') {
    return normalizeRelPath(file.previewPath || file.imagePath || String(file.path || '').replace(/\.psd$/i, '.png'));
  }
  return normalizeRelPath(file.imagePath || file.previewPath || file.path);
}

function targetHtmlRelPath(sourceImageRelPath) {
  const rel = normalizeRelPath(sourceImageRelPath);
  const parsed = path.posix.parse(rel);
  return path.posix.join(parsed.dir, parsed.name, 'index.html');
}

function relativeFromHtml(htmlRelPath, targetRelPath) {
  const rel = path.posix.relative(path.posix.dirname(htmlRelPath), normalizeRelPath(targetRelPath));
  if (!rel || rel.startsWith('.')) return rel || '.';
  return `./${rel}`;
}

module.exports = {
  normalizeRelPath,
  pickSourceImageRelPath,
  relativeFromHtml,
  targetHtmlRelPath
};
