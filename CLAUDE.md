# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**历史人物猜谜游戏** (Historical Figures Guessing Game) — A 20 Questions-style interactive game where the AI secretly selects a historical figure and the player asks yes/no questions over up to 20 rounds. On game end, the player learns about the figure through portraits, biographies, and achievements.

Full specification: `IMPLEMENTATION_PLAN.md` (~2500 lines). Read it first for architecture, API contracts, prompt templates, CSS specs, and deployment guides.

## Tech Stack

- **Frontend**: Vanilla JS (ES Modules) + Tailwind CSS CDN + custom `ancient.css`
- **Backend**: Express.js 4.x + OpenAI-compatible SDK (calls Agnes API in dev, Anthropic Claude in production)
- **AI Provider**: Development = Agnes (`agnes-2.0-flash`, free, base URL `https://apihub.agnes-ai.com/v1`); Production = Anthropic Claude (comment toggle in `server/config/claude.js`)
- **State**: In-memory Map per session (migratable to Redis later)
- **Styling**: Chinese ancient aesthetic — parchment colors, ink-black text, cinnabar accents

## Directory Structure (target)

```
human/
├── IMPLEMENTATION_PLAN.md   ← Master spec (read first)
├── server/
│   ├── index.js             ← Express entry, middleware, static serving
│   ├── config/claude.js     ← AI provider config (Agnes dev / Claude prod)
│   ├── routes/game.js       ← 4 endpoints: /start, /question, /reveal, /end
│   ├── state/session-manager.js  ← GameSession CRUD, TTL cleanup
│   ├── services/claude-service.js ← AI API wrapper (pickFigure, judgeQuestion, revealAnswer)
│   ├── prompts/             ← Prompt templates (select-figure, judge-question, reveal)
│   └── utils/helpers.js     ← Session ID generation, guess detection regex
├── public/
│   ├── index.html           ← 3 screens: welcome / game / result
│   ├── css/ancient.css      ← Full古风 stylesheet (colors, fonts, chat bubbles, result card)
│   └── js/game.js           ← Client state, API calls, DOM rendering
├── test/                    ← Jest + supertest
├── .env                     ← API keys (gitignored)
└── package.json
```

## Common Commands

```bash
# Install dependencies
npm install

# Start dev server (with file watcher)
npm run dev        # → node --watch server/index.js

# Start production server
npm start          # → node server/index.js

# Run tests
npm test           # → jest

# Access
# Frontend: http://localhost:3000
# Health:   http://localhost:3000/health
```

## Key Architecture Patterns

### Game Flow
1. `POST /api/game/start` → AI picks figure → returns `sessionId` (figure stored server-side only)
2. `POST /api/game/question` → client sends question → server calls AI with figure + history → returns `answer` (是/不是/不确定) + `reason` + `status`
3. `POST /api/game/reveal` → game end → AI generates portrait URL, biography, achievements, fun fact
4. `POST /api/game/end` → cleanup session

### Session Management
- `SessionManager` uses an in-memory `Map<sessionId, GameSession>`
- Each session holds: `secretFigure` (never sent to client), `messages[]` (truncated to 15), `currentRound` (1-20), `status`
- 30-min TTL, cleanup every 5 minutes via `setInterval`
- 2-second per-session cooldown between questions

### AI API Pattern
- Uses OpenAI-compatible SDK (`openai` package) — works with both Agnes (dev) and Claude (prod)
- Switch provider by toggling comments in `server/config/claude.js`
- All AI calls return JSON; responses parsed with `JSON.parse()`
- `response_format: { type: 'json_object' }` for structured outputs
- Three temperature levels: pickFigure(0.7), judgeQuestion(0.3), revealAnswer(0.5)

### Frontend State Machine
Three screens controlled by `hidden`/`active` classes:
- `#welcome-screen` → `#game-screen` → `#result-screen`
- Client state: `sessionId`, `currentRound`, `isSubmitting`, `gameStatus`
- All API calls use `fetch()`, no axios

### Prompt Architecture
Four prompt templates in `server/prompts/`:
1. `select-figure.js` — Random historical figure selection (system prompt)
2. `judge-question.js` — YES/NO/Uncertain judgment with figure context embedded
3. `reveal.js` — Biography, achievements, fun fact, portrait URL generation
4. Prompts use `{secret_figure_json}` placeholder replaced at runtime

## Development Guidelines

- **No build step**: Tailwind loaded via CDN, JS loaded as ES modules. Keep it simple.
- **Chinese first**: All UI text, prompts, error messages in Chinese.
- **Ancient aesthetic**: Use the defined color palette (`--color-parchment`, `--color-ink`, `--color-cinnabar`, etc.) and fonts (`Ma Shan Zheng` for titles, `Noto Serif SC` for body).
- **Secret figure isolation**: The chosen figure is never sent to the client. It's embedded in the system prompt for AI judgment calls only.
- **Result page is educational**: On game end, always show portrait, biography (300-600 chars), achievements list, and a fun fact. This is the "边玩边学" (learn while playing) core feature.
- **When implementing from spec**: `IMPLEMENTATION_PLAN.md` contains complete code skeletons for every file. Use them as the source of truth for API contracts, data structures, and UI markup.
