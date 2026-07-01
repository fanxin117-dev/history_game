const { aiClient, API_CONFIG } = require('../config/claude');
const SELECT_FIGURE_PROMPT = require('../prompts/select-figure');
const JUDGE_QUESTION_PROMPT = require('../prompts/judge-question');
const REVEAL_SYSTEM_PROMPT = require('../prompts/reveal');

/**
 * 从 AI 返回的文本中提取 JSON
 * 处理 AI 可能返回 Markdown 代码块包裹的 JSON 的情况
 */
function parseJSON(text) {
  if (!text) throw new Error('AI 返回了空内容');
  const trimmed = text.trim();
  // 去除 Markdown 代码块包裹
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = jsonMatch ? jsonMatch[1].trim() : trimmed;
  return JSON.parse(jsonText);
}

/**
 * 带超时和重试的 AI 请求包装器
 */
async function withTimeoutAndRetry(fn, maxRetries = 1, timeoutMs = API_CONFIG.TIMEOUT_MS) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // 创建 AbortController 实现超时
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const result = await fn({ signal: controller.signal });
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      lastError = error;
      // 超时或客户端中止，不重试
      if (error.name === 'AbortError' || error.code === 'REQUEST_ABORTED') {
        break;
      }
      // 4xx 错误（如认证失败），不重试
      if (error.status && error.status >= 400 && error.status < 500) {
        break;
      }
      // 短暂等待后重试
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

class AIService {
  /**
   * 选择秘密人物
   */
  async pickFigure() {
    return withTimeoutAndRetry(async ({ signal }) => {
      const response = await aiClient.chat.completions.create({
        model: API_CONFIG.MODEL,
        temperature: API_CONFIG.PICK_TEMPERATURE,
        max_tokens: API_CONFIG.PICK_MAX_TOKENS,
        messages: [
          { role: 'system', content: SELECT_FIGURE_PROMPT },
          { role: 'user', content: '请为一个猜谜游戏选择一位历史人物。' },
        ],
      }, { signal });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error('AI 返回了空内容');
      return parseJSON(text);
    });
  }

  /**
   * 判断问题
   */
  async judgeQuestion(secretFigure, messageHistory) {
    return withTimeoutAndRetry(async ({ signal }) => {
      const systemPrompt = JUDGE_QUESTION_PROMPT.replace(
        '{secret_figure_json}',
        JSON.stringify(secretFigure, null, 2)
      );

      const messages = messageHistory.slice(-API_CONFIG.MAX_MESSAGES).map(msg => ({
        role: msg.role,
        content: msg.content,
      }));

      // 如果消息历史为空（第一轮），添加一个占位用户消息
      // 因为 Agnes API 要求 messages 中至少有一个 user 角色
      const finalMessages = messages.length > 0
        ? [{ role: 'system', content: systemPrompt }, ...messages]
        : [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: '请问：他是男性吗？' },
          ];

      const response = await aiClient.chat.completions.create({
        model: API_CONFIG.MODEL,
        temperature: API_CONFIG.JUDGE_TEMPERATURE,
        max_tokens: API_CONFIG.JUDGE_MAX_TOKENS,
        messages: finalMessages,
      }, { signal });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error('AI 返回了空内容');
      return parseJSON(text);
    });
  }

  /**
   * 揭示答案并生成详细简介
   */
  async revealAnswer(secretFigure, resultType = 'lost') {
    return withTimeoutAndRetry(async ({ signal }) => {
      const systemPrompt = REVEAL_SYSTEM_PROMPT.replace(
        '{secret_figure_json}',
        JSON.stringify(secretFigure, null, 2)
      );

      let resultHint = '';
      if (resultType === 'won') {
        resultHint = '（猜赢了的情况，玩家在第X轮猜中）';
      } else if (resultType === 'lost') {
        resultHint = '（20轮用完的情况）';
      } else {
        resultHint = '（玩家主动揭晓的情况）';
      }

      const response = await aiClient.chat.completions.create({
        model: API_CONFIG.MODEL,
        temperature: API_CONFIG.SUMMARIZE_TEMPERATURE,
        max_tokens: API_CONFIG.SUMMARIZE_MAX_TOKENS,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `请为以下历史人物写一份详细的学习资料${resultHint}：${JSON.stringify(secretFigure)}`,
          },
        ],
      }, { signal });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error('AI 返回了空内容');
      return parseJSON(text);
    });
  }
}

module.exports = { AIService };
