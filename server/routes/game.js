const express = require('express');
const { AIService } = require('../services/claude-service');
const { generateSessionId } = require('../utils/helpers');
const { gameLog, aiCallLog, aiErrorLog } = require('../utils/logger');

const COOLDOWN_MS = 2000;

function gameRoutes(sessionManager) {
  const router = express.Router();
  const aiService = new AIService();

  /**
   * POST /api/game/start
   * 开始新游戏，AI 选择秘密人物
   */
  router.post('/start', async (req, res) => {
    try {
      const secretFigure = await aiService.pickFigure();
      const sessionId = generateSessionId();
      sessionManager.create(sessionId, secretFigure);

      gameLog(sessionId, 'FIGURE_PICKED', {
        figureName: secretFigure.name,
        dynasty: secretFigure.dynasty,
        difficulty: secretFigure.difficulty,
      });

      res.json({
        success: true,
        data: {
          sessionId,
          maxRounds: 20,
          message: '游戏已开始！你可以开始提问了。',
        },
      });
    } catch (error) {
      console.error('[START ERROR]', error.message?.split('\n')[0]);
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 服务暂时不可用，请稍后重试',
        },
      });
    }
  });

  /**
   * POST /api/game/question
   * 提交问题或猜测，获取 AI 回答
   */
  router.post('/question', async (req, res) => {
    try {
      const { sessionId, question } = req.body;

      // 参数校验
      if (!sessionId || !question || typeof question !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: '参数不完整' },
        });
      }

      const trimmed = question.trim();
      if (trimmed.length === 0 || trimmed.length > 200) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: '问题不能为空，且不超过200字' },
        });
      }

      const session = sessionManager.get(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' },
        });
      }

      if (session.status === 'ended') {
        return res.status(410).json({
          success: false,
          error: { code: 'GAME_OVER', message: '本局游戏已结束' },
        });
      }

      // 冷却检查
      const lastQuestionTime = session.lastQuestionAt?.getTime() || 0;
      if (Date.now() - lastQuestionTime < COOLDOWN_MS) {
        return res.status(400).json({
          success: false,
          error: { code: 'COOLDOWN_ACTIVE', message: '请稍候再提问' },
        });
      }

      // 记录用户输入
      gameLog(sessionId, 'USER', { question: trimmed });

      // 先追加用户消息到历史，再调用 AI 判断
      sessionManager.appendMessage(sessionId, {
        role: 'user',
        content: trimmed,
        timestamp: new Date(),
      });

      // 调用 AI 判断（传入包含最新问题的完整历史）
      const judgment = await aiService.judgeQuestion(session.secretFigure, session.messages, sessionId);

      // 更新回合
      sessionManager.advanceRound(sessionId);
      session.lastQuestionAt = new Date();
      sessionManager.touch(sessionId);

      // 处理判决结果
      let gameStatus = 'playing';
      if (judgment.correctGuess) {
        gameStatus = 'won';
        sessionManager.endGame(sessionId, 'won');
      } else if (judgment.gameStatus === 'lost') {
        gameStatus = 'lost';
        sessionManager.endGame(sessionId, 'lost');
      }

      // 构造 AI 回复 — 只显示简短回答，不暴露推理过程
      const aiReply = judgment.answer === '是' ? '是。'
        : judgment.answer === '不是' ? '不是。'
        : '不确定。';

      // 记录到消息历史（内部存储完整回复用于回放）
      sessionManager.appendMessage(sessionId, {
        role: 'assistant',
        content: aiReply,
        timestamp: new Date(),
      });

      // 记录 AI 调用详情（用于调试日志）
      aiCallLog(sessionId, trimmed, session.secretFigure, judgment, aiReply);

      res.json({
        success: true,
        data: {
          answer: judgment.answer,
          // 不再返回 reason 给客户端，避免泄露 AI 推理过程
          round: session.currentRound,
          remainingRounds: 20 - session.currentRound,
          status: gameStatus,
          figureGuessed: judgment.isGuess || false,
        },
      });

    } catch (error) {
      console.error('[QUESTION ERROR]', error.message?.split('\n')[0]);
      aiErrorLog(req.body.sessionId, error, req.body.question);
      res.status(500).json({
        success: false,
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 服务暂时不可用，请稍后重试',
        },
      });
    }
  });

  /**
   * POST /api/game/reveal
   * 揭晓答案，展示人物画像、生平、成就
   */
  router.post('/reveal', async (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: '缺少 sessionId' },
        });
      }

      const session = sessionManager.get(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' },
        });
      }

      if (session.status === 'ended' && session.resultData) {
        return res.json({
          success: true,
          data: session.resultData,
        });
      }

      // 确定结果类型
      const resultType = session.currentRound >= 20 ? 'lost' : 'revealed';

      // 调用 AI 生成详细简介
      const figureInfo = await aiService.revealAnswer(session.secretFigure, resultType);

      sessionManager.endGame(sessionId, resultType);

      const responseData = {
        success: true,
        data: {
          figure: {
            name: figureInfo.name,
            dynasty: figureInfo.dynasty,
            lived: figureInfo.lived,
            portraitUrl: figureInfo.portraitUrl || null,
            summary: figureInfo.summary || '',
            biography: figureInfo.biography || '',
            achievements: figureInfo.achievements || [],
            funFact: figureInfo.funFact || '',
          },
          roundsPlayed: session.currentRound,
          result: resultType,
          resultMessage: figureInfo.resultMessage || '游戏结束。',
        },
      };

      // 缓存结果以便重复请求
      session.resultData = responseData.data;

      gameLog(sessionId, 'REVEAL', {
        figureName: figureInfo.name,
        result: resultType,
        roundsPlayed: session.currentRound,
      });

      res.json(responseData);

    } catch (error) {
      console.error('[REVEAL ERROR]', error.message?.split('\n')[0]);
      res.status(500).json({
        success: false,
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 服务暂时不可用',
        },
      });
    }
  });

  /**
   * POST /api/game/end
   * 主动结束游戏，释放资源
   */
  router.post('/end', async (req, res) => {
    try {
      const { sessionId } = req.body;
      const session = sessionManager.get(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' },
        });
      }

      sessionManager.endGame(sessionId, 'abandoned');
      sessionManager.destroy(sessionId);

      res.json({
        success: true,
        data: { message: '游戏已结束，感谢您的参与！' },
      });
    } catch (error) {
      console.error('[END ERROR]', error.message?.split('\n')[0]);
      res.status(500).json({
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: '结束游戏时发生错误',
        },
      });
    }
  });

  return router;
}

module.exports = gameRoutes;
