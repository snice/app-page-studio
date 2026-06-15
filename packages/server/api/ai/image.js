const path = require('path');
const fs = require('fs');
const { requestError } = require('./errors');

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] || null;
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24) return null;
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function parseJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  const sofMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;

    if (marker === 0xd9 || marker === 0xda) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;
    if (offset + 2 > buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;

    if (sofMarkers.has(marker) && offset + 7 <= buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5)
      };
    }

    offset += length;
  }

  return null;
}

function readUInt24LE(buffer, offset) {
  if (offset + 3 > buffer.length) return 0;
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function parseWebpDimensions(buffer) {
  if (buffer.length < 30) return null;
  if (buffer.subarray(0, 4).toString('ascii') !== 'RIFF') return null;
  if (buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;

  const chunk = buffer.subarray(12, 16).toString('ascii');
  if (chunk === 'VP8X' && buffer.length >= 30) {
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1
    };
  }

  if (chunk === 'VP8L' && buffer.length >= 25 && buffer[20] === 0x2f) {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }

  if (chunk === 'VP8 ' && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }

  return null;
}

function parseImageDimensions(buffer, mime) {
  let dimensions = null;
  if (mime === 'image/png') dimensions = parsePngDimensions(buffer);
  if (mime === 'image/jpeg') dimensions = parseJpegDimensions(buffer);
  if (mime === 'image/webp') dimensions = parseWebpDimensions(buffer);

  const width = Number.parseInt(dimensions?.width, 10);
  const height = Number.parseInt(dimensions?.height, 10);
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return null;
  return { width, height };
}

function readImageFile(absPath) {
  const mime = getMimeType(absPath);
  if (!mime) throw requestError(400, '设计图格式仅支持 PNG/JPG/WebP');
  const stat = fs.statSync(absPath);
  if (stat.size > MAX_IMAGE_BYTES) throw requestError(413, '设计图超过 20MB');
  const buffer = fs.readFileSync(absPath);
  return {
    dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
    imageSize: parseImageDimensions(buffer, mime),
    mime,
    bytes: stat.size
  };
}

function normalizeDevice(device, imageSize = null) {
  const imageWidth = Number.parseInt(imageSize?.width, 10);
  const imageHeight = Number.parseInt(imageSize?.height, 10);
  if (Number.isFinite(imageWidth) && imageWidth > 0 && Number.isFinite(imageHeight) && imageHeight > 0) {
    return {
      width: imageWidth,
      height: imageHeight,
      source: 'image'
    };
  }

  const width = Number.parseInt(device?.width, 10);
  const height = Number.parseInt(device?.height, 10);
  return {
    width: Number.isFinite(width) && width > 0 ? width : 375,
    height: Number.isFinite(height) && height > 0 ? height : 812,
    source: 'device'
  };
}

module.exports = {
  normalizeDevice,
  parseImageDimensions,
  readImageFile
};
