const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', '..', 'logs', 'game.log');

// 确保日志目录存在
const logDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

/**
 * 格式化时间戳
 */
function ts() {
  return new Date().toISOString().replace('T', ' ').substring(0, 23);
}

/**
 * 写入日志（追加模式，同步以避免异步写入丢失）
 */
function writeLog(level, label, data) {
  const line = `[${ts()}] [${level}] [${label}] ${JSON.stringify(data)}`;
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch (e) {
    // 日志写入失败不应影响主流程
    console.error('[Logger] Failed to write log:', e.message);
  }
}

/**
 * 记录游戏对话 — 用户提问、AI 判断、页面显示内容
 * @param {string} sessionId - 会话 ID
 * @param {'USER' | 'AI_JUDGMENT' | 'AI_DISPLAY' | 'FIGURE_PICKED' | 'REVEAL'} type - 日志类型
 * @param {Object} data - 数据
 */
function gameLog(sessionId, type, data) {
  writeLog('INFO', `GAME[${sessionId}]${type}`, data);
}

/**
 * 记录 AI 服务调用 — 用于调试 AI 判断质量
 * @param {string} sessionId - 会话 ID
 * @param {string} question - 用户问题
 * @param {Object} secretFigure - 秘密人物（脱敏，只保留 name）
 * @param {Object} judgment - AI 判断结果
 * @param {string} displayText - 实际显示给用户的文本
 */
function aiCallLog(sessionId, question, secretFigure, judgment, displayText) {
  writeLog('DEBUG', `GAME[${sessionId}]AI_CALL`, {
    question,
    figureName: secretFigure?.name || 'unknown',
    judgment: {
      answer: judgment?.answer,
      isGuess: judgment?.isGuess,
      correctGuess: judgment?.correctGuess,
      gameStatus: judgment?.gameStatus,
    },
    // reason 和 displayText 分开记录，方便对比
    reason: judgment?.reason,
    displayText,
  });
}

/**
 * 记录 AI 服务错误
 */
function aiErrorLog(sessionId, error, question) {
  writeLog('ERROR', `GAME[${sessionId}]AI_ERROR`, {
    question,
    error: error.message?.split('\n')[0],
    status: error.status,
  });
}

module.exports = { gameLog, aiCallLog, aiErrorLog };
