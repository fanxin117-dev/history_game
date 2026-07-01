require('dotenv').config();

const AGNES_BASE_URL = process.env.AGNES_BASE_URL || 'https://apihub.agnes-ai.com/v1';
const AGNES_MODEL = 'agnes-2.0-flash';

// 商用环境（切换注释）：Anthropic Claude
// const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
// const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

const API_CONFIG = {
  // --- 开发模式 (Agnes) ---
  BASE_URL: AGNES_BASE_URL,
  MODEL: AGNES_MODEL,
  API_KEY: process.env.AGNES_API_KEY || '',

  // --- 商用模式 (Claude) ---
  // BASE_URL: undefined,
  // MODEL: CLAUDE_MODEL,
  // API_KEY: CLAUDE_API_KEY,

  JUDGE_TEMPERATURE: 0.1,
  JUDGE_MAX_TOKENS: 1024,
  PICK_TEMPERATURE: 0.7,
  PICK_MAX_TOKENS: 512,
  SUMMARIZE_TEMPERATURE: 0.5,
  SUMMARIZE_MAX_TOKENS: 2048,
  MAX_MESSAGES: 15,
  TIMEOUT_MS: 60000,
};

const OpenAI = require('openai');

const aiClient = new OpenAI({
  baseURL: API_CONFIG.BASE_URL,
  apiKey: API_CONFIG.API_KEY,
});

module.exports = { aiClient, API_CONFIG };
