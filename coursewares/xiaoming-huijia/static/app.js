const GRID_SIZE = 9;
const START = { row: 4, col: 0 };
const GOAL = { row: 4, col: 8 };
const BLOCKED = Array.from({ length: 8 }, (_, row) => ({ row, col: 4 }));
const BRIDGE = { row: 8, col: 4 };
const BEST_COST = 9;
const ANIMATION_DELAY_MS = 360;
const MAP_IMAGE_SRC = "./assets/cartoon-route-map-wide.png";
const ROUTE_SCREENSHOT_FILE_NAME = "小明回家路径截图.png";

const TRANSPORTS = [
  {
    id: "bus",
    label: "公交",
    from: { row: 2, col: 2 },
    to: { row: 2, col: 5 },
    saving: 2,
    className: "bus",
  },
  {
    id: "metro",
    label: "地铁",
    from: { row: 6, col: 1 },
    to: { row: 6, col: 5 },
    saving: 3,
    className: "metro",
  },
];

const app = {
  params: new URLSearchParams(window.location.search),
  launchToken: "",
  platformApiBase: "",
  returnUrl: "",
  demoMode: false,
  launch: null,
  startedAt: Date.now(),
  route: [START],
  algorithm: null,
  searchVisited: new Set(),
  searchCurrent: new Set(),
  activeTransportIds: new Set(),
  bestPathKeys: new Set(),
  bestTransportIds: new Set(),
  algorithmCompleted: false,
  algorithmAnimating: false,
  submitted: false,
  submitting: false,
  lastRouteScreenshot: null,
  audioContext: null,
  soundEnabled: true,
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  boot();
});

function cacheElements() {
  Object.assign(els, {
    launchPanel: document.querySelector("#launchPanel"),
    launchTitle: document.querySelector("#launchTitle"),
    launchMessage: document.querySelector("#launchMessage"),
    startButton: document.querySelector("#startButton"),
    workspace: document.querySelector("#workspace"),
    board: document.querySelector("#board"),
    studentSteps: document.querySelector("#studentSteps"),
    bestSteps: document.querySelector("#bestSteps"),
    scoreValue: document.querySelector("#scoreValue"),
    routeMessage: document.querySelector("#routeMessage"),
    runAlgorithmButton: document.querySelector("#runAlgorithmButton"),
    resetRouteButton: document.querySelector("#resetRouteButton"),
    soundToggleButton: document.querySelector("#soundToggleButton"),
    algorithmTitle: document.querySelector("#algorithmTitle"),
    algorithmMessage: document.querySelector("#algorithmMessage"),
    resultTitle: document.querySelector("#resultTitle"),
    comparisonList: document.querySelector("#comparisonList"),
    summaryPreview: document.querySelector("#summaryPreview"),
    submitButton: document.querySelector("#submitButton"),
    submitStatus: document.querySelector("#submitStatus"),
    safeHomeModal: document.querySelector("#safeHomeModal"),
    safeHomeTitle: document.querySelector("#safeHomeTitle"),
    safeHomeMessage: document.querySelector("#safeHomeMessage"),
    safeHomePrimaryButton: document.querySelector("#safeHomePrimaryButton"),
    safeHomeSecondaryButton: document.querySelector("#safeHomeSecondaryButton"),
  });
}

function bindEvents() {
  document.querySelectorAll("[data-back]").forEach((button) => {
    button.addEventListener("click", backToStudentPortal);
  });

  els.startButton.addEventListener("click", startLesson);
  els.resetRouteButton.addEventListener("click", resetRoute);
  els.runAlgorithmButton.addEventListener("click", runAlgorithmAnimation);
  els.submitButton.addEventListener("click", submitRecord);
  els.soundToggleButton.addEventListener("click", toggleSound);
  els.safeHomePrimaryButton.addEventListener("click", handleSafeHomePrimary);
  els.safeHomeSecondaryButton.addEventListener("click", hideSafeHomeModal);
  updateSoundToggle();
}

async function boot() {
  app.launchToken = app.params.get("launchToken") || "";
  app.platformApiBase = (app.params.get("platformApiBase") || "").replace(/\/+$/, "");
  app.returnUrl = app.params.get("returnUrl") || "";
  app.demoMode = app.params.get("demo") === "1";
  app.algorithm = computeSearch();

  if (!app.launchToken || !app.platformApiBase) {
    if (app.demoMode) {
      app.launch = {
        student: { name: "本地演示学生" },
        courseware: { title: "小明回家" },
      };
      setLaunchReady("本地演示模式", "可以完整预览路线、交通捷径、算法动画和提交摘要，但成绩不会写入业务底座。");
      if (app.params.get("autostart") === "1") {
        window.setTimeout(startLesson, 0);
      }
      return;
    }

    els.launchTitle.textContent = "请从学生后台进入课件";
    els.launchMessage.textContent = "当前链接缺少 launchToken 或 platformApiBase，无法确认学生身份和任务。";
    els.startButton.disabled = true;
    return;
  }

  try {
    els.launchTitle.textContent = "正在校验学生身份";
    app.launch = await platformPost("/course-runtime/launch/verify", {
      launchToken: app.launchToken,
    });
    const studentName = getStudentName(app.launch);
    setLaunchReady("校验通过", `${studentName}，准备帮小明用步行、公交和地铁找到回家的最优路线。`);
  } catch (error) {
    els.launchTitle.textContent = "启动校验失败";
    els.launchMessage.textContent = getErrorMessage(error);
    els.startButton.disabled = true;
  }
}

