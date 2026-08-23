const startScreen = document.querySelector("#startScreen");
const gameScreen = document.querySelector("#gameScreen");
const summaryScreen = document.querySelector("#summaryScreen");
const startBtn = document.querySelector("#startBtn");
const resetLevelBtn = document.querySelector("#resetLevelBtn");
const submitBtn = document.querySelector("#submitBtn");
const projectorPreviewBtn = document.querySelector("#projectorPreviewBtn");
const reviewBtn = document.querySelector("#reviewBtn");
const levelHost = document.querySelector("#levelHost");
const levelTitle = document.querySelector("#levelTitle");
const levelNumber = document.querySelector("#levelNumber");
const levelProgressText = document.querySelector("#levelProgressText");
const scoreLabel = document.querySelector("#scoreLabel");
const timerLabel = document.querySelector("#timerLabel");
const conceptLabel = document.querySelector("#conceptLabel");
const taskLabel = document.querySelector("#taskLabel");
const roundMessage = document.querySelector("#roundMessage");
const conceptText = document.querySelector("#conceptText");
const conceptChips = document.querySelector("#conceptChips");
const resultBox = document.querySelector("#resultBox");
const progressList = document.querySelector("#progressList");
const launchNotice = document.querySelector("#launchNotice");
const finalScore = document.querySelector("#finalScore");
const finalMessage = document.querySelector("#finalMessage");
const summaryResults = document.querySelector("#summaryResults");
const completionDialog = document.querySelector("#completionDialog");
const completionTitle = document.querySelector("#completionTitle");
const completionMessage = document.querySelector("#completionMessage");
const soundToggle = document.querySelector("#soundToggle");

const backButtons = [
  "#backToStudent",
  "#gameBackToStudent",
  "#summaryBackToStudent",
  "#summaryBackInline",
  "#completionBackToStudent",
].map((selector) => document.querySelector(selector));

const completionClose = document.querySelector("#completionClose");

const launchParams = new URLSearchParams(window.location.search);
const launchToken = launchParams.get("launchToken");
const platformApiBase = (launchParams.get("platformApiBase") || "").replace(/\/+$/, "");
const returnUrl = launchParams.get("returnUrl") || "";
const demoMode = launchParams.get("demo") === "1";
const projectorVersion = "little-chef-projector-v1";

let currentLevelIndex = 0;
let levelChecked = false;
let levelRunning = false;
let levelScores = [];
let levelDetails = [];
let levelState = {};
let feedbackState = "";
let runTimerId = 0;
let autoAdvanceTimerId = 0;
let autoSubmitTimerId = 0;
let startedAt = 0;
let timerId = 0;
let platformContext = null;
let platformVerified = false;
let submitted = false;
let dragSession = null;
let audioContext = null;
let soundMuted = localStorage.getItem("littleChefSoundMuted") === "1";

