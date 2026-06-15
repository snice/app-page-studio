const path = require('path');
const fs = require('fs');
const { UI_IR_AGENT_SPEC_PATH } = require('../../paths');
const { requestError } = require('./errors');

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_IMAGE_MODEL = 'gpt-image-1';
const SERVER_ENV_PATH = path.resolve(__dirname, '..', '..', '.env');

let cachedServerEnv = null;

function unquoteEnvValue(value) {
  const trimmed = String(value || '').trim();
  if (trimmed.length >= 2) {
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed[trimmed.length - 1] === quote) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function loadServerEnv() {
  if (cachedServerEnv) return cachedServerEnv;
  const env = {};
  if (!fs.existsSync(SERVER_ENV_PATH)) {
    cachedServerEnv = env;
    return env;
  }

  const content = fs.readFileSync(SERVER_ENV_PATH, 'utf-8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const index = normalized.indexOf('=');
    if (index <= 0) continue;
    const key = normalized.slice(0, index).trim();
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) continue;
    env[key] = unquoteEnvValue(normalized.slice(index + 1));
  }
  cachedServerEnv = env;
  return env;
}

function getEnvValue(key) {
  const value = process.env[key];
  if (value != null && value !== '') return value;
  return loadServerEnv()[key] || '';
}

function getAgentConfig() {
  const baseURL = getEnvValue('AI_AGENT_BASE_URL') || getEnvValue('OPENAI_BASE_URL') || DEFAULT_BASE_URL;
  const apiKey = getEnvValue('AI_AGENT_API_KEY') || getEnvValue('OPENAI_API_KEY') || '';
  const model = getEnvValue('AI_AGENT_MODEL') || getEnvValue('OPENAI_MODEL') || DEFAULT_MODEL;
  const maxTokens = Number.parseInt(getEnvValue('AI_AGENT_MAX_TOKENS') || '12000', 10);
  return {
    baseURL: baseURL.replace(/\/+$/, ''),
    apiKey,
    model,
    maxTokens: Number.isFinite(maxTokens) && maxTokens > 0 ? maxTokens : 12000
  };
}

function getImageAgentConfig() {
  const config = getAgentConfig();
  const model = getEnvValue('AI_AGENT_IMAGE_MODEL') || getEnvValue('OPENAI_IMAGE_MODEL') || DEFAULT_IMAGE_MODEL;
  return {
    ...config,
    model
  };
}

function loadUiIrSpec() {
  if (!fs.existsSync(UI_IR_AGENT_SPEC_PATH)) {
    throw requestError(500, '缺少 UI-IR-AGENT.md');
  }
  return fs.readFileSync(UI_IR_AGENT_SPEC_PATH, 'utf-8');
}

module.exports = {
  getAgentConfig,
  getImageAgentConfig,
  loadUiIrSpec
};