function setLaunchReady(title, message) {
  els.launchTitle.textContent = title;
  els.launchMessage.textContent = message;
  els.startButton.disabled = false;
}

function startLesson() {
  app.startedAt = Date.now();
  document.body.classList.add("is-learning");
  els.launchPanel.classList.add("is-hidden");
  els.workspace.classList.remove("is-hidden");
  playSound("start");
  renderBoard();
  updateResults();
}

function backToStudentPortal() {
  if (app.returnUrl) {
    window.location.href = app.returnUrl;
    return;
  }
  window.history.back();
}

function resetRoute() {
  app.route = [START];
  app.searchVisited.clear();
  app.searchCurrent.clear();
  app.activeTransportIds.clear();
  app.bestPathKeys.clear();
  app.bestTransportIds.clear();
  app.algorithmCompleted = false;
  app.submitted = false;
  app.submitting = false;
  app.lastRouteScreenshot = null;
  hideSafeHomeModal();
  els.algorithmTitle.textContent = "等待算法出发";
  els.algorithmMessage.textContent = "点“算法”，看最优路线。";
  setMessage("重新出发");
  playSound("reset");
  renderBoard();
  updateResults();
}

function handleCellClick(cell) {
  if (app.algorithmAnimating) return;
  if (isBlocked(cell)) {
    playSound("invalid");
    setMessage("这里封路", true);
    return;
  }

  const existingIndex = app.route.findIndex((item) => sameCell(item, cell));
  if (existingIndex >= 0) {
    app.route = app.route.slice(0, existingIndex + 1);
    playSound(existingIndex === 0 ? "reset" : "backtrack");
    setMessage(existingIndex === 0 ? "回学校" : "退回这里");
    updateAfterRouteChange();
    return;
  }

  const last = app.route[app.route.length - 1];
  if (!isAdjacent(last, cell)) {
    playSound("invalid");
    setMessage("点旁边格子", true);
    return;
  }

  app.route.push(cell);
  const transport = getTransportFrom(cell);
  if (transport) {
    app.route.push(transport.to);
    playSound(transport.id);
    setMessage(`坐${transport.label}，省${transport.saving}步`);
  } else if (sameCell(cell, GOAL)) {
    playSound("success");
    setMessage("到家啦！看算法");
  } else if (sameCell(cell, BRIDGE)) {
    playSound("bridge");
    setMessage("过桥啦");
  } else {
    playSound("move");
    setMessage("继续走");
  }
  updateAfterRouteChange();
}

function updateAfterRouteChange() {
  app.submitted = false;
  app.submitting = false;
  app.lastRouteScreenshot = null;
  hideSafeHomeModal();
  app.algorithmCompleted = false;
  app.searchVisited.clear();
  app.searchCurrent.clear();
  app.activeTransportIds.clear();
  app.bestPathKeys.clear();
  app.bestTransportIds.clear();
  renderBoard();
  updateResults();
  if (hasReachedHome()) {
    showSafeHomeModal();
  }
}

async function runAlgorithmAnimation() {
  if (app.algorithmAnimating) return;
  app.algorithm = computeSearch();
  app.algorithmCompleted = false;
  app.searchVisited.clear();
  app.searchCurrent.clear();
  app.activeTransportIds.clear();
  app.bestPathKeys.clear();
  app.bestTransportIds.clear();
  app.algorithmAnimating = true;
  els.runAlgorithmButton.disabled = true;
  els.resetRouteButton.disabled = true;
  els.algorithmTitle.textContent = "算法开始搜索";
  els.algorithmMessage.textContent = "算法一层层找。";
  setMessage("算法出发");
  playSound("algorithm-start");

  for (let level = 0; level < app.algorithm.layers.length; level += 1) {
    const cells = app.algorithm.layers[level];
    app.searchCurrent = new Set(cells.map(cellKey));
    app.activeTransportIds = getLayerTransportIds(cells, app.algorithm.previous);
    cells.forEach((cell) => app.searchVisited.add(cellKey(cell)));
    els.algorithmTitle.textContent = level === 0 ? "第 0 步：学校" : `花费 ${level} 步可以到达`;
    const transportText = [...app.activeTransportIds]
      .map((id) => getTransportById(id))
      .filter(Boolean)
      .map((item) => `${item.label}省 ${item.saving} 步`)
      .join("，");
    els.algorithmMessage.textContent = level === BEST_COST
      ? "找到家。"
      : transportText || `第 ${level} 步。`;
    setMessage(level === BEST_COST ? "找到家" : app.activeTransportIds.size ? "发现捷径" : `找第${level}步`);
    playSound(level === 0 ? "search-start" : app.activeTransportIds.size ? "transport-search" : "search");
    renderBoard();
    await sleep(ANIMATION_DELAY_MS);
  }

  app.searchCurrent.clear();
  app.activeTransportIds.clear();
  app.bestPathKeys = new Set(app.algorithm.path.map(cellKey));
  app.bestTransportIds = getRouteTransportIds(app.algorithm.path);
  app.algorithmCompleted = true;
  app.algorithmAnimating = false;
  els.runAlgorithmButton.disabled = false;
  els.resetRouteButton.disabled = false;
  els.algorithmTitle.textContent = "算法找到了最优路线";
  els.algorithmMessage.textContent = `最优 ${BEST_COST} 步。`;
  setMessage(`最优 ${BEST_COST} 步`);
  playSound("success");
  renderBoard();
  updateResults();
  if (hasReachedHome()) {
    showSafeHomeModal();
  }
}

