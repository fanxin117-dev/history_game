# 历史人物猜谜游戏 — 实施方案

> 20 Questions 风格的 AI 驱动猜谜游戏，用户通过提问猜测一个秘密历史人物。

---

## 目录

1. [项目概述](#1-项目概述)
2. [技术栈选择及理由](#2-技术栈选择及理由)
3. [系统架构](#3-系统架构)
4. [API 详细设计](#4-api-详细设计)
5. [会话与状态管理](#5-会话与状态管理)
6. [Prompt 工程设计](#6-prompt-工程设计)
7. [前端设计](#7-前端设计)
8. [后端设计](#8-后端设计)
9. [安全性考虑](#9-安全性考虑)
10. [开发计划](#10-开发计划)
11. [测试策略](#11-测试策略)
12. [部署方案](#12-部署方案)

---

## 1. 项目概述

### 1.1 产品描述

**历史人物猜谜游戏**是一款基于 AI 的 20 Questions 风格互动游戏。游戏流程如下：

1. 玩家点击"开始游戏"，AI 从浩瀚的历史人物库中随机选取一位中国历史人物作为"秘密人物"。
2. 玩家最多有 20 轮提问机会，每轮可提出一个关于该人物的问题，或直接猜测人物姓名。
3. AI 根据秘密人物的真实信息，回答"是"、"不是"或"不确定"，并附带简要推理。
4. 若玩家在 20 轮内猜中人物，则获胜；若用完 20 轮仍未猜中，AI 揭晓答案并提供历史画像、详细生平简介和主要成就，让玩家在娱乐中学习历史知识。

### 1.2 核心特性

| 特性 | 说明 |
|------|------|
| 开放式人物池 | 不限定固定人物列表，AI 自主从训练知识中选择任意真实历史人物 |
| AI 判断 | 所有逻辑判断（包括胜负判定）由 Claude 完成，利用其历史知识储备 |
| 中文界面 | 全中文 UI，适配中国用户使用习惯 |
| 古风视觉 | 羊皮纸色调、墨黑色文字、竹简式 UI 元素 |
| 边玩边学 | 游戏结束时展示历史画像、详细生平简介和主要成就，寓教于乐 |
| 回合制 REST | 简单可靠的 HTTP 请求/响应模式，无需 WebSocket |
| 会话管理 | 内存存储，支持多用户并行，自动过期清理 |
| 边玩边学 | 游戏结束时展示历史画像、详细生平简介、主要成就和趣味冷知识 |

### 1.3 用户流程

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  访问首页    │────▶│  点击开始游戏 │────▶│  AI 选定人物  │────▶│  开始提问    │
│  (index.html)│     │  (POST /start)│     │  (Claude API) │     │  (20轮循环)   │
└─────────────┘     └──────────────┘     └──────────────┘     └──────┬───────┘
                                                                     │
                                                        ┌────────────▼────────┐
                                                        │   20轮用完？         │
                                                        │   是 → 揭晓答案       │
                                                        │   否 → 继续提问       │
                                                        └─────────────────────┘
```

详细轮次流程：

```
玩家输入问题/猜测
        │
        ▼
   客户端校验 (非空、长度)
        │
        ▼
   POST /api/game/question
        │
        ▼
   服务端追加到消息历史
        │
        ▼
   发送完整上下文给 Claude
        │
        ▼
   Claude 判断并返回:
   - 答案 (是/不是/不确定)
   - 推理理由
   - 是否已猜中
        │
        ▼
   服务端更新回合数、检查上限
        │
        ▼
   返回给客户端展示
```

---

## 2. 技术栈选择及理由

### 2.1 前端技术

| 技术 | 选型 | 理由 |
|------|------|------|
| JavaScript | Vanilla JS (ES Modules) | 无构建步骤，游戏逻辑简单，减少依赖 |
| CSS | Tailwind CSS (CDN) + 自定义 ancient.css | 快速原型，CDN 版本免安装，古风样式用自定义覆盖 |
| HTTP 通信 | Fetch API | 原生支持，无需 axios 等额外库 |
| 字体 | Google Fonts (Noto Serif SC, Ma Shan Zheng) | 免费可商用，古风适配 |
| 图标 | Unicode 字符 + CSS 绘制 | 避免引入 icon 库，保持轻量 |

### 2.2 后端技术

| 技术 | 选型 | 理由 |
|------|------|------|
| 运行时 | Node.js 18+ | 异步 IO 友好，生态成熟 |
| Web 框架 | Express.js 4.x | 轻量、路由清晰、中间件丰富 |
| API 调用 | Agnes SDK（兼容 OpenAI 协议） | 免费开发，商用可切换付费提供商 |
| 环境变量 | dotenv | 本地开发加载 .env |
| 会话存储 | Map (内存) | 单实例部署足够，无需 Redis 引入复杂度 |
| 速率限制 | express-rate-limit | 成熟中间件，支持 IP 级别限流 |
| CORS | cors | 允许同源或指定域名访问 |

### 2.3 技术选型决策记录

**为什么不选 WebSocket？**
游戏本质是回合制，每轮一问一答，HTTP 请求/响应模式完全满足需求。WebSocket 会增加连接管理、心跳、重连等复杂度，对这类场景过度设计。

**为什么不选固定人物库？**
- 固定列表限制了游戏的可玩性和趣味性
- Claude 的历史知识远超任何人工维护的人物库
- 开放式选择避免了"猜不到列表中人物"的挫败感
- 服务端存储秘密人物，不影响客户端逻辑

**为什么用内存 Map 而非数据库？**
- 游戏会话生命周期短（最多 20 分钟），重启即丢失可接受
- 简化部署，无需维护 MySQL/Redis 等外部服务
- 若后续需要持久化，可平滑迁移至 Redis

---

## 3. 系统架构

### 3.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        浏览器 (用户)                              │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  index.html  │  │ ancient.css  │  │  game.js (客户端逻辑)   │  │
│  │  (古风界面)   │  │  (Tailwind+  │  │  - 消息渲染             │  │
│  │              │  │   自定义)     │  │  - 表单校验             │  │
│  │              │  │              │  │  - API 调用             │  │
│  └─────────────┘  └──────────────┘  └────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP/REST
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                     Express.js 服务器                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    中间件层                                  │  │
│  │  cors() │ rateLimit() │ express.json() │ express.static()  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐  │
│  │  /api/game   │  │  静态文件     │  │  会话管理 (SessionMgr) │  │
│  │  路由:        │  │  /public/    │  │  - 创建/获取/删除会话   │  │
│  │  POST /start │  │              │  │  - 消息历史追加         │  │
│  │  POST /q     │  │              │  │  - 过期清理             │  │
│  │  POST /reveal│  │              │  │                        │  │
│  └──────────────┘  └──────────────┘  └────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                 Agnes Service 层                           │  │
│  │  - pickFigure(): 选择秘密人物                                │  │
│  │  - judgeQuestion(): 判断问题                                 │  │
│  │  - revealAnswer(): 揭示答案                                  │  │
│  │  - summarizeFigure(): 生成人物简介                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │ Agnes SDK (OpenAI 兼容协议)
                             │
┌────────────────────────────▼────────────────────────────────────┐
│                   Agnes AI API (免费开发)                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  agnes-sonnet-4 (或其他可用模型)                           │  │
│  │  - temperature: 0.3                                        │  │
│  │  - response_format: { type: "json_schema", ... }           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 数据流

#### 3.2.1 游戏启动

```
Client                    Server                    Agnes API
  |                         |                          |
  |-- POST /api/game/start ->|                          |
  |                         |-- pickFigure(prompt) ---->|
  |                         |<--- { figure, info } -----|
  |                         |-- 存储秘密人物(内存)       |
  |<-- { sessionId } --------|                          |
```

#### 3.2.2 提问轮次

```
Client                    Server                    Agnes API
  |                         |                          |
  |-- POST /api/game/question->|                        |
  |  { sessionId,           |-- 获取会话               |
  |   question }            |-- 追加到消息历史          |
  |                         |-- judgeQuestion(context)->|
  |                         |<--- { answer, isCorrect }-|
  |                         |-- 更新会话状态             |
  |<-- { answer, round,     |                          |
  |    status, reason } -----|                          |
```

#### 3.2.3 揭晓答案

```
Client                    Server                    Agnes API
  |                         |                          |
  |-- POST /api/game/reveal ->|                         |
  |  { sessionId }          |-- 获取秘密人物             |
  |                         |-- summarizeFigure ------> |
  |                         |<--- { summary } ----------|
  |<-- { figure, summary } --|                          |
```

---

## 4. API 详细设计

### 4.1 通用约定

- 所有接口路径前缀：`/api/game`
- 请求/响应 Content-Type：`application/json`
- 统一响应格式：

```json
{
  "success": true,
  "data": { /* 业务数据 */ },
  "error": null
}
```

- 错误时：

```json
{
  "success": false,
  "data": null,
  "error": {
    "code": "SESSION_NOT_FOUND",
    "message": "会话不存在或已过期"
  }
}
```

### 4.2 接口定义

#### 4.2.1 开始游戏 `POST /api/game/start`

**功能**：启动一局新游戏，AI 选择秘密人物。

**请求体**：

```json
{}  // 无参数
```

**成功响应** (HTTP 200)：

```json
{
  "success": true,
  "data": {
    "sessionId": "gs_abc123def456",
    "maxRounds": 20,
    "message": "游戏已开始！你可以开始提问了。"
  }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| sessionId | string | 会话唯一标识，格式 `gs_` + 12位随机字符 |
| maxRounds | number | 最大回合数，固定 20 |
| message | string | 欢迎语 |

**错误响应**：

| HTTP 状态码 | error.code | error.message | 说明 |
|-------------|-----------|---------------|------|
| 429 | RATE_LIMITED | 请求过于频繁，请稍后再试 | 全局 IP 限流触发 |
| 500 | AI_SERVICE_ERROR | 服务暂时不可用 | AI API 调用失败 |
| 500 | SESSION_LIMIT_EXCEEDED | 您已有进行中的游戏 | 同一 sessionId 重复开始（由客户端保证，服务端不做强制限制） |

---

#### 4.2.2 提问 `POST /api/game/question`

**功能**：提交一个问题或猜测，获取 AI 回答。

**请求体**：

```json
{
  "sessionId": "gs_abc123def456",
  "question": "这个人是男性吗？"
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| sessionId | string | 是 | 游戏会话 ID |
| question | string | 是 | 用户的问题或猜测，1-200字 |

**成功响应** (HTTP 200)：

```json
{
  "success": true,
  "data": {
    "answer": "是",
    "reason": "李世民是唐朝第二位皇帝，确为男性。",
    "round": 3,
    "remainingRounds": 17,
    "status": "playing",
    "figureGuessed": false
  }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| answer | string | AI 的回答："是"、"不是" 或 "不确定" |
| reason | string | 回答的推理依据 |
| round | number | 当前是第几轮（1-20） |
| remainingRounds | number | 剩余回合数 |
| status | string | 游戏状态：`playing` / `won` / `lost` / `guessed` |
| figureGuessed | boolean | 本次是否为猜测（非提问） |

**status 枚举值**：

| 值 | 说明 |
|----|------|
| `playing` | 游戏继续中 |
| `guessed` | 玩家猜中了人物（无论对错，进入揭晓阶段） |
| `won` | 玩家猜对了（通过猜测或轮次耗尽前的确认） |
| `lost` | 20轮用完仍未猜中 |

**错误响应**：

| HTTP 状态码 | error.code | error.message | 说明 |
|-------------|-----------|---------------|------|
| 400 | INVALID_INPUT | 问题不能为空，且不超过200字 | 参数校验失败 |
| 400 | COOLDOWN_ACTIVE | 请稍候再提问 | 2秒冷却期未满 |
| 404 | SESSION_NOT_FOUND | 会话不存在 | sessionId 无效 |
| 404 | SESSION_EXPIRED | 会话已过期 | 超过30分钟无活动 |
| 410 | GAME_OVER | 本局游戏已结束 | 状态为 won/lost |
| 429 | RATE_LIMITED | 请求过于频繁 | IP 级限流 |
| 500 | AI_SERVICE_ERROR | AI 服务暂时不可用 | AI API 异常 |

---

#### 4.2.3 揭晓答案 `POST /api/game/reveal`

**功能**：主动结束游戏并揭示秘密人物及其详细信息（含历史画像与生平简介）。

> **设计目标**：边玩边学 — 不仅公布答案，更通过画像和详实的生平介绍让玩家了解这位历史人物，达到寓教于乐的效果。

**请求体**：

```json
{
  "sessionId": "gs_abc123def456"
}
```

**成功响应** (HTTP 200)：

```json
{
  "success": true,
  "data": {
    "figure": {
      "name": "李世民",
      "dynasty": "唐朝",
      "lived": "598年－649年",
      "portraitUrl": "https://example.com/portraits/lichimin.jpg",
      "summary": "唐太宗李世民，唐朝第二位皇帝，中国历史上最著名的君主之一...",
      "biography": "李世民（598年1月28日－649年7月10日），唐高祖李渊第二子...",
      "achievements": [
        "开创\"贞观之治\"，奠定大唐盛世基业",
        "击败突厥，被尊为\"天可汗\"",
        "修订《唐律疏议》，完善三省六部制",
        "广开言路，重用魏徵等贤臣"
      ],
      "funFact": "他是中国历史上唯一同时获得\"天可汗\"尊号的中原皇帝。"
    },
    "roundsPlayed": 5,
    "result": "lost",
    "resultMessage": "很遗憾，20轮已用完。这位历史人物是——李世民！"
  }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| figure.name | string | 人物姓名 |
| figure.dynasty | string | 所属朝代/时代 |
| figure.lived | string | 生卒年份 |
| figure.portraitUrl | string | **历史画像图片 URL**（AI 生成或 Wikimedia 公共领域图片链接） |
| figure.summary | string | 一句话简介（50-100字） |
| figure.biography | string | **详细生平简介（300-600字，按时间线叙述）** |
| figure.achievements | string[] | **主要成就列表（3-5条）** |
| figure.funFact | string | **一句趣味冷知识** |
| roundsPlayed | number | 实际进行的回合数 |
| result | string | `won` / `lost` / `revealed` |
| resultMessage | string | 针对结果的提示语 |

**错误响应**：同 `POST /api/game/question` 的 404/410 错误。

---

#### 4.2.4 结束游戏 `POST /api/game/end`

**功能**：主动放弃当前游戏，释放会话资源。（可选接口，用于清理）

**请求体**：

```json
{
  "sessionId": "gs_abc123def456"
}
```

**成功响应** (HTTP 200)：

```json
{
  "success": true,
  "data": {
    "message": "游戏已结束，感谢您的参与！"
  }
}
```

### 4.3 错误码汇总

| 错误码 | HTTP 状态 | 含义 | 客户端处理建议 |
|--------|----------|------|--------------|
| `INVALID_INPUT` | 400 | 输入不合法 | 显示输入错误提示 |
| `COOLDOWN_ACTIVE` | 400 | 冷却期内 | 倒计时提示，禁用按钮 |
| `SESSION_NOT_FOUND` | 404 | 会话不存在 | 引导重新开始 |
| `SESSION_EXPIRED` | 404 | 会话已过期 | 引导重新开始 |
| `GAME_OVER` | 410 | 游戏已结束 | 引导查看结果或新游戏 |
| `RATE_LIMITED` | 429 | 请求频率超限 | 显示等待时间 |
| `AI_SERVICE_ERROR` | 500 | AI 服务异常 | 提示重试 |
| `UNKNOWN_ERROR` | 500 | 未知错误 | 通用错误提示 |

---

## 5. 会话与状态管理

### 5.1 会话数据结构

```typescript
interface GameSession {
  sessionId: string;        // 唯一标识，格式 gs_<12chars>
  createdAt: Date;          // 创建时间
  lastActiveAt: Date;       // 最后活跃时间
  status: 'playing' | 'ended';  // 会话状态
  secretFigure: SecretFigure;   // 秘密人物（不暴露给客户端）
  currentRound: number;     // 当前轮次 (1-20)
  messages: MessageRecord[]; // 对话历史（最多保留15条）
  isConfirmed: boolean;     // 是否已通过猜测确认了人物
  confirmedFigureName?: string; // 已确认的人物名称
}

interface SecretFigure {
  name: string;             // 人物姓名
  dynasty: string;          // 朝代/时代
  lived: string;            // 生卒年份
  keywords: string[];       // 关键词标签（供内部判断使用）
  _rawResponse: string;     // Claude 原始返回（调试用）
}

interface MessageRecord {
  role: 'user' | 'assistant';
  content: string;          // 显示内容
  rawContent?: string;      // 发送给 Claude 的原始内容（可能不同）
  timestamp: Date;
}
```

### 5.2 会话生命周期

```
创建 (start) ──▶ 活跃中 (playing) ──▶ 结束 (won/lost)
    │                  │                       │
    │                  │               30分钟无活动
    │                  │                       │
    │             20轮用完               定时清理 (cleanupTimer)
    │                                       │
    │                                  从 Map 中移除
    ▼
  释放资源
```

### 5.3 会话管理器设计

**文件位置**：`server/state/session-manager.js`

**核心方法**：

```javascript
class SessionManager {
  // 创建新会话
  create(sessionId, secretFigure) => void

  // 获取会话
  get(sessionId) => GameSession | null

  // 更新活跃时间
  touch(sessionId) => void

  // 追加消息
  appendMessage(sessionId, message) => void

  // 增加回合数
  advanceRound(sessionId) => number

  // 标记游戏结束
  endGame(sessionId, result) => void

  // 删除会话
  destroy(sessionId) => void

  // 检查是否过期
  isExpired(sessionId) => boolean

  // 清理所有过期会话
  cleanup() => number  // 返回清理数量
}
```

### 5.4 消息历史管理策略

**为什么只保留 15 条？**
- Claude API 按 token 计费，消息越多成本越高
- 20 Questions 游戏中，最近 15 轮的上下文已足够做出准确判断
- 早期问题对后续判断影响递减

**截断规则**：
- 每次追加新消息后，如果消息总数 > 15，移除最早的 1 条
- 保留一条"系统指令"类型的消息（包含秘密人物信息），不计入 15 条限制
- 实际发送给 Claude 的消息结构：

```
[系统消息: 秘密人物信息] (始终保留)
[用户问题1] [AI回答1]
[用户问题2] [AI回答2]
...
[用户问题15] [AI回答15]
// 超出部分被截断
```

### 5.5 定时清理

```javascript
// 每 5 分钟执行一次清理
const cleanupTimer = setInterval(() => {
  const cleaned = sessionManager.cleanup();
  console.log(`[SessionManager] Cleaned ${cleaned} expired sessions`);
}, 5 * 60 * 1000);

// 进程退出时清理定时器
process.on('SIGTERM', () => clearInterval(cleanupTimer));
process.on('SIGINT', () => clearInterval(cleanupTimer));
```

---

## 6. Prompt 工程设计

这是整个系统的核心。Claude 的质量直接决定游戏体验。以下提供四个关键场景的完整 Prompt 模板。

### 6.1 场景一：选择秘密人物

**触发时机**：玩家点击"开始游戏"时调用。

**系统 Prompt**：

```
你是一位历史学家和游戏主持人。你的任务是为一场"20 Questions"猜谜游戏选择一个秘密历史人物。

规则：
1. 人物必须是真实存在的历史人物（可以是中国人物或世界人物）
2. 人物应该有一定知名度，但不是过于常见以至于毫无挑战性（如"秦始皇"太容易，"某县令"太难）
3. 人物应该来自不同时代、不同领域（政治家、军事家、文学家、科学家、艺术家等）
4. 不要选择当代在世人物
5. 不要选择神话或传说中的人物

请从以下候选名单中选择一个（或选择其他合适的）：
- 中国历史人物为主，也可以包含世界著名历史人物
- 避免选择游戏历史上已被频繁使用的极端热门人物

以 JSON 格式返回，不要包含任何其他文本：
{
  "name": "人物姓名",
  "dynasty": "朝代/时代",
  "lived": "生卒年份或活跃年代",
  "keywords": ["关键词1", "关键词2", "关键词3", "关键词4", "关键词5"],
  "difficulty": "easy|medium|hard",
  "funFact": "一句关于此人物的有趣事实（用于揭晓时展示）"
}
```

**参数配置**：
- `temperature`: 0.7（需要一定的随机性）
- `top_p`: 0.9
- 模型：`agnes-2.0-flash`（Agnes 免费模型，选择人物不需要太高智能）

**示例输出**：

```json
{
  "name": "王安石",
  "dynasty": "北宋",
  "lived": "1021年－1086年",
  "keywords": ["改革家", "文学家", "北宋", "变法", "宰相"],
  "difficulty": "medium",
  "funFact": "他推行的变法被称为'熙宁变法'，是中国历史上最具争议的改革之一。"
}
```

### 6.2 场景二：判断问题

**触发时机**：每轮玩家提交问题时调用。

**系统 Prompt**：

```
你是一位公正的历史裁判。在一场"20 Questions"猜谜游戏中，你负责判断玩家的问题是否适用于你手中的秘密人物。

【秘密人物信息】
{secret_figure_json}

【游戏规则】
- 玩家最多有 20 轮提问机会
- 玩家可以提出是非题（如"他是男性吗？"），也可以直接猜测人物姓名
- 你需要根据秘密人物的真实信息回答问题

【回答标准】
1. 对于是非题：
   - "是"：该问题的答案明确为肯定
   - "不是"：该问题的答案明确为否定
   - "不确定"：问题存在歧义、涉及主观判断、或秘密人物的相关信息不明确

2. 对于猜测（玩家直接说"我猜是XXX"或类似表述）：
   - 如果猜测正确：回答"是"，并标记游戏胜利
   - 如果猜测错误：回答"不是"，并指出正确的方向

3. 对于模糊/无法回答的问题（如"你觉得他帅吗？"）：
   - 回答"不确定"，并温和引导玩家提出更具体的问题

【判断原则】
- 严格基于历史事实，不推测、不脑补
- 对于间接推断（如"他活过50岁"需要从生卒年计算），可以进行合理推断
- 对于有争议的历史事件，如果大多数史料支持某一结论，可以据此判断
- 注意代词消解：玩家说"他"指的是秘密人物

【输出格式】
以 JSON 格式返回，不要包含任何其他文本：
{
  "answer": "是" | "不是" | "不确定",
  "reason": "简短的解释理由（1-2句话）",
  "isGuess": false,           // 是否为猜测
  "figureGuessed": "",        // 如果是猜测，玩家猜的人名
  "correctGuess": false,      // 猜测是否正确
  "gameStatus": "playing" | "won" | "lost",
  "roundHint": "可选：给玩家的提示（仅在不合适问题时给出）"
}
```

**参数配置**：
- `temperature`: 0.3（需要稳定一致的判断）
- `response_format`: `{ type: "json_schema", schema: {...} }`
- 模型：`agnes-2.0-flash`

**消息历史组装示例**：

```
[系统消息]
你是历史裁判。秘密人物：{"name":"王安石","dynasty":"北宋",...}
回答标准：是/不是/不确定
请基于以上人物信息判断以下问题。

[用户消息] 第1轮：他是男性吗？
[助手消息] {"answer":"是","reason":"王安石是北宋男性政治家。",...}
[用户消息] 第2轮：他是文学家吗？
[助手消息] {"answer":"是","reason":"王安石是唐宋八大家之一，著名的文学家。",...}
[用户消息] 第3轮：他生活在宋朝吗？
```

### 6.3 场景三：胜负判定

**触发时机**：每轮回答后，由 Claude 在判断时一并完成。

**说明**：胜负判定不单独调用 Claude，而是整合在"判断问题"的 Prompt 中：

- 如果玩家猜测正确 → `gameStatus: "won"`
- 如果 20 轮用完且未猜中 → 服务端检查 `currentRound >= 20`，设置 `gameStatus: "lost"`
- 如果玩家在游戏中途主动要求结束 → 通过 `/reveal` 接口处理

### 6.4 场景四：揭示答案（含画像、生平、成就）

**触发时机**：游戏结束时调用。

> 此 Prompt 是"边玩边学"的核心。AI 需要生成丰富的内容，让玩家即使猜错了也能学到历史知识。

**系统 Prompt**：

```
你是一位历史学家和教育家。玩家正在进行一场"20 Questions"猜谜游戏，现在游戏结束了，
请为这位历史人物准备一份详细的学习资料，让玩家通过了解此人物的生平获得知识。

【人物信息】
{secret_figure_json}

【输出要求】

1. summary（一句话简介，50-100字）
   - 用最精炼的语言概括此人物的身份和历史地位
   - 适合快速了解"这人是谁"

2. biography（详细生平，300-600字）
   - 按时间顺序叙述人物的一生
   - 涵盖：出身背景、重要经历、关键转折、历史贡献、晚年结局
   - 语言通俗易懂，像一位优秀的历史老师在讲故事
   - 穿插重要的历史事件和典故

3. achievements（主要成就，3-5条）
   - 列出此人最重要的历史贡献
   - 每条 15-30 字，简明扼要
   - 按重要性排序

4. funFact（趣味冷知识，1句）
   - 一个鲜为人知但有趣的关于此人物的事实
   - 让人眼前一亮的那种

5. resultMessage（根据游戏结果生成结束语）
   - 猜赢了："恭喜你！你在第X轮就猜中了..."
   - 猜输了："很遗憾，20轮已用完。不过没关系，通过刚才的问答，你可能已经..."
   - 主动揭晓："你选择了提前揭晓，让我们一起来看看这位人物..."

6. portraitUrl（历史画像 URL）
   - 优先使用 Wikimedia Commons 或其他公共领域的历史画像链接
   - 格式：https://upload.wikimedia.org/wikipedia/commons/...
   - 如果无法确定可靠的公开画像链接，返回 null（前端会显示占位符）
   - 不要编造不存在的图片链接

【输出格式】
以 JSON 格式返回，不要包含任何其他文本：
{
  "name": "人物姓名",
  "dynasty": "朝代",
  "lived": "生卒年",
  "summary": "一句话简介",
  "biography": "详细生平介绍...",
  "achievements": ["成就1", "成就2", "成就3", "成就4"],
  "funFact": "趣味冷知识",
  "resultMessage": "根据结果生成的结束语",
  "portraitUrl": "https://upload.wikimedia.org/wikipedia/commons/... 或 null"
}
```

**参数配置**：
- `temperature`: 0.5（需要一些文采和故事性）
- `response_format`: `{ type: "json_object" }`
- 模型：`agnes-2.0-flash`（纯文本生成，免费 API 即可）

---

## 7. 前端设计

### 7.1 页面结构

**文件位置**：`public/index.html`

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>历史人物猜谜游戏</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Google Fonts -->
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&family=Ma+Shan+Zheng&display=swap" rel="stylesheet">
  <!-- 自定义古风样式 -->
  <link rel="stylesheet" href="/css/ancient.css">
</head>
<body class="ancient-bg">
  <!-- ========== 欢迎界面 ========== -->
  <div id="welcome-screen" class="screen active">
    <header class="text-center py-12">
      <h1 class="ancient-title">历史人物猜谜游戏</h1>
      <p class="ancient-subtitle">二十问知古今 · 猜人物辨忠奸</p>
      <div class="ancient-divider mx-auto my-8"></div>
      <p class="instructions-text">
        我将想好一位历史人物，你最多可以问 20 个问题。<br>
        每个问题我会回答"是"、"不是"或"不确定"。<br>
        你也可以随时猜测人物姓名。
      </p>
    </header>
    <div class="text-center">
      <button id="btn-start" class="ancient-btn-primary">
        <span class="btn-icon">📜</span> 开始游戏
      </button>
    </div>
  </div>

  <!-- ========== 游戏界面 ========== -->
  <div id="game-screen" class="screen hidden">
    <!-- 顶部信息栏 -->
    <div class="game-header">
      <div class="round-indicator">
        <!-- 竹简式轮次指示器 -->
        <div id="round-dots" class="flex gap-1"></div>
      </div>
      <div class="round-count">
        第 <span id="current-round">0</span> / 20 轮
      </div>
      <button id="btn-reveal" class="ancient-btn-secondary hidden">
        揭晓答案
      </button>
    </div>

    <!-- 消息区域 -->
    <div id="chat-area" class="chat-container">
      <!-- 动态插入消息气泡 -->
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <form id="question-form" class="flex gap-2">
        <input
          id="question-input"
          type="text"
          placeholder="请输入你的问题..."
          maxlength="200"
          class="ancient-input"
          autocomplete="off"
        />
        <span id="char-count" class="char-counter">0/200</span>
        <button type="submit" id="btn-submit" class="ancient-btn-primary">
          提问
        </button>
      </form>
      <div class="input-hint">
        💡 提示：你可以问"他是男性吗？"或猜"我猜是诸葛亮"
      </div>
    </div>
  </div>

  <!-- ========== 结果界面 ========== -->
  <div id="result-screen" class="screen hidden">
    <div class="result-container">
      <!-- 结果标题 -->
      <h2 id="result-title" class="ancient-title mb-4"></h2>
      <p id="result-message" class="result-text mb-8"></p>

      <!-- 人物卡片 -->
      <div id="result-figure" class="figure-card">
        <!-- 画像区域 -->
        <div class="portrait-section">
          <img id="figure-portrait" class="figure-portrait" alt="历史人物画像" />
          <div id="portrait-placeholder" class="portrait-placeholder hidden">
            <span class="placeholder-icon">🖼️</span>
            <span class="placeholder-text">暂无历史画像</span>
          </div>
        </div>

        <!-- 基本信息 -->
        <div class="figure-meta">
          <h3 id="figure-name" class="figure-name"></h3>
          <div class="figure-dynasty-row">
            <span id="figure-dynasty" class="figure-dynasty"></span>
            <span class="separator">·</span>
            <span id="figure-lived" class="figure-lived"></span>
          </div>
        </div>

        <!-- 一句话简介 -->
        <p id="figure-summary" class="figure-summary"></p>

        <!-- 主要成就 -->
        <div class="achievements-section">
          <h4 class="section-title">📜 主要成就</h4>
          <ul id="figure-achievements" class="achievement-list"></ul>
        </div>

        <!-- 详细生平 -->
        <div class="biography-section">
          <h4 class="section-title">📖 生平简介</h4>
          <div id="figure-biography" class="biography-text"></div>
        </div>

        <!-- 趣味冷知识 -->
        <div class="funfact-section">
          <h4 class="section-title">💡 趣味冷知识</h4>
          <p id="figure-funfact" class="funfact-text"></p>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="mt-10 flex justify-center gap-4">
        <button id="btn-play-again" class="ancient-btn-primary">
          <span class="btn-icon">🔄</span> 再来一局
        </button>
      </div>
    </div>
  </div>

  <script type="module" src="/js/game.js"></script>
</body>
</html>
```

### 7.2 组件划分

| 组件 | 职责 | 对应 DOM |
|------|------|---------|
| WelcomeScreen | 欢迎页展示、开始按钮 | `#welcome-screen` |
| GameScreen | 游戏主界面、消息流 | `#game-screen` |
| ChatArea | 消息气泡渲染、滚动 | `#chat-area` |
| RoundIndicator | 竹简式轮次可视化 | `#round-dots` |
| InputArea | 问题输入、校验、提交 | `#question-form` |
| ResultScreen | 结果展示（画像+生平+成就+冷知识）、再次游戏 | `#result-screen` |
| PortraitSection | 历史画像展示（含占位符） | `#figure-portrait`, `#portrait-placeholder` |
| BiographySection | 详细生平简介 | `#figure-biography` |
| AchievementsSection | 主要成就列表 | `#figure-achievements` |
| FunFactSection | 趣味冷知识 | `#figure-funfact` |

### 7.3 交互流程

```
┌─────────────────────────────────────────────────────┐
│                   欢迎界面                             │
│                                                      │
│  用户点击"开始游戏"                                   │
│       │                                              │
│       ▼                                              │
│  显示加载状态 (旋转的毛笔图标)                         │
│       │                                              │
│       ▼                                              │
│  调用 POST /api/game/start                           │
│       │                                              │
│       ├─ 成功 ──▶ 切换到游戏界面                       │
│       │              - 清空消息区                      │
│       │              - 初始化轮次指示器                │
│       │              - 聚焦输入框                      │
│       │              - 显示欢迎消息                    │
│       │                                              │
│       └─ 失败 ──▶ 显示错误提示                         │
│                                                      │
├─────────────────────────────────────────────────────┤
│                   游戏界面                             │
│                                                      │
│  用户输入问题 → 点击"提问"                             │
│       │                                              │
│       ▼                                              │
│  客户端校验 (非空、长度≤200)                           │
│       │                                              │
│       ▼                                              │
│  禁用输入、显示加载状态                                │
│       │                                              │
│       ▼                                              │
│  调用 POST /api/game/question                        │
│       │                                              │
│       ├─ 成功 ──▶ 渲染 AI 回复气泡                     │
│       │              - 更新轮次指示器                  │
│       │              - 启用输入                        │
│       │              - 自动滚动到底部                  │
│       │                                              │
│       ├─ 状态=playing ──▶ 继续游戏                     │
│       ├─ 状态=guessed/won ──▶ 调用 /reveal → 显示结果 │
│       │              - 展示历史画像                     │
│       │              - 展示详细生平简介                 │
│       │              - 展示主要成就列表                 │
│       │              - 展示趣味冷知识                   │
│       └─ 状态=lost ──▶ 自动调用 /reveal → 显示结果     │
│                                                      │
│  用户点击"揭晓答案"                                    │
│       │                                              │
│       ▼                                              │
│  调用 POST /api/game/reveal                          │
│       │                                              │
│       ▼                                              │
│  显示结果界面（画像 + 生平 + 成就 + 冷知识）           │
│                                                      │
├─────────────────────────────────────────────────────┤
│                   结果界面                             │
│                                                      │
│  用户点击"再来一局"                                    │
│       │                                              │
│       ▼                                              │
│  重置所有状态 → 回到欢迎界面                           │
└─────────────────────────────────────────────────────┘
```

### 7.4 样式规范

**文件位置**：`public/css/ancient.css`

#### 颜色体系

```css
/* 主色调 */
--color-parchment:    #F5F0E8;  /* 羊皮纸背景 */
--color-ink:          #2C2420;  /* 墨黑色文字 */
--color-cinnabar:     #C23B22;  /* 朱红色点缀 */
--color-sepia:        #8B6914;  /* 古铜色 */
--color-bamboo:       #7A8B6F;  /* 竹青色 */
--color-rice-paper:   #FAF6EE;  /* 宣纸白 */

/* 渐变 */
--gradient-parchment: linear-gradient(135deg, #F5F0E8 0%, #EDE5D5 100%);
--gradient-ink:       linear-gradient(180deg, rgba(44,36,32,0.05) 0%, transparent 100%);
```

#### 字体

```css
.ancient-title {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 3rem;
  color: var(--color-ink);
  text-shadow: 2px 2px 4px rgba(0,0,0,0.1);
}

.ancient-subtitle {
  font-family: 'Noto Serif SC', serif;
  font-size: 1.25rem;
  color: var(--color-sepia);
  letter-spacing: 0.2em;
}

body {
  font-family: 'Noto Serif SC', serif;
  background-color: var(--color-parchment);
  color: var(--color-ink);
}
```

#### 竹简式轮次指示器

```css
.round-dot {
  width: 18px;
  height: 28px;
  background: var(--color-bamboo);
  border-radius: 3px;
  opacity: 0.3;
  transition: opacity 0.3s, background-color 0.3s;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.round-dot.used {
  opacity: 1;
  background: var(--color-cinnabar);
}

.round-dot.current {
  opacity: 1;
  background: var(--color-sepia);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(1.15); }
}
```

#### 聊天气泡

```css
/* 用户消息（右侧，墨迹风） */
.chat-bubble.user {
  background: var(--color-ink);
  color: var(--color-rice-paper);
  border-radius: 2px 16px 16px 2px;
  padding: 12px 16px;
  margin-left: auto;
  max-width: 70%;
  box-shadow: 2px 2px 8px rgba(0,0,0,0.15);
}

/* AI 消息（左侧，卷轴风） */
.chat-bubble.ai {
  background: var(--color-rice-paper);
  border: 1px solid rgba(139, 105, 20, 0.2);
  border-radius: 16px 2px 2px 16px;
  padding: 12px 16px;
  max-width: 70%;
  box-shadow: 1px 1px 6px rgba(0,0,0,0.08);
}

/* 答案标签 */
.answer-tag {
  display: inline-block;
  padding: 2px 12px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 1.1rem;
  margin-bottom: 6px;
}
.answer-tag.yes { background: var(--color-cinnabar); color: white; }
.answer-tag.no { background: var(--color-sepia); color: white; }
.answer-tag.maybe { background: var(--color-bamboo); color: white; }
```

#### 按钮

```css
.ancient-btn-primary {
  background: var(--color-cinnabar);
  color: white;
  padding: 12px 32px;
  border: none;
  border-radius: 4px;
  font-family: 'Noto Serif SC', serif;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(194, 59, 34, 0.3);
}

.ancient-btn-primary:hover {
  background: #a83119;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(194, 59, 34, 0.4);
}

.ancient-btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.ancient-btn-secondary {
  background: transparent;
  color: var(--color-cinnabar);
  border: 2px solid var(--color-cinnabar);
  padding: 8px 20px;
  border-radius: 4px;
  font-family: 'Noto Serif SC', serif;
  cursor: pointer;
  transition: all 0.2s;
}

.ancient-btn-secondary:hover {
  background: var(--color-cinnabar);
  color: white;
}
```

#### 结果页样式（画像 + 生平 + 成就）

```css
/* 人物卡片整体 */
.figure-card {
  background: var(--color-rice-paper);
  border: 2px solid var(--color-sepia);
  border-radius: 8px;
  padding: 24px;
  max-width: 640px;
  margin: 0 auto;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

/* 画像区域 */
.portrait-section {
  text-align: center;
  margin-bottom: 20px;
}

.figure-portrait {
  width: 180px;
  height: 240px;
  object-fit: cover;
  border-radius: 8px;
  border: 3px solid var(--color-sepia);
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}

.portrait-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px;
  color: var(--color-sepia);
  opacity: 0.7;
}

.placeholder-icon {
  font-size: 3rem;
}

/* 人物基本信息 */
.figure-name {
  font-family: 'Ma Shan Zheng', cursive;
  font-size: 2.5rem;
  color: var(--color-ink);
  text-align: center;
  margin-bottom: 8px;
}

.figure-dynasty-row {
  text-align: center;
  color: var(--color-sepia);
  font-size: 1.1rem;
  margin-bottom: 16px;
}

.separator {
  margin: 0 8px;
  opacity: 0.5;
}

.figure-summary {
  text-align: center;
  font-size: 1.05rem;
  line-height: 1.8;
  color: var(--color-ink);
  opacity: 0.85;
  margin-bottom: 24px;
  padding: 12px;
  background: rgba(139, 105, 20, 0.05);
  border-radius: 4px;
  border-left: 3px solid var(--color-sepia);
}

/* 分区标题 */
.section-title {
  font-family: 'Noto Serif SC', serif;
  font-size: 1.2rem;
  color: var(--color-cinnabar);
  margin-bottom: 12px;
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--color-sepia);
}

/* 主要成就列表 */
.achievements-section {
  margin-bottom: 24px;
}

.achievement-list {
  list-style: none;
  padding: 0;
}

.achievement-list li {
  position: relative;
  padding: 8px 0 8px 24px;
  line-height: 1.6;
  color: var(--color-ink);
}

.achievement-list li::before {
  content: '✦';
  position: absolute;
  left: 0;
  color: var(--color-sepia);
  font-size: 0.9rem;
}

/* 详细生平 */
.biography-section {
  margin-bottom: 24px;
}

.biography-text {
  font-size: 1rem;
  line-height: 2;
  color: var(--color-ink);
  text-align: justify;
  text-indent: 2em;
  max-height: 300px;
  overflow-y: auto;
  padding: 12px;
  background: rgba(245, 240, 232, 0.5);
  border-radius: 4px;
}

/* 滚动条样式 */
.biography-text::-webkit-scrollbar {
  width: 6px;
}

.biography-text::-webkit-scrollbar-track {
  background: transparent;
}

.biography-text::-webkit-scrollbar-thumb {
  background: var(--color-sepia);
  border-radius: 3px;
}

/* 趣味冷知识 */
.funfact-section {
  margin-bottom: 8px;
}

.funfact-text {
  font-size: 1rem;
  line-height: 1.8;
  color: var(--color-bamboo);
  background: rgba(122, 139, 111, 0.08);
  padding: 12px 16px;
  border-radius: 4px;
  border-left: 3px solid var(--color-bamboo);
}

/* 结果标题（胜利/失败） */
.result-text {
  font-size: 1.1rem;
  color: var(--color-sepia);
  text-align: center;
}

/* 移动端适配 */
@media (max-width: 640px) {
  .figure-card {
    padding: 16px;
  }

  .figure-portrait {
    width: 140px;
    height: 186px;
  }

  .figure-name {
    font-size: 2rem;
  }

  .biography-text {
    max-height: 200px;
    font-size: 0.95rem;
  }
}

#### 响应式断点

```css
/* 移动端优先 */
@media (min-width: 768px) {
  .chat-container {
    /* 桌面端增大消息宽度 */
  }
  .ancient-title {
    font-size: 3.5rem;
  }
}

@media (min-width: 1024px) {
  /* 大屏双栏布局：消息区 + 轮次指示器 */
  .game-layout {
    display: grid;
    grid-template-columns: 1fr 200px;
    gap: 20px;
  }
}
```

### 7.5 客户端 JavaScript 设计

**文件位置**：`public/js/game.js`

#### 状态管理

```javascript
const gameState = {
  sessionId: null,
  currentRound: 0,
  maxRounds: 20,
  isSubmitting: false,
  gameStatus: 'idle',  // 'idle' | 'playing' | 'ended'
};
```

#### 核心函数

```javascript
// 页面切换
function showScreen(screenId) { ... }

// 开始游戏
async function startGame() { ... }

// 提交问题
async function submitQuestion(question) { ... }

// 渲染消息气泡
function appendMessage(role, content, answer) { ... }

// 更新轮次指示器
function updateRoundIndicator() { ... }

// 显示结果
function showResult(resultData) {
  const { figure, roundsPlayed, result, resultMessage } = resultData.data;

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
  document.getElementById('figure-summary').textContent = figure.summary;

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
  document.getElementById('figure-biography').textContent = figure.biography;

  // 趣味冷知识
  document.getElementById('figure-funfact').textContent = figure.funFact;
}

// 揭晓答案
async function revealAnswer() { ... }

// 重新开始
function resetGame() { ... }
```

#### 错误处理

```javascript
// 统一的 API 错误处理
async function handleApiError(response, fallbackMessage) {
  const error = await response.json().catch(() => null);
  const message = error?.error?.message || fallbackMessage;

  switch (error?.error?.code) {
    case 'COOLDOWN_ACTIVE':
      showCooldownTimer(error.error.message);
      break;
    case 'SESSION_EXPIRED':
      alert('游戏会话已过期，请重新开始');
      resetGame();
      break;
    case 'GAME_OVER':
      alert('本局游戏已结束，请开启新游戏');
      break;
    default:
      alert(message);
  }
}
```

---

## 8. 后端设计

### 8.1 模块划分

```
server/
├── index.js                  # Express 应用入口
├── config/
│   └── claude.js             # Claude API 配置
├── routes/
│   └── game.js               # 游戏路由 (/api/game/*)
├── state/
│   └── session-manager.js    # 会话管理器
└── services/
    └── claude-service.js     # AI API 封装服务
```

### 8.2 入口文件

**文件位置**：`server/index.js`

```javascript
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const gameRoutes = require('./routes/game');
const { SessionManager } = require('./state/session-manager');

const app = express();
const PORT = process.env.PORT || 3000;

// 会话管理器单例
const sessionManager = new SessionManager();

// 中间件
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// IP 级别速率限制：10 请求/分钟
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 分钟
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试' }
  }
});
app.use('/api/', apiLimiter);

// 路由
app.use('/api/game', gameRoutes(sessionManager));

// 健康检查
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', sessions: sessionManager.size });
});

// 启动
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log(`会话管理器已启动，清理间隔 5 分钟`);
});
```

### 8.3 Agnes API 配置

**文件位置**：`server/config/claude.js`（文件名保留 `claude.js`，后续可按需重命名为 `ai.js`）

> **开发阶段使用免费 Agnes API**：模型名称 `agnes-2.0-flash`，URL `https://apihub.agnes-ai.com/v1`
>
> **商用阶段**：可无缝切换至 Anthropic Claude（OpenAI 兼容协议下 SDK 改动极小），届时配置付费 API Key。

```javascript
const { Anthropic } = require('@anthropic-ai/sdk');
// 或使用 OpenAI 兼容 SDK（Agnes 支持 OpenAI 协议）
// const OpenAI = require('openai');

// ============================================================
// 开发环境：Agnes 免费 API
// ============================================================
const AGNES_BASE_URL = 'https://apihub.agnes-ai.com/v1';
const AGNES_MODEL = 'agnes-2.0-flash';

// ============================================================
// 商用环境（切换注释）：Anthropic Claude
// ============================================================
// const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
// const CLAUDE_MODEL = 'claude-sonnet-4-20250514';

// ============================================================
// 当前激活配置（开发 = Agnes，商用 = 切换注释）
// ============================================================
const API_CONFIG = {
  // --- 开发模式 (Agnes) ---
  BASE_URL: AGNES_BASE_URL,
  MODEL: AGNES_MODEL,
  API_KEY: process.env.AGNES_API_KEY || '', // Agnes 免费 API 如有密钥需求

  // --- 商用模式 (Claude) ---
  // BASE_URL: undefined,  // Anthropic 无自定义 URL
  // MODEL: CLAUDE_MODEL,
  // API_KEY: CLAUDE_API_KEY,

  // 判断问题模型（需要较强推理能力）
  JUDGE_TEMPERATURE: 0.3,
  JUDGE_MAX_TOKENS: 1024,

  // 选择人物模型
  PICK_TEMPERATURE: 0.7,
  PICK_MAX_TOKENS: 512,

  // 生成简介模型
  SUMMARIZE_TEMPERATURE: 0.5,
  SUMMARIZE_MAX_TOKENS: 1024,

  // 消息历史保留条数
  MAX_MESSAGES: 15,

  // API 超时 (ms)
  TIMEOUT_MS: 30000,
};

// 创建 SDK 客户端（根据当前配置选择）
// 方案 A：使用 OpenAI 兼容 SDK（推荐，Agnes 原生支持）
const OpenAI = require('openai');
const aiClient = new OpenAI({
  baseURL: API_CONFIG.BASE_URL,
  apiKey: API_CONFIG.API_KEY,
  // 以下字段在商用切换到 Claude 时无需修改
});

// 方案 B（备用）：使用 Anthropic SDK
// const anthropic = new Anthropic({
//   apiKey: API_CONFIG.API_KEY,
//   baseURL: API_CONFIG.BASE_URL, // Agnes 兼容此参数
// });

module.exports = { aiClient, API_CONFIG };
```

### 8.4 AI 服务

**文件位置**：`server/services/claude-service.js`（文件名可按需重命名为 `ai-service.js`）

> 使用 OpenAI 兼容协议调用 Agnes API，SDK 接口与 OpenAI 一致，后续切换到 Claude 只需改配置。

```javascript
const { aiClient, API_CONFIG } = require('../config/claude');

class AIService {
  /**
   * 选择秘密人物
   */
  async pickFigure() {
    const response = await aiClient.chat.completions.create({
      model: API_CONFIG.MODEL,
      temperature: API_CONFIG.PICK_TEMPERATURE,
      max_tokens: API_CONFIG.PICK_MAX_TOKENS,
      messages: [
        { role: 'system', content: SELECT_FIGURE_PROMPT },
        { role: 'user', content: '请为一个猜谜游戏选择一位历史人物。' },
      ],
    });

    const text = response.choices[0]?.message?.content;
    return JSON.parse(text);
  }

  /**
   * 判断问题
   */
  async judgeQuestion(secretFigure, messageHistory) {
    const systemPrompt = this.buildJudgeSystemPrompt(secretFigure);
    const messages = this.buildJudgeMessages(messageHistory);

    const response = await aiClient.chat.completions.create({
      model: API_CONFIG.MODEL,
      temperature: API_CONFIG.JUDGE_TEMPERATURE,
      max_tokens: API_CONFIG.JUDGE_MAX_TOKENS,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    });

    const text = response.choices[0]?.message?.content;
    return JSON.parse(text);
  }

  /**
   * 揭示答案并生成简介
   */
  async revealAnswer(secretFigure) {
    const response = await aiClient.chat.completions.create({
      model: API_CONFIG.MODEL,
      temperature: API_CONFIG.SUMMARIZE_TEMPERATURE,
      max_tokens: API_CONFIG.SUMMARIZE_MAX_TOKENS,
      messages: [
        { role: 'system', content: REVEAL_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `请为以下历史人物写一段简介：${JSON.stringify(secretFigure)}`
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    return JSON.parse(text);
  }

  buildJudgeSystemPrompt(secretFigure) {
    return JUDGE_QUESTION_PROMPT.replace('{secret_figure_json}', JSON.stringify(secretFigure, null, 2));
  }

  buildJudgeMessages(messageHistory) {
    const recent = messageHistory.slice(-API_CONFIG.MAX_MESSAGES);
    return recent.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));
  }
}

// Prompt 模板导入（见 6.2）
const SELECT_FIGURE_PROMPT = require('../prompts/select-figure');
const JUDGE_QUESTION_PROMPT = require('../prompts/judge-question');
const REVEAL_SYSTEM_PROMPT = require('../prompts/reveal');

module.exports = { AIService };
```

### 8.5 路由设计

**文件位置**：`server/routes/game.js`

```javascript
const express = require('express');
const { AIService } = require('../services/claude-service');
const { generateSessionId } = require('../utils/helpers');

const COOLDOWN_MS = 2000;  // 2 秒冷却

function gameRoutes(sessionManager) {
  const router = express.Router();
  const aiService = new AIService();

  /**
   * POST /api/game/start
   * 开始新游戏
   */
  router.post('/start', async (req, res) => {
    try {
      // 1. 选择秘密人物
      const secretFigure = await aiService.pickFigure();

      // 2. 创建会话
      const sessionId = generateSessionId();
      sessionManager.create(sessionId, secretFigure);

      // 3. 返回
      res.json({
        success: true,
        data: {
          sessionId,
          maxRounds: 20,
          message: '游戏已开始！你可以开始提问了。'
        }
      });
    } catch (error) {
      console.error('[START ERROR]', error);
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 服务暂时不可用，请稍后重试'
        }
      });
    }
  });

  /**
   * POST /api/game/question
   * 提交问题
   */
  router.post('/question', async (req, res) => {
    try {
      const { sessionId, question } = req.body;

      // 参数校验
      if (!sessionId || !question || typeof question !== 'string') {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: '参数不完整' }
        });
      }

      const trimmed = question.trim();
      if (trimmed.length === 0 || trimmed.length > 200) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: '问题不能为空，且不超过200字' }
        });
      }

      // 获取会话
      const session = sessionManager.get(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' }
        });
      }

      if (session.isExpired()) {
        return res.status(404).json({
          success: false,
          error: { code: 'SESSION_EXPIRED', message: '会话已过期' }
        });
      }

      if (session.status === 'ended') {
        return res.status(410).json({
          success: false,
          error: { code: 'GAME_OVER', message: '本局游戏已结束' }
        });
      }

      // 冷却检查
      const lastQuestionTime = session.lastQuestionAt?.getTime() || 0;
      if (Date.now() - lastQuestionTime < COOLDOWN_MS) {
        return res.status(400).json({
          success: false,
          error: { code: 'COOLDOWN_ACTIVE', message: '请稍候再提问' }
        });
      }

      // 调用 Claude 判断
      const judgment = await aiService.judgeQuestion(
        session.secretFigure,
        session.messages
      );

      // 追加用户消息到历史
      session.appendMessage({
        role: 'user',
        content: trimmed,
        timestamp: new Date()
      });

      // 更新会话状态
      session.advanceRound();
      session.lastQuestionAt = new Date();
      session.touch();

      // 处理 Claude 的判决结果
      let gameStatus = 'playing';
      if (judgment.correctGuess) {
        gameStatus = 'won';
        session.endGame('won');
      } else if (judgment.gameStatus === 'lost') {
        gameStatus = 'lost';
        session.endGame('lost');
      }

      // 构造 AI 回复消息
      const aiReply = judgment.answer === '是' ? '是。'
        : judgment.answer === '不是' ? '不是。'
        : '不确定。';

      session.appendMessage({
        role: 'assistant',
        content: `${aiReply} ${judgment.reason}`,
        timestamp: new Date()
      });

      res.json({
        success: true,
        data: {
          answer: judgment.answer,
          reason: judgment.reason,
          round: session.currentRound,
          remainingRounds: 20 - session.currentRound,
          status: gameStatus,
          figureGuessed: judgment.isGuess || false
        }
      });

    } catch (error) {
      console.error('[QUESTION ERROR]', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 服务暂时不可用，请稍后重试'
        }
      });
    }
  });

  /**
   * POST /api/game/reveal
   * 揭晓答案
   */
  router.post('/reveal', async (req, res) => {
    try {
      const { sessionId } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: { code: 'INVALID_INPUT', message: '缺少 sessionId' }
        });
      }

      const session = sessionManager.get(sessionId);
      if (!session) {
        return res.status(404).json({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' }
        });
      }

      if (session.isExpired()) {
        return res.status(404).json({
          success: false,
          error: { code: 'SESSION_EXPIRED', message: '会话已过期' }
        });
      }

      if (session.status === 'ended') {
        // 游戏已结束，直接返回已存储的结果
        return res.json({
          success: true,
          data: session.resultData || { /* 默认值 */ }
        });
      }

      // 调用 AI 生成详细简介（画像、生平、成就）
      const figureInfo = await aiService.revealAnswer(session.secretFigure);

      // 确定结果
      const result = session.currentRound >= 20 ? 'lost' : 'revealed';
      session.endGame(result);

      res.json({
        success: true,
        data: {
          figure: {
            name: figureInfo.name,
            dynasty: figureInfo.dynasty,
            lived: figureInfo.lived,
            portraitUrl: figureInfo.portraitUrl,
            summary: figureInfo.summary,
            biography: figureInfo.biography,
            achievements: figureInfo.achievements,
            funFact: figureInfo.funFact
          },
          roundsPlayed: session.currentRound,
          result: result,
          resultMessage: figureInfo.resultMessage
        }
      });

    } catch (error) {
      console.error('[REVEAL ERROR]', error);
      res.status(500).json({
        success: false,
        error: {
          code: 'AI_SERVICE_ERROR',
          message: 'AI 服务暂时不可用'
        }
      });
    }
  });

  /**
   * POST /api/game/end
   * 主动结束游戏
   */
  router.post('/end', async (req, res) => {
    try {
      const { sessionId } = req.body;
      const session = sessionManager.get(sessionId);

      if (!session) {
        return res.status(404).json({
          success: false,
          error: { code: 'SESSION_NOT_FOUND', message: '会话不存在' }
        });
      }

      session.endGame('abandoned');
      session.destroy();

      res.json({
        success: true,
        data: { message: '游戏已结束，感谢您的参与！' }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: {
          code: 'UNKNOWN_ERROR',
          message: '结束游戏时发生错误'
        }
      });
    }
  });

  return router;
}

module.exports = gameRoutes;
```

### 8.6 工具函数

**文件位置**：`server/utils/helpers.js`

```javascript
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
```

---

## 9. 安全性考虑

### 9.1 API 密钥保护

| 风险 | 措施 |
|------|------|
| 密钥泄露 | 存储在 `.env` 文件中，不提交到版本控制（`.gitignore` 已排除） |
| 前端访问 | 所有 Claude API 调用在后端完成，密钥不暴露给客户端 |
| 环境变量 | 生产环境通过部署平台注入环境变量，不使用 `.env` 文件 |

### 9.2 秘密人物保护

| 风险 | 措施 |
|------|------|
| 客户端篡改 | 秘密人物信息存储在服务端内存中，不通过 API 返回给客户端 |
| XSS 攻击 | 用户输入在渲染时进行 HTML 转义（使用 textContent 而非 innerHTML） |
| 消息历史泄露 | 发送给 Claude 的消息历史中，秘密人物信息通过 system prompt 传递，不在 messages 数组中 |

### 9.3 速率限制

| 层级 | 限制 | 目的 |
|------|------|------|
| IP 级别 | 10 请求/分钟 | 防止滥用，控制 API 成本 |
| 会话级别 | 2 秒冷却 | 防止同一玩家连续快速提问 |
| 全局并发 | Node.js 事件循环天然限制 | 不会因并发请求导致崩溃 |

### 9.4 输入验证

```javascript
// 服务端对所有输入做校验
function validateQuestion(input) {
  if (typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed.length === 0 || trimmed.length > 200) return false;
  return true;
}
```

### 9.5 其他安全措施

- **CORS**：开发环境允许所有来源，生产环境限制为特定域名
- **Content-Security-Policy**：添加基础 CSP 头，限制脚本来源
- **X-Frame-Options**：设置为 DENY，防止点击劫持
- **错误信息脱敏**：生产环境中不暴露堆栈跟踪和内部细节

---

## 10. 开发计划

### 10.1 阶段划分

| 阶段 | 名称 | 工期 | 优先级 | 交付物 |
|------|------|------|--------|--------|
| P1 | 基础骨架 | 1天 | 最高 | 可运行的空壳应用 |
| P2 | 核心游戏逻辑 | 2天 | 最高 | 完整的 20 Questions 流程 |
| P3 | Prompt 调优 | 2天 | 高 | 稳定的 AI 判断质量 |
| P4 | 前端 UI 完善 | 1天 | 高 | 完整的古风界面 |
| P5 | 健壮性与优化 | 1天 | 中 | 错误处理、性能优化 |
| P6 | 测试与部署 | 1天 | 中 | 可上线的版本 |

### 10.2 详细任务清单

#### 阶段 P1：基础骨架（第 1 天）

| 序号 | 任务 | 文件 | 说明 |
|------|------|------|------|
| 1.1 | 初始化项目 | `package.json` | `npm init -y`，安装依赖 |
| 1.2 | 创建目录结构 | 全部 | 按本文档第 0 节创建文件夹 |
| 1.3 | 配置 Express 服务器 | `server/index.js` | 静态文件服务、中间件 |
| 1.4 | 创建空白路由 | `server/routes/game.js` | 三个接口的空实现 |
| 1.5 | 创建基础前端页面 | `public/index.html` | 三个界面的 HTML 骨架 |
| 1.6 | 验证启动 | - | `npm start` 能访问首页和 API |

#### 阶段 P2：核心游戏逻辑（第 2-3 天）

| 序号 | 任务 | 文件 | 说明 |
|------|------|------|------|
| 2.1 | 实现 SessionManager | `server/state/session-manager.js` | 会话 CRUD、过期清理 |
| 2.2 | 实现 AIService | `server/services/claude-service.js` | 三个 API 调用方法 |
| 2.3 | 编写 Prompt 模板 | `server/prompts/` | 4 个场景的完整 Prompt |
| 2.4 | 实现 /start 路由 | `server/routes/game.js` | 调用 pickFigure |
| 2.5 | 实现 /question 路由 | `server/routes/game.js` | 调用 judgeQuestion |
| 2.6 | 实现 /reveal 路由 | `server/routes/game.js` | 调用 revealAnswer |
| 2.7 | 实现客户端 game.js | `public/js/game.js` | 状态管理、API 调用 |
| 2.8 | 联调测试 | - | 完成一轮完整游戏流程 |

#### 阶段 P3：Prompt 调优（第 4-5 天）

| 序号 | 任务 | 说明 |
|------|------|------|
| 3.1 | 测试人物选择质量 | 运行 50+ 次，评估人物多样性、难度分布 |
| 3.2 | 调整判断 Prompt | 针对"不确定"过多/过少的问题微调 |
| 3.3 | 处理边界情况 | 模糊问题、代词消解、历史争议 |
| 3.4 | 优化 JSON 输出稳定性 | 确保 Claude 始终返回合法 JSON |
| 3.5 | 调整温度参数 | pickFigure(0.7) → judge(0.3) → reveal(0.5) |

#### 阶段 P4：前端 UI 完善（第 6 天）

| 序号 | 任务 | 文件 | 说明 |
|------|------|------|------|
| 4.1 | 编写 ancient.css | `public/css/ancient.css` | 古风样式完整实现 |
| 4.2 | 消息动画 | `public/css/ancient.css` | 气泡出现动画 |
| 4.3 | 加载状态 | `public/js/game.js` | 旋转毛笔图标、禁用态 |
| 4.4 | 轮次指示器 | `public/js/game.js` | 竹简式 UI |
| 4.5 | 响应式适配 | `public/css/ancient.css` | 手机/平板/桌面三档 |
| 4.6 | 结果页美化 | `public/index.html` | 胜利/失败不同样式 |

#### 阶段 P5：健壮性与优化（第 7 天）

| 序号 | 任务 | 说明 |
|------|------|------|
| 5.1 | 超时处理 | Claude API 超时 30 秒，友好提示 |
| 5.2 | 重试机制 | API 失败后自动重试 1 次 |
| 5.3 | 内存泄漏检查 | 确保会话正确清理 |
| 5.4 | 日志系统 | 结构化日志（请求 ID、耗时） |
| 5.5 | 性能测试 | 模拟多用户并发 |

#### 阶段 P6：测试与部署（第 8 天）

| 序号 | 任务 | 说明 |
|------|------|------|
| 6.1 | 端到端测试 | 手动完成 10+ 局完整游戏 |
| 6.2 | 自动化测试 | 编写路由单元测试 |
| 6.3 | 环境变量配置 | `.env.example` 模板 |
| 6.4 | Docker 化（可选） | `Dockerfile` + `docker-compose.yml` |
| 6.5 | 部署文档 | `README.md` 中的部署章节 |

### 10.3 依赖清单

```json
{
  "dependencies": {
    "openai": "^4.79.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.7",
    "express": "^4.21.2",
    "express-rate-limit": "^7.5.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^7.0.0"
  },
  "scripts": {
    "start": "node server/index.js",
    "dev": "node --watch server/index.js",
    "test": "jest"
  }
}
```

---

## 11. 测试策略

### 11.1 测试层次

```
┌─────────────────────────────────────────┐
│           E2E 测试（手动）                │
│  完整游戏流程 × 10 局                    │
│  不同人物类型 × 10 局（政治家/文学家等）   │
│  各种提问方式 × 10 局（是非题/猜测/模糊）  │
├─────────────────────────────────────────┤
│           集成测试（supertest）           │
│  API 路由正确性                          │
│  错误码返回                              │
│  会话生命周期                            │
├─────────────────────────────────────────┤
│           单元测试                        │
│  SessionManager CRUD                     │
│  isGuessInput 正则匹配                   │
│  消息截断逻辑                            │
└─────────────────────────────────────────┘
```

### 11.2 关键测试用例

#### 11.2.1 会话管理测试

```javascript
// test/session-manager.test.js
describe('SessionManager', () => {
  test('创建会话后应能被获取', () => { ... });
  test('过期会话应被 cleanup 清除', () => { ... });
  test('消息历史超过 15 条时应截断', () => { ... });
  test('同一 sessionId 不应被重复创建', () => { ... });
});
```

#### 11.2.2 API 路由测试

```javascript
// test/routes.test.js
describe('POST /api/game/start', () => {
  test('应返回有效的 sessionId', () => { ... });
  test('应返回 200 状态码', () => { ... });
});

describe('POST /api/game/question', () => {
  test('空问题应返回 400', () => { ... });
  test('超长问题应返回 400', () => { ... });
  test('无效 sessionId 应返回 404', () => { ... });
  test('已结束的游戏应返回 410', () => { ... });
  test('正常问题应返回是/不是/不确定', () => { ... });
});
```

#### 11.2.3 Prompt 质量测试矩阵

| 人物类别 | 测试问题示例 | 预期回答 |
|---------|------------|---------|
| 政治家 | "他是皇帝吗？" | 是/不是（取决于人物） |
| 文学家 | "他的作品流传至今吗？" | 是 |
| 军事家 | "他打过仗吗？" | 是 |
| 女性人物 | "她是女性吗？" | 是 |
| 外国人物 | "他来自中国吗？" | 不是 |

**评判标准**：
- 答案准确性：与人物真实属性一致
- 回答一致性：相同问题在不同轮次得到相同答案
- "不确定"使用率：不应超过 10%（过高说明 Prompt 不够具体）
- JSON 解析成功率：应接近 100%

### 11.3 人工测试 checklist

完成开发后，按以下清单手动测试：

- [ ] 能顺利完成一局完整游戏（20轮用完）
- [ ] 能在少于 20 轮时猜中人物
- [ ] 能中途使用"揭晓答案"功能
- [ ] 能"再来一局"，且人物发生变化
- [ ] 输入空问题时有提示
- [ ] 输入超长问题时被截断或拒绝
- [ ] 快速连续提问时，冷却期生效
- [ ] 手机浏览器上界面正常显示
- [ ] 网络断开时显示友好错误提示
- [ ] 刷新页面后游戏状态正确处理

---

## 12. 部署方案

### 12.1 本地开发

```bash
# 1. 克隆/下载代码
cd D:\project\claude_jobs\human

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 ANTHROPIC_API_KEY

# 4. 启动开发服务器
npm run dev

# 5. 访问
# http://localhost:3000
```

### 12.2 生产环境推荐方案

#### 方案 A：Vercel / Railway（推荐，最简单）

```
优点：零运维、自动 HTTPS、免费额度充足
缺点：冷启动延迟（约 5 秒）
```

**Vercel 部署步骤**：

```json
// vercel.json
{
  "version": 2,
  "builds": [
    { "src": "server/index.js", "use": "@vercel/node" }
  ],
  "routes": [
    { "src": "/api/(.*)", "dest": "/server/index.js" },
    { "src": "/(.*)", "dest": "/public/$1" }
  ]
}
```

**Railway 部署步骤**：

```yaml
# railway.toml
[build]
builder = "NIXPACKS"

[deploy]
startCommand = "node server/index.js"
```

#### 方案 B：Docker + 云服务器

```dockerfile
# Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY server/ server/
COPY public/ public/

EXPOSE 3000
CMD ["node", "server/index.js"]
```

```bash
# 构建镜像
docker build -t history-guess-game .

# 运行容器
docker run -d \
  --name history-guess \
  -p 3000:3000 \
  -e AGNES_API_KEY= \
  -e AGNES_BASE_URL=https://apihub.agnes-ai.com/v1 \
  -e PORT=3000 \
  history-guess-game
```

#### 方案 C：PM2 进程管理（长期运行）

```bash
# 安装 PM2
npm install -g pm2

# 启动
pm2 start server/index.js --name history-guess

# 开机自启
pm2 startup
pm2 save
```

### 12.3 环境变量模板

**文件位置**：`.env.example`

```env
# ============================================
# 开发环境：Agnes 免费 API
# ============================================
# Agnes API 密钥（如免费 API 不需要密钥可留空）
AGNES_API_KEY=

# Agnes API 地址
AGNES_BASE_URL=https://apihub.agnes-ai.com/v1

# ============================================
# 商用环境（切换注释）：Anthropic Claude
# ============================================
# CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxx

# ============================================
# 通用配置
# ============================================

# 服务器端口
PORT=3000

# 允许的 CORS 来源（生产环境填写你的域名）
CORS_ORIGIN=https://yourdomain.com

# 会话过期时间（毫秒），默认 30 分钟
SESSION_TIMEOUT_MS=1800000

# 清理间隔（毫秒），默认 5 分钟
CLEANUP_INTERVAL_MS=300000
```

### 12.4 监控与告警

| 指标 | 采集方式 | 阈值 |
|------|---------|------|
| AI 调用成功率 | 服务端日志 | < 95% 告警 |
| 平均响应时间 | 中间件计时 | > 5 秒告警 |
| 活跃会话数 | SessionManager 统计 | > 100 告警 |
| API 费用 | Agnes 控制台 / Anthropic 控制台 | 月度预算限制 |

### 12.5 扩展性考虑

当前设计为单实例内存存储。如果需要水平扩展：

1. **会话存储迁移**：将 `SessionManager` 的内存 Map 替换为 Redis
2. **API 密钥管理**：使用 Vault 或云服务商的密钥管理服务
3. **AI 模型降级**：高峰期自动降级到轻量模型降低成本
4. **CDN 加速**：将 `public/` 静态资源托管到 CDN

---

## 附录 A：文件路径总览

```
D:\project\claude_jobs\human/
├── .env.example                    # 环境变量模板
├── .gitignore                      # git 忽略规则（含 .env）
├── package.json                    # 项目依赖与脚本
├── server/
│   ├── index.js                    # Express 入口
│   ├── config/
│   │   └── claude.js               # Claude SDK 配置
│   ├── routes/
│   │   └── game.js                 # 游戏 API 路由
│   ├── state/
│   │   └── session-manager.js      # 会话管理器
│   ├── services/
│   │   └── claude-service.js       # AI API 封装（实际调用 Agnes）
│   ├── prompts/
│   │   ├── select-figure.js        # 人物选择 Prompt
│   │   ├── judge-question.js       # 问题判断 Prompt
│   │   └── reveal.js               # 揭示答案 Prompt
│   └── utils/
│       └── helpers.js              # 工具函数
├── public/
│   ├── index.html                  # 主页面
│   ├── css/
│   │   └── ancient.css             # 古风样式
│   └── js/
│       └── game.js                 # 客户端逻辑
└── test/
    ├── session-manager.test.js     # 会话管理测试
    └── routes.test.js              # API 路由测试
```

## 附录 B：.gitignore

```
.env
node_modules/
*.log
.DS_Store
coverage/
```

## 附录 C：关键风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| AI API 不稳定 | 游戏无法进行 | 超时重试 1 次；失败时显示友好提示 |
| API 费用超支 | 成本失控 | IP 限速 10 次/分钟；消息历史截断 15 条 |
| AI 判断不一致 | 体验差 | temperature 0.3 降低随机性；同一会话内秘密人物不变 |
| 人物过于简单或困难 | 趣味性差 | 在 Prompt 中给出难度评估要求；人工测试时筛选 |
| 内存泄漏 | 服务崩溃 | 定时清理过期会话；PM2 监控内存使用 |
| 并发冲突 | 数据错乱 | Node.js 单线程天然避免；如多实例需 Redis |

---

*文档版本：1.0*
*创建日期：2026-06-30*
*状态：待评审*
