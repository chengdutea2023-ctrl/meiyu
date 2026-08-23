const CATEGORY_LABELS = {
  generate: "生成式 AI",
  judge: "识别判断型 AI",
};

const CATEGORY_HINTS = {
  generate: "写、画、配音、续写、创造",
  judge: "识别、分类、匹配、检测、推荐",
};

const questionBank = [
  {
    id: "story-writer",
    title: "AI 故事写作助手",
    kind: "generate",
    image: "./assets/questions/story-writer.jpg",
    explanation: "它会根据提示写出新的故事内容，属于生成式 AI。",
  },
  {
    id: "image-generator",
    title: "AI 图像生成画板",
    kind: "generate",
    image: "./assets/questions/image-generator.jpg",
    explanation: "它会根据文字提示画出新图片，属于生成式 AI。",
  },
  {
    id: "voice-generator",
    title: "AI 配音和音乐工具",
    kind: "generate",
    image: "./assets/questions/voice-generator.jpg",
    explanation: "它会生成新的声音、配音或旋律，属于生成式 AI。",
  },
  {
    id: "comic-continuation",
    title: "AI 四格故事续写",
    kind: "generate",
    image: "./assets/questions/comic-continuation.jpg",
    explanation: "它会继续创作新的剧情和画面，属于生成式 AI。",
  },
  {
    id: "solution-creator",
    title: "AI 解题步骤生成",
    kind: "generate",
    image: "./assets/questions/solution-creator.jpg",
    explanation: "它会生成新的讲解步骤和表达方式，属于生成式 AI。",
  },
  {
    id: "avatar-creator",
    title: "AI 角色形象生成",
    kind: "generate",
    image: "./assets/questions/avatar-creator.jpg",
    explanation: "它会根据要求创造新的角色形象，属于生成式 AI。",
  },
  {
    id: "face-recognition",
    title: "人脸识别门禁",
    kind: "judge",
    image: "./assets/questions/face-recognition.jpg",
    explanation: "它主要识别人脸并判断是否匹配身份，属于识别判断型 AI，也叫判别式 AI。",
  },
  {
    id: "trash-classifier",
    title: "智能垃圾分类",
    kind: "judge",
    image: "./assets/questions/trash-classifier.jpg",
    explanation: "它识别物品并判断应该放进哪类垃圾桶，属于识别判断型 AI，也叫判别式 AI。",
  },
  {
    id: "pronunciation-evaluator",
    title: "口语发音评测",
    kind: "judge",
    image: "./assets/questions/pronunciation-evaluator.jpg",
    explanation: "它听声音后判断发音是否准确，属于识别判断型 AI，也叫判别式 AI。",
  },
  {
    id: "recommendation",
    title: "内容推荐系统",
    kind: "judge",
    image: "./assets/questions/recommendation.jpg",
    explanation: "它根据行为判断你可能喜欢什么内容，属于识别判断型 AI，也叫判别式 AI。",
  },
  {
    id: "plant-detector",
    title: "植物图片检测",
    kind: "judge",
    image: "./assets/questions/plant-detector.jpg",
    explanation: "它观察图片并检测叶片是否有问题，属于识别判断型 AI，也叫判别式 AI。",
  },
  {
    id: "route-detector",
    title: "机器人路线避障",
    kind: "judge",
    image: "./assets/questions/route-detector.jpg",
    explanation: "它识别障碍物并判断安全路线，属于识别判断型 AI，也叫判别式 AI。",
  },
];

const startScreen = document.querySelector("#startScreen");
const quizScreen = document.querySelector("#quizScreen");
const startBtn = document.querySelector("#startBtn");
const submitBtn = document.querySelector("#submitBtn");
const previousBtn = document.querySelector("#previousBtn");
const hintBtn = document.querySelector("#hintBtn");
const soundToggleBtn = document.querySelector("#soundToggleBtn");
const resetBtn = document.querySelector("#resetBtn");
const questionDeck = document.querySelector("#questionDeck");
const questionCard = document.querySelector("#questionCard");
const questionImage = document.querySelector("#questionImage");
const questionCounter = document.querySelector("#questionCounter");
const questionTitle = document.querySelector("#questionTitle");
const questionFeedback = document.querySelector("#questionFeedback");
const choiceButtons = [...document.querySelectorAll(".choice-action")];
const progressFill = document.querySelector("#progressFill");
const progressStars = document.querySelector("#progressStars");
const reviewPanel = document.querySelector("#reviewPanel");
const reviewSummary = document.querySelector("#reviewSummary");
const reviewList = document.querySelector("#reviewList");
const answeredCount = document.querySelector("#answeredCount");
const totalCount = document.querySelector("#totalCount");
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
const finishChoiceDialog = document.querySelector("#finishChoiceDialog");
const finishSaveBack = document.querySelector("#finishSaveBack");
const finishKeepAnswering = document.querySelector("#finishKeepAnswering");
const finishChoiceMessage = document.querySelector("#finishChoiceMessage");