function renderBoard() {
  const routeKeys = new Map(app.route.map((cell, index) => [cellKey(cell), index]));
  const routeTransportIds = getRouteTransportIds(app.route);
  els.board.innerHTML = "";

  for (const transport of TRANSPORTS) {
    els.board.append(createTransportLine(transport, routeTransportIds));
  }

  for (let row = 0; row < GRID_SIZE; row += 1) {
    for (let col = 0; col < GRID_SIZE; col += 1) {
      const cell = { row, col };
      const key = cellKey(cell);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "map-cell";
      button.dataset.row = String(row);
      button.dataset.col = String(col);
      button.setAttribute("aria-label", getCellLabel(cell));
      button.addEventListener("click", () => handleCellClick(cell));

      const transportPoint = getTransportPoint(cell);
      if (transportPoint) {
        button.classList.add("is-transport", `is-${transportPoint.transport.className}`);
        button.classList.add(transportPoint.role === "from" ? "is-transport-start" : "is-transport-end");
      }
      if (isBlocked(cell)) {
        button.classList.add("is-blocked");
        button.setAttribute("aria-disabled", "true");
      }
      if (sameCell(cell, START)) button.classList.add("is-start");
      if (sameCell(cell, GOAL)) button.classList.add("is-goal");
      if (sameCell(cell, BRIDGE)) button.classList.add("is-bridge");
      if (app.searchVisited.has(key)) button.classList.add("is-search-visited");
      if (app.searchCurrent.has(key)) button.classList.add("is-search-current");
      if (app.bestPathKeys.has(key)) button.classList.add("is-best-path");
      if (routeKeys.has(key)) {
        button.classList.add("is-route");
        button.style.setProperty("--step-index", routeKeys.get(key));
      }

      button.innerHTML = getCellContent(cell, routeKeys.get(key));
      els.board.append(button);
    }
  }
}

function createTransportLine(transport, routeTransportIds) {
  const line = document.createElement("span");
  const active = app.activeTransportIds.has(transport.id);
  const best = app.bestTransportIds.has(transport.id);
  const used = routeTransportIds.has(transport.id);
  line.className = [
    "transport-line",
    `transport-line-${transport.className}`,
    active ? "is-active" : "",
    best ? "is-best" : "",
    used ? "is-used" : "",
  ].filter(Boolean).join(" ");
  const from = cellCenterPercent(transport.from);
  const to = cellCenterPercent(transport.to);
  line.style.left = `${from.x}%`;
  line.style.top = `${from.y}%`;
  line.style.width = `${Math.max(0, to.x - from.x)}%`;
  return line;
}

function getCellContent(cell, routeIndex) {
  if (sameCell(cell, START)) {
    return `<span class="landmark-badge landmark-school"><span class="cell-main">学校</span><small>起点</small></span>`;
  }
  if (sameCell(cell, GOAL)) {
    return `<span class="landmark-badge landmark-home"><span class="cell-main">家</span><small>终点</small></span>`;
  }
  if (sameCell(cell, BRIDGE)) {
    return `<span class="landmark-badge landmark-bridge"><span class="cell-main">桥</span><small>可过</small></span>`;
  }
  if (isBlocked(cell)) {
    return `<span class="landmark-badge landmark-blocked"><span class="cell-main">封路</span><small>施工</small></span>`;
  }
  if (typeof routeIndex === "number") {
    return `<span class="route-step">${routeIndex}</span>`;
  }

  const transportPoint = getTransportPoint(cell);
  if (transportPoint) {
    const suffix = transportPoint.role === "from" ? "上车" : "到站";
    return `<span class="landmark-badge landmark-${transportPoint.transport.className}"><span class="cell-main">${transportPoint.transport.label}</span><small>${suffix}</small></span>`;
  }

  const key = cellKey(cell);
  if (app.bestPathKeys.has(key)) {
    return `<span class="best-dot"></span>`;
  }
  if (app.searchCurrent.has(key) || app.searchVisited.has(key)) {
    const level = app.algorithm?.distance.get(key);
    return `<span class="search-step">${level ?? ""}</span>`;
  }
  return `<span class="road-dot"></span>`;
}

function updateResults() {
  const studentCost = getStudentCost();
  const reachedHome = hasReachedHome();
  const score = reachedHome ? computeScore(studentCost) : null;
  const extraCost = reachedHome ? Math.max(0, studentCost - BEST_COST) : null;
  const transportStats = getTransportStats(app.route);

  els.studentSteps.textContent = String(studentCost);
  els.bestSteps.textContent = String(BEST_COST);
  els.scoreValue.textContent = score === null ? "--" : String(score);

  if (!reachedHome) {
    els.resultTitle.textContent = "还没到家";
    els.comparisonList.innerHTML = `
      <span>花费 ${studentCost}</span>
      <span>省 ${transportStats.savedSteps}</span>
      <span>继续走</span>
    `;
    els.summaryPreview.textContent = "还没到家。";
    els.submitButton.disabled = true;
    els.submitStatus.textContent = "看算法后提交。";
    updatePrimaryAction();
    return;
  }

  const optimalText = extraCost === 0 ? "最优路线" : `多 ${extraCost} 步`;
  els.resultTitle.textContent = optimalText;
  els.comparisonList.innerHTML = `
    <span>你 ${studentCost}</span>
    <span>最优 ${BEST_COST}</span>
    <span>省 ${transportStats.savedSteps}</span>
    <span>${extraCost === 0 ? "真棒" : "还能更快"}</span>
  `;

  const summary = buildSummary();
  els.summaryPreview.innerHTML = `
    <strong>${summary.scoreText}</strong>
    <span>${summary.brief}</span>
    <span>${summary.resultItems.map((item) => `${item.label}：${item.value}`).join(" · ")}</span>
  `;
  els.submitButton.disabled = !app.algorithmCompleted;
  els.submitStatus.textContent = app.submitted
    ? "已提交。可以回学生后台。"
    : app.algorithmCompleted
      ? "可以提交。"
      : "先看算法。";
  updatePrimaryAction();
  updateSafeHomeModal();
}