const levels = [
  {
    id: "tomato-egg",
    title: "食材进来，菜品出来",
    concept: "输入输出算法",
    outputName: "番茄炒蛋",
    task: "把番茄炒蛋需要的输入拖进篮子",
    conceptText: "算法先接收输入，再按照步骤处理，最后得到输出。",
    chips: ["输入", "处理", "输出"],
    processText: "先接收食材，再按步骤炒熟。",
    outputImage: "./assets/ui/output-dish.png?v=dish-output-20260625",
    algorithmRows: [
      ["输入", "鸡蛋、番茄、油、盐", "egg"],
      ["处理", "热锅后翻炒并调味", "pan"],
      ["输出", "得到番茄炒蛋", "bowl"],
    ],
    items: [
      { id: "egg", label: "鸡蛋", icon: "egg", needed: true },
      { id: "tomato", label: "番茄", icon: "tomato", needed: true },
      { id: "oil", label: "油", icon: "oil", needed: true },
      { id: "salt", label: "盐", icon: "salt", needed: true },
      { id: "ice", label: "冰块", icon: "ice", needed: false },
      { id: "chocolate", label: "巧克力", icon: "chocolate", needed: false },
    ],
  },
  {
    id: "golden-toast",
    title: "按顺序做黄金煎吐司",
    concept: "顺序算法",
    outputName: "黄金煎吐司",
    task: "把黄金煎吐司需要的输入拖进篮子",
    conceptText: "顺序算法像菜谱：先做什么、再做什么，要安排清楚。",
    chips: ["顺序", "步骤", "执行"],
    processText: "蘸蛋奶、下锅、翻面，顺序清楚才稳定。",
    algorithmRows: [
      ["输入", "面包、鸡蛋、牛奶、油", "toast"],
      ["处理", "按蘸、煎、翻面的顺序执行", "board"],
      ["输出", "得到黄金煎吐司", "check"],
    ],
    items: [
      { id: "toast", label: "面包", icon: "toast", needed: true },
      { id: "egg", label: "鸡蛋", icon: "egg", needed: true },
      { id: "milk", label: "牛奶", icon: "milk", needed: true },
      { id: "oil", label: "油", icon: "oil", needed: true },
      { id: "chili", label: "辣椒", icon: "chili", needed: false },
      { id: "ice", label: "冰块", icon: "ice", needed: false },
    ],
  },
  {
    id: "sweet-sour-salad",
    title: "按口味做酸甜番茄沙拉",
    concept: "条件分支算法",
    outputName: "酸甜番茄沙拉",
    task: "把酸甜番茄沙拉需要的输入拖进篮子",
    conceptText: "条件分支像问客人口味：如果喜欢酸甜，就选择对应食材；否则换另一条路。",
    chips: ["如果", "否则", "分支"],
    processText: "根据口味条件，选择酸甜路线，不走辣味路线。",
    algorithmRows: [
      ["输入", "番茄、糖、醋、盐", "tomato"],
      ["判断", "如果喜欢酸甜，就加糖和醋", "sugar"],
      ["输出", "得到酸甜番茄沙拉", "bowl"],
    ],
    items: [
      { id: "tomato", label: "番茄", icon: "tomato", needed: true },
      { id: "sugar", label: "糖", icon: "sugar", needed: true },
      { id: "vinegar", label: "醋", icon: "vinegar", needed: true },
      { id: "salt", label: "盐", icon: "salt", needed: true },
      { id: "chili", label: "辣椒", icon: "chili", needed: false },
      { id: "peanut", label: "花生碎", icon: "peanut", needed: false },
    ],
  },
  {
    id: "fruit-milk-cup",
    title: "循环调出水果牛奶杯",
    concept: "循环反馈算法",
    outputName: "水果牛奶杯",
    task: "把水果牛奶杯需要的输入拖进篮子",
    conceptText: "循环反馈像尝味道：加一点、看反馈，再决定要不要继续。",
    chips: ["重复", "反馈", "停止条件"],
    processText: "一边搅拌一边尝，合适就停止循环。",
    algorithmRows: [
      ["输入", "牛奶、水果、糖、冰块", "milk"],
      ["循环", "搅拌、尝味、再调整", "timer"],
      ["输出", "得到水果牛奶杯", "fruit"],
    ],
    items: [
      { id: "milk", label: "牛奶", icon: "milk", needed: true },
      { id: "fruit", label: "水果", icon: "fruit", needed: true },
      { id: "sugar", label: "糖", icon: "sugar", needed: true },
      { id: "ice", label: "冰块", icon: "ice", needed: true },
      { id: "salt", label: "盐", icon: "salt", needed: false },
      { id: "chili", label: "辣椒", icon: "chili", needed: false },
    ],
  },
  {
    id: "quick-breakfast",
    title: "优化做出快手早餐盘",
    concept: "优化算法",
    outputName: "快手早餐盘",
    task: "把快手早餐盘需要的输入拖进篮子",
    conceptText: "优化算法会在限制条件下找更好的方案，比如更快完成一份早餐。",
    chips: ["时间", "资源", "更优方案"],
    processText: "把能同时做的食材安排好，减少等待时间。",
    algorithmRows: [
      ["输入", "面包、鸡蛋、牛奶、水果", "toast"],
      ["优化", "炉灶、双手和工具一起安排", "timer"],
      ["输出", "得到快手早餐盘", "check"],
    ],
    items: [
      { id: "toast", label: "面包", icon: "toast", needed: true },
      { id: "egg", label: "鸡蛋", icon: "egg", needed: true },
      { id: "milk", label: "牛奶", icon: "milk", needed: true },
      { id: "fruit", label: "水果", icon: "fruit", needed: true },
      { id: "chocolate", label: "巧克力", icon: "chocolate", needed: false },
      { id: "chili", label: "辣椒", icon: "chili", needed: false },
    ],
  },
];

const spritePositions = {
  egg: [0, 0],
  tomato: [1, 0],
  oil: [2, 0],
  salt: [3, 0],
  ice: [4, 0],
  chocolate: [0, 1],
  sugar: [1, 1],
  vinegar: [2, 1],
  chili: [3, 1],
  peanut: [4, 1],
  pan: [0, 2],
  board: [1, 2],
  timer: [2, 2],
  toast: [3, 2],
  milk: [4, 2],
  fruit: [0, 3],
  stove: [1, 3],
  toaster: [2, 3],
  bowl: [3, 3],
  check: [4, 3],
};

function iconStyle(icon) {
  const [col, row] = spritePositions[icon] || [4, 3];
  const x = (col / 4) * 100;
  const y = (row / 3) * 100;
  return `background-image: url("./assets/kitchen-items-sprite.png"); background-size: 500% 400%; background-position: ${x}% ${y}%;`;
}

function tinyIconMarkup(icon, label = "") {
  return `<span class="sprite-icon tiny" style='${iconStyle(icon)}' aria-hidden="true"></span><span>${label}</span>`;
}

function itemPayload(item) {
  if (!item) return null;
  return {
    id: item.id,
    label: item.label,
    icon: item.icon,
    needed: Boolean(item.needed),
  };
}

