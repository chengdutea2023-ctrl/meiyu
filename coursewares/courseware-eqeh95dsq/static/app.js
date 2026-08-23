const tools = [
  {
    id: "ai-writing",
    title: "写作助手",
    isAi: true,
    sheet: "tool-sheet.png",
    sprite: 0,
    cols: 5,
    rows: 2,
    explanation: "它能理解写作要求，并生成新的文字内容。",
  },
  {
    id: "ai-image",
    title: "图像生成工具",
    isAi: true,
    sheet: "tool-sheet.png",
    sprite: 1,
    cols: 5,
    rows: 2,
    explanation: "它会根据提示词生成新图片，属于生成式 AI。",
  },
  {
    id: "ai-speaking",
    title: "口语陪练应用",
    isAi: true,
    sheet: "tool-sheet.png",
    sprite: 2,
    cols: 5,
    rows: 2,
    explanation: "它会识别发音并给出反馈，不只是播放录音。",
  },
  {
    id: "ai-solver",
    title: "拍照识题工具",
    isAi: true,
    sheet: "tool-sheet.png",
    sprite: 3,
    cols: 5,
    rows: 2,
    explanation: "它会识别题目图片，并生成解题步骤。",
  },
  {
    id: "ai-learning",
    title: "学习推荐平台",
    isAi: true,
    sheet: "tool-sheet.png",
    sprite: 4,
    cols: 5,
    rows: 2,
    explanation: "它会根据错题和表现推荐下一步练习。",
  },
  {
    id: "search",
    title: "普通搜索网页",
    isAi: false,
    sheet: "tool-sheet.png",
    sprite: 5,
    cols: 5,
    rows: 2,
    explanation: "这里只列出网页链接，没有理解问题并生成答案。",
  },
  {
    id: "dictionary",
    title: "电子词典",
    isAi: false,
    sheet: "tool-sheet.png",
    sprite: 6,
    cols: 5,
    rows: 2,
    explanation: "它主要查固定释义和例句，不会智能生成反馈。",
  },
  {
    id: "calculator",
    title: "计算器 App",
    isAi: false,
    sheet: "tool-sheet.png",
    sprite: 7,
    cols: 5,
    rows: 2,
    explanation: "它按确定公式计算结果，不需要学习或理解语义。",
  },
  {
    id: "video",
    title: "录播课程播放器",
    isAi: false,
    sheet: "tool-sheet.png",
    sprite: 8,
    cols: 5,
    rows: 2,
    explanation: "它只是播放固定视频，没有根据学生表现互动反馈。",
  },
  {
    id: "reminder",
    title: "日程提醒 App",
    isAi: false,
    sheet: "tool-sheet.png",
    sprite: 9,
    cols: 5,
    rows: 2,
    explanation: "它按设定时间提醒，不会主动理解或推荐学习计划。",
  },
  {
    id: "ai-car-nav",
    title: "智能汽车导航",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 0,
    cols: 5,
    rows: 4,
    explanation: "它会结合路况预测、路线选择和驾驶场景做智能判断。",
  },
  {
    id: "ai-face-door",
    title: "人脸识别门禁",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 1,
    cols: 5,
    rows: 4,
    explanation: "它需要识别人脸特征并判断是否匹配身份。",
  },
  {
    id: "ai-security",
    title: "智能监控识别",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 2,
    cols: 5,
    rows: 4,
    explanation: "它会识别人、物体或异常行为，不只是录下画面。",
  },
  {
    id: "ai-trash",
    title: "智能垃圾分类",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 3,
    cols: 5,
    rows: 4,
    explanation: "它会通过图像识别判断物品属于哪类垃圾。",
  },
  {
    id: "ai-drone",
    title: "无人机避障",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 4,
    cols: 5,
    rows: 4,
    explanation: "它会识别障碍物并动态调整飞行路线。",
  },
  {
    id: "ai-home",
    title: "智能家居助手",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 5,
    cols: 5,
    rows: 4,
    explanation: "它能理解语音或文字指令，并控制多个设备。",
  },
  {
    id: "ai-translation",
    title: "拍照翻译工具",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 6,
    cols: 5,
    rows: 4,
    explanation: "它会识别图片中的文字并转换成另一种语言。",
  },
  {
    id: "ai-recommend",
    title: "内容推荐系统",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 7,
    cols: 5,
    rows: 4,
    explanation: "它会根据个人行为和偏好推荐内容。",
  },
  {
    id: "ai-correction",
    title: "写作纠错工具",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 8,
    cols: 5,
    rows: 4,
    explanation: "它会理解句子并给出修改建议或改写内容。",
  },
  {
    id: "ai-delivery",
    title: "配送机器人规划",
    isAi: true,
    sheet: "world-tool-sheet.png",
    sprite: 9,
    cols: 5,
    rows: 4,
    explanation: "它会根据环境和路线规划自主移动。",
  },
  {
    id: "car-wash",
    title: "自动洗车机",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 10,
    cols: 5,
    rows: 4,
    explanation: "它按固定流程喷水、刷洗和烘干，通常不需要智能判断。",
  },
  {
    id: "qr-door",
    title: "二维码门禁",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 11,
    cols: 5,
    rows: 4,
    explanation: "它读取二维码并核验结果，不等于识别人脸或理解场景。",
  },
  {
    id: "elevator",
    title: "电梯按钮面板",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 12,
    cols: 5,
    rows: 4,
    explanation: "它按按钮指令运行，是规则控制，不是 AI 判断。",
  },
  {
    id: "vending",
    title: "自动售货机",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 13,
    cols: 5,
    rows: 4,
    explanation: "它根据编号和付款出货，通常只是固定流程。",
  },
  {
    id: "traffic-light",
    title: "倒计时交通灯",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 14,
    cols: 5,
    rows: 4,
    explanation: "它按预设时间切换信号，不一定会识别和推理路况。",
  },
  {
    id: "soap",
    title: "感应洗手机",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 15,
    cols: 5,
    rows: 4,
    explanation: "它通过简单传感器出泡沫，不需要理解或学习。",
  },
  {
    id: "barcode",
    title: "条码扫描器",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 16,
    cols: 5,
    rows: 4,
    explanation: "它读取条码编码，本质是固定识别规则。",
  },
  {
    id: "thermostat",
    title: "定时温控器",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 17,
    cols: 5,
    rows: 4,
    explanation: "它按设定时间调温，不会自主学习用户习惯。",
  },
  {
    id: "bike-display",
    title: "电动车仪表盘",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 18,
    cols: 5,
    rows: 4,
    explanation: "它显示速度和电量，只是传感数据展示。",
  },
  {
    id: "washer",
    title: "洗衣机程序面板",
    isAi: false,
    sheet: "world-tool-sheet.png",
    sprite: 19,
    cols: 5,
    rows: 4,
    explanation: "它按用户选择的洗涤程序运行，通常不是 AI。",
  },
];