function updatePrimaryAction() {
  const showSubmit = hasReachedHome() && app.algorithmCompleted;
  const canSubmit = showSubmit && !app.submitted && !app.submitting;
  const label = els.submitButton.querySelector("span");
  if (label) {
    label.textContent = app.submitting ? "提交中" : app.submitted ? "已交" : "提交";
  }
  els.runAlgorithmButton.classList.toggle("is-hidden", showSubmit);
  els.submitButton.classList.toggle("is-hidden", !showSubmit);
  els.runAlgorithmButton.disabled = app.algorithmAnimating;
  els.submitButton.disabled = !canSubmit;
  updateSafeHomeModal();
}

function computeScore(studentCost) {
  return Math.max(0, 100 - Math.max(0, studentCost - BEST_COST) * 5);
}

function computeSearch() {
  const queue = [START];
  const previous = new Map([[cellKey(START), null]]);
  const distance = new Map([[cellKey(START), 0]]);
  const layers = [[START]];

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    if (sameCell(current, GOAL)) break;

    for (const edge of getNeighbors(current)) {
      const key = cellKey(edge.cell);
      if (previous.has(key) || isBlocked(edge.cell)) continue;

      previous.set(key, { cell: current, edge });
      const nextDistance = (distance.get(cellKey(current)) || 0) + 1;
      distance.set(key, nextDistance);
      if (!layers[nextDistance]) layers[nextDistance] = [];
      layers[nextDistance].push(edge.cell);
      queue.push(edge.cell);
    }
  }

  const path = [];
  let current = GOAL;
  while (current) {
    path.push(current);
    current = previous.get(cellKey(current))?.cell || null;
  }
  path.reverse();

  const goalDistance = distance.get(cellKey(GOAL)) ?? layers.length - 1;
  return { layers: layers.slice(0, goalDistance + 1), path, previous, distance };
}

function getNeighbors(cell) {
  const offsets = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];
  const walkingEdges = offsets
    .map((offset) => ({ row: cell.row + offset.row, col: cell.col + offset.col }))
    .filter((item) => item.row >= 0 && item.row < GRID_SIZE && item.col >= 0 && item.col < GRID_SIZE)
    .filter((item) => !isBlocked(item))
    .map((item) => ({ cell: item, type: "walk", transportId: null }));

  const transport = getTransportFrom(cell);
  if (transport) {
    walkingEdges.push({ cell: transport.to, type: "transport", transportId: transport.id });
  }

  return walkingEdges;
}

function buildSummary(routeArtifact = app.lastRouteScreenshot) {
  const studentCost = getStudentCost();
  const score = hasReachedHome() ? computeScore(studentCost) : 0;
  const extraCost = hasReachedHome() ? Math.max(0, studentCost - BEST_COST) : null;
  const durationSeconds = Math.max(1, Math.round((Date.now() - app.startedAt) / 1000));
  const transportStats = getTransportStats(app.route);
  return {
    displayTitle: "小明回家",
    brief: hasReachedHome()
      ? `学生用 ${studentCost} 步花费帮小明回家，交通工具共节省 ${transportStats.savedSteps} 步，算法最优花费为 ${BEST_COST} 步。`
      : "学生尚未完成回家路线。",
    scoreText: `${score} 分`,
    resultItems: [
      { label: "学生花费", value: hasReachedHome() ? `${studentCost} 步` : "未到家" },
      { label: "算法最优", value: `${BEST_COST} 步` },
      { label: "交通节省", value: `${transportStats.savedSteps} 步` },
      { label: "交通工具", value: transportStats.usedLabels.length ? transportStats.usedLabels.join("、") : "未使用" },
      { label: "算法动画", value: app.algorithmCompleted ? "已观看" : "未观看" },
      { label: "用时", value: `${durationSeconds} 秒` },
    ],
    processSummary: hasReachedHome()
      ? `学生先手动画出一条花费 ${studentCost} 步的路线，使用 ${transportStats.usedLabels.length ? transportStats.usedLabels.join("、") : "无交通工具"}，再观看带交通捷径的最短路搜索，算法最优花费为 ${BEST_COST} 步。`
      : "学生开始规划路线，但尚未到达终点。",
    studentRoute: app.route.map(serializeCell),
    algorithmRoute: app.algorithm.path.map(serializeCell),
    transportsUsed: transportStats.used,
    savedSteps: transportStats.savedSteps,
    shortestCost: BEST_COST,
    studentCost,
    shortestSteps: BEST_COST,
    studentSteps: studentCost,
    extraSteps: extraCost,
    optimal: hasReachedHome() && studentCost === BEST_COST,
    routeScreenshot: routeArtifact,
    routeScreenshotUrl: routeArtifact?.url || null,
    artifacts: routeArtifact ? [routeArtifact] : [],
    map: {
      gridSize: GRID_SIZE,
      start: serializeCell(START),
      goal: serializeCell(GOAL),
      bridge: serializeCell(BRIDGE),
      blocked: BLOCKED.map(serializeCell),
      transports: TRANSPORTS.map((item) => ({
        id: item.id,
        label: item.label,
        from: serializeCell(item.from),
        to: serializeCell(item.to),
        saving: item.saving,
      })),
    },
  };
}

