// ================================
// 游戏状态
// ================================
const gameState = {
  sessionId: null,
  currentRound: 0,
  maxRounds: 20,
  isSubmitting: false,
  gameStatus: 'idle', // 'idle' | 'playing' | 'ended'
};

// ================================
// DOM 元素
// ================================
const screens = {
  welcome: document.getElementById('welcome-screen'),
  game: document.getElementById('game-screen'),
  result: document.getElementById('result-screen'),
};

const roundDots = document.getElementById('round-dots');
const currentRoundEl = document.getElementById('current-round');
const chatArea = document.getElementById('chat-area');
const questionForm = document.getElementById('question-form');
const questionInput = document.getElementById('question-input');
const charCount = document.getElementById('char-count');
const btnSubmit = document.getElementById('btn-submit');
const btnReveal = document.getElementById('btn-reveal');

// ================================
// 屏幕切换
// ================================
function showScreen(screenName) {
  Object.values(screens).forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  screens[screenName].classList.remove('hidden');
  screens[screenName].classList.add('active');
}

// ================================
// 初始化轮次指示器
// ================================
function initRoundIndicator() {
  roundDots.innerHTML = '';
  for (let i = 0; i < 20; i++) {
    const dot = document.createElement('div');
    dot.className = 'round-dot';
    roundDots.appendChild(dot);
  }
  updateRoundIndicator();
}

function updateRoundIndicator() {
  const dots = roundDots.querySelectorAll('.round-dot');
  dots.forEach((dot, i) => {
    dot.classList.remove('used', 'current');
    if (i < gameState.currentRound) {
      dot.classList.add('used');
    } else if (i === gameState.currentRound) {
      dot.classList.add('current');
    }
  });
  currentRoundEl.textContent = gameState.currentRound;
}

