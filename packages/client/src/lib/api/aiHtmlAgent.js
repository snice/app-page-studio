import { readJson, getProjectId, getSessionHeaders } from './_http';

function buildPayload(payload) {
  const projectId = payload?.projectId || getProjectId();
  if (!projectId) return { error: '请先选择项目' };
  return { ...payload, projectId };
}

async function postJson(url, payload) {
  const body = buildPayload(payload);
  if (body.error) return body;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getSessionHeaders() },
    body: JSON.stringify(body),
  });
  return readJson(res);
}

function parseSseBlock(block) {
  let event = 'message';
  const dataLines = [];

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim() || 'message';
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return null;

  const rawData = dataLines.join('\n');
  let payload;
  try {
    payload = JSON.parse(rawData);
  } catch {
    payload = { text: rawData };
  }

  return { event, payload };
}

function dispatchStreamEvent(message, handlers, state) {
  if (!message) return;
  const { event, payload } = message;
  handlers.onEvent?.(event, payload);

  if (event === 'stage') {
    handlers.onStage?.(payload);
  } else if (event === 'delta') {
    handlers.onDelta?.(payload);
  } else if (event === 'done') {
    state.result = payload;
    handlers.onDone?.(payload);
  } else if (event === 'error') {
    const error = new Error(payload?.error || 'AI HTML Agent 执行失败');
    error.status = payload?.status;
    throw error;
  }
}

async function postStream(url, payload, handlers = {}) {
  const body = buildPayload({ ...payload, stream: true });
  if (body.error) return body;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      ...getSessionHeaders()
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const data = await readJson(res);
    throw new Error(data?.error || `请求失败: HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const state = { result: null };
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n\n');
      while (index >= 0) {
        const block = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        dispatchStreamEvent(parseSseBlock(block), handlers, state);
        index = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    if (buffer.trim()) {
      dispatchStreamEvent(parseSseBlock(buffer), handlers, state);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  }

  if (!state.result) {
    throw new Error('AI 流式响应未返回结果');
  }
  return state.result;
}

export const aiHtmlAgentApi = {
  async generateHtmlIr(payload) {
    return postJson('/api/ai-html-agent/generate', payload);
  },

  async refineHtmlIr(payload) {
    return postJson('/api/ai-html-agent/refine', payload);
  },

  async generateHtmlIrStream(payload, handlers) {
    return postStream('/api/ai-html-agent/generate', payload, handlers);
  },

  async refineHtmlIrStream(payload, handlers) {
    return postStream('/api/ai-html-agent/refine', payload, handlers);
  },

  async generateDesignAssets(payload) {
    return postJson('/api/ai-html-agent/generate-assets', payload);
  },

  async generateDesignAssetsStream(payload, handlers) {
    return postStream('/api/ai-html-agent/generate-assets', payload, handlers);
  },
};