async function submitRecord() {
  if (app.submitting) return;
  if (!hasReachedHome()) {
    playSound("invalid");
    setMessage("先到家", true);
    setSubmitStatus("先到家。", true);
    return;
  }
  if (!app.algorithmCompleted) {
    playSound("invalid");
    setMessage("先看算法", true);
    setSubmitStatus("先看算法。", true);
    return;
  }

  const studentCost = getStudentCost();
  const score = computeScore(studentCost);
  const durationSeconds = Math.max(1, Math.round((Date.now() - app.startedAt) / 1000));

  app.submitting = true;
  updatePrimaryAction();

  if (app.demoMode) {
    try {
      setMessage("生成截图");
      setSubmitStatus("正在生成路径截图。", false);
      app.lastRouteScreenshot = await createRouteScreenshotArtifact(score, durationSeconds);
      const summary = buildSummary(app.lastRouteScreenshot);
      app.submitted = true;
      playSound("submit");
      setMessage("提交啦");
      setSubmitStatus("演示提交完成。", false);
      els.summaryPreview.innerHTML = `
        <strong>演示提交完成：${score} 分</strong>
        <span>${summary.processSummary}</span>
      `;
      updateResults();
      showSafeHomeModal();
    } catch (error) {
      playSound("invalid");
      setMessage("截图失败", true);
      setSubmitStatus(`截图失败：${getErrorMessage(error)}`, true);
    } finally {
      app.submitting = false;
      updatePrimaryAction();
    }
    return;
  }

  try {
    setMessage("保存截图");
    setSubmitStatus("正在保存路径截图。", false);
    const screenshotArtifact = await createRouteScreenshotArtifact(score, durationSeconds);
    const uploadedArtifact = await platformPost("/course-runtime/launch/artifacts", {
      launchToken: app.launchToken,
      fileName: screenshotArtifact.fileName,
      mimeType: screenshotArtifact.mimeType,
      kind: screenshotArtifact.kind,
      contentBase64: screenshotArtifact.contentBase64,
      metadata: screenshotArtifact.metadata,
    });
    app.lastRouteScreenshot = normalizeRouteScreenshotArtifact(uploadedArtifact);
    const summary = buildSummary(app.lastRouteScreenshot);
    setMessage("提交中");
    setSubmitStatus("截图已保存，正在提交。", false);
    await platformPost("/course-runtime/launch/records", {
      launchToken: app.launchToken,
      status: "COMPLETED",
      score,
      durationSeconds,
      summary,
    });
    app.submitted = true;
    playSound("submit");
    setMessage("提交啦");
    setSubmitStatus("已提交。可以回学生后台。", false);
    updateResults();
    showSafeHomeModal();
  } catch (error) {
    playSound("invalid");
    setMessage(app.lastRouteScreenshot ? "提交失败" : "截图失败", true);
    setSubmitStatus(`请重试：${getErrorMessage(error)}`, true);
  } finally {
    app.submitting = false;
    updatePrimaryAction();
  }
}

function showSafeHomeModal() {
  if (!hasReachedHome()) return;
  updateSafeHomeModal();
  els.safeHomeModal.classList.remove("is-hidden");
}

function hideSafeHomeModal() {
  if (!els.safeHomeModal) return;
  els.safeHomeModal.classList.add("is-hidden");
}

function updateSafeHomeModal() {
  if (!els.safeHomeModal) return;

  els.safeHomeTitle.textContent = "安全回家";
  if (app.submitted) {
    els.safeHomeMessage.textContent = "学习记录已提交，可以回学生后台啦。";
    els.safeHomePrimaryButton.textContent = "回到学生后台";
    els.safeHomeSecondaryButton.textContent = "留下看看";
    els.safeHomePrimaryButton.disabled = false;
    return;
  }

  if (app.submitting) {
    els.safeHomeMessage.textContent = "正在保存小明的回家路径截图。";
    els.safeHomePrimaryButton.textContent = "提交中";
    els.safeHomeSecondaryButton.textContent = "继续看看";
    els.safeHomePrimaryButton.disabled = true;
    return;
  }

  if (app.algorithmCompleted) {
    els.safeHomeMessage.textContent = "小明安全到家啦！提交给老师后就能回后台。";
    els.safeHomePrimaryButton.textContent = "提交";
    els.safeHomeSecondaryButton.textContent = "继续看看";
    els.safeHomePrimaryButton.disabled = false;
    return;
  }

  els.safeHomeMessage.textContent = "小明安全到家啦！看完算法后提交给老师。";
  els.safeHomePrimaryButton.textContent = "看算法";
  els.safeHomeSecondaryButton.textContent = "继续看看";
  els.safeHomePrimaryButton.disabled = app.algorithmAnimating;
}

function handleSafeHomePrimary() {
  if (app.submitted) {
    backToStudentPortal();
    return;
  }

  hideSafeHomeModal();
  if (app.algorithmCompleted) {
    submitRecord();
    return;
  }

  runAlgorithmAnimation();
}