const launchParams = new URLSearchParams(window.location.search);
const launchToken = launchParams.get("launchToken");
const platformApiBase = (launchParams.get("platformApiBase") || "").replace(/\/+$/, "");
const returnUrl = launchParams.get("returnUrl") || "";

let answers = new Map();
let submitted = false;
let currentQuestions = [];
let currentIndex = 0;
let platformContext = null;
let platformVerified = false;
let quizStartedAt = 0;
let advanceTimer = null;
let soundEnabled = true;
let audioContext = null;
let finishChoiceDismissed = false;
let finishSaveLabel = finishSaveBack?.textContent || "保存并返回学生后台";

function ensureAudioContext() {
  if (!soundEnabled) return null;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  try {
    if (!audioContext) audioContext = new AudioContextClass();
    if (audioContext.state === "suspended") {
      const resumePromise = audioContext.resume();
      if (resumePromise && typeof resumePromise.catch === "function") resumePromise.catch(() => {});
    }
    return audioContext;
  } catch (_error) {
    return null;
  }
}

function playTone(ctx, frequency, offset, duration, type = "sine", volume = 0.055) {
  const start = ctx.currentTime + offset;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(volume, start + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.04);
}

function playSound(name) {
  const ctx = ensureAudioContext();
  if (!ctx) return;

  try {
    const patterns = {
      start: [[523, 0, 0.08], [659, 0.09, 0.1], [784, 0.19, 0.12]],
      select: [[660, 0, 0.08, "triangle"], [880, 0.08, 0.1, "triangle"]],
      next: [[740, 0, 0.06, "sine", 0.035]],
      back: [[440, 0, 0.07, "sine", 0.035]],
      reset: [[330, 0, 0.07, "triangle", 0.035], [392, 0.08, 0.08, "triangle", 0.035]],
      complete: [[659, 0, 0.08], [784, 0.08, 0.08], [988, 0.16, 0.14]],
      success: [[523, 0, 0.08], [659, 0.08, 0.08], [1047, 0.16, 0.18]],
      fail: [[220, 0, 0.12, "sawtooth", 0.035], [196, 0.14, 0.14, "sawtooth", 0.03]],
      hint: [[587, 0, 0.06, "sine", 0.03], [784, 0.07, 0.08, "sine", 0.03]],
      toggle: [[784, 0, 0.06, "triangle", 0.035]],
    };
    (patterns[name] || patterns.select).forEach(([frequency, offset, duration, type, volume]) => {
      playTone(ctx, frequency, offset, duration, type, volume);
    });
  } catch (_error) {
    // Sound is decorative; never block the quiz.
  }
}

function updateSoundToggle() {
  if (!soundToggleBtn) return;
  soundToggleBtn.textContent = soundEnabled ? "声音开" : "声音关";
  soundToggleBtn.setAttribute("aria-pressed", String(soundEnabled));
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  updateSoundToggle();
  if (soundEnabled) playSound("toggle");
}

function goBackToStudent() {
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }
  window.history.back();
}

function showCompletionDialog(title, message, isError = false) {
  if (!completionDialog || !completionTitle || !completionMessage) return;
  completionTitle.textContent = title;
  completionMessage.textContent = message;
  completionDialog.classList.toggle("is-error", isError);
  completionDialog.classList.remove("is-hidden");
}

function hideCompletionDialog() {
  completionDialog?.classList.add("is-hidden");
}

function setFinishSaving(isSaving) {
  if (!finishSaveBack) return;
  finishSaveBack.disabled = isSaving;
  finishSaveBack.textContent = isSaving ? "保存中..." : finishSaveLabel;
  if (finishKeepAnswering) finishKeepAnswering.disabled = isSaving;
  if (finishChoiceMessage) {
    finishChoiceMessage.textContent = isSaving
      ? "正在保存成绩，请稍等。"
      : "要保存成绩并回到学生后台吗？也可以回去修改答案。";
  }
}

function showFinishChoiceDialog() {
  if (!finishChoiceDialog || submitted || answers.size < currentQuestions.length || finishChoiceDismissed) return;
  setFinishSaving(false);
  finishChoiceDialog.classList.remove("is-hidden");
  finishSaveBack?.focus();
}

