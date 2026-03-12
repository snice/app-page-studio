#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function printUsage() {
  console.log('Usage: node tools/html-snapshot/index.js <htmlPath> <pngPath> [size]');
  console.log('  size (optional): 375x812 or 375,812');
}

function parseSizeArg(arg) {
  if (!arg) return null;
  const match = String(arg).trim().match(/^(\d{2,5})\s*[x,]\s*(\d{2,5})$/i);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseViewportFromHtml(html) {
  const metaMatch = html.match(/<meta\s+[^>]*name=["']viewport["'][^>]*>/i);
  if (!metaMatch) return null;
  const contentMatch = metaMatch[0].match(/content=["']([^"']+)["']/i);
  if (!contentMatch) return null;
  const content = contentMatch[1];
  const widthMatch = content.match(/width\s*=\s*(\d{2,5})/i);
  const heightMatch = content.match(/height\s*=\s*(\d{2,5})/i);
  if (!widthMatch || !heightMatch) return null;
  return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
}

async function detectPageSize(page) {
  const size = await page.evaluate(() => {
    const doc = document.documentElement;
    const body = document.body;
    const widths = [
      doc ? doc.scrollWidth : 0,
      doc ? doc.clientWidth : 0,
      body ? body.scrollWidth : 0,
      body ? body.clientWidth : 0,
    ];
    const heights = [
      doc ? doc.scrollHeight : 0,
      doc ? doc.clientHeight : 0,
      body ? body.scrollHeight : 0,
      body ? body.clientHeight : 0,
    ];
    const width = Math.max(...widths);
    const height = Math.max(...heights);
    return { width, height };
  });
  const width = Math.max(1, Math.min(10000, Math.round(size.width)));
  const height = Math.max(1, Math.min(10000, Math.round(size.height)));
  return { width, height };
}

async function main() {
  const [, , htmlPathInput, pngPathInput, sizeArg] = process.argv;
  if (!htmlPathInput || !pngPathInput) {
    printUsage();
    process.exit(1);
  }

  const htmlPath = path.resolve(htmlPathInput);
  const pngPath = path.resolve(pngPathInput);

  if (!fs.existsSync(htmlPath)) {
    console.error(`HTML not found: ${htmlPath}`);
    process.exit(1);
  }

  const outputDir = path.dirname(pngPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const html = fs.readFileSync(htmlPath, 'utf-8');
  const sizeFromArg = parseSizeArg(sizeArg);
  const sizeFromHtml = sizeFromArg || parseViewportFromHtml(html);

  let chromium;
  try {
    ({ chromium } = require('playwright'));
  } catch (err) {
    console.error('Playwright is not installed. Run `npm install` first.');
    process.exit(1);
  }

  const browser = await chromium.launch();
  const viewport = sizeFromHtml || { width: 800, height: 600 };
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const fileUrl = pathToFileURL(htmlPath).toString();
  await page.goto(fileUrl, { waitUntil: 'load' });

  await page.screenshot({ path: pngPath, fullPage: false });
  await browser.close();

  console.log(`Snapshot saved: ${pngPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
