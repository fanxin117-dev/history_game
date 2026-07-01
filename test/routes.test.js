const express = require('express');
const request = require('supertest');
const gameRoutes = require('../server/routes/game');
const { SessionManager } = require('../server/state/session-manager');

let testApp;
let sessionManager;

beforeEach(() => {
  testApp = express();
  testApp.use(express.json());
  sessionManager = new SessionManager();
  testApp.use('/api/game', gameRoutes(sessionManager));
});

describe('Session Management', () => {
  test('should create and retrieve a session', () => {
    sessionManager.create('test-123', { name: 'Test', dynasty: 'Test' });
    const session = sessionManager.get('test-123');
    expect(session).not.toBeNull();
    expect(session.secretFigure.name).toBe('Test');
  });

  test('should return null for non-existent session', () => {
    const session = sessionManager.get('non-existent');
    expect(session).toBeNull();
  });

  test('should append messages and truncate at max', () => {
    sessionManager.create('test-123', { name: 'Test', dynasty: 'Test' });
    for (let i = 0; i < 20; i++) {
      sessionManager.appendMessage('test-123', {
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      });
    }
    const session = sessionManager.get('test-123');
    expect(session.messages.length).toBeLessThanOrEqual(15);
  });
});

describe('POST /api/game/question', () => {
  test('should return 400 for empty question', async () => {
    const res = await request(testApp)
      .post('/api/game/question')
      .send({ sessionId: 'test', question: '' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  test('should return 400 for question exceeding 200 chars', async () => {
    const res = await request(testApp)
      .post('/api/game/question')
      .send({ sessionId: 'test', question: 'a'.repeat(201) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  test('should return 404 for invalid sessionId', async () => {
    const res = await request(testApp)
      .post('/api/game/question')
      .send({ sessionId: 'invalid', question: '测试' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });

  test('should return 400 for missing sessionId', async () => {
    const res = await request(testApp)
      .post('/api/game/question')
      .send({ question: '测试' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  test('should return 410 for ended game', async () => {
    sessionManager.create('test-ended', { name: 'Test', dynasty: 'Test' });
    sessionManager.endGame('test-ended', 'won');

    const res = await request(testApp)
      .post('/api/game/question')
      .send({ sessionId: 'test-ended', question: '测试' });

    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe('GAME_OVER');
  });
});

describe('POST /api/game/reveal', () => {
  test('should return 400 for missing sessionId', async () => {
    const res = await request(testApp)
      .post('/api/game/reveal')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_INPUT');
  });

  test('should return 404 for invalid sessionId', async () => {
    const res = await request(testApp)
      .post('/api/game/reveal')
      .send({ sessionId: 'invalid' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

describe('POST /api/game/end', () => {
  test('should return 404 for invalid sessionId', async () => {
    const res = await request(testApp)
      .post('/api/game/end')
      .send({ sessionId: 'invalid' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });

  test('should succeed for valid session', async () => {
    sessionManager.create('test-end', { name: 'Test', dynasty: 'Test' });

    const res = await request(testApp)
      .post('/api/game/end')
      .send({ sessionId: 'test-end' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.message).toContain('感谢');
  });
});