const startScreen = document.querySelector("#startScreen");
const quizScreen = document.querySelector("#quizScreen");
const startBtn = document.querySelector("#startBtn");
const submitBtn = document.querySelector("#submitBtn");
const hintBtn = document.querySelector("#hintBtn");
const resetBtn = document.querySelector("#resetBtn");
const toolGrid = document.querySelector("#toolGrid");
const selectedCount = document.querySelector("#selectedCount");
const scoreLabel = document.querySelector("#scoreLabel");
const resultBox = document.querySelector("#resultBox");
const roundMessage = document.querySelector("#roundMessage");
const backToStudentBtn = document.querySelector("#backToStudent");
const quizBackToStudentBtn = document.querySelector("#quizBackToStudent");
const completionDialog = document.querySelector("#completionDialog");
const completionTitle = document.querySelector("#completionTitle");
const completionMessage = document.querySelector("#completionMessage");
const completionBackToStudent = document.querySelector("#completionBackToStudent");
const completionClose = document.querySelector("#completionClose");

const launchParams = new URLSearchParams(window.location.search);
const launchToken = launchParams.get("launchToken");
const platformApiBase = (launchParams.get("platformApiBase") || "").replace(/\/+$/, "");
const returnUrl = launchParams.get("returnUrl") || "";

