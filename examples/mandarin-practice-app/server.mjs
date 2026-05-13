import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.MANDARIN_APP_PORT || 3101);
const publicUrl = (process.env.MANDARIN_APP_PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, '');
const platformUrl = (process.env.PLATFORM_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const appId = process.env.MANDARIN_APP_ID || 'mandarin-practice-app';
const appSecret = process.env.MANDARIN_APP_SECRET || 'mandarin-practice-secret';
const agentName = process.env.MANDARIN_AGENT_NAME || '普通话练习智能体';
const dbPath = process.env.MANDARIN_APP_DB_PATH || path.join(appRoot, 'data', 'mandarin-practice-db.json');
const sessionCookie = 'mandarin_practice_session';

const exercises = [
  {
    id: 'tone-four',
    title: '四声稳定练习',
    phrase: '四是四，十是十',
    pinyin: 'si shi si, shi shi shi',
    focus: '区分翘舌音和第四声，保持收束干净。',
    prompt: '这一组主要训练“四”和“十”的声调与舌位。',
    options: ['一声', '二声', '三声', '四声'],
    correct: '四声',
  },
  {
    id: 'retroflex',
    title: '翘舌音练习',
    phrase: '出租车司机驶出城市',
    pinyin: 'chu zu che si ji shi chu cheng shi',
    focus: '训练 ch、sh、zh 与平舌音的区别。',
    prompt: '读的时候不要把“出、驶、城”读成平舌。',
    options: ['平舌为主', '翘舌为主', '轻声为主', '儿化为主'],
    correct: '翘舌为主',
  },
  {
    id: 'nasal',
    title: '前后鼻音练习',
    phrase: '青青山岭映清泉',
    pinyin: 'qing qing shan ling ying qing quan',
    focus: '训练 in/ing、en/eng 的收音位置。',
    prompt: '注意“青、岭、映、清”的后鼻音稳定度。',
    options: ['前鼻音', '后鼻音', '轻声', '变调'],
    correct: '后鼻音',
  },
  {
    id: 'third-tone',
    title: '三声连读练习',
    phrase: '你好，可以给我一把雨伞吗',
    pinyin: 'ni hao, ke yi gei wo yi ba yu san ma',
    focus: '训练三声连读中的自然变调。',
    prompt: '不要机械读满每个三声，注意口语中的自然起伏。',
    options: ['一声连读', '二声连读', '三声变调', '四声收束'],
    correct: '三声变调',
  },
];

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', publicUrl);

    if (request.method === 'GET' && url.pathname === '/') {
      const session = await getSession(request);
      return session ? redirect(response, '/dashboard') : sendHtml(response, homePage());
    }

    if (request.method === 'GET' && url.pathname === '/register') {
      return sendHtml(response, authPage('注册普通话练习账号', '/register', '创建账号', undefined, 'register'));
    }

    if (request.method === 'POST' && url.pathname === '/register') {
      return handleRegister(request, response);
    }

    if (request.method === 'GET' && url.pathname === '/login') {
      return sendHtml(response, authPage('登录普通话练习', '/login', '登录', undefined, 'login'));
    }

    if (request.method === 'POST' && url.pathname === '/login') {
      return handleLogin(request, response);
    }

    if (request.method === 'POST' && url.pathname === '/logout') {
      return handleLogout(request, response);
    }

    if (request.method === 'POST' && url.pathname === '/sync') {
      const session = await requireSession(request, response);
      if (!session) return;
      const db = await readDb();
      const user = db.users.find((item) => item.id === session.userId);
      if (!user) return redirect(response, '/login');
      await syncAndStorePlatformUser(db, user);
      await writeDb(db);
      return redirect(response, '/dashboard');
    }

    if (request.method === 'GET' && url.pathname === '/dashboard') {
      const session = await requireSession(request, response);
      if (!session) return;
      const db = await readDb();
      const user = db.users.find((item) => item.id === session.userId);
      if (!user) return redirect(response, '/login');
      return sendHtml(response, dashboardPage(user, db.attempts.filter((item) => item.userId === user.id)));
    }

    if (request.method === 'GET' && url.pathname === '/practice') {
      const session = await requireSession(request, response);
      if (!session) return;
      const db = await readDb();
      const user = db.users.find((item) => item.id === session.userId);
      if (!user) return redirect(response, '/login');
      const exercise = exercises.find((item) => item.id === url.searchParams.get('exercise')) || exercises[0];
      return sendHtml(response, practicePage(user, exercise));
    }

    if (request.method === 'POST' && url.pathname === '/practice/submit') {
      return handlePracticeSubmit(request, response);
    }

    if (request.method === 'GET' && url.pathname === '/practice/result') {
      const session = await requireSession(request, response);
      if (!session) return;
      const db = await readDb();
      const attempt = db.attempts.find((item) => item.id === url.searchParams.get('id') && item.userId === session.userId);
      if (!attempt) return redirect(response, '/records');
      return sendHtml(response, resultPage(attempt));
    }

    if (request.method === 'GET' && url.pathname === '/records') {
      const session = await requireSession(request, response);
      if (!session) return;
      const db = await readDb();
      const user = db.users.find((item) => item.id === session.userId);
      if (!user) return redirect(response, '/login');
      return sendHtml(response, recordsPage(user, db.attempts.filter((item) => item.userId === user.id)));
    }

    return sendHtml(response, page('未找到页面', '<main><h1>404</h1><p>页面不存在。</p></main>'), 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return sendHtml(response, authPage('服务错误', '/login', '返回登录', message, 'login'), 500);
  }
});