function itemsFromIds(level, ids) {
  return ids.map((id) => itemPayload(level.items.find((item) => item.id === id))).filter(Boolean);
}

function algorithmRows(level) {
  if (Array.isArray(level.algorithmRows)) return level.algorithmRows;
  return [
    ["输入", "选择正确食材", "egg"],
    ["处理", "运行这道菜的算法", "pan"],
    ["输出", `得到${level.outputName || "菜品"}`, "bowl"],
  ];
}

function renderAlgorithmRows(level) {
  return algorithmRows(level).map(([title, text, icon]) => `
    <article class="algorithm-row">
      <strong>${title}</strong>
      <span>${text}</span>
      <span class="sprite-icon tiny" style='${iconStyle(icon)}' aria-hidden="true"></span>
    </article>
  `).join("");
}

function updateSoundToggle() {
  if (!soundToggle) return;
  soundToggle.textContent = soundMuted ? "声音 关" : "声音 开";
  soundToggle.setAttribute("aria-pressed", String(!soundMuted));
}

function ensureAudioContext() {
  if (soundMuted) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioContext) audioContext = new AudioContextClass();
  if (audioContext.state === "suspended") audioContext.resume();
  return audioContext;
}

function playTone(ctx, frequency, start, duration, type = "sine", volume = 0.08) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(gain).connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playSound(kind) {
  const ctx = ensureAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;
  const sounds = {
    pickup: [[560, 0, 0.055, "triangle", 0.05]],
    drop: [[420, 0, 0.06, "sine", 0.06], [640, 0.045, 0.08, "sine", 0.045]],
    success: [[520, 0, 0.08, "triangle", 0.06], [720, 0.075, 0.09, "triangle", 0.06], [940, 0.16, 0.12, "triangle", 0.05]],
    wrong: [[210, 0, 0.13, "sawtooth", 0.045], [160, 0.1, 0.14, "sawtooth", 0.035]],
    next: [[440, 0, 0.07, "sine", 0.055], [660, 0.065, 0.08, "sine", 0.055]],
    complete: [[520, 0, 0.08, "triangle", 0.06], [690, 0.07, 0.08, "triangle", 0.06], [860, 0.14, 0.1, "triangle", 0.055], [1030, 0.23, 0.12, "triangle", 0.05]],
  };
  (sounds[kind] || sounds.drop).forEach(([frequency, offset, duration, type, volume]) => {
    playTone(ctx, frequency, now + offset, duration, type, volume);
  });
}

function toggleSound() {
  soundMuted = !soundMuted;
  localStorage.setItem("littleChefSoundMuted", soundMuted ? "1" : "0");
  updateSoundToggle();
  if (!soundMuted) playSound("drop");
}

function goBackToStudent() {
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }
  window.history.back();
}

function showDialog(title, message, isError = false) {
  completionTitle.textContent = title;
  completionMessage.textContent = message;
  completionDialog.classList.toggle("is-error", isError);
  completionDialog.classList.remove("is-hidden");
}

function hideDialog() {
  completionDialog.classList.add("is-hidden");
}