function hideFinishChoiceDialog() {
  finishChoiceDialog?.classList.add("is-hidden");
  setFinishSaving(false);
}

function returnToAnswering() {
  finishChoiceDismissed = true;
  hideFinishChoiceDialog();
  clearAdvanceTimer();
  questionDeck.scrollIntoView({ behavior: "smooth", block: "start" });
  playSound("back");
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
    roundMessage.textContent = "本地预览：可以试玩，成绩不会保存。";
    return;
  }

  try {
    const data = await platformRequest("/course-runtime/launch/verify", { launchToken });
    platformContext = data.context || null;
    platformVerified = Boolean(platformContext);
    const studentName = platformContext?.student?.displayName || platformContext?.student?.email || "同学";
    roundMessage.textContent = `${studentName}，看图选一个。`;
  } catch (error) {
    roundMessage.textContent = `身份校验失败：${error.message}。`;
  }
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function pickRoundQuestions() {
  const generative = shuffle(questionBank.filter((item) => item.kind === "generate")).slice(0, 5);
  const judging = shuffle(questionBank.filter((item) => item.kind === "judge")).slice(0, 5);
  return shuffle([...generative, ...judging]);
}

function currentQuestion() {
  return currentQuestions[currentIndex] || currentQuestions[0];
}

function clearAdvanceTimer() {
  if (advanceTimer) {
    window.clearTimeout(advanceTimer);
    advanceTimer = null;
  }
}

function updateProgress() {
  answeredCount.textContent = answers.size;
  totalCount.textContent = currentQuestions.length;
  const total = Math.max(1, currentQuestions.length);
  const visibleStep = Math.min(currentIndex + 1, total);
  progressFill.style.width = `${Math.max((answers.size / total) * 100, (visibleStep / total) * 6)}%`;

  if (progressStars) {
    progressStars.replaceChildren(
      ...currentQuestions.map((question, index) => {
        const star = document.createElement("span");
        const isAnswered = answers.has(question.id);
        star.textContent = "★";
        star.className = [
          isAnswered ? "is-done" : "",
          index === currentIndex ? "is-current" : "",
        ].join(" ");
        star.setAttribute("aria-hidden", "true");
        return star;
      }),
    );
  }
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) return;

  const selected = answers.get(question.id) || "";
  const isLast = currentIndex === currentQuestions.length - 1;
  questionCounter.textContent = `第 ${currentIndex + 1}/${currentQuestions.length} 题`;
  questionTitle.textContent = question.title;
  questionImage.src = question.image;
  questionImage.alt = question.title;
  questionCard.dataset.kind = question.kind;
  questionCard.classList.toggle("is-answered", Boolean(selected));
  questionCard.classList.toggle("is-submitted", submitted);
  questionCard.classList.toggle("is-correct", submitted && selected === question.kind);
  questionCard.classList.toggle("is-wrong", submitted && selected !== question.kind);

  choiceButtons.forEach((button) => {
    const choice = button.dataset.choice;
    button.classList.toggle("is-selected", choice === selected);
    button.classList.toggle("is-correct-choice", submitted && choice === question.kind);
    button.classList.toggle("is-wrong-choice", submitted && choice === selected && selected !== question.kind);
    button.disabled = submitted;
  });

  if (submitted) {
    questionFeedback.textContent = `正确答案：${CATEGORY_LABELS[question.kind]}。${question.explanation}`;
  } else if (selected) {
    questionFeedback.textContent = isLast
      ? "已选好，可以提交。"
      : "已选好，下一题。";
  } else {
    questionFeedback.textContent = "选完自动下一题。";
  }

  previousBtn.disabled = currentIndex === 0 || submitted;
  submitBtn.disabled = submitted || answers.size < currentQuestions.length;
  updateProgress();
  renderReview();
}