server.listen(port, () => {
  console.log(`Mandarin practice app listening on ${publicUrl}`);
  console.log(`Platform URL: ${platformUrl}`);
  console.log(`Local DB: ${dbPath}`);
});

async function handleRegister(request, response) {
  const body = await readForm(request);
  const email = normalizeEmail(body.get('email'));
  const displayName = String(body.get('displayName') || '').trim();
  const ageBand = String(body.get('ageBand') || '').trim();
  const password = String(body.get('password') || '');

  if (!email || !displayName || !ageBand || password.length < 8) {
    return sendHtml(response, authPage('注册普通话练习账号', '/register', '创建账号', '请填写有效邮箱、显示名称、年龄段和至少 8 位密码。', 'register'), 400);
  }

  const db = await readDb();
  if (db.users.some((user) => user.email === email)) {
    return sendHtml(response, authPage('注册普通话练习账号', '/register', '创建账号', '这个邮箱已经注册，请直接登录。', 'register'), 409);
  }

  const now = new Date().toISOString();
  const user = {
    id: `mandarin_${crypto.randomUUID()}`,
    email,
    displayName,
    ageBand,
    passwordHash: await hashPassword(password),
    platformUserId: null,
    platformContext: null,
    createdAt: now,
    updatedAt: now,
    lastPlatformSyncAt: null,
  };

  db.users.push(user);
  await syncAndStorePlatformUser(db, user);
  const session = createSession(db, user.id);
  await writeDb(db);
  setCookie(response, sessionCookie, session.id, 60 * 60 * 24 * 7);
  return redirect(response, '/dashboard');
}

async function handleLogin(request, response) {
  const body = await readForm(request);
  const email = normalizeEmail(body.get('email'));
  const password = String(body.get('password') || '');
  const db = await readDb();
  const user = db.users.find((item) => item.email === email);

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return sendHtml(response, authPage('登录普通话练习', '/login', '登录', '邮箱或密码错误。', 'login'), 401);
  }

  await syncAndStorePlatformUser(db, user);
  const session = createSession(db, user.id);
  await writeDb(db);
  setCookie(response, sessionCookie, session.id, 60 * 60 * 24 * 7);
  return redirect(response, '/dashboard');
}

async function handleLogout(request, response) {
  const sessionId = readCookie(request, sessionCookie);
  if (sessionId) {
    const db = await readDb();
    db.sessions = db.sessions.filter((session) => session.id !== sessionId);
    await writeDb(db);
  }
  clearCookie(response, sessionCookie);
  return redirect(response, '/');
}