async function createRouteScreenshotArtifact(score, durationSeconds) {
  const dataUrl = await createRouteScreenshotDataUrl(score);
  const contentBase64 = dataUrl.split(",")[1] || "";
  if (!contentBase64) {
    throw new Error("路径截图生成失败");
  }

  const transportStats = getTransportStats(app.route);
  const localArtifact = {
    title: "小明回家路径截图",
    url: dataUrl,
    mimeType: "image/png",
    kind: "route-screenshot",
  };

  return {
    ...localArtifact,
    fileName: ROUTE_SCREENSHOT_FILE_NAME,
    contentBase64,
    metadata: {
      title: "小明回家路径截图",
      scene: "final-route",
      score,
      durationSeconds,
      studentCost: getStudentCost(),
      shortestCost: BEST_COST,
      savedSteps: transportStats.savedSteps,
      transportsUsed: transportStats.used,
      studentRoute: app.route.map(serializeCell),
      algorithmRoute: app.algorithm.path.map(serializeCell),
    },
  };
}

async function createRouteScreenshotDataUrl(score) {
  const image = await loadImage(new URL(MAP_IMAGE_SRC, window.location.href).href);
  const canvas = document.createElement("canvas");
  const width = image.naturalWidth || 1672;
  const height = image.naturalHeight || Math.round((width * 941) / 1672);
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("浏览器不支持截图画布");
  }

  context.drawImage(image, 0, 0, width, height);
  drawScreenshotOverlay(context, width, height, score);
  return canvas.toDataURL("image/png");
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("地图图片加载失败"));
    image.src = src;
  });
}

function drawScreenshotOverlay(context, width, height, score) {
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";

  if (app.algorithmCompleted && app.algorithm?.path?.length) {
    drawScreenshotPath(context, app.algorithm.path, width, height, {
      color: "rgba(255, 205, 55, 0.92)",
      width: 24,
      shadow: "rgba(134, 94, 12, 0.24)",
      dashed: false,
    });
  }

  drawScreenshotPath(context, app.route, width, height, {
    color: "rgba(28, 162, 70, 0.96)",
    width: 20,
    shadow: "rgba(8, 77, 37, 0.3)",
    dashed: false,
  });
  drawScreenshotRoutePoints(context, width, height);
  drawScreenshotBadges(context, width, height);
  drawScreenshotScorePill(context, width, height, score);
  context.restore();
}

