#!/usr/bin/env node

/**
 * Local smoke test for AI HTML Agent generation.
 *
 * It invokes the real /ai-html-agent/generate route handler with a fake
 * authenticated admin request, so it exercises the same generation path without
 * starting the HTTP server or logging in.
 */

const path = require('path');
const router = require('../api/ai-html-agent');
const { Projects, Users } = require('../db');

const DEFAULT_PROJECT_ID = 1;
const DEFAULT_DESIGN_PATH = '__design__/figma_page_d8e2c82aab.png';
const DEFAULT_DEVICE = { width: 375, height: 812 };

function parseArgs(argv) {
  const options = {
    projectId: DEFAULT_PROJECT_ID,
    designPath: DEFAULT_DESIGN_PATH,
    width: DEFAULT_DEVICE.width,
    height: DEFAULT_DEVICE.height,
    stream: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === '-p' || arg === '--projectId') && next) {
      options.projectId = Number.parseInt(next, 10);
      i++;
    } else if ((arg === '-f' || arg === '--path') && next) {
      options.designPath = next;
      i++;
    } else if (arg === '--width' && next) {
      options.width = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--height' && next) {
      options.height = Number.parseInt(next, 10);
      i++;
    } else if (arg === '--no-stream') {
      options.stream = false;
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function printHelp() {
  console.log(`Usage:
  pnpm --filter server test-ai-html-agent
  pnpm --filter server test-ai-html-agent -- --projectId 1 --path __design__/figma_page_d8e2c82aab.png

Options:
  -p, --projectId <id>  Project id. Default: ${DEFAULT_PROJECT_ID}
  -f, --path <path>     Design image path. Default: ${DEFAULT_DESIGN_PATH}
  --width <px>          Preview fallback width. Image width is used when readable. Default: ${DEFAULT_DEVICE.width}
  --height <px>         Preview fallback height. Image height is used when readable. Default: ${DEFAULT_DEVICE.height}
  --no-stream           Use the legacy JSON response path.
`);
}

function findGenerateHandler() {
  for (const layer of router.stack || []) {
    if (layer.route?.path !== '/ai-html-agent/generate') continue;
    const routeLayer = layer.route.stack?.[0];
    if (typeof routeLayer?.handle === 'function') return routeLayer.handle;
  }
  throw new Error('Cannot find /ai-html-agent/generate route handler');
}

function buildFileConfig(projectId, designPath) {
  const pagesConfig = Projects.getPagesJson(projectId);
  const existingFile = (pagesConfig?.htmlFiles || []).find((file) =>
    file?.path === designPath || file?.imagePath === designPath || file?.previewPath === designPath
  );

  return {
    ...(existingFile || {}),
    path: existingFile?.path || designPath,
    name: existingFile?.name || path.posix.basename(designPath),
    sourceType: existingFile?.sourceType || 'image',
    imagePath: existingFile?.imagePath || designPath,
  };
}

function parseSseBlock(block) {
  let event = 'message';
  const dataLines = [];
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) event = line.slice(6).trim() || 'message';
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return null;
  let payload;
  try {
    payload = JSON.parse(dataLines.join('\n'));
  } catch {
    payload = { text: dataLines.join('\n') };
  }
  return { event, payload };
}

function invokeHandler(handler, req, { stream = false } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let sseBuffer = '';
    let ssePayload = null;
    let streamedChars = 0;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const handleSseBlock = (block) => {
      const message = parseSseBlock(block);
      if (!message) return;

      if (message.event === 'stage') {
        console.log(`[stage] ${message.payload?.message || message.payload?.stage || '处理中'}`);
      } else if (message.event === 'delta') {
        streamedChars = Number.isFinite(Number(message.payload?.chars))
          ? Number(message.payload.chars)
          : streamedChars + String(message.payload?.text || '').length;
      } else if (message.event === 'done') {
        if (streamedChars > 0) console.log(`[stream] received ${streamedChars} HTML chars`);
        ssePayload = message.payload;
      } else if (message.event === 'error') {
        fail(new Error(message.payload?.error || 'AI HTML Agent stream failed'));
      }
    };

    const res = {
      statusCode: 200,
      headers: {},
      destroyed: false,
      status(code) {
        this.statusCode = code;
        return this;
      },
      set(headers) {
        this.headers = { ...this.headers, ...headers };
        return this;
      },
      writeHead(code, headers) {
        this.statusCode = code;
        this.headers = { ...this.headers, ...headers };
        return this;
      },
      flushHeaders() {},
      write(chunk) {
        sseBuffer += String(chunk);
        let index = sseBuffer.indexOf('\n\n');
        while (index >= 0) {
          const block = sseBuffer.slice(0, index);
          sseBuffer = sseBuffer.slice(index + 2);
          handleSseBlock(block);
          index = sseBuffer.indexOf('\n\n');
        }
        return true;
      },
      end() {
        if (sseBuffer.trim()) handleSseBlock(sseBuffer);
        finish({ statusCode: this.statusCode, payload: ssePayload });
      },
      on() {},
      json(payload) {
        finish({ statusCode: this.statusCode, payload });
      },
    };

    const next = (error) => {
      if (error) fail(error);
      else finish({ statusCode: res.statusCode, payload: stream ? ssePayload : null });
    };

    const maybePromise = handler(req, res, next);
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch(fail);
    }
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!Number.isFinite(options.projectId) || options.projectId <= 0) {
    throw new Error('Invalid projectId');
  }

  const admin = Users.getFirstAdmin();
  if (!admin) {
    throw new Error('No admin user found. Start the server once to bootstrap an admin account.');
  }

  const project = Projects.getById(options.projectId, admin);
  if (!project) {
    throw new Error(`Project not found or inaccessible: ${options.projectId}`);
  }

  const handler = findGenerateHandler();
  const file = buildFileConfig(options.projectId, options.designPath);
  const req = {
    body: {
      projectId: options.projectId,
      file,
      device: { width: options.width, height: options.height },
      designSystem: project.designSystem || null,
      stream: options.stream,
    },
    query: {},
    params: {},
    authUser: admin,
    sessionID: 'ai-html-agent-test',
    session: { user: admin },
    get(name) {
      return options.stream && String(name).toLowerCase() === 'accept' ? 'text/event-stream' : '';
    },
    on() {},
    app: { get() { return null; } },
  };

  console.log('[AI HTML Agent Test] Generating HTML IR...');
  console.log(`projectId: ${options.projectId}`);
  console.log(`designPath: ${options.designPath}`);
  console.log(`device: ${options.width}x${options.height}`);
  console.log(`stream: ${options.stream ? 'yes' : 'no'}`);

  const result = await invokeHandler(handler, req, { stream: options.stream });
  if (result.statusCode >= 400 || result.payload?.error) {
    const message = result.payload?.error || `HTTP ${result.statusCode}`;
    throw new Error(message);
  }

  console.log('[AI HTML Agent Test] Success');
  console.log(`htmlPath: ${result.payload.htmlPath}`);
  console.log(`sourcePath: ${result.payload.sourcePath}`);
  console.log(`rounds: ${result.payload.rounds}`);
  console.log(`updatedAt: ${result.payload.updatedAt}`);
}

main().catch((error) => {
  console.error('[AI HTML Agent Test] Failed');
  console.error(error?.stack || error?.message || error);
  process.exit(1);
});