async function handlePracticeSubmit(request, response) {
  const session = await requireSession(request, response);
  if (!session) return;

  const body = await readForm(request);
  const exercise = exercises.find((item) => item.id === body.get('exerciseId')) || exercises[0];
  const selectedAnswer = String(body.get('selectedAnswer') || '');
  const selfScore = Math.max(1, Math.min(5, Number(body.get('selfScore') || 3)));
  const note = String(body.get('note') || '').trim();
  const correct = selectedAnswer === exercise.correct;
  const score = Math.min(100, (correct ? 68 : 38) + selfScore * 6);
  const db = await readDb();
  const user = db.users.find((item) => item.id === session.userId);
  if (!user) return redirect(response, '/login');

  const attempt = {
    id: `attempt_${crypto.randomUUID()}`,
    userId: user.id,
    platformUserId: user.platformUserId,
    exerciseId: exercise.id,
    title: exercise.title,
    phrase: exercise.phrase,
    selectedAnswer,
    correctAnswer: exercise.correct,
    selfScore,
    correct,
    score,
    note,
    createdAt: new Date().toISOString(),
  };

  db.attempts.push(attempt);
  await writeDb(db);
  return redirect(response, `/practice/result?id=${encodeURIComponent(attempt.id)}`);
}

async function syncAndStorePlatformUser(db, user) {
  const syncResult = await syncPlatformUser(user);
  const context = await fetchPlatformUserContext(user.email);
  user.platformUserId = syncResult.platformUserId;
  user.platformContext = context;
  user.updatedAt = new Date().toISOString();
  user.lastPlatformSyncAt = user.updatedAt;
  return user;
}