function drawScreenshotPath(context, route, width, height, options) {
  if (!route || route.length < 2) return;
  const scale = width / 1672;
  context.save();
  context.lineWidth = options.width * scale;
  context.strokeStyle = options.color;
  context.shadowColor = options.shadow;
  context.shadowBlur = 12 * scale;
  context.shadowOffsetY = 4 * scale;

  for (let index = 1; index < route.length; index += 1) {
    const from = screenshotCellPoint(route[index - 1], width, height);
    const to = screenshotCellPoint(route[index], width, height);
    const transport = getTransportForSegment(route[index - 1], route[index]);
    context.setLineDash(transport ? [22 * scale, 14 * scale] : []);
    context.strokeStyle = transport
      ? transport.id === "metro"
        ? "rgba(31, 144, 232, 0.96)"
        : "rgba(255, 157, 22, 0.96)"
      : options.color;
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  context.restore();
}

function drawScreenshotRoutePoints(context, width, height) {
  const scale = width / 1672;
  app.route.forEach((cell, index) => {
    const point = screenshotCellPoint(cell, width, height);
    context.save();
    context.fillStyle = index === 0 ? "#77caff" : sameCell(cell, GOAL) ? "#ff7a72" : "#32c65b";
    context.strokeStyle = "#ffffff";
    context.lineWidth = 5 * scale;
    context.shadowColor = "rgba(35, 52, 33, 0.28)";
    context.shadowBlur = 10 * scale;
    context.beginPath();
    context.arc(point.x, point.y, 22 * scale, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.shadowBlur = 0;
    context.fillStyle = "#ffffff";
    context.font = `900 ${22 * scale}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(index), point.x, point.y + 1 * scale);
    context.restore();
  });
}

function drawScreenshotBadges(context, width, height) {
  drawScreenshotBadge(context, START, "学校", "起点", "#77caff", "#063b73", width, height);
  drawScreenshotBadge(context, GOAL, "家", "终点", "#ff7a72", "#ffffff", width, height);
  drawScreenshotBadge(context, BRIDGE, "桥", "可过", "#ffbf39", "#4b2b00", width, height);
  TRANSPORTS.forEach((transport) => {
    const color = transport.id === "metro" ? "#2b9bf0" : "#ffc72e";
    const textColor = transport.id === "metro" ? "#ffffff" : "#4d2d00";
    drawScreenshotBadge(context, transport.from, transport.label, "上车", color, textColor, width, height);
    drawScreenshotBadge(context, transport.to, transport.label, "到站", color, textColor, width, height);
  });
  BLOCKED.forEach((cell) => {
    drawScreenshotBadge(context, cell, "封路", "施工", "#c8332b", "#ffffff", width, height, 0.82);
  });
}

function drawScreenshotBadge(context, cell, title, subtitle, fill, color, width, height, opacity = 0.94) {
  const scale = width / 1672;
  const point = screenshotCellPoint(cell, width, height);
  const badgeWidth = 92 * scale;
  const badgeHeight = 62 * scale;
  const x = point.x - badgeWidth / 2;
  const y = point.y - badgeHeight / 2;

  context.save();
  context.globalAlpha = opacity;
  context.fillStyle = fill;
  context.strokeStyle = "rgba(255, 255, 255, 0.95)";
  context.lineWidth = 5 * scale;
  context.shadowColor = "rgba(49, 35, 18, 0.22)";
  context.shadowBlur = 9 * scale;
  context.shadowOffsetY = 5 * scale;
  roundedRect(context, x, y, badgeWidth, badgeHeight, 12 * scale);
  context.fill();
  context.stroke();
  context.shadowBlur = 0;
  context.globalAlpha = 1;
  context.fillStyle = color;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `1000 ${24 * scale}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
  context.fillText(title, point.x, y + 24 * scale);
  context.font = `900 ${15 * scale}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
  context.fillText(subtitle, point.x, y + 45 * scale);
  context.restore();
}

function drawScreenshotScorePill(context, width, height, score) {
  const scale = width / 1672;
  const transportStats = getTransportStats(app.route);
  const text = `小明安全回家  花费 ${getStudentCost()}  最优 ${BEST_COST}  得分 ${score}  省 ${transportStats.savedSteps}`;
  const x = 28 * scale;
  const y = 24 * scale;
  const pillWidth = Math.min(width - 56 * scale, 720 * scale);
  const pillHeight = 56 * scale;

  context.save();
  context.fillStyle = "rgba(255, 255, 255, 0.92)";
  context.strokeStyle = "rgba(87, 200, 77, 0.5)";
  context.lineWidth = 3 * scale;
  roundedRect(context, x, y, pillWidth, pillHeight, 24 * scale);
  context.fill();
  context.stroke();
  context.fillStyle = "#3a250e";
  context.font = `900 ${23 * scale}px "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(text, x + 24 * scale, y + pillHeight / 2);
  context.restore();
}

function screenshotCellPoint(cell, width, height) {
  return {
    x: ((cell.col + 0.5) / GRID_SIZE) * width,
    y: ((cell.row + 0.5) / GRID_SIZE) * height,
  };
}

function roundedRect(context, x, y, width, height, radius) {
  if (typeof context.roundRect === "function") {
    context.beginPath();
    context.roundRect(x, y, width, height, radius);
    return;
  }

  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
}

function normalizeRouteScreenshotArtifact(artifact) {
  return {
    id: artifact.id,
    title: artifact.originalFileName || ROUTE_SCREENSHOT_FILE_NAME,
    url: artifact.url,
    mimeType: artifact.mimeType || "image/png",
    kind: artifact.kind || "route-screenshot",
  };
}

function toggleSound() {
  app.soundEnabled = !app.soundEnabled;
  updateSoundToggle();
  if (app.soundEnabled) playSound("toggle-on");
}

function updateSoundToggle() {
  if (!els.soundToggleButton) return;
  const label = els.soundToggleButton.querySelector("[data-sound-label]");
  if (label) label.textContent = app.soundEnabled ? "音效" : "静音";
  els.soundToggleButton.setAttribute("aria-pressed", String(app.soundEnabled));
  els.soundToggleButton.setAttribute("aria-label", app.soundEnabled ? "关闭音效" : "打开音效");
}

function playSound(kind) {
  if (!app.soundEnabled) return;
  const context = getAudioContext();
  if (!context) return;

  if (context.state === "suspended") {
    context.resume().catch(() => {});
  }

  const notes = getSoundNotes(kind);
  const startAt = context.currentTime + 0.018;
  notes.forEach((note) => {
    scheduleTone(context, {
      ...note,
      when: startAt + (note.offset || 0),
    });
  });
}

function getAudioContext() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!app.audioContext || app.audioContext.state === "closed") {
    app.audioContext = new AudioContextClass();
  }
  return app.audioContext;
}

function getSoundNotes(kind) {
  const quietTick = { frequency: 700, endFrequency: 610, duration: 0.055, volume: 0.016, type: "sine" };
  switch (kind) {
    case "start":
      return [
        { frequency: 392, duration: 0.085, volume: 0.032, type: "triangle" },
        { frequency: 523, offset: 0.08, duration: 0.11, volume: 0.036, type: "triangle" },
      ];
    case "move":
      return [
        { frequency: 500, endFrequency: 650, duration: 0.075, volume: 0.028, type: "sine" },
      ];
    case "bridge":
      return [
        { frequency: 440, endFrequency: 560, duration: 0.07, volume: 0.032, type: "triangle" },
        { frequency: 660, offset: 0.055, duration: 0.085, volume: 0.026, type: "sine" },
      ];
    case "backtrack":
      return [
        { frequency: 360, endFrequency: 300, duration: 0.075, volume: 0.026, type: "triangle" },
        { frequency: 300, offset: 0.06, duration: 0.075, volume: 0.022, type: "triangle" },
      ];
    case "reset":
      return [
        { frequency: 330, endFrequency: 420, duration: 0.08, volume: 0.025, type: "sine" },
      ];
    case "invalid":
      return [
        { frequency: 185, endFrequency: 140, duration: 0.16, volume: 0.038, type: "triangle" },
      ];
    case "bus":
      return [
        { frequency: 392, duration: 0.075, volume: 0.034, type: "triangle" },
        { frequency: 494, offset: 0.065, duration: 0.08, volume: 0.035, type: "triangle" },
        { frequency: 587, offset: 0.13, duration: 0.095, volume: 0.032, type: "triangle" },
      ];
    case "metro":
      return [
        { frequency: 330, duration: 0.08, volume: 0.032, type: "sine" },
        { frequency: 523, offset: 0.06, duration: 0.085, volume: 0.036, type: "sine" },
        { frequency: 784, offset: 0.125, duration: 0.12, volume: 0.034, type: "sine" },
      ];
    case "algorithm-start":
      return [
        { frequency: 440, duration: 0.06, volume: 0.024, type: "sine" },
        { frequency: 660, offset: 0.055, duration: 0.075, volume: 0.026, type: "sine" },
      ];
    case "search-start":
      return [
        { frequency: 520, duration: 0.055, volume: 0.018, type: "sine" },
      ];
    case "search":
      return [quietTick];
    case "transport-search":
      return [
        { frequency: 520, duration: 0.052, volume: 0.019, type: "sine" },
        { frequency: 760, offset: 0.048, duration: 0.065, volume: 0.021, type: "sine" },
      ];
    case "success":
      return [
        { frequency: 523, duration: 0.085, volume: 0.036, type: "triangle" },
        { frequency: 659, offset: 0.075, duration: 0.095, volume: 0.038, type: "triangle" },
        { frequency: 784, offset: 0.15, duration: 0.15, volume: 0.036, type: "triangle" },
      ];
    case "submit":
      return [
        { frequency: 659, duration: 0.08, volume: 0.032, type: "sine" },
        { frequency: 880, offset: 0.075, duration: 0.13, volume: 0.036, type: "sine" },
      ];
    case "toggle-on":
      return [
        { frequency: 620, endFrequency: 760, duration: 0.08, volume: 0.026, type: "sine" },
      ];
    default:
      return [];
  }
}

function scheduleTone(context, note) {
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const startAt = note.when;
    const endAt = startAt + note.duration;

    oscillator.type = note.type || "sine";
    oscillator.frequency.setValueAtTime(note.frequency, startAt);
    if (note.endFrequency) {
      oscillator.frequency.exponentialRampToValueAtTime(note.endFrequency, endAt);
    }

    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(note.volume || 0.025, startAt + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(endAt + 0.02);
  } catch (error) {
    // Audio feedback is optional; interaction should never fail because sound is unavailable.
  }
}

function platformPost(path, body) {
  requireLaunchContext();
  return fetch(`${app.platformApiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || "底座接口请求失败");
    }
    return data;
  });
}

function requireLaunchContext() {
  if (!app.launchToken || !app.platformApiBase) {
    throw new Error("请从学生后台进入课件");
  }
}

function getStudentName(launch) {
  return launch?.student?.name
    || launch?.student?.displayName
    || launch?.context?.student?.name
    || launch?.context?.student?.displayName
    || "同学";
}

function getStudentCost() {
  return Math.max(0, app.route.length - 1);
}

function hasReachedHome() {
  return sameCell(app.route[app.route.length - 1], GOAL);
}

function isBlocked(cell) {
  return BLOCKED.some((item) => sameCell(item, cell));
}

function isAdjacent(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1;
}

function sameCell(a, b) {
  return a.row === b.row && a.col === b.col;
}

function cellKey(cell) {
  return `${cell.row},${cell.col}`;
}

function serializeCell(cell) {
  return { row: cell.row, col: cell.col };
}

function getTransportFrom(cell) {
  return TRANSPORTS.find((transport) => sameCell(transport.from, cell)) || null;
}

function getTransportById(id) {
  return TRANSPORTS.find((transport) => transport.id === id) || null;
}

function getTransportPoint(cell) {
  for (const transport of TRANSPORTS) {
    if (sameCell(transport.from, cell)) return { transport, role: "from" };
    if (sameCell(transport.to, cell)) return { transport, role: "to" };
  }
  return null;
}

function getTransportForSegment(from, to) {
  return TRANSPORTS.find((transport) => sameCell(transport.from, from) && sameCell(transport.to, to)) || null;
}

function getRouteTransportIds(route) {
  const ids = new Set();
  for (let index = 1; index < route.length; index += 1) {
    const transport = getTransportForSegment(route[index - 1], route[index]);
    if (transport) ids.add(transport.id);
  }
  return ids;
}

function getTransportStats(route) {
  const used = [];
  for (let index = 1; index < route.length; index += 1) {
    const transport = getTransportForSegment(route[index - 1], route[index]);
    if (transport) {
      used.push({
        id: transport.id,
        label: transport.label,
        from: serializeCell(transport.from),
        to: serializeCell(transport.to),
        saving: transport.saving,
      });
    }
  }
  return {
    used,
    usedLabels: used.map((item) => item.label),
    savedSteps: used.reduce((total, item) => total + item.saving, 0),
  };
}

function getLayerTransportIds(cells, previous) {
  const ids = new Set();
  cells.forEach((cell) => {
    const edge = previous.get(cellKey(cell))?.edge;
    if (edge?.transportId) ids.add(edge.transportId);
  });
  return ids;
}

function cellCenterPercent(cell) {
  return {
    x: ((cell.col + 0.5) / GRID_SIZE) * 100,
    y: ((cell.row + 0.5) / GRID_SIZE) * 100,
  };
}

function getCellLabel(cell) {
  if (sameCell(cell, START)) return "学校，起点";
  if (sameCell(cell, GOAL)) return "家，终点";
  if (sameCell(cell, BRIDGE)) return "小桥，可以通过";
  if (isBlocked(cell)) return "施工封路，不能通过";
  const transportPoint = getTransportPoint(cell);
  if (transportPoint) {
    return `${transportPoint.transport.label}${transportPoint.role === "from" ? "上车站" : "到站"}，省 ${transportPoint.transport.saving} 步`;
  }
  return `道路，第 ${cell.row + 1} 行，第 ${cell.col + 1} 列`;
}

function setMessage(message, isError = false) {
  els.routeMessage.textContent = message;
  els.routeMessage.classList.toggle("is-error", isError);
}

function setSubmitStatus(message, isError) {
  els.submitStatus.textContent = message;
  els.submitStatus.classList.toggle("is-error", isError);
}

function getErrorMessage(error) {
  return error?.message || "未知错误";
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