// ================================
// 消息渲染
// ================================
function appendMessage(role, content, answer) {
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${role}`;

  if (role === 'assistant' && answer) {
    const tagClass = answer === '是' ? 'yes' : answer === '不是' ? 'no' : 'maybe';
    const tag = document.createElement('div');
    tag.className = `answer-tag ${tagClass}`;
    tag.textContent = answer;
    bubble.appendChild(tag);
  }

  const text = document.createElement('div');
  text.textContent = content;
  bubble.appendChild(text);

  chatArea.appendChild(bubble);
  chatArea.scrollTop = chatArea.scrollHeight;
}

// ================================
// 加载状态
// ================================
function showLoading(show) {
  gameState.isSubmitting = show;
  questionInput.disabled = show;
  btnSubmit.disabled = show;

  if (show) {
    const loader = document.createElement('div');
    loader.id = 'loading-indicator';
    loader.className = 'loading-indicator';
    loader.innerHTML = '<div class="loading-spinner"></div><span>AI 思考中...</span>';
    chatArea.appendChild(loader);
    chatArea.scrollTop = chatArea.scrollHeight;
  } else {
    const loader = document.getElementById('loading-indicator');
    if (loader) loader.remove();
  }
}

// ================================
// 开始游戏
// ================================
async function startGame() {
  const btn = document.getElementById('btn-start');
  btn.disabled = true;
  btn.innerHTML = '<div class="loading-spinner" style="width:16px;height:16px;border-width:2px;"></div> AI 正在选人...';

  try {
    const res = await fetch('/api/game/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || '启动失败');

    gameState.sessionId = data.data.sessionId;
    gameState.currentRound = 0;
    gameState.gameStatus = 'playing';

    // 切换界面
    showScreen('game');
    initRoundIndicator();
    chatArea.innerHTML = '';

    // 显示欢迎消息
    appendMessage('assistant', data.data.message, null);

    // 聚焦输入
    questionInput.focus();
  } catch (error) {
    console.error('Start game error:', error);
    alert('游戏启动失败，请重试');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">📜</span> 开始游戏';
  }
}

// ================================
// 提交问题
// ================================
async function submitQuestion(text) {
  if (!text || gameState.isSubmitting || gameState.gameStatus !== 'playing') return;

  gameState.isSubmitting = true;
  showLoading(true);

  // 先显示用户消息
  appendMessage('user', text, null);
  questionInput.value = '';
  charCount.textContent = '0/200';

  try {
    const res = await fetch('/api/game/question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: gameState.sessionId,
        question: text,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      // 错误处理
      await handleApiError(data?.error, '请求失败，请重试');
      return;
    }

    const { answer, round, status } = data.data;
    gameState.currentRound = round;
    updateRoundIndicator();

    // 显示 AI 回复 — 只显示简短回答（"是。" / "不是。" / "不确定。"）
    // reason 已从服务端移除，不再泄露 AI 推理过程
    appendMessage('assistant', answer === '是' ? '是。'
      : answer === '不是' ? '不是。'
      : '不确定。', answer);

    // 检查游戏状态
    if (status === 'won') {
      gameState.gameStatus = 'ended';
      btnReveal.classList.add('hidden');
      btnSubmit.disabled = true;
      questionInput.disabled = true;
      setTimeout(() => showResultFromQuestion(true), 1000);
    } else if (status === 'lost' || remainingRounds <= 0) {
      gameState.gameStatus = 'ended';
      btnReveal.classList.add('hidden');
      btnSubmit.disabled = true;
      questionInput.disabled = true;
      setTimeout(() => showResultFromQuestion(false), 1500);
    }

  } catch (error) {
    console.error('Question error:', error);
    alert('提问失败，请检查网络连接');
  } finally {
    showLoading(false);
    gameState.isSubmitting = false;
  }
}

// ================================
// 从提问结果跳转结果页
// ================================
async function showResultFromQuestion(won) {
  try {
    const res = await fetch('/api/game/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: gameState.sessionId }),
    });

    const data = await res.json();
    if (data.success) {
      showResult(data.data);
    }
  } catch (error) {
    console.error('Reveal error:', error);
  }
}

// ================================
// 显示结果
// ================================
function showResult(resultData) {
  const { figure, roundsPlayed, result, resultMessage } = resultData;

  // 标题
  const title = result === 'won' ? '🎉 恭喜猜中！'
    : result === 'lost' ? '😢 很遗憾，20轮已用完'
    : '📜 揭晓答案';
  document.getElementById('result-title').textContent = title;
  document.getElementById('result-message').textContent = resultMessage;

  // 显示人物卡片
  const card = document.getElementById('result-figure');
  card.classList.remove('hidden');

  // 基本信息
  document.getElementById('figure-name').textContent = figure.name;
  document.getElementById('figure-dynasty').textContent = figure.dynasty;
  document.getElementById('figure-lived').textContent = figure.lived;
  document.getElementById('figure-summary').textContent = figure.summary || '';

  // 历史画像
  const img = document.getElementById('figure-portrait');
  const placeholder = document.getElementById('portrait-placeholder');
  if (figure.portraitUrl) {
    img.src = figure.portraitUrl;
    img.alt = figure.name + '画像';
    img.classList.remove('hidden');
    placeholder.classList.add('hidden');
    img.onerror = () => {
      img.classList.add('hidden');
      placeholder.classList.remove('hidden');
    };
  } else {
    img.classList.add('hidden');
    placeholder.classList.remove('hidden');
  }

  // 主要成就
  const achList = document.getElementById('figure-achievements');
  achList.innerHTML = '';
  (figure.achievements || []).forEach(ach => {
    const li = document.createElement('li');
    li.textContent = ach;
    achList.appendChild(li);
  });

  // 详细生平
  document.getElementById('figure-biography').textContent = figure.biography || '';

  // 趣味冷知识
  document.getElementById('figure-funfact').textContent = figure.funFact || '';

  // 切换界面
  showScreen('result');
  gameState.gameStatus = 'ended';
}

// ================================
// 揭晓答案（用户主动点击）
// ================================
async function revealAnswer() {
  if (!gameState.sessionId || gameState.gameStatus !== 'playing') return;

  showLoading(true);
  try {
    const res = await fetch('/api/game/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: gameState.sessionId }),
    });

    const data = await res.json();
    if (data.success) {
      showResult(data.data);
    } else {
      alert(data.error?.message || '揭晓失败');
    }
  } catch (error) {
    console.error('Reveal error:', error);
    alert('揭晓失败，请重试');
  } finally {
    showLoading(false);
  }
}

// ================================
// 重新开始
// ================================
function resetGame() {
  gameState.sessionId = null;
  gameState.currentRound = 0;
  gameState.gameStatus = 'idle';
  chatArea.innerHTML = '';
  questionInput.value = '';
  charCount.textContent = '0/200';
  showScreen('welcome');
}

// ================================
// 统一错误处理
// ================================
async function handleApiError(error, fallbackMessage) {
  if (!error) {
    alert(fallbackMessage);
    return;
  }

  const message = error.message || fallbackMessage;

  switch (error.code) {
    case 'COOLDOWN_ACTIVE':
      alert(message);
      break;
    case 'SESSION_EXPIRED':
    case 'SESSION_NOT_FOUND':
      alert('游戏会话已过期，请重新开始');
      resetGame();
      break;
    case 'GAME_OVER':
      alert('本局游戏已结束，请开启新游戏');
      break;
    case 'RATE_LIMITED':
      alert(message);
      break;
    default:
      alert(message);
  }
}

// ================================
// 事件绑定
// ================================
document.getElementById('btn-start').addEventListener('click', startGame);
document.getElementById('btn-play-again').addEventListener('click', resetGame);
document.getElementById('btn-reveal').addEventListener('click', revealAnswer);

questionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = questionInput.value.trim();
  if (text) submitQuestion(text);
});

questionInput.addEventListener('input', () => {
  const len = questionInput.value.length;
  charCount.textContent = `${len}/200`;
  btnSubmit.disabled = len === 0 || gameState.isSubmitting;
});

// 初始状态
showScreen('welcome');
