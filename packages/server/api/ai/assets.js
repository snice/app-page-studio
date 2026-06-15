const path = require('path');
const fs = require('fs');
const { resolveSafe } = require('../utils');
const { requestError } = require('./errors');
const { normalizeRelPath, relativeFromHtml } = require('./paths');

const LOCAL_IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif)$/i;
const LOCAL_ASSET_ROOTS = ['__assets__', '__design__', '__psd__'];
const MAX_PROMPT_ASSETS = 80;

function extractHashTokens(value) {
  return Array.from(new Set(String(value || '').match(/[a-f0-9]{10}/ig) || []))
    .map((item) => item.toLowerCase());
}

function assetMatchKey(fileName) {
  const basename = path.posix.basename(String(fileName || '')).toLowerCase();
  const match = basename.match(/[a-f0-9]{10}_.+$/i);
  return match ? match[0].toLowerCase() : basename;
}

function walkLocalImageAssets(projectDir, relDir, output) {
  const absDir = resolveSafe(projectDir, relDir);
  if (!absDir || !fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) return;

  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const relPath = path.posix.join(relDir, entry.name);
    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      walkLocalImageAssets(projectDir, relPath, output);
    } else if (entry.isFile() && LOCAL_IMAGE_EXT_RE.test(entry.name)) {
      output.push({
        relPath,
        basename: path.posix.basename(relPath),
        ext: path.posix.extname(relPath).toLowerCase()
      });
    }
  }
}

function listProjectLocalImageAssets(projectDir) {
  const assets = [];
  for (const root of LOCAL_ASSET_ROOTS) {
    walkLocalImageAssets(projectDir, root, assets);
  }
  return assets.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function buildAssetIndex(context) {
  const assets = listProjectLocalImageAssets(context.projectDir);
  const byBasename = new Map();
  const byKey = new Map();

  for (const asset of assets) {
    const basename = asset.basename.toLowerCase();
    const key = assetMatchKey(asset.basename);
    if (!byBasename.has(basename)) byBasename.set(basename, []);
    if (!byKey.has(key)) byKey.set(key, []);
    byBasename.get(basename).push(asset);
    byKey.get(key).push(asset);
  }

  return {
    assets,
    byBasename,
    byKey,
    sourceHashes: extractHashTokens(context.sourceImageRelPath)
  };
}

function rankAssetCandidate(asset, sourceHashes) {
  let score = asset.relPath.length / 1000;
  if (asset.relPath.startsWith('__assets__/')) score -= 100;
  if (sourceHashes.some((hash) => asset.basename.toLowerCase().includes(hash))) score -= 10;
  return score;
}

function pickAssetCandidate(candidates, sourceHashes, preferredExt) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const extMatches = candidates.filter((asset) => !preferredExt || asset.ext === preferredExt);
  const scoped = extMatches.length > 0 ? extMatches : candidates;
  return scoped
    .slice()
    .sort((a, b) => rankAssetCandidate(a, sourceHashes) - rankAssetCandidate(b, sourceHashes))
  [0] || null;
}

function splitLocalResourceUrl(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('#')) return null;
  if (/^(?:data|blob|https?|mailto|tel|javascript):/i.test(raw)) return null;

  const suffixIndex = [raw.indexOf('?'), raw.indexOf('#')]
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  const pathname = suffixIndex >= 0 ? raw.slice(0, suffixIndex) : raw;
  const suffix = suffixIndex >= 0 ? raw.slice(suffixIndex) : '';
  if (!LOCAL_IMAGE_EXT_RE.test(pathname)) return null;

  let decodedPathname = pathname;
  try {
    decodedPathname = decodeURI(pathname);
  } catch { }

  return { raw, pathname: decodedPathname.replace(/\\/g, '/'), suffix };
}