function renderReview() {
  if (answers.size < currentQuestions.length && !submitted) {
    reviewPanel.classList.add("is-hidden");
    return;
  }

  const correct = currentQuestions.filter((question) => answers.get(question.id) === question.kind).length;
  reviewPanel.classList.remove("is-hidden");
  reviewPanel.classList.toggle("is-submitted", submitted);
  reviewSummary.textContent = submitted
    ? `本次答对 ${correct}/${currentQuestions.length}。下面可以查看每题解释。`
    : "可以提交，也可以回上一题修改。";
  reviewList.innerHTML = currentQuestions
    .map((question, index) => {
      const selected = answers.get(question.id) || "";
      const isCorrect = selected === question.kind;
      const stateLabel = submitted ? (isCorrect ? "正确" : "需复习") : CATEGORY_LABELS[selected];
      const stateClass = submitted ? (isCorrect ? "is-correct" : "is-wrong") : "";
      const extra = submitted
        ? `<p>${question.explanation}</p>`
        : `<p>你选择了 ${CATEGORY_LABELS[selected]}。</p>`;
      return `
        <button class="review-item ${stateClass}" type="button" data-review-index="${index}">
          <span>${index + 1}</span>
          <strong>${question.title}</strong>
          <em>${stateLabel}</em>
          ${extra}
        </button>
      `;
    })
    .join("");

  reviewList.querySelectorAll("[data-review-index]").forEach((item) => {
    item.addEventListener("click", () => {
      currentIndex = Number(item.dataset.reviewIndex);
      clearAdvanceTimer();
      renderQuestion();
      questionDeck.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function chooseAnswer(choice) {
  if (submitted) return;
  const question = currentQuestion();
  answers.set(question.id, choice);
  finishChoiceDismissed = false;
  renderQuestion();
  playSound("select");
  clearAdvanceTimer();

  if (currentIndex < currentQuestions.length - 1) {
    advanceTimer = window.setTimeout(() => {
      currentIndex += 1;
      renderQuestion();
      playSound("next");
    }, 420);
    return;
  }

  advanceTimer = window.setTimeout(() => {
    renderReview();
    playSound("complete");
    showFinishChoiceDialog();
  }, 420);
}

function goPreviousQuestion() {
  if (submitted || currentIndex === 0) return;
  clearAdvanceTimer();
  currentIndex -= 1;
  renderQuestion();
  playSound("back");
}

function buildSummary(correct) {
  const results = currentQuestions.map((question, index) => {
    const selected = answers.get(question.id) || "";
    const imageUrl = new URL(question.image, window.location.href).href;
    return {
      round: index + 1,
      id: question.id,
      title: question.title,
      imageUrl,
      imageAlt: question.title,
      imageWidth: 1280,
      imageHeight: 720,
      correctCategory: CATEGORY_LABELS[question.kind],
      selectedCategory: selected ? CATEGORY_LABELS[selected] : "未作答",
      correct: selected === question.kind,
      explanation: question.explanation,
    };
  });
  const rounds = results.map((item) => ({
    round: item.round,
    title: item.title,
    questionTitle: item.title,
    imageUrl: item.imageUrl,
    imageAlt: item.imageAlt,
    imageWidth: item.imageWidth,
    imageHeight: item.imageHeight,
    correctCategory: item.correctCategory,
    selectedCategory: item.selectedCategory,
    correct: item.correct,
    explanation: item.explanation,
  }));

  return {
    title: "AI 会生成还是判断",
    displayTitle: "AI 会生成还是判断",
    displaySummary: `完成 10 题，答对 ${correct}/${currentQuestions.length}`,
    scoreText: `${correct * 10} 分`,
    correctCount: correct,
    totalCount: currentQuestions.length,
    concepts: {
      generativeAi: "生成式 AI 会根据提示生成新的文字、图片、声音、故事或方案。",
      discriminativeAi: "识别判断型 AI 会识别、分类、匹配、检测或推荐，也叫判别式 AI。",
    },
    answers: results,
    rounds,
    resultItems: results.map((item) => ({
      label: item.title,
      title: item.title,
      value: item.correct ? "正确" : "需复习",
      description: `${item.selectedCategory} / 正确是 ${item.correctCategory}`,
      imageUrl: item.imageUrl,
      imageAlt: item.imageAlt,
      imageWidth: item.imageWidth,
      imageHeight: item.imageHeight,
    })),
    projector: {
      type: "question-image-quiz",
      layout: "image-grid",
      items: rounds.map((item) => ({
        round: item.round,
        title: item.title,
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt,
        imageWidth: item.imageWidth,
        imageHeight: item.imageHeight,
        correctCategory: item.correctCategory,
        selectedCategory: item.selectedCategory,
        correct: item.correct,
        explanation: item.explanation,
      })),
    },
  };
}

async function submitAnswers({ returnAfterSave = false } = {}) {
  if (submitted) return;

  if (answers.size < currentQuestions.length) {
    const remaining = currentQuestions.length - answers.size;
    resultBox.innerHTML = `
      <strong>还差 ${remaining} 题</strong>
      <span>每页选择一个类别，全部答完后再提交。</span>
    `;
    roundMessage.textContent = "请先把所有题都选完。";
    playSound("fail");
    return;
  }

  clearAdvanceTimer();
  hideFinishChoiceDialog();
  submitted = true;
  const correct = currentQuestions.filter((question) => answers.get(question.id) === question.kind).length;
  const score = correct * 10;
  const summary = buildSummary(correct);
  scoreLabel.textContent = score;

  resultBox.innerHTML = `
    <strong>${correct} / ${currentQuestions.length}</strong>
    <span>${correct >= 8 ? "分类很准确。" : "再看看每题解释，重点区分“创作新内容”和“识别后判断”。"}</span>
  `;
  roundMessage.textContent = "已提交。下面可以查看每题解释。";
  renderQuestion();

  if (!launchToken || !platformApiBase) {
    roundMessage.textContent += " 本地预览模式未回传成绩。";
    showCompletionDialog("答案已提交", "请从学生后台进入课件后完成正式学习；当前本地预览没有回传成绩。");
    playSound("success");
    return;
  }

  try {
    if (!platformVerified) await verifyPlatformLaunch();
    if (!platformVerified) throw new Error("未通过底座身份校验");
    await platformRequest("/course-runtime/launch/records", {
      launchToken,
      status: "COMPLETED",
      score,
      durationSeconds: Math.max(1, Math.round((Date.now() - quizStartedAt) / 1000)),
      summary,
    });
    roundMessage.textContent += " 本次成绩已回传到底座。";
    playSound("success");
    if (returnAfterSave) {
      showCompletionDialog("已保存", "成绩已保存，正在回到学生后台。");
      window.setTimeout(goBackToStudent, 650);
      return;
    }

    showCompletionDialog("答案已提交", `本次得分 ${score} 分，成绩已保存到底座，老师可以查看和投屏。`);
  } catch (error) {
    submitted = false;
    roundMessage.textContent += ` 成绩回传失败：${error.message}。`;
    renderQuestion();
    showCompletionDialog("成绩保存失败", "成绩保存失败，请联系老师或稍后重试；你也可以先回到学生后台。", true);
    playSound("fail");
  }
}

function resetQuiz() {
  if (quizStartedAt) playSound("reset");
  hideCompletionDialog();
  hideFinishChoiceDialog();
  clearAdvanceTimer();
  answers = new Map();
  submitted = false;
  finishChoiceDismissed = false;
  currentQuestions = pickRoundQuestions();
  currentIndex = 0;
  quizStartedAt = Date.now();
  scoreLabel.textContent = "--";
  resultBox.innerHTML = `
    <strong>等待提交</strong>
    <span>答完 10 题后提交。</span>
  `;
  roundMessage.textContent = launchToken && platformApiBase
    ? "看图选一个。"
    : "本地预览：可以试玩，成绩不会保存。";
  renderQuestion();
}

function startQuiz() {
  ensureAudioContext();
  playSound("start");
  startScreen.classList.add("is-hidden");
  quizScreen.classList.remove("is-hidden");
  resetQuiz();
}

function showHint() {
  playSound("hint");
  resultBox.innerHTML = `
    <strong>小提示</strong>
    <span>生成：${CATEGORY_HINTS.generate}。判断：${CATEGORY_HINTS.judge}。</span>
  `;
  questionFeedback.textContent = "生成是在做新东西；判断是看懂后分类。";
}

startBtn?.addEventListener("click", startQuiz);
submitBtn?.addEventListener("click", () => {
  if (answers.size >= currentQuestions.length && !submitted) {
    finishChoiceDismissed = false;
    showFinishChoiceDialog();
    return;
  }

  submitAnswers();
});
previousBtn?.addEventListener("click", goPreviousQuestion);
hintBtn?.addEventListener("click", showHint);
soundToggleBtn?.addEventListener("click", toggleSound);
resetBtn?.addEventListener("click", resetQuiz);
backToStudentBtn?.addEventListener("click", goBackToStudent);
quizBackToStudentBtn?.addEventListener("click", goBackToStudent);
completionBackToStudent?.addEventListener("click", goBackToStudent);
completionClose?.addEventListener("click", hideCompletionDialog);
finishSaveBack?.addEventListener("click", () => {
  setFinishSaving(true);
  submitAnswers({ returnAfterSave: true });
});
finishKeepAnswering?.addEventListener("click", returnToAnswering);
choiceButtons.forEach((button) => {
  button.addEventListener("click", () => chooseAnswer(button.dataset.choice));
});

updateSoundToggle();
verifyPlatformLaunch();
