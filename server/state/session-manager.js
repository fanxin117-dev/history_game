/**
 * 会话管理器 — 内存 Map 存储游戏会话
 * 支持创建、获取、更新、删除会话，自动过期清理
 */

class SessionManager {
  constructor(options = {}) {
    this.sessions = new Map();
    this.timeoutMs = options.timeoutMs || 30 * 60 * 1000; // 30 分钟
    this.maxMessages = options.maxMessages || 15;
  }

  /**
   * 创建新会话
   */
  create(sessionId, secretFigure) {
    this.sessions.set(sessionId, {
      sessionId,
      createdAt: new Date(),
      lastActiveAt: new Date(),
      lastQuestionAt: null,
      status: 'playing',
      secretFigure,
      currentRound: 0,
      maxRounds: 20,
      messages: [],
      isConfirmed: false,
      confirmedFigureName: null,
      resultData: null,
    });
  }

  /**
   * 获取会话
   */
  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (this._isExpired(session)) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  /**
   * 更新活跃时间
   */
  touch(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActiveAt = new Date();
    }
  }

  /**
   * 追加消息（自动截断到 maxMessages 条）
   */
  appendMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.messages.push({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp || new Date(),
    });

    // 截断：保留最多 maxMessages 条
    while (session.messages.length > this.maxMessages) {
      session.messages.shift();
    }
  }

  /**
   * 撤回最后一条消息（用于拒绝类问题不消耗轮次的场景）
   */
  undoAppend(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.messages.length === 0) return;
    session.messages.pop();
  }

  /**
   * 增加回合数，返回新的回合数
   */
  advanceRound(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;
    session.currentRound += 1;
    return session.currentRound;
  }

  /**
   * 标记游戏结束
   */
  endGame(sessionId, result) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'ended';
      session.result = result; // 'won' | 'lost' | 'revealed' | 'abandoned'
    }
  }

  /**
   * 删除会话
   */
  destroy(sessionId) {
    this.sessions.delete(sessionId);
  }

  /**
   * 检查会话是否过期
   */
  isExpired(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return true;
    return this._isExpired(session);
  }

  /**
   * 清理所有过期会话
   * @returns {number} 清理的会话数量
   */
  cleanup() {
    let cleaned = 0;
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - session.lastActiveAt.getTime() > this.timeoutMs) {
        this.sessions.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  /**
   * 获取活跃会话数
   */
  get size() {
    return this.sessions.size;
  }

  /**
   * 内部过期检查
   */
  _isExpired(session) {
    return Date.now() - session.lastActiveAt.getTime() > this.timeoutMs;
  }
}

module.exports = { SessionManager };