async function syncPlatformUser(user) {
  const response = await fetch(`${platformUrl}/api/v1/app-auth/users/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-App-Id': appId,
      'X-App-Secret': appSecret,
    },
    body: JSON.stringify({
      email: user.email,
      externalUserId: user.id,
      username: user.email.split('@')[0],
      displayName: user.displayName,
      ageBand: user.ageBand,
      agentName,
      emailVerified: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`同步到底座失败：${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function fetchPlatformUserContext(email) {
  const url = new URL('/api/v1/app-auth/users/by-email', platformUrl);
  url.searchParams.set('email', email);
  const response = await fetch(url, {
    headers: {
      'X-App-Id': appId,
      'X-App-Secret': appSecret,
    },
  });

  if (!response.ok) {
    throw new Error(`查询底座用户失败：${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function readDb() {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  try {
    const content = await fs.readFile(dbPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return { users: [], sessions: [], attempts: [] };
    }
    throw error;
  }
}

async function writeDb(db) {
  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.writeFile(dbPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
}

function createSession(db, userId) {
  const session = {
    id: `session_${crypto.randomUUID()}`,
    userId,
    createdAt: new Date().toISOString(),
  };
  db.sessions.push(session);
  return session;
}

async function getSession(request) {
  const sessionId = readCookie(request, sessionCookie);
  if (!sessionId) return undefined;
  const db = await readDb();
  return db.sessions.find((session) => session.id === sessionId);
}

async function requireSession(request, response) {
  const session = await getSession(request);
  if (!session) {
    redirect(response, '/login');
    return undefined;
  }
  return session;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = await pbkdf2(password, salt);
  return `pbkdf2$${salt}$${hash}`;
}

async function verifyPassword(password, storedHash) {
  const [method, salt, hash] = String(storedHash).split('$');
  if (method !== 'pbkdf2' || !salt || !hash) return false;
  const nextHash = await pbkdf2(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(nextHash, 'hex'));
}

function pbkdf2(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 120000, 32, 'sha256', (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey.toString('hex'));
    });
  });
}

async function readForm(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

function homePage() {
  return page('普通话练习', `
    <main class="hero">
      <div>
        <p class="eyebrow">第三方测试系统</p>
        <h1>普通话练习</h1>
        <p class="lead">这个应用拥有自己的注册、登录、本地数据库和练习记录。它只在服务端调用智美教育业务底座同步用户身份。</p>
        <nav>
          <a class="button" href="/register">注册测试账号</a>
          <a class="link" href="/login">已有账号登录</a>
        </nav>
      </div>
      <section class="side-panel">
        <h2>接入验证点</h2>
        <ul>
          <li>本应用保存密码和练习数据</li>
          <li>底座返回统一 platformUserId</li>
          <li>同 email 可跨应用归并</li>
        </ul>
      </section>
    </main>
  `);
}

function authPage(title, action, submitText, error, mode) {
  return page(title, `
    <main class="auth-shell">
      <section>
        <p class="eyebrow">普通话练习</p>
        <h1>${escapeHtml(title)}</h1>
        <p class="muted">账号和密码保存在本应用数据库，提交成功后才同步到底座。</p>
      </section>
      <form method="post" action="${action}" class="form">
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
        <label>
          <span>邮箱</span>
          <input name="email" type="email" autocomplete="email" required />
        </label>
        ${mode === 'register' ? `
          <label>
            <span>显示名称</span>
            <input name="displayName" autocomplete="name" required />
          </label>
          <label>
            <span>年龄段</span>
            <select name="ageBand" required>
              <option value="6-12岁">6-12岁</option>
              <option value="13-15岁">13-15岁</option>
              <option value="16-18岁">16-18岁</option>
              <option value="成人">成人</option>
            </select>
          </label>
        ` : ''}
        <label>
          <span>密码</span>
          <input name="password" type="password" autocomplete="${mode === 'register' ? 'new-password' : 'current-password'}" minlength="8" required />
        </label>
        <button type="submit">${escapeHtml(submitText)}</button>
        <p class="muted">${mode === 'register' ? '<a href="/login">已有账号，去登录</a>' : '<a href="/register">没有账号，去注册</a>'}</p>
      </form>
    </main>
  `);
}

function dashboardPage(user, attempts) {
  const latest = attempts.slice(-3).reverse();
  return page('练习首页', `
    ${topbar(user)}
    <main>
      <section class="summary-grid">
        <div class="summary">
          <span>本地用户 ID</span>
          <strong>${escapeHtml(user.id)}</strong>
        </div>
        <div class="summary">
          <span>底座 platformUserId</span>
          <strong>${escapeHtml(user.platformUserId || '未同步')}</strong>
        </div>
        <div class="summary">
          <span>年龄段</span>
          <strong>${escapeHtml(user.ageBand || '未同步')}</strong>
        </div>
        <div class="summary">
          <span>练习次数</span>
          <strong>${attempts.length}</strong>
        </div>
      </section>
      <section class="layout">
        <div>
          <h1>普通话练习工作台</h1>
          <p class="muted">选择一个练习，完成后记录会保存到本应用自己的数据库，同时保留底座统一用户 ID。</p>
          <div class="exercise-list">
            ${exercises.map((exercise) => `
              <a class="exercise-row" href="/practice?exercise=${encodeURIComponent(exercise.id)}">
                <strong>${escapeHtml(exercise.title)}</strong>
                <span>${escapeHtml(exercise.phrase)}</span>
              </a>
            `).join('')}
          </div>
        </div>
        <aside class="side-panel">
          <h2>底座同步状态</h2>
          <dl>
            <dt>email</dt>
            <dd>${escapeHtml(user.email)}</dd>
            <dt>sourceAppId</dt>
            <dd>${escapeHtml(user.platformContext?.sourceAppId || appId)}</dd>
            <dt>最后同步</dt>
            <dd>${escapeHtml(formatTime(user.lastPlatformSyncAt))}</dd>
          </dl>
          <form method="post" action="/sync">
            <button type="submit" class="secondary">重新同步到底座</button>
          </form>
        </aside>
      </section>
      <section>
        <h2>最近记录</h2>
        ${latest.length ? recordTable(latest) : '<p class="muted">还没有练习记录。</p>'}
      </section>
    </main>
  `);
}

function practicePage(user, exercise) {
  return page(exercise.title, `
    ${topbar(user)}
    <main class="practice">
      <section>
        <p class="eyebrow">练习任务</p>
        <h1>${escapeHtml(exercise.title)}</h1>
        <p class="phrase">${escapeHtml(exercise.phrase)}</p>
        <p class="pinyin">${escapeHtml(exercise.pinyin)}</p>
        <p class="muted">${escapeHtml(exercise.focus)}</p>
      </section>
      <form method="post" action="/practice/submit" class="form">
        <input type="hidden" name="exerciseId" value="${escapeHtml(exercise.id)}" />
        <label>
          <span>${escapeHtml(exercise.prompt)}</span>
          <select name="selectedAnswer" required>
            ${exercise.options.map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join('')}
          </select>
        </label>
        <label>
          <span>自评流畅度 1-5</span>
          <input name="selfScore" type="number" min="1" max="5" value="3" required />
        </label>
        <label>
          <span>练习备注</span>
          <textarea name="note" rows="3" placeholder="记录自己容易读错的地方"></textarea>
        </label>
        <button type="submit">保存练习记录</button>
      </form>
    </main>
  `);
}

function resultPage(attempt) {
  return page('练习结果', `
    <main>
      <p class="eyebrow">练习结果</p>
      <h1>${escapeHtml(attempt.title)}</h1>
      <p class="phrase">${escapeHtml(attempt.phrase)}</p>
      <section class="summary-grid">
        <div class="summary">
          <span>得分</span>
          <strong>${attempt.score}</strong>
        </div>
        <div class="summary">
          <span>判断</span>
          <strong>${attempt.correct ? '正确' : '需复习'}</strong>
        </div>
        <div class="summary">
          <span>platformUserId</span>
          <strong>${escapeHtml(attempt.platformUserId || '未同步')}</strong>
        </div>
      </section>
      <nav>
        <a class="button" href="/practice">继续练习</a>
        <a class="link" href="/records">查看记录</a>
      </nav>
    </main>
  `);
}

function recordsPage(user, attempts) {
  return page('练习记录', `
    ${topbar(user)}
    <main>
      <h1>练习记录</h1>
      ${attempts.length ? recordTable(attempts.slice().reverse()) : '<p class="muted">还没有练习记录。</p>'}
    </main>
  `);
}

function recordTable(attempts) {
  return `
    <table>
      <thead>
        <tr>
          <th>时间</th>
          <th>练习</th>
          <th>选择</th>
          <th>得分</th>
          <th>platformUserId</th>
        </tr>
      </thead>
      <tbody>
        ${attempts.map((attempt) => `
          <tr>
            <td>${escapeHtml(formatTime(attempt.createdAt))}</td>
            <td>${escapeHtml(attempt.title)}</td>
            <td>${escapeHtml(attempt.selectedAnswer)}</td>
            <td>${attempt.score}</td>
            <td><code>${escapeHtml(attempt.platformUserId || '')}</code></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function topbar(user) {
  return `
    <header class="topbar">
      <a href="/dashboard" class="brand">普通话练习</a>
      <nav>
        <a href="/practice">练习</a>
        <a href="/records">记录</a>
        <span>${escapeHtml(user.displayName)}</span>
        <form method="post" action="/logout">
          <button type="submit" class="text-button">退出</button>
        </form>
      </nav>
    </header>
  `;
}

function page(title, body) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f5f7fb;
        color: #172033;
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        min-height: 100vh;
        background: #f5f7fb;
      }
      main {
        width: min(1120px, calc(100vw - 32px));
        margin: 40px auto;
      }
      h1, h2, p {
        margin-top: 0;
      }
      h1 {
        font-size: 32px;
        line-height: 1.2;
      }
      h2 {
        font-size: 18px;
      }
      a {
        color: #1f6feb;
      }
      .hero, .auth-shell, .practice, .layout {
        display: grid;
        grid-template-columns: minmax(0, 1fr) 360px;
        gap: 24px;
        align-items: start;
      }
      .lead {
        max-width: 680px;
        color: #4f5f7a;
        font-size: 18px;
        line-height: 1.7;
      }
      .eyebrow {
        color: #1f6feb;
        font-size: 13px;
        font-weight: 700;
      }
      .muted {
        color: #5b6680;
        line-height: 1.7;
      }
      .button, button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 0 16px;
        border: 0;
        border-radius: 6px;
        background: #1f6feb;
        color: #fff;
        text-decoration: none;
        font-weight: 700;
        cursor: pointer;
      }
      .secondary {
        background: #24324b;
      }
      .text-button {
        min-height: auto;
        padding: 0;
        background: transparent;
        color: #1f6feb;
      }
      .link {
        display: inline-flex;
        align-items: center;
        min-height: 40px;
        text-decoration: none;
        font-weight: 700;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
      }
      .side-panel, .form, .summary, table {
        background: #fff;
        border: 1px solid #d9deea;
        border-radius: 8px;
        box-shadow: 0 18px 42px rgba(23, 32, 51, 0.07);
      }
      .side-panel, .form {
        padding: 24px;
      }
      .side-panel li {
        margin: 10px 0;
      }
      .form {
        display: grid;
        gap: 16px;
      }
      label {
        display: grid;
        gap: 8px;
        color: #33405c;
        font-size: 14px;
        font-weight: 600;
      }
      input, select, textarea {
        width: 100%;
        border: 1px solid #cbd3e1;
        border-radius: 6px;
        padding: 10px 12px;
        font: inherit;
      }
      input, select {
        height: 42px;
      }
      .error {
        padding: 10px 12px;
        border-radius: 6px;
        background: #fff1f0;
        border: 1px solid #ffccc7;
        color: #a8071a;
      }
      .topbar {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        padding: 16px 24px;
        background: #fff;
        border-bottom: 1px solid #d9deea;
      }
      .brand {
        color: #172033;
        font-weight: 800;
        text-decoration: none;
      }
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 16px;
        margin-bottom: 24px;
      }
      .summary {
        padding: 18px;
      }
      .summary span {
        display: block;
        margin-bottom: 8px;
        color: #5b6680;
        font-size: 13px;
      }
      .summary strong {
        display: block;
        overflow-wrap: anywhere;
      }
      .exercise-list {
        display: grid;
        gap: 12px;
      }
      .exercise-row {
        display: grid;
        gap: 6px;
        padding: 16px;
        border: 1px solid #d9deea;
        border-radius: 8px;
        background: #fff;
        text-decoration: none;
      }
      .exercise-row span {
        color: #5b6680;
      }
      .phrase {
        font-size: 34px;
        font-weight: 800;
      }
      .pinyin {
        color: #1f6feb;
        font-weight: 700;
      }
      dl {
        display: grid;
        gap: 8px;
      }
      dt {
        color: #5b6680;
        font-size: 13px;
      }
      dd {
        margin: 0 0 8px;
        overflow-wrap: anywhere;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        overflow: hidden;
      }
      th, td {
        padding: 12px;
        border-bottom: 1px solid #edf0f6;
        text-align: left;
        vertical-align: top;
      }
      th {
        color: #5b6680;
        font-size: 13px;
      }
      code {
        overflow-wrap: anywhere;
      }
      @media (max-width: 860px) {
        .hero, .auth-shell, .practice, .layout, .summary-grid {
          grid-template-columns: 1fr;
        }
        .topbar {
          align-items: flex-start;
          flex-direction: column;
        }
        .phrase {
          font-size: 26px;
        }
      }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function sendHtml(response, html, status = 200) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
  });
  response.end(html);
}

function setCookie(response, name, value, maxAgeSeconds) {
  response.setHeader(
    'Set-Cookie',
    `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`,
  );
}

function clearCookie(response, name) {
  response.setHeader('Set-Cookie', `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function readCookie(request, name) {
  const header = request.headers.cookie;
  if (!header) return undefined;
  const pair = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function formatTime(value) {
  if (!value) return '无';
  return new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'short',
    timeStyle: 'short',
    hour12: false,
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
