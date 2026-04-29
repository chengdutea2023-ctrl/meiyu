import http from 'node:http';

const port = Number(process.env.DEMO_APP_PORT || 3001);
const platformUrl = (process.env.PLATFORM_PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const appId = process.env.DEMO_APP_ID || 'demo-teaching-app';
const appSecret = process.env.DEMO_APP_SECRET || 'demo-app-secret';
const publicUrl = (process.env.DEMO_APP_PUBLIC_URL || `http://localhost:${port}`).replace(/\/$/, '');
const redirectUri = `${publicUrl}/auth/callback`;
const state = 'demo-state';
const accessCookie = 'demo_app_access_token';

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url || '/', publicUrl);

    if (url.pathname === '/') {
      return sendHtml(response, page('教学辅助演示应用', `
        <main>
          <h1>教学辅助演示应用</h1>
          <p>这是一个独立服务器上的业务应用，用来验证统一登录接入流程。</p>
          <nav>
            <a class="button" href="/login">使用统一账号登录</a>
            <a class="link" href="/me">查看当前用户</a>
          </nav>
        </main>
      `));
    }

    if (url.pathname === '/login') {
      const authorizeUrl = new URL('/sso/authorize', platformUrl);
      authorizeUrl.searchParams.set('appId', appId);
      authorizeUrl.searchParams.set('redirectUri', redirectUri);
      authorizeUrl.searchParams.set('state', state);
      authorizeUrl.searchParams.set('scope', 'profile organization class');
      return redirect(response, authorizeUrl.toString());
    }

    if (url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code');
      const returnedState = url.searchParams.get('state');

      if (!code || (returnedState !== null && returnedState !== state)) {
        return sendHtml(response, page('登录失败', '<main><h1>登录失败</h1><p>授权回调参数无效。</p></main>'), 400);
      }

      const tokenResponse = await exchangeCode(code);
      setCookie(response, accessCookie, tokenResponse.accessToken, tokenResponse.expiresIn);
      return redirect(response, '/me');
    }

    if (url.pathname === '/me') {
      const accessToken = readCookie(request, accessCookie);

      if (!accessToken) {
        return redirect(response, '/login');
      }

      const currentUser = await getCurrentUser(accessToken);
      return sendHtml(response, page('当前用户', `
        <main>
          <h1>当前用户</h1>
          <pre>${escapeHtml(JSON.stringify(currentUser, null, 2))}</pre>
          <nav>
            <a class="button" href="/logout">退出演示应用</a>
            <a class="link" href="/">返回首页</a>
          </nav>
        </main>
      `));
    }

    if (url.pathname === '/logout') {
      clearCookie(response, accessCookie);
      return redirect(response, '/');
    }

    return sendHtml(response, page('Not Found', '<main><h1>404</h1></main>'), 404);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return sendHtml(response, page('服务错误', `<main><h1>服务错误</h1><p>${escapeHtml(message)}</p></main>`), 500);
  }
});

server.listen(port, () => {
  console.log(`Teaching demo app listening on ${publicUrl}`);
  console.log(`Platform URL: ${platformUrl}`);
});

async function exchangeCode(code) {
  const response = await fetch(`${platformUrl}/api/v1/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appId,
      appSecret,
      code,
      redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function getCurrentUser(accessToken) {
  const response = await fetch(`${platformUrl}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Fetch current user failed: ${response.status} ${await response.text()}`);
  }

  return response.json();
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

function readCookie(request, name) {
  const cookie = request.headers.cookie;

  if (!cookie) {
    return undefined;
  }

  const pair = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!pair) {
    return undefined;
  }

  return decodeURIComponent(pair.slice(name.length + 1));
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
        background: #f6f7fb;
        color: #172033;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      main {
        width: min(720px, calc(100vw - 32px));
        background: #fff;
        border: 1px solid #d9deea;
        border-radius: 8px;
        padding: 28px;
        box-shadow: 0 18px 48px rgba(23, 32, 51, 0.08);
      }
      h1 {
        margin: 0 0 12px;
        font-size: 24px;
      }
      p {
        color: #5b6680;
      }
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        align-items: center;
        margin-top: 24px;
      }
      a {
        color: #1f6feb;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 40px;
        padding: 0 16px;
        border-radius: 6px;
        background: #1f6feb;
        color: #fff;
        text-decoration: none;
        font-weight: 600;
      }
      .link {
        text-decoration: none;
      }
      pre {
        overflow: auto;
        padding: 16px;
        border-radius: 6px;
        background: #101828;
        color: #e6edf7;
        font-size: 13px;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>${body}</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
