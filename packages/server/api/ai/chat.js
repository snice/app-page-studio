const OpenAI = require('openai');
const { firstTextValue } = require('./content');
const { requestError } = require('./errors');
const { emitStage } = require('./progress');

const MAX_HISTORY_ITEMS = 12;

function compactHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .slice(-MAX_HISTORY_ITEMS)
    .map((item) => ({
      role: item?.role === 'assistant' ? 'assistant' : 'user',
      content: String(item?.content || '').slice(0, 4000)
    }))
    .filter((item) => item.content.trim());
}

function extractChatText(data) {
  const choice = data?.choices?.[0] || {};
  return firstTextValue([
    choice.message?.content,
    choice.text,
    data?.output_text,
    data?.text,
    data?.content,
    data?.message?.content
  ]);
}

function extractChatDeltaText(chunk) {
  const choice = chunk?.choices?.[0] || {};
  return firstTextValue([
    choice.delta?.content,
    choice.delta?.text,
    choice.message?.content,
    chunk?.output_text,
    chunk?.text,
    chunk?.content
  ], { preserveWhitespace: true });
}

function buildChatCompletionPayload(config, { systemPrompt, prompt, imageDataUrl }, stream = false) {
  const payload = {
    model: config.model,
    max_tokens: config.maxTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } }
        ]
      }
    ]
  };
  if (stream) payload.stream = true;
  return payload;
}

function sdkRequestError(sdkError) {
  const status = sdkError?.status || sdkError?.response?.status || 500;
  const detail = sdkError?.error
    ? JSON.stringify({ error: sdkError.error })
    : (sdkError?.message || String(sdkError));
  const error = requestError(status >= 500 ? 502 : status, `AI 调用失败: ${detail}`);
  error.responseStatus = status;
  error.responseText = detail;
  return error;
}

async function postChatCompletion(config, { systemPrompt, prompt, imageDataUrl }) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });

  try {
    return await client.chat.completions.create(
      buildChatCompletionPayload(config, { systemPrompt, prompt, imageDataUrl }, false)
    );
  } catch (sdkError) {
    throw sdkRequestError(sdkError);
  }
}

async function postChatCompletionStream(config, { systemPrompt, prompt, imageDataUrl }, { onStage, onDelta } = {}) {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL
  });

  let content = '';
  let finishReason = '';
  let sawFirstContent = false;

  try {
    const stream = await client.chat.completions.create(
      buildChatCompletionPayload(config, { systemPrompt, prompt, imageDataUrl }, true)
    );

    for await (const chunk of stream) {
      const choice = chunk?.choices?.[0] || {};
      if (choice.finish_reason) finishReason = choice.finish_reason;

      const delta = extractChatDeltaText(chunk);
      if (!delta) continue;

      if (!sawFirstContent) {
        sawFirstContent = true;
        emitStage(onStage, 'ai-stream', 'AI 正在返回 HTML');
      }
      content += delta;
      if (typeof onDelta === 'function') onDelta(delta, content.length);
    }
  } catch (sdkError) {
    throw sdkRequestError(sdkError);
  }

  return { content, finishReason };
}

module.exports = {
  compactHistory,
  extractChatDeltaText,
  extractChatText,
  postChatCompletion,
  postChatCompletionStream
};
