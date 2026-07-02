const { aiClient, API_CONFIG } = require('../config/claude');
const SELECT_FIGURE_PROMPT = require('../prompts/select-figure');
const JUDGE_QUESTION_PROMPT = require('../prompts/judge-question');
const REVEAL_SYSTEM_PROMPT = require('../prompts/reveal');
const { aiRequestLog, aiResponseLog } = require('../utils/logger');

/**
 * 从 AI 返回的文本中提取 JSON
 * 处理 AI 可能返回 Markdown 代码块包裹的 JSON 的情况
 * 如果 AI 没有返回 JSON（比如直接返回了"是"/"不是"），尝试提取并包装成标准格式
 */
function parseJSON(text, sessionId = null) {
  if (!text) throw new Error('AI 返回了空内容');
  const trimmed = text.trim();

  // 先尝试直接解析
  try {
    return JSON.parse(trimmed);
  } catch (e) {
    // 忽略 — 继续尝试其他提取方式
  }

  // 去除 Markdown 代码块包裹
  const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1].trim());
    } catch (e) {
      // 继续尝试 fallback
    }
  }

  // Fallback: 如果 AI 直接返回了简短的中文回答，尝试从中提取答案
  // 注意：必须从长到短匹配！"不是" 必须在 "是" 之前，否则 "不是" 会被误匹配为 "是"
  const shortAnswers = ['不是', '不确定', '是的', '不是的', '是'];
  for (const ans of shortAnswers) {
    if (trimmed === ans || trimmed.startsWith(ans + '。') || trimmed.startsWith(ans + '.') ||
        trimmed.startsWith(ans + '，')) {
      if (sessionId) {
        aiResponseLog(sessionId, text, false);
      }
      const cleanAnswer = ans === '是的' ? '是' : ans === '不是的' ? '不是' : ans;
      const reasonPart = trimmed.replace(ans, '').replace(/^。+|。+$/g, '').trim();
      return {
        answer: cleanAnswer,
        reason: reasonPart ? reasonPart : `${cleanAnswer}（AI 未提供理由）`,
        isGuess: false,
        figureGuessed: '',
        correctGuess: false,
        gameStatus: 'playing',
      };
    }
  }

  // 终极 fallback: 如果 AI 返回了长文本，尝试从中提取关键词
  // 这表明 AI 可能在"说话"而不是返回 JSON
  if (trimmed.length > 20) {
    // 检查是否包含"拒绝"相关关键词
    if (trimmed.includes('无法') || trimmed.includes('不能') || trimmed.includes('不是') ||
        trimmed.includes('不合适') || trimmed.includes('问题') || trimmed.includes('请')) {
      return {
        answer: '拒绝',
        reason: '这个问题不适合用是/否回答',
        isGuess: false,
        figureGuessed: '',
        correctGuess: false,
        gameStatus: 'playing',
      };
    }
  }

  // 全部失败，抛出原始错误
  throw new Error(`AI 返回了非 JSON 内容: ${trimmed.substring(0, 100)}`);
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
   * 注意：只传当前问题 + 人物信息，不传历史对话。
   * 历史对话会干扰 AI 判断，且浪费 token。
   * AI 只需要基于规则和人物信息对当前问题进行独立判断。
   */
  async judgeQuestion(secretFigure, messageHistory, sessionId = null) {
    return withTimeoutAndRetry(async ({ signal }) => {
      const systemPrompt = JUDGE_QUESTION_PROMPT.replace(
        '{secret_figure_json}',
        JSON.stringify(secretFigure, null, 2)
      );

      // 从 messageHistory 中取最后一条用户消息（即当前问题）
      // messageHistory 格式: [..., {role: 'user', content: '当前问题'}, {role: 'assistant', content: '上一轮回复'}]
      let currentQuestion = '';
      for (let i = messageHistory.length - 1; i >= 0; i--) {
        if (messageHistory[i].role === 'user') {
          currentQuestion = messageHistory[i].content;
          break;
        }
      }

      // 如果找不到用户消息（极端情况），使用占位
      if (!currentQuestion) {
        currentQuestion = '请问：他是男性吗？';
      }

      const finalMessages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: currentQuestion },
      ];

      // 记录发送给 AI 的完整请求（脱敏，只保留 content 前 200 字符）
      if (sessionId) {
        aiRequestLog(sessionId, systemPrompt, finalMessages);
      }

      const response = await aiClient.chat.completions.create({
        model: API_CONFIG.MODEL,
        temperature: API_CONFIG.JUDGE_TEMPERATURE,
        max_tokens: API_CONFIG.JUDGE_MAX_TOKENS,
        messages: finalMessages,
      }, { signal });

      const text = response.choices[0]?.message?.content;
      if (!text) throw new Error('AI 返回了空内容');

      // 记录 AI 原始响应
      if (sessionId) {
        try {
          parseJSON(text, sessionId);
          aiResponseLog(sessionId, text, true);
        } catch (e) {
          aiResponseLog(sessionId, text, false);
          throw e;
        }
      }

      const judgment = parseJSON(text, sessionId);

      //  Sanity check: 如果 reason 和 answer 矛盾，以 reason 为准
      // 因为 AI（尤其是免费模型）经常在长推理中写出正确答案，但在 answer 字段填反
      if (judgment.answer && judgment.reason) {
        const reason = judgment.reason.toLowerCase();
        const answer = judgment.answer;

        // 检测 reason 中的关键否定词
        const saysNo = reason.includes('不是') || reason.includes('应为"不是"') || reason.includes('应为\'不是\'') || reason.includes('答案应为"不是"') || reason.includes('答案应为\'不是\'') || reason.includes('答案应该是"不是"') || reason.includes('答案应该是\'不是\'');
        const saysYes = reason.includes('答案是"是"') || reason.includes('答案是\'是\'') || reason.includes('答案应为"是"') || reason.includes('答案应为\'是\'') || reason.includes('答案应该是"是"') || reason.includes('答案应该是\'是\'');

        if (saysNo && answer === '是') {
          console.log(`[SANITY_CHECK] reason说"不是"但answer是"是"，修正为"不是": ${judgment.reason.substring(0, 80)}...`);
          judgment.answer = '不是';
        } else if (saysYes && answer === '不是') {
          console.log(`[SANITY_CHECK] reason说"是"但answer是"不是"，修正为"是": ${judgment.reason.substring(0, 80)}...`);
          judgment.answer = '是';
        }
      }

      return judgment;
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
