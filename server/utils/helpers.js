const crypto = require('crypto');

/**
 * 生成会话 ID，格式: gs_<12位随机字符>
 */
function generateSessionId() {
  return 'gs_' + crypto.randomBytes(8).toString('hex');
}

/**
 * 判断用户输入是否为猜测（而非问题）
 */
function isGuessInput(input) {
  const guessPatterns = [
    /^我猜是/i, /^应该是/i, /^是\s*[^?！。]+[?!]?$/,
    /^猜测/i, /^答案是/i, /^我觉得是/i, /^TA是/i
  ];
  return guessPatterns.some(pattern => pattern.test(input.trim()));
}

module.exports = { generateSessionId, isGuessInput };