async function platformRequest(path, body) {
  if (!launchToken || !platformApiBase) throw new Error("请从学生后台进入课件");
  const response = await fetch(`${platformApiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "底座接口请求失败");
  return data;
}

async function verifyPlatformLaunch() {
  if (demoMode) {
    launchNotice.textContent = "本地预览模式：可以试玩，成绩不会回传到底座。";
    startBtn.disabled = false;
    return;
  }

  if (!launchToken || !platformApiBase) {
    launchNotice.textContent = "请从学生后台进入课件。当前链接缺少 launchToken 或 platformApiBase，无法确认学生身份和任务。";
    startBtn.disabled = true;
    return;
  }

  try {
    const data = await platformRequest("/course-runtime/launch/verify", { launchToken });
    platformContext = data.context || null;
    platformVerified = Boolean(platformContext);
    const studentName = platformContext?.student?.displayName || platformContext?.student?.email || "同学";
    launchNotice.textContent = `已连接业务底座，当前学生：${studentName}。`;
    startBtn.disabled = false;
  } catch (error) {
    launchNotice.textContent = `底座身份校验失败：${error.message}。请从学生后台重新进入课件。`;
    startBtn.disabled = true;
  }
}

function startTimer() {
  startedAt = Date.now();
  clearInterval(timerId);
  timerId = window.setInterval(updateTimer, 1000);
  updateTimer();
}

function updateTimer() {
  const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remain = seconds % 60;
  timerLabel.textContent = `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function elapsedSeconds() {
  return Math.max(1, Math.round((Date.now() - startedAt) / 1000));
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remain = safeSeconds % 60;
  if (minutes <= 0) return `${remain} 秒`;
  return `${minutes} 分 ${String(remain).padStart(2, "0")} 秒`;
}

function totalScore() {
  return levelScores.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
}

function shuffledItemIds(level, previousOrder = []) {
  const ids = level.items.map((item) => item.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
  }

  const matchesPrevious = ids.length === previousOrder.length
    && ids.every((id, index) => id === previousOrder[index]);
  if (matchesPrevious && ids.length > 1) {
    ids.push(ids.shift());
  }

  const neededIds = new Set(level.items.filter((item) => item.needed).map((item) => item.id));
  const neededCount = neededIds.size;
  const firstSlotsAreAllCorrect = ids.slice(0, neededCount).every((id) => neededIds.has(id));
  if (firstSlotsAreAllCorrect && neededCount < ids.length) {
    [ids[neededCount - 1], ids[neededCount]] = [ids[neededCount], ids[neededCount - 1]];
  }

  const stillMatchesPrevious = ids.length === previousOrder.length
    && ids.every((id, index) => id === previousOrder[index]);
  if (stillMatchesPrevious && ids.length > 1) {
    [ids[0], ids[1]] = [ids[1], ids[0]];
  }

  return ids;
}

function initializeLevelState(previousOrder = []) {
  const level = levels[currentLevelIndex];
  levelState = {
    selected: {},
    itemOrder: shuffledItemIds(level, previousOrder),
  };
}

function orderedLevelItems(level) {
  if (!Array.isArray(levelState.itemOrder) || levelState.itemOrder.length !== level.items.length) {
    levelState.itemOrder = shuffledItemIds(level);
  }
  const itemsById = new Map(level.items.map((item) => [item.id, item]));
  return levelState.itemOrder.map((id) => itemsById.get(id)).filter(Boolean);
}

function clearRunTimers() {
  clearTimeout(runTimerId);
  clearTimeout(autoAdvanceTimerId);
  clearTimeout(autoSubmitTimerId);
  runTimerId = 0;
  autoAdvanceTimerId = 0;
  autoSubmitTimerId = 0;
}

function canSubmitToPlatform() {
  return !demoMode && Boolean(launchToken && platformApiBase);
}

function scheduleAutoSubmit() {
  clearTimeout(autoSubmitTimerId);
  if (!canSubmitToPlatform() || submitted) {
    submitBtn.textContent = submitted ? "成绩已保存" : "保存成绩";
    return;
  }
  submitBtn.textContent = "正在保存...";
  autoSubmitTimerId = window.setTimeout(() => {
    submitScore();
  }, 450);
}

function renderProgress() {
  progressList.innerHTML = levels.map((level, index) => {
    const done = typeof levelScores[index] === "number";
    const active = index === currentLevelIndex;
    const scoreText = done ? `${levelScores[index]} 分` : active ? "进行中" : "未开始";
    return `<li class="${active ? "is-active" : ""} ${done ? "is-done" : ""}" aria-label="第 ${index + 1} 关，${level.concept}，${scoreText}">
      <span>${index + 1}</span>
      <strong>${level.concept}</strong>
      <em>${scoreText}</em>
    </li>`;
  }).join("");
}

function renderShell() {
  const level = levels[currentLevelIndex];
  levelTitle.textContent = level.title;
  levelNumber.textContent = String(currentLevelIndex + 1);
  if (levelProgressText) levelProgressText.textContent = `${currentLevelIndex + 1} / ${levels.length}`;
  scoreLabel.textContent = String(totalScore());
  conceptLabel.textContent = level.concept;
  taskLabel.textContent = level.task;
  conceptText.textContent = level.conceptText;
  conceptChips.innerHTML = renderAlgorithmRows(level);
  roundMessage.textContent = "选好食材后点击“运行算法”。";
  resultBox.innerHTML = "<strong>等待运行</strong><span>选好食材后点击“运行算法”。</span>";
  levelChecked = false;
  levelRunning = false;
  feedbackState = "";
  renderProgress();
}

function clearDropHighlights() {
  levelHost.querySelectorAll(".is-drop-hover").forEach((item) => item.classList.remove("is-drop-hover"));
}

function hitTestDropZone(x, y) {
  const element = document.elementFromPoint(x, y);
  return element?.closest("[data-drop-zone]");
}

function applyDrop(session, dropZone) {
  if (!dropZone) return false;
  const { action, id } = session;
  const zone = dropZone.dataset.dropZone;

  if (action === "input-item" && zone === "input-basket") {
    if (!levelState.selected) levelState.selected = {};
    levelState.selected[id] = true;
    renderLevel();
    return true;
  }

  return false;
}

function handleDragTap(session) {
  if (session.action === "input-item") selectToggle(session.id);
}

function sessionFromElement(source) {
  return {
    action: source.dataset.dragAction,
    id: source.dataset.id,
  };
}

function startDrag(event) {
  if (levelRunning || levelChecked || event.button > 0) return;
  const source = event.currentTarget;
  event.preventDefault();
  source.setPointerCapture?.(event.pointerId);
  const rect = source.getBoundingClientRect();
  const ghost = source.cloneNode(true);
  ghost.classList.add("drag-ghost");
  ghost.style.width = `${rect.width}px`;
  ghost.style.left = `${rect.left}px`;
  ghost.style.top = `${rect.top}px`;
  document.body.appendChild(ghost);

  dragSession = {
    action: source.dataset.dragAction,
    id: source.dataset.id,
    source,
    ghost,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    moved: false,
    pointerId: event.pointerId,
  };
  source.classList.add("is-drag-source");
  playSound("pickup");
  document.addEventListener("pointermove", moveDrag);
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
}

function moveDrag(event) {
  if (!dragSession) return;
  const dx = event.clientX - dragSession.startX;
  const dy = event.clientY - dragSession.startY;
  if (Math.hypot(dx, dy) > 6) dragSession.moved = true;
  dragSession.ghost.style.left = `${event.clientX - dragSession.offsetX}px`;
  dragSession.ghost.style.top = `${event.clientY - dragSession.offsetY}px`;
  clearDropHighlights();
  const dropZone = hitTestDropZone(event.clientX, event.clientY);
  dropZone?.classList.add("is-drop-hover");
}

function endDrag(event) {
  if (!dragSession) return;
  const session = dragSession;
  const dropZone = hitTestDropZone(event.clientX, event.clientY);
  const dropped = session.moved && applyDrop(session, dropZone);
  if (!session.moved) handleDragTap(session);
  if (dropped) playSound("drop");
  if (session.moved && !dropped) playSound("wrong");
  session.source.classList.remove("is-drag-source");
  session.ghost.remove();
  clearDropHighlights();
  document.removeEventListener("pointermove", moveDrag);
  document.removeEventListener("pointerup", endDrag);
  document.removeEventListener("pointercancel", endDrag);
  dragSession = null;
}

function bindDragInteractions() {
  levelHost.querySelectorAll("[data-drag-action]").forEach((item) => {
    item.addEventListener("pointerdown", startDrag);
    item.addEventListener("click", (event) => {
      if (event.detail !== 0 || levelRunning || levelChecked) return;
      handleDragTap(sessionFromElement(item));
    });
  });
  levelHost.querySelector("[data-run-algorithm]")?.addEventListener("click", runAlgorithm);
}

function selectToggle(id) {
  if (levelRunning || levelChecked) return;
  if (!levelState.selected) levelState.selected = {};
  if (feedbackState === "wrong") {
    feedbackState = "";
    roundMessage.textContent = "调整食材后，再点击“运行算法”。";
  }
  levelState.selected[id] = !levelState.selected[id];
  playSound(levelState.selected[id] ? "drop" : "pickup");
  renderLevel();
}

function dishOutputMarkup(level) {
  if (level.outputImage) {
    return `<img class="dish-asset" src="${level.outputImage}" alt="${level.outputName}" />`;
  }

  return `
    <div class="dish-art dish-art-${level.id}" role="img" aria-label="${level.outputName}">
      <span class="dish-shine" aria-hidden="true"></span>
      <span class="dish-main dish-main-1" aria-hidden="true"></span>
      <span class="dish-main dish-main-2" aria-hidden="true"></span>
      <span class="dish-main dish-main-3" aria-hidden="true"></span>
      <span class="dish-main dish-main-4" aria-hidden="true"></span>
      <span class="dish-main dish-main-5" aria-hidden="true"></span>
      <span class="dish-main dish-main-6" aria-hidden="true"></span>
    </div>
  `;
}

function renderInputOutput() {
  const level = levels[currentLevelIndex];
  if (!levelState.selected) levelState.selected = {};
  const displayedItems = orderedLevelItems(level);
  const selectedItems = level.items.filter((item) => levelState.selected[item.id]);
  const sceneStateClass = [
    feedbackState ? `is-${feedbackState}` : "",
    levelRunning ? "is-running" : "",
  ].filter(Boolean).join(" ");
  const feedbackCopy = feedbackState === "correct"
    ? currentLevelIndex === levels.length - 1
      ? "做对啦！准备生成总结"
      : "做对啦！准备下一道菜"
    : feedbackState === "wrong"
      ? currentLevelIndex === levels.length - 1
        ? "放错食材，本题 0 分，准备生成总结"
        : "放错食材，本题 0 分，准备下一道菜"
      : feedbackState === "running"
        ? "算法正在运行..."
        : "";
  levelHost.innerHTML = `
    <div class="level-scene input-output-scene ${sceneStateClass}">
      <aside class="wood-shelf">
        <div class="shelf-tab"><span>1</span> 食材</div>
        <div class="ingredient-grid">
          ${displayedItems.map((item) => `
            <button type="button" class="ingredient-card drag-card ${levelState.selected[item.id] ? "is-selected" : ""}" data-drag-action="input-item" data-id="${item.id}" data-needed="${item.needed ? "true" : "false"}" aria-label="拖动 ${item.label}">
              <span class="sprite-icon" style='${iconStyle(item.icon)}' aria-hidden="true"></span>
              <strong>${item.label}</strong>
              <span class="grab-mark" aria-hidden="true"></span>
            </button>
          `).join("")}
        </div>
      </aside>

      <section class="counter-stage">
        <div class="basket-station station-card" data-drop-zone="input-basket">
          <div class="ribbon blue">篮子</div>
          <div class="basket-visual">
            <img src="./assets/ui/basket.png?v=dish-output-20260625" alt="输入篮" />
            <div class="basket-overlay">
              ${selectedItems.length ? selectedItems.map((item) => `
                <span class="basket-token">${tinyIconMarkup(item.icon, item.label)}</span>
              `).join("") : ""}
            </div>
          </div>
        </div>

        <div class="process-station station-card">
          <button type="button" class="run-algorithm-button ribbon orange" data-run-algorithm ${levelRunning || levelChecked ? "disabled" : ""}>
            ${feedbackState === "running" ? "运行中" : "运行"}
          </button>
          <img class="stove-asset" src="./assets/ui/stove-pan.png?v=dish-output-20260625" alt="锅在炉灶上加热" />
          <div class="steam-cloud" aria-hidden="true"><span></span><span></span><span></span></div>
          <p>${level.processText || "食材按照算法步骤处理"}</p>
        </div>

        <div class="output-station station-card">
          <div class="ribbon green"><span>3</span> 菜</div>
          <div class="sparkles" aria-hidden="true"><span></span><span></span><span></span></div>
          ${dishOutputMarkup(level)}
          <strong>${level.outputName}</strong>
        </div>

        <div class="stage-feedback ${feedbackCopy ? "is-visible" : ""}" aria-live="polite">
          ${feedbackCopy}
        </div>
      </section>
    </div>
  `;
}

function renderLevel() {
  renderInputOutput();
  bindDragInteractions();
}

function evaluateInputOutput() {
  const level = levels[currentLevelIndex];
  const selectedIds = Object.keys(levelState.selected || {}).filter((id) => levelState.selected[id]);
  const needed = level.items.filter((item) => item.needed).map((item) => item.id);
  const correctNeeded = needed.filter((id) => selectedIds.includes(id)).length;
  const wrongIds = selectedIds.filter((id) => !needed.includes(id));
  const missingIds = needed.filter((id) => !selectedIds.includes(id));
  const score = Math.max(0, Math.round((correctNeeded / needed.length) * 20) - wrongIds.length * 3);
  return {
    score,
    detail: `${level.outputName}：选中 ${selectedIds.length} 个输入，正确食材 ${correctNeeded}/${needed.length}。`,
    success: score === 20,
    selectedIds,
    neededIds: needed,
    wrongIds,
    missingIds,
  };
}

function evaluateCurrentLevel() {
  return evaluateInputOutput();
}

function recordLevelResult(result) {
  const level = levels[currentLevelIndex];
  const selectedIds = result.selectedIds || Object.keys(levelState.selected || {}).filter((id) => levelState.selected[id]);
  const neededIds = result.neededIds || level.items.filter((item) => item.needed).map((item) => item.id);
  const wrongIds = result.wrongIds || selectedIds.filter((id) => !neededIds.includes(id));
  const missingIds = result.missingIds || neededIds.filter((id) => !selectedIds.includes(id));
  levelScores[currentLevelIndex] = result.score;
  levelDetails[currentLevelIndex] = {
    round: currentLevelIndex + 1,
    id: level.id,
    title: level.title,
    dish: level.outputName,
    concept: level.concept,
    processText: level.processText,
    outputKind: level.id,
    outputImage: level.outputImage || "",
    score: result.score,
    detail: result.detail,
    success: result.success,
    selected: itemsFromIds(level, selectedIds),
    selectedIds,
    correctItems: itemsFromIds(level, neededIds),
    correctIds: neededIds,
    wrongItems: itemsFromIds(level, wrongIds),
    wrongIds,
    missingItems: itemsFromIds(level, missingIds),
    missingIds,
  };
  scoreLabel.textContent = String(totalScore());
  const resultMessage = result.success
    ? currentLevelIndex === levels.length - 1
      ? "算法运行成功，准备生成总结。"
      : "算法运行成功，准备下一道菜。"
    : currentLevelIndex === levels.length - 1
      ? "本题未通过，记 0 分，准备生成总结。"
      : "本题未通过，记 0 分，准备下一道菜。";
  resultBox.innerHTML = `
    <strong>${result.score} / 20 分</strong>
    <span>${resultMessage}</span>
  `;
  renderProgress();
}

function runAlgorithm() {
  if (levelRunning || levelChecked) return;
  clearRunTimers();
  levelRunning = true;
  feedbackState = "running";
  roundMessage.textContent = "算法正在运行...";
  resultBox.innerHTML = "<strong>运行中</strong><span>正在检查输入篮里的食材。</span>";
  playSound("drop");
  renderLevel();

  runTimerId = window.setTimeout(() => {
    const result = evaluateCurrentLevel();
    levelRunning = false;

    if (result.success) {
      levelChecked = true;
      feedbackState = "correct";
      recordLevelResult(result);
      roundMessage.textContent = currentLevelIndex === levels.length - 1
        ? "算法运行成功，准备生成总结。"
        : "算法运行成功，准备下一道菜。";
      playSound("success");
      renderLevel();
      autoAdvanceTimerId = window.setTimeout(() => {
        goNext();
      }, 2000);
      return;
    }

    const failedResult = {
      ...result,
      score: 0,
      success: false,
      detail: `${result.detail} 本题记 0 分。`,
    };
    levelChecked = true;
    feedbackState = "wrong";
    recordLevelResult(failedResult);
    roundMessage.textContent = currentLevelIndex === levels.length - 1
      ? "放错食材，本题 0 分，准备生成总结。"
      : "放错食材，本题 0 分，准备下一道菜。";
    playSound("wrong");
    renderLevel();
    autoAdvanceTimerId = window.setTimeout(() => {
      goNext();
    }, 2000);
  }, 520);
}

function checkLevel() {
  runAlgorithm();
}

function resetCurrentLevel() {
  clearRunTimers();
  const previousOrder = Array.isArray(levelState.itemOrder) ? levelState.itemOrder : [];
  initializeLevelState(previousOrder);
  levelScores[currentLevelIndex] = undefined;
  levelDetails[currentLevelIndex] = undefined;
  feedbackState = "";
  levelRunning = false;
  levelChecked = false;
  playSound("pickup");
  renderShell();
  renderLevel();
}

function goNext() {
  clearRunTimers();
  feedbackState = "";
  levelRunning = false;
  if (currentLevelIndex < levels.length - 1) {
    currentLevelIndex += 1;
    initializeLevelState();
    playSound("next");
    renderShell();
    renderLevel();
    return;
  }
  renderSummary();
}

function renderSummary() {
  clearRunTimers();
  clearInterval(timerId);
  gameScreen.classList.add("is-hidden");
  summaryScreen.classList.remove("is-hidden");
  const score = totalScore();
  finalScore.textContent = String(score);
  finalMessage.textContent = score >= 85
    ? "你已经完成 5 道菜，也看懂了 5 种算法的想法。"
    : "你已经完成算法厨房，可以回看分数较低的菜品关卡继续练习。";
  summaryResults.innerHTML = levelDetails.filter(Boolean).map((item) => `
    <article>
      <span>${item.dish} · ${item.concept}</span>
      <strong>${item.score} 分</strong>
      <p>${item.detail}</p>
    </article>
  `).join("");
  playSound("complete");
  scheduleAutoSubmit();
}

function studentProjectionContext() {
  const context = platformContext || {};
  const student = context.student || {};
  const classInfo = context.class || context.classroom || {};
  const course = context.course || {};
  const courseware = context.courseware || {};
  return {
    studentName: student.displayName || student.name || student.username || student.email || "同学",
    className: classInfo.name || classInfo.title || context.className || "课堂",
    courseName: course.title || course.name || "AI 素养智课",
    coursewareTitle: courseware.title || courseware.name || "小厨师的算法厨房",
  };
}

function buildRoundPayloads() {
  return levels.map((level, index) => {
    const detail = levelDetails[index] || {};
    const fallbackCorrectIds = level.items.filter((item) => item.needed).map((item) => item.id);
    const selected = Array.isArray(detail.selected) ? detail.selected : [];
    const score = typeof detail.score === "number" ? detail.score : 0;
    return {
      round: index + 1,
      id: level.id,
      title: level.title,
      dish: level.outputName,
      concept: level.concept,
      processText: level.processText,
      score,
      success: Boolean(detail.success),
      statusText: detail.success ? "做对啦" : "0 分",
      detail: detail.detail || `${level.outputName}：等待学习结果。`,
      outputKind: level.id,
      outputImage: level.outputImage || "",
      selected,
      selectedText: selected.length ? selected.map((item) => item.label).join("、") : "未选择食材",
      correctItems: Array.isArray(detail.correctItems) ? detail.correctItems : itemsFromIds(level, fallbackCorrectIds),
      wrongItems: Array.isArray(detail.wrongItems) ? detail.wrongItems : [],
      missingItems: Array.isArray(detail.missingItems) ? detail.missingItems : [],
    };
  });
}

function encodeProjectorPayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function projectorUrlFromPayload(payload) {
  const baseUrl = new URL("./projector.html", window.location.href);
  return `${baseUrl.toString()}#data=${encodeProjectorPayload(payload)}`;
}

function buildProjectorPayload(score, durationSeconds, rounds) {
  const context = studentProjectionContext();
  return {
    version: projectorVersion,
    title: "小厨师的算法厨房",
    headline: "完成 5 道菜，学会 5 种算法",
    conclusion: score >= 85
      ? "步骤、判断、反馈和优化都掌握得很棒。"
      : "已经完成 5 道菜，可以继续练习分数较低的回合。",
    generatedAt: new Date().toISOString(),
    ...context,
    score,
    scoreText: `${score} 分`,
    durationSeconds,
    durationText: formatDuration(durationSeconds),
    rounds,
    concepts: levels.map((level) => level.concept),
  };
}

function buildSummary() {
  const score = totalScore();
  const durationSeconds = elapsedSeconds();
  const rounds = buildRoundPayloads();
  const projectorPayload = buildProjectorPayload(score, durationSeconds, rounds);
  const projectorUrl = projectorUrlFromPayload(projectorPayload);
  return {
    title: "小厨师的算法厨房",
    displayTitle: "小厨师的算法厨房",
    displaySummary: `完成 5 道菜、5 种算法，得分 ${score}/100，用时 ${durationSeconds} 秒`,
    brief: "完成 5 道菜，认识 5 种算法思想。",
    processSummary: "学生每一关都选择食材放入篮子，再点击运行算法，系统根据输入是否正确给出回合结果。",
    score,
    scoreText: `${score} 分`,
    durationSeconds,
    projectorUrl,
    screenUrl: projectorUrl,
    levelResults: levelDetails.filter(Boolean),
    rounds,
    algorithmConcepts: [
      "输入输出算法：番茄炒蛋让食材进来、菜品出来。",
      "顺序算法：黄金煎吐司要按清楚步骤执行。",
      "条件分支算法：酸甜番茄沙拉根据口味选择路线。",
      "循环反馈算法：水果牛奶杯需要边尝边调整，合适就停。",
      "优化算法：快手早餐盘要减少等待，更快完成。",
    ],
    finalReflection: "算法不是魔法。不同的菜也能用同样清楚的输入、处理、输出方式来理解。",
    resultItems: levelDetails.filter(Boolean).map((item) => ({
      title: `${item.dish} · ${item.concept}`,
      value: `${item.score} 分`,
      description: item.detail,
    })),
    projector: {
      layout: "little-chef-round-cards-v1",
      title: "小厨师的算法厨房成果投屏",
      headline: projectorPayload.headline,
      items: rounds.map((round) => ({
        title: `第 ${round.round} 关 · ${round.dish}`,
        value: `${round.score} 分`,
        status: round.success ? "correct" : "wrong",
        description: `${round.concept}：${round.selectedText}`,
        outputKind: round.outputKind,
      })),
    },
  };
}

function openProjectorPreview() {
  window.open(buildSummary().projectorUrl, "_blank", "noopener,noreferrer");
}

async function submitScore() {
  if (submitted) return;
  submitted = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "正在保存...";
  const score = totalScore();
  const durationSeconds = elapsedSeconds();
  const summary = buildSummary();

  if (demoMode || !launchToken || !platformApiBase) {
    submitted = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "保存成绩";
    showDialog("本地预览已完成", "请从学生后台进入课件后完成正式学习；当前预览没有回传成绩。");
    return;
  }

  try {
    if (!platformVerified) await verifyPlatformLaunch();
    if (!platformVerified) throw new Error("未通过底座身份校验");
    await platformRequest("/course-runtime/launch/records", {
      launchToken,
      status: "COMPLETED",
      score,
      durationSeconds,
      summary,
    });
    submitBtn.textContent = "成绩已保存";
    showDialog("成绩已保存", `本次得分 ${score} 分，成绩已回传到底座，老师可以查看和投屏。`);
  } catch (error) {
    submitted = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "重新保存";
    showDialog("成绩保存失败", `成绩保存失败：${error.message}。请联系老师或稍后重试。`, true);
  }
}

function startGame() {
  if (!demoMode && (!launchToken || !platformApiBase || !platformVerified)) return;
  clearRunTimers();
  playSound("next");
  startScreen.classList.add("is-hidden");
  summaryScreen.classList.add("is-hidden");
  gameScreen.classList.remove("is-hidden");
  currentLevelIndex = 0;
  levelScores = [];
  levelDetails = [];
  initializeLevelState();
  feedbackState = "";
  levelRunning = false;
  levelChecked = false;
  submitted = false;
  submitBtn.disabled = false;
  submitBtn.textContent = "保存成绩";
  startTimer();
  renderShell();
  renderLevel();
}

function reviewLevels() {
  clearRunTimers();
  summaryScreen.classList.add("is-hidden");
  gameScreen.classList.remove("is-hidden");
  currentLevelIndex = 0;
  initializeLevelState();
  feedbackState = "";
  levelRunning = false;
  levelChecked = false;
  renderShell();
  renderLevel();
}

startBtn?.addEventListener("click", startGame);
resetLevelBtn?.addEventListener("click", resetCurrentLevel);
submitBtn?.addEventListener("click", submitScore);
projectorPreviewBtn?.addEventListener("click", openProjectorPreview);
reviewBtn?.addEventListener("click", reviewLevels);
completionClose?.addEventListener("click", hideDialog);
soundToggle?.addEventListener("click", toggleSound);
backButtons.forEach((button) => button?.addEventListener("click", goBackToStudent));

updateSoundToggle();
verifyPlatformLaunch();
