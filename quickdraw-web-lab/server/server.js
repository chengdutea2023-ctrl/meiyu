const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT || 0);
const dataDir = process.env.COURSEWARE_DATA_DIR || path.join(__dirname, "data");
const worksDir = path.join(dataDir, "works");

function ensureDataDir() {
  fs.mkdirSync(worksDir, { recursive: true });
}

function jsonResponse(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function htmlResponse(res, status, body) {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024 * 3) {
        reject(new Error("请求体太大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("JSON 格式不正确"));
      }
    });
    req.on("error", reject);
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeId() {
  return `work_${Date.now().toString(36)}_${crypto.randomBytes(6).toString("hex")}`;
}

function getPublicBaseUrl(req, pathname) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  const hostHeader = req.headers["x-forwarded-host"] || req.headers.host;
  if (!hostHeader) throw new Error("缺少访问域名信息");
  const routeIndex = pathname.indexOf("/api/submit");
  const prefix = routeIndex >= 0 ? pathname.slice(0, routeIndex) : "";
  return `${proto}://${hostHeader}${prefix}`.replace(/\/+$/, "");
}

function normalizePlatformApiBase(value) {
  const base = String(value || "").trim().replace(/\/+$/, "");
  if (!base) throw new Error("缺少 platformApiBase");
  const parsed = new URL(base);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("platformApiBase 格式不正确");
  return base;
}