let selected = new Set();
let submitted = false;
let currentTools = [];
let platformContext = null;
let platformVerified = false;
let quizStartedAt = 0;

function goBackToStudent() {
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }
  window.history.back();
}

function showCompletionDialog(title, message, isError = false) {
  if (!completionDialog || !completionTitle || !completionMessage) {
    return;
  }
  completionTitle.textContent = title;
  completionMessage.textContent = message;
  completionDialog.classList.toggle("is-error", isError);
  completionDialog.classList.remove("is-hidden");
}

function hideCompletionDialog() {
  completionDialog?.classList.add("is-hidden");
}

async function platformRequest(path, body) {
  if (!launchToken || !platformApiBase) {
    throw new Error("请从学生后台进入课件");
  }
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
  if (!launchToken || !platformApiBase) {
    if (roundMessage) roundMessage.textContent = "本地预览模式：请从学生后台进入课件后回传成绩。";
    return;
  }

  try {
    const data = await platformRequest("/course-runtime/launch/verify", { launchToken });
    platformContext = data.context || null;
    platformVerified = Boolean(platformContext);
    const studentName = platformContext?.student?.displayName || platformContext?.student?.email || "同学";
    if (roundMessage) roundMessage.textContent = `已连接业务底座，当前学生：${studentName}。点击开始挑战。`;
  } catch (error) {
    if (roundMessage) roundMessage.textContent = `底座身份校验失败：${error.message}。请从学生后台重新进入。`;
  }
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function pickRoundTools() {
  const aiTools = shuffle(tools.filter((tool) => tool.isAi)).slice(0, 5);
  const ordinaryTools = shuffle(tools.filter((tool) => !tool.isAi)).slice(0, 5);
  return shuffle([...aiTools, ...ordinaryTools]);
}

function spriteStyle(tool) {
  const col = tool.sprite % tool.cols;
  const row = Math.floor(tool.sprite / tool.cols);
  const x = tool.cols === 1 ? 0 : (col / (tool.cols - 1)) * 100;
  const y = tool.rows === 1 ? 0 : (row / (tool.rows - 1)) * 100;
  return [
    `background-image: url("./assets/${tool.sheet}")`,
    `background-size: ${tool.cols * 100}% ${tool.rows * 100}%`,
    `background-position: ${x}% ${y}%`,
  ].join("; ");
}

function renderTools() {
  toolGrid.innerHTML = "";
  currentTools.forEach((tool) => {
    const card = document.createElement("button");
    card.className = `tool-card ${tool.isAi ? "is-ai" : ""}`;
    card.type = "button";
    card.dataset.id = tool.id;
    card.setAttribute("aria-pressed", selected.has(tool.id) ? "true" : "false");

    if (selected.has(tool.id)) {
      card.classList.add("is-selected");
    }

    if (submitted) {
      card.classList.add("is-revealed");
      const chose = selected.has(tool.id);
      if ((chose && tool.isAi) || (!chose && !tool.isAi)) {
        card.classList.add("is-correct");
      } else {
        card.classList.add("is-wrong");
      }
    }

    card.innerHTML = `
      <div class="tool-image" style='${spriteStyle(tool)}'></div>
      <div class="tool-body">
        <div class="tool-title-row">
          <strong>${tool.title}</strong>
          <span class="check-mark">${selected.has(tool.id) ? "✓" : ""}</span>
        </div>
        <span class="tool-kind">${tool.isAi ? "AI 工具" : "非 AI 工具"}</span>
        <p class="explanation">${tool.explanation}</p>
      </div>
    `;

    card.addEventListener("click", () => toggleTool(tool.id));
    toolGrid.appendChild(card);
  });
}

function updateSelectedCount() {
  selectedCount.textContent = selected.size;
}

function toggleTool(id) {
  if (submitted) {
    return;
  }
  if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  updateSelectedCount();
  renderTools();
}

async function submitAnswers() {
  if (submitted) {
    return;
  }

  submitted = true;
  const correct = currentTools.filter((tool) => selected.has(tool.id) === tool.isAi).length;
  scoreLabel.textContent = correct;

  resultBox.innerHTML = `
    <strong>${correct} / ${currentTools.length}</strong>
    <span>${correct >= 8 ? "判断很准确。" : "再看每张卡片的解释，重点区分普通数字工具和真正的 AI 能力。"}</span>
  `;
  roundMessage.textContent = "绿色边框表示这张卡判断正确，红色边框表示需要重新思考。";
  renderTools();
  if (!launchToken || !platformApiBase) {
    roundMessage.textContent += " 本地预览模式未回传成绩。";
    showCompletionDialog("答案已提交", "这是本地预览模式，成绩没有回传到底座。可以返回学生后台重新从任务进入。");
    return;
  }

  try {
    if (!platformVerified) await verifyPlatformLaunch();
    if (!platformVerified) throw new Error("未通过底座身份校验");
    await platformRequest("/course-runtime/launch/records", {
      launchToken,
      status: "COMPLETED",
      score: correct * 10,
      durationSeconds: Math.max(1, Math.round((Date.now() - quizStartedAt) / 1000)),
      summary: {
        comment: `完成 AI 工具识别挑战，答对 ${correct}/${currentTools.length}`,
        correctCount: correct,
        questionCount: currentTools.length,
        selectedToolIds: Array.from(selected),
        tools: currentTools.map((tool) => ({
          id: tool.id,
          title: tool.title,
          isAi: tool.isAi,
          selected: selected.has(tool.id),
          correct: selected.has(tool.id) === tool.isAi,
        })),
      },
    });
    roundMessage.textContent += " 本次成绩已回传到底座。";
    showCompletionDialog("答案已提交", `本次得分 ${correct * 10} 分，成绩已保存到底座。`);
  } catch (error) {
    roundMessage.textContent += ` 成绩回传失败：${error.message}。`;
    showCompletionDialog("成绩保存失败", "成绩保存失败，请联系老师或稍后重试；你也可以先回到学生后台。", true);
  }
}

function resetQuiz() {
  hideCompletionDialog();
  selected = new Set();
  submitted = false;
  currentTools = pickRoundTools();
  selectedCount.textContent = "0";
  scoreLabel.textContent = "--";
  roundMessage.textContent = "本轮从 30 张图片题库中随机抽取。点击卡片可多选，提交后显示判断理由。";
  resultBox.innerHTML = `
    <strong>等待提交</strong>
    <span>选择你认为属于 AI 工具的图片。</span>
  `;
  renderTools();
}

startBtn.addEventListener("click", () => {
  startScreen.classList.add("is-hidden");
  quizScreen.classList.remove("is-hidden");
  quizStartedAt = Date.now();
  resetQuiz();
});

submitBtn.addEventListener("click", submitAnswers);
resetBtn.addEventListener("click", resetQuiz);
hintBtn.addEventListener("click", () => {
  roundMessage.textContent = "提示：如果工具能理解输入、生成内容、识别图像/语音、个性化推荐或反馈，它更可能是 AI 工具。";
});
backToStudentBtn.addEventListener("click", goBackToStudent);
quizBackToStudentBtn.addEventListener("click", goBackToStudent);
completionBackToStudent.addEventListener("click", goBackToStudent);
completionClose.addEventListener("click", hideCompletionDialog);

verifyPlatformLaunch();