function localResourceToProjectRel(context, pathname) {
  let clean = String(pathname || '').replace(/\\/g, '/').trim();
  const servedProjectMatch = clean.match(/^\/?html\/\d+\/(.+)$/i);
  if (servedProjectMatch) clean = servedProjectMatch[1];
  if (clean.startsWith('/')) clean = clean.slice(1);

  const relPath = clean.startsWith('__')
    ? normalizeRelPath(clean)
    : normalizeRelPath(path.posix.normalize(path.posix.join(path.posix.dirname(context.htmlRelPath), clean)));
  const absPath = resolveSafe(context.projectDir, relPath);
  return absPath ? { relPath, absPath } : null;
}

function findExistingAssetForMissingReference(context, pathname, assetIndex) {
  const basename = path.posix.basename(String(pathname || '')).toLowerCase();
  const preferredExt = path.posix.extname(basename).toLowerCase();
  const exact = pickAssetCandidate(assetIndex.byBasename.get(basename), assetIndex.sourceHashes, preferredExt);
  if (exact) return exact;

  const key = assetMatchKey(basename);
  return pickAssetCandidate(assetIndex.byKey.get(key), assetIndex.sourceHashes, preferredExt);
}

function extractHtmlLocalResourceRefs(html) {
  const refs = new Set();
  String(html || '').replace(/\b(?:src|href|poster)\s*=\s*(["'])([^"']+)\1/gi, (_match, _quote, value) => {
    refs.add(value);
    return _match;
  });
  String(html || '').replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, _quote, value) => {
    refs.add(value);
    return _match;
  });
  return Array.from(refs);
}

function repairHtmlLocalAssetReferences(html, context) {
  const assetIndex = buildAssetIndex(context);
  const replacements = [];
  const missing = [];

  for (const rawRef of extractHtmlLocalResourceRefs(html)) {
    const resource = splitLocalResourceUrl(rawRef);
    if (!resource) continue;

    const resolved = localResourceToProjectRel(context, resource.pathname);
    if (resolved?.absPath && fs.existsSync(resolved.absPath) && fs.statSync(resolved.absPath).isFile()) {
      continue;
    }

    const asset = findExistingAssetForMissingReference(context, resource.pathname, assetIndex);
    if (asset) {
      const replacement = `${relativeFromHtml(context.htmlRelPath, asset.relPath)}${resource.suffix}`;
      if (replacement !== rawRef) {
        replacements.push({ from: rawRef, to: replacement, assetPath: asset.relPath });
      }
    } else {
      missing.push(rawRef);
    }
  }

  if (missing.length > 0) {
    const snippet = missing.slice(0, 5).join(', ');
    throw requestError(502, `AI 引用了不存在的本地图片资源: ${snippet}`);
  }

  let repairedHtml = String(html || '');
  const uniqueReplacements = Array.from(new Map(replacements.map((item) => [item.from, item])).values());
  uniqueReplacements
    .sort((a, b) => b.from.length - a.from.length)
    .forEach((item) => {
      repairedHtml = repairedHtml.split(item.from).join(item.to);
    });

  return { html: repairedHtml, replacements: uniqueReplacements };
}

function buildAvailableLocalAssetsText(context, { excludePaths = [] } = {}) {
  const sourceHashes = extractHashTokens(context.sourceImageRelPath);
  const assets = listProjectLocalImageAssets(context.projectDir);
  const excludeSet = new Set(
    (Array.isArray(excludePaths) ? excludePaths : [])
      .map((value) => normalizeRelPath(String(value || '')))
      .filter(Boolean)
  );
  const filteredAssets = excludeSet.size > 0
    ? assets.filter((asset) => !excludeSet.has(asset.relPath))
    : assets;
  const sameSourceAssets = sourceHashes.length > 0
    ? filteredAssets.filter((asset) => sourceHashes.some((hash) => asset.basename.toLowerCase().includes(hash)))
    : [];
  const scopedAssets = (sameSourceAssets.length > 0 ? sameSourceAssets : filteredAssets).slice(0, MAX_PROMPT_ASSETS);
  if (scopedAssets.length === 0) return '无';
  return scopedAssets
    .map((asset) => `- ${relativeFromHtml(context.htmlRelPath, asset.relPath)}`)
    .join('\n');
}

module.exports = {
  buildAvailableLocalAssetsText,
  repairHtmlLocalAssetReferences
};