async function platformPost(platformApiBase, pathname, body) {
  const response = await fetch(`${platformApiBase}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "底座接口请求失败");
  return data;
}

async function verifyLaunchToken(platformApiBase, launchToken) {
  if (!launchToken) throw new Error("缺少 launchToken");
  const data = await platformPost(platformApiBase, "/course-runtime/launch/verify", { launchToken });
  if (!data.context) throw new Error("底座未返回学生上下文");
  return data.context;
}

function normalizeRound(round) {
  return {
    index: Number(round.index || 0),
    promptWord: String(round.promptWord || ""),
    promptLabel: String(round.promptLabel || ""),
    outcome: String(round.outcome || ""),
    recognized: Boolean(round.recognized),
    scoreAwarded: Number(round.scoreAwarded || 0),
    remainingSeconds: Number(round.remainingSeconds || 0),
    guesses: Array.isArray(round.guesses) ? round.guesses.slice(0, 8) : [],
    guessedLabels: Array.isArray(round.guessedLabels) ? round.guessedLabels.slice(0, 24) : [],
    strokes: Array.isArray(round.strokes) ? round.strokes : [],
    pointCount: Number(round.pointCount || 0),
    createdAt: String(round.createdAt || new Date().toISOString()),
  };
}

function buildWork(context, body, req, pathname) {
  const workId = makeId();
  const baseUrl = getPublicBaseUrl(req, pathname);
  const rounds = Array.isArray(body.rounds) ? body.rounds.map(normalizeRound) : [];
  const score = Math.max(0, Math.min(100, Number(body.score || 0)));
  const durationSeconds = Math.max(1, Math.round(Number(body.durationSeconds || 1)));
  const recognizedCount = Number(body.recognizedCount || rounds.filter((round) => round.recognized).length);

  return {
    workId,
    studentId: context.student?.id || "",
    classId: context.class?.id || "",
    assignmentId: context.assignment?.id || "",
    courseId: context.course?.id || "",
    courseSlug: context.course?.slug || "",
    coursewareId: context.courseware?.id || "",
    coursewareSlug: context.courseware?.slug || "",
    studentName: context.student?.displayName || context.student?.email || "同学",
    className: context.class?.name || "",
    score,
    rawScore: Number(body.rawScore || 0),
    maxRawScore: Number(body.maxRawScore || 0),
    durationSeconds,
    roundCount: Number(body.roundCount || rounds.length),
    recognizedCount,
    rounds,
    artifactUrl: `${baseUrl}/api/work/${workId}`,
    projectorUrl: `${baseUrl}/api/projector/${workId}`,
    imageUrl: `${baseUrl}/api/work/${workId}/image.png`,
    imageMimeType: "image/png",
    imageSizeBytes: 0,
    createdAt: new Date().toISOString(),
  };
}

function parsePngDataUrl(dataUrl) {
  const match = String(dataUrl || "").match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("缺少有效的 PNG 作品图片");
  return Buffer.from(match[1], "base64");
}

function saveWork(work, body) {
  ensureDataDir();
  const workDir = path.join(worksDir, work.workId);
  fs.mkdirSync(workDir, { recursive: true });

  const imageBuffer = parsePngDataUrl(body.imageDataUrl);
  fs.writeFileSync(path.join(workDir, "image.png"), imageBuffer);
  work.imageSizeBytes = imageBuffer.length;

  if (Array.isArray(body.roundImages)) {
    const roundDir = path.join(workDir, "rounds");
    fs.mkdirSync(roundDir, { recursive: true });
    body.roundImages.forEach((roundImage) => {
      const index = Number(roundImage.index || 0);
      if (!index) return;
      try {
        fs.writeFileSync(path.join(roundDir, `round-${index}.png`), parsePngDataUrl(roundImage.imageDataUrl));
      } catch {
        // Per-round images are useful but not required if the aggregate image exists.
      }
    });
  }

  fs.writeFileSync(path.join(workDir, "work.json"), JSON.stringify(work, null, 2));
}

function readWork(workId) {
  const filePath = path.join(worksDir, workId, "work.json");
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readWorkImage(workId) {
  const filePath = path.join(worksDir, workId, "image.png");
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

function readRoundImage(workId, roundIndex) {
  const filePath = path.join(worksDir, workId, "rounds", `round-${roundIndex}.png`);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

async function handleSubmit(req, res, pathname) {
  try {
    const body = await readJsonBody(req);
    const platformApiBase = normalizePlatformApiBase(body.platformApiBase);
    const context = await verifyLaunchToken(platformApiBase, body.launchToken);
    const work = buildWork(context, body, req, pathname);
    saveWork(work, body);

    await platformPost(platformApiBase, "/course-runtime/launch/records", {
      launchToken: body.launchToken,
      status: "COMPLETED",
      score: work.score,
      durationSeconds: work.durationSeconds,
      summary: {
        workId: work.workId,
        artifactUrl: work.artifactUrl,
        projectorUrl: work.projectorUrl,
        imageUrl: work.imageUrl,
        brief: `完成涂鸦识别挑战，识别成功 ${work.recognizedCount}/${work.roundCount}`,
        imageMimeType: work.imageMimeType,
        imageSizeBytes: work.imageSizeBytes,
        rawScore: work.rawScore,
        maxRawScore: work.maxRawScore,
        recognizedCount: work.recognizedCount,
        roundCount: work.roundCount,
        savedArtifacts: ["drawingImage", "strokeData", "predictionHistory", "workDetail", "projectorPage"],
      },
    });

    jsonResponse(res, 200, {
      ok: true,
      workId: work.workId,
      artifactUrl: work.artifactUrl,
      projectorUrl: work.projectorUrl,
      imageUrl: work.imageUrl,
    });
  } catch (error) {
    jsonResponse(res, 400, { error: error.message || "提交失败" });
  }
}

function renderWorkPage(work, projector = false) {
  const roundsJson = JSON.stringify(work.rounds);
  const title = projector ? "涂鸦作品投屏" : "涂鸦作品详情";
  const returnUrlScript = `const params = new URLSearchParams(window.location.search);
    const returnUrl = params.get("returnUrl");
    document.querySelectorAll("[data-return-link]").forEach((link) => {
      if (returnUrl) link.href = returnUrl;
    });`;
  if (projector) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>课堂投屏 · ${escapeHtml(work.studentName)}</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #172033;
      --muted: #6b7280;
      --line: #1f2937;
      --paper: #fffdf5;
      --panel: #ffffff;
      --blue: #2563eb;
      --green: #059669;
      --red: #dc2626;
      --amber: #d97706;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: var(--ink);
      background:
        linear-gradient(rgba(31, 41, 55, 0.035) 1px, transparent 1px),
        linear-gradient(90deg, rgba(31, 41, 55, 0.035) 1px, transparent 1px),
        #fbf8ef;
      background-size: 28px 28px;
    }
    main {
      width: min(1560px, calc(100vw - 40px));
      margin: 0 auto;
      padding: 28px 0 40px;
    }
    .projector-shell {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 360px;
      gap: 22px;
      align-items: start;
    }
    .hero, .summary-panel, .gallery-card {
      background: rgba(255, 255, 255, 0.9);
      border: 2px solid var(--line);
      box-shadow: 8px 8px 0 rgba(23, 32, 51, 0.12);
    }
    .hero {
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: 24px 28px;
      border-radius: 24px;
      margin-bottom: 22px;
    }
    .eyebrow {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 900;
      color: var(--blue);
    }
    h1 {
      margin: 0;
      font-size: clamp(36px, 4.6vw, 76px);
      line-height: 0.98;
      letter-spacing: 0;
    }
    .hero-meta {
      margin-top: 14px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      color: var(--muted);
      font-weight: 800;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      border: 2px solid #d1d5db;
      border-radius: 999px;
      padding: 7px 12px;
      background: #fff;
      font-weight: 900;
      white-space: nowrap;
    }
    .return-link {
      align-self: start;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 0 16px;
      border: 2px solid var(--line);
      border-radius: 14px;
      color: var(--ink);
      background: #fff;
      font-weight: 900;
      text-decoration: none;
      box-shadow: 4px 4px 0 rgba(23, 32, 51, 0.14);
    }
    .gallery {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 18px;
    }
    .gallery-card {
      display: flex;
      flex-direction: column;
      min-height: 370px;
      overflow: hidden;
      border-radius: 22px;
    }
    .card-head {
      display: flex;
      align-items: start;
      justify-content: space-between;
      gap: 12px;
      padding: 16px 18px 10px;
      border-bottom: 2px solid rgba(31, 41, 55, 0.1);
    }
    .round-kicker {
      margin: 0 0 4px;
      color: var(--muted);
      font-size: 14px;
      font-weight: 900;
    }
    .round-title {
      margin: 0;
      font-size: 24px;
      line-height: 1.18;
      font-weight: 1000;
    }
    .status {
      flex: 0 0 auto;
      border-radius: 999px;
      padding: 6px 10px;
      font-size: 13px;
      font-weight: 1000;
      border: 2px solid currentColor;
      background: #fff;
    }
    .status.ok { color: var(--green); }
    .status.miss { color: var(--red); }
    .art-box {
      position: relative;
      height: 230px;
      margin: 14px 16px 0;
      border: 2px solid rgba(31, 41, 55, 0.16);
      border-radius: 18px;
      background:
        linear-gradient(rgba(31, 41, 55, 0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(31, 41, 55, 0.04) 1px, transparent 1px),
        #fff;
      background-size: 18px 18px;
      overflow: hidden;
    }
    .art-box img, .art-box canvas {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .empty-art {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      color: #9ca3af;
      font-weight: 900;
    }
    .round-result {
      margin-top: auto;
      padding: 14px 18px 18px;
    }
    .score-line {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      padding-top: 12px;
      border-top: 2px solid rgba(31, 41, 55, 0.1);
    }
    .score-line strong {
      font-size: 34px;
      line-height: 1;
    }
    .guess-line {
      margin: 10px 0 0;
      color: var(--muted);
      font-weight: 800;
      line-height: 1.5;
    }
    .summary-panel {
      position: sticky;
      top: 24px;
      border-radius: 24px;
      padding: 22px;
    }
    .summary-panel h2 {
      margin: 0 0 14px;
      font-size: 28px;
    }
    .total-score {
      display: grid;
      place-items: center;
      min-height: 150px;
      border-radius: 22px;
      background: linear-gradient(135deg, #2563eb, #38bdf8);
      color: #fff;
      margin-bottom: 18px;
      border: 2px solid var(--line);
      box-shadow: 5px 5px 0 rgba(23, 32, 51, 0.15);
    }
    .total-score span {
      font-size: 16px;
      font-weight: 900;
    }
    .total-score strong {
      font-size: 72px;
      line-height: 0.95;
    }
    .metric {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 12px 0;
      border-bottom: 1px solid #e5e7eb;
      font-weight: 900;
    }
    .metric span:first-child { color: var(--muted); }
    .talking {
      margin-top: 18px;
      border: 2px dashed #bfdbfe;
      background: #eff6ff;
      border-radius: 18px;
      padding: 14px;
    }
    .talking h3 { margin: 0 0 10px; }
    .talking ul {
      margin: 0;
      padding-left: 18px;
      color: #334155;
      font-weight: 800;
      line-height: 1.65;
    }
    .empty-state {
      padding: 40px;
      border: 2px dashed #cbd5e1;
      border-radius: 22px;
      background: #fff;
      color: #64748b;
      font-weight: 900;
      text-align: center;
    }
    @media (max-width: 1100px) {
      .projector-shell { grid-template-columns: 1fr; }
      .summary-panel { position: static; }
    }
  </style>
</head>
<body>
  <main>
    <section class="projector-shell">
      <div>
        <header class="hero">
          <div>
            <p class="eyebrow">课堂投屏 · 全部画作</p>
            <h1>${escapeHtml(work.studentName)} 的 AI 猜画作品</h1>
            <div class="hero-meta">
              <span class="pill">${escapeHtml(work.className || "未记录班级")}</span>
              <span class="pill">共 ${work.roundCount || work.rounds.length || 0} 回合</span>
              <span class="pill">${escapeHtml(new Date(work.createdAt).toLocaleString("zh-CN"))}</span>
            </div>
          </div>
          <a class="return-link" href="/" data-return-link>返回学生后台</a>
        </header>
        <section class="gallery" id="rounds"></section>
      </div>
      <aside class="summary-panel">
        <h2>本次表现</h2>
        <div class="total-score">
          <span>总分</span>
          <strong>${Number(work.score || 0)}</strong>
        </div>
        <div class="metric"><span>识别成功</span><strong>${Number(work.recognizedCount || 0)} / ${Number(work.roundCount || work.rounds.length || 0)}</strong></div>
        <div class="metric"><span>完成回合</span><strong>${Number(work.roundCount || work.rounds.length || 0)}</strong></div>
        <div class="metric"><span>学习耗时</span><strong>${Number(work.durationSeconds || 0)} 秒</strong></div>
        <div class="metric"><span>完成时间</span><strong>${escapeHtml(new Date(work.createdAt).toLocaleString("zh-CN"))}</strong></div>
        <div class="talking">
          <h3>教师点评提示</h3>
          <ul>
            <li>先看孩子表达的主要特征，再讨论 AI 为什么这样猜。</li>
            <li>对比高分和低分画作，引导观察线条、轮廓和关键细节。</li>
            <li>鼓励学生说出下一次会补充哪些信息。</li>
          </ul>
        </div>
      </aside>
    </section>
  </main>
  <script>
    const rounds = ${roundsJson};
    ${returnUrlScript}
    const workId = ${JSON.stringify(work.workId)};
    const container = document.querySelector("#rounds");
    function escapeText(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      }[char]));
    }
    function draw(canvas, strokes) {
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const points = Array.isArray(strokes) ? strokes.flat() : [];
      if (!points.length) return false;
      const xs = points.map((point) => Number(point.x || 0));
      const ys = points.map((point) => Number(point.y || 0));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      const scale = Math.min((rect.width - 32) / width, (rect.height - 32) / height);
      const offsetX = (rect.width - width * scale) / 2;
      const offsetY = (rect.height - height * scale) / 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
      ctx.lineWidth = 5;
      strokes.forEach((stroke) => {
        if (!Array.isArray(stroke) || stroke.length < 2) return;
        ctx.beginPath();
        ctx.moveTo((stroke[0].x - minX) * scale + offsetX, (stroke[0].y - minY) * scale + offsetY);
        stroke.slice(1).forEach((point) => ctx.lineTo((point.x - minX) * scale + offsetX, (point.y - minY) * scale + offsetY));
        ctx.stroke();
      });
      return true;
    }
    function renderEmptyState() {
      container.innerHTML = '<div class="empty-state">这个作品暂时没有保存到可展示的回合画作。</div>';
    }
    if (!Array.isArray(rounds) || !rounds.length) {
      renderEmptyState();
    } else {
      container.innerHTML = rounds.map((round, index) => {
        const roundIndex = Number(round.index || index + 1);
        const title = round.promptLabel || round.promptWord || "未记录提示词";
        const guessText = Array.isArray(round.guessedLabels) && round.guessedLabels.length
          ? round.guessedLabels.slice(0, 5).join("、")
          : "未记录 AI 猜测";
        return \`
          <article class="gallery-card">
            <div class="card-head">
              <div>
                <p class="round-kicker">第 \${roundIndex} 回合</p>
                <h2 class="round-title">\${escapeText(title)}</h2>
              </div>
              <span class="status \${round.recognized ? "ok" : "miss"}">\${round.recognized ? "识别成功" : "未识别"}</span>
            </div>
            <div class="art-box" data-round-index="\${roundIndex}">
              <img src="./../work/\${encodeURIComponent(workId)}/rounds/round-\${roundIndex}.png" alt="\${escapeText(title)} 的画作" data-round-image="\${index}" />
              <canvas data-round-canvas="\${index}" hidden></canvas>
            </div>
            <div class="round-result">
              <div class="score-line">
                <span>本回合得分</span>
                <strong>\${Number(round.scoreAwarded || 0)}</strong>
              </div>
              <p class="guess-line">AI 猜测：\${escapeText(guessText)}</p>
            </div>
          </article>
        \`;
      }).join("");
      document.querySelectorAll("[data-round-image]").forEach((image) => {
        const index = Number(image.dataset.roundImage);
        const canvas = document.querySelector(\`[data-round-canvas="\${index}"]\`);
        image.addEventListener("error", () => {
          image.hidden = true;
          canvas.hidden = false;
          const didDraw = draw(canvas, rounds[index]?.strokes || []);
          if (!didDraw) {
            canvas.replaceWith(Object.assign(document.createElement("div"), {
              className: "empty-art",
              textContent: "暂无画作",
            }));
          }
        }, { once: true });
      });
    }
  </script>
</body>
</html>`;
  }
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #151515; background: #fbf8ef; }
    main { width: min(1120px, calc(100vw - 32px)); margin: 0 auto; padding: 28px 0; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 20px; border-bottom: 2px solid #151515; padding-bottom: 18px; }
    h1 { margin: 0; font-size: clamp(28px, 5vw, 56px); }
    .meta { color: #646464; font-weight: 800; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-top: 22px; }
    .card { border: 1px solid #151515; border-radius: 8px; padding: 14px; background: #fffdf7; box-shadow: 3px 3px 0 #151515; }
    canvas { width: 100%; height: 190px; border: 1px solid #d9d4ca; border-radius: 6px; background: #fff; }
    .score { font-size: clamp(32px, 7vw, 84px); font-weight: 900; }
    .round-title { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; font-weight: 900; }
    .ok { color: #188b5f; }
    .miss { color: #b72a22; }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">${escapeHtml(work.studentName)} · ${escapeHtml(work.className)} · ${escapeHtml(new Date(work.createdAt).toLocaleString("zh-CN"))}</div>
      </div>
      <div class="score">${work.score}</div>
    </header>
    <section class="card">
      <div class="round-title">
        <span>最终作品图片</span>
        <a href="${escapeHtml(work.imageUrl)}" target="_blank" rel="noreferrer">打开图片</a>
      </div>
      <img src="${escapeHtml(work.imageUrl)}" alt="学生最终涂鸦作品" style="width:100%;border:1px solid #d9d4ca;border-radius:6px;background:#fff" />
    </section>
    <section class="grid" id="rounds"></section>
  </main>
  <script>
    const rounds = ${roundsJson};
    const container = document.querySelector("#rounds");
    function draw(canvas, strokes) {
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const points = Array.isArray(strokes) ? strokes.flat() : [];
      if (!points.length) return;
      const xs = points.map((point) => Number(point.x || 0));
      const ys = points.map((point) => Number(point.y || 0));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      const width = Math.max(1, maxX - minX);
      const height = Math.max(1, maxY - minY);
      const scale = Math.min((rect.width - 28) / width, (rect.height - 28) / height);
      const offsetX = (rect.width - width * scale) / 2;
      const offsetY = (rect.height - height * scale) / 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#151515";
      ctx.lineWidth = 4;
      strokes.forEach((stroke) => {
        if (!Array.isArray(stroke) || stroke.length < 2) return;
        ctx.beginPath();
        ctx.moveTo((stroke[0].x - minX) * scale + offsetX, (stroke[0].y - minY) * scale + offsetY);
        stroke.slice(1).forEach((point) => ctx.lineTo((point.x - minX) * scale + offsetX, (point.y - minY) * scale + offsetY));
        ctx.stroke();
      });
    }
    container.innerHTML = rounds.map((round, index) => \`
      <article class="card">
        <div class="round-title">
          <span>\${index + 1}. \${round.promptLabel || round.promptWord}</span>
          <span class="\${round.recognized ? "ok" : "miss"}">\${round.recognized ? "识别成功" : "未识别"}</span>
        </div>
        <canvas data-index="\${index}"></canvas>
        <p>得分：\${round.scoreAwarded || 0} · 笔画点数：\${round.pointCount || 0}</p>
      </article>
    \`).join("");
    document.querySelectorAll("canvas").forEach((canvas) => draw(canvas, rounds[Number(canvas.dataset.index)]?.strokes || []));
  </script>
</body>
</html>`;
}

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || `${host}:${port}`}`);
  const pathname = decodeURIComponent(url.pathname);

  if (req.method === "GET" && pathname === "/health") {
    return jsonResponse(res, 200, { ok: true });
  }

  if (req.method === "POST" && pathname.endsWith("/api/submit")) {
    return handleSubmit(req, res, pathname);
  }

  const imageMatch = pathname.match(/\/work\/([^/]+)\/image\.png$/);
  if (req.method === "GET" && imageMatch) {
    const image = readWorkImage(imageMatch[1]);
    if (!image) return htmlResponse(res, 404, "作品图片不存在");
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": image.length,
      "Cache-Control": "private, max-age=300",
    });
    return res.end(image);
  }

  const roundImageMatch = pathname.match(/\/work\/([^/]+)\/rounds\/round-(\d+)\.png$/);
  if (req.method === "GET" && roundImageMatch) {
    const image = readRoundImage(roundImageMatch[1], Number(roundImageMatch[2]));
    if (!image) return htmlResponse(res, 404, "回合图片不存在");
    res.writeHead(200, {
      "Content-Type": "image/png",
      "Content-Length": image.length,
      "Cache-Control": "private, max-age=300",
    });
    return res.end(image);
  }

  const workMatch = pathname.match(/\/work\/([^/]+)$/);
  if (req.method === "GET" && workMatch) {
    const work = readWork(workMatch[1]);
    if (!work) return htmlResponse(res, 404, "作品不存在");
    return htmlResponse(res, 200, renderWorkPage(work, false));
  }

  const projectorMatch = pathname.match(/\/projector\/([^/]+)$/);
  if (req.method === "GET" && projectorMatch) {
    const work = readWork(projectorMatch[1]);
    if (!work) return htmlResponse(res, 404, "作品不存在");
    return htmlResponse(res, 200, renderWorkPage(work, true));
  }

  jsonResponse(res, 404, { error: "Not found" });
}

ensureDataDir();
const server = http.createServer(route);
server.listen(port, host, () => {
  const address = server.address();
  console.log(`QuickDraw courseware server listening on ${host}:${address.port}`);
});
