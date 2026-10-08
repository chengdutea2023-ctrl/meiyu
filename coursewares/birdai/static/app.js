const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const species = [
  { name: "白鹭", scientific: "Egretta garzetta", short: "湿地里的白色猎手。看长腿、黑嘴和黄色脚。", image: "assets/birds/little-egret.png", color: "#e7ecdf" },
  { name: "红嘴蓝鹊", scientific: "Urocissa erythrorhyncha", short: "红嘴、蓝身、超长尾，是四川山林里的醒目身影。", image: "assets/birds/red-billed-blue-magpie.png", color: "#dfe8f4" },
  { name: "黄臀鹎", scientific: "Pycnonotus xanthorrhous", short: "林缘常见，尾下鲜黄色是最容易发现的线索。", image: "assets/birds/yellow-vented-bulbul.png", color: "#edf0d9" },
  { name: "翠鸟", scientific: "Alcedo atthis", short: "常在溪流边快速掠过，蓝色背部和橙色腹部很醒目。", image: "assets/birds/common-kingfisher.png", color: "#d9eef0" },
  { name: "麻雀", scientific: "Passer montanus", short: "城市、村落和农田都常见，喜欢成群活动。", image: "assets/birds/eurasian-tree-sparrow.png", color: "#eee4d3" },
  { name: "喜鹊", scientific: "Pica pica", short: "黑白羽色、长尾，叫声响亮，常在开阔地活动。", image: "assets/birds/eurasian-magpie.png", color: "#e1e4ed" },
  { name: "白头鹎", scientific: "Pycnonotus sinensis", short: "头顶白色，叫声清脆，是四川城市绿地常见鸟。", image: "assets/birds/light-vented-bulbul.png", color: "#e9ead8" },
  { name: "珠颈斑鸠", scientific: "Spilopelia chinensis", short: "颈侧有黑白珍珠纹，常在地面慢慢觅食。", image: "assets/birds/spotted-dove.png", color: "#e6ddd2" },
  { name: "乌鸫", scientific: "Turdus merula", short: "雄鸟通体黑色、眼圈黄色，喜欢林下和草地。", image: "assets/birds/common-blackbird.png", color: "#dedede" },
  { name: "普通燕鸥", scientific: "Sterna hirundo", short: "江河湖泊上空常见，长翅尖尾，飞行轻快。", image: "assets/birds/common-tern.png", color: "#dce8ef" },
  { name: "黑水鸡", scientific: "Gallinula chloropus", short: "湿地常见，黑色身体配红黄色嘴，善于在水草间行走。", image: "assets/birds/common-moorhen.png", color: "#d9e5d9" },
];

const lessonSpecies = [
  {
    name: "红嘴蓝鹊",
    image: "assets/birds/red-billed-blue-magpie.png",
    clue: "观察红色嘴、蓝色身体和特别长的尾巴。",
    hint: "它的嘴是红色的，身体偏蓝，尾巴很长。",
    detail: "红嘴蓝鹊在山林里很醒目，红色嘴和蓝色长尾是最稳的识别线索。",
    options: ["红嘴蓝鹊", "喜鹊", "乌鸫", "麻雀"],
    soundDesc: "叫声较亮且连续，适合和喜鹊一类长尾鸦科鸟做对比。",
    audio: "assets/audio/red-billed-blue-magpie.mp3",
    credit: "Xeno-canto XC1138461",
    x: 8,
    y: 6,
  },
  {
    name: "白头鹎",
    image: "assets/birds/light-vented-bulbul.png",
    clue: "观察白色头顶、黑色眼纹和尾下的黄色。",
    hint: "头顶偏白，脸上有深色眼纹。",
    detail: "白头鹎在四川城市绿地很常见，头顶白、眼纹黑，是很好的入门鸟种。",
    options: ["白头鹎", "黄臀鹎", "麻雀", "喜鹊"],
    soundDesc: "清脆短鸣，城市和公园里都常能听到。",
    audio: "assets/audio/bulbul.mp3",
    credit: "Xeno-canto XC1136986",
    x: 28,
    y: 11,
  },
  {
    name: "麻雀",
    image: "assets/birds/eurasian-tree-sparrow.png",
    clue: "观察棕色头顶、脸侧黑斑和常见的小型体型。",
    hint: "它体型小，头顶棕色，脸上有明显黑斑。",
    detail: "麻雀常出现在村落和林缘，体型小，脸侧黑斑很有代表性。",
    options: ["麻雀", "白头鹎", "珠颈斑鸠", "乌鸫"],
    soundDesc: "麻雀常发出连续短促的喳喳声，适合和其他小型鸟对比学习。",
    audio: "assets/audio/tree-sparrow.mp3",
    credit: "Xeno-canto XC979271",
    x: 72,
    y: 9,
  },
  {
    name: "喜鹊",
    image: "assets/birds/eurasian-magpie.png",
    clue: "观察黑白羽色、长尾和翼上的蓝绿色金属光泽。",
    hint: "它的尾巴很长，黑白对比最明显。",
    detail: "喜鹊常在开阔地和村落附近活动，黑白羽色配长尾很容易辨认。",
    options: ["喜鹊", "麻雀", "乌鸫", "珠颈斑鸠"],
    soundDesc: "叫声响亮、连续，适合先建立听觉印象。",
    audio: "assets/audio/magpie.mp3",
    credit: "Xeno-canto XC1153259",
    x: 90,
    y: 30,
  },
  {
    name: "黄臀鹎",
    image: "assets/birds/yellow-vented-bulbul.png",
    clue: "观察偏灰褐的身体和尾下很明显的黄色区域。",
    hint: "尾巴下面的黄色是它最容易认出来的地方。",
    detail: "黄臀鹎常在林缘活动，灰褐色身体比较低调，尾下黄色是关键线索。",
    options: ["黄臀鹎", "白头鹎", "麻雀", "珠颈斑鸠"],
    soundDesc: "黄臀鹎的叫声常较轻快，适合和白头鹎做对比。",
    audio: "assets/audio/yellow-vented-bulbul.mp3",
    credit: "Xeno-canto XC1138423",
    x: 34,
    y: 34,
  },
  {
    name: "珠颈斑鸠",
    image: "assets/birds/spotted-dove.png",
    clue: "观察颈侧一圈黑底白点的珍珠纹。",
    hint: "脖子侧面像戴了一条带白点的项链。",
    detail: "珠颈斑鸠常在地面缓慢觅食，颈侧黑白斑是最稳的识别线索。",
    options: ["珠颈斑鸠", "白鹭", "乌鸫", "麻雀"],
    soundDesc: "低沉、重复的咕咕声，很适合做声音辨认。",
    audio: "assets/audio/dove.mp3",
    credit: "Xeno-canto XC1138609",
    x: 4,
    y: 49,
  },
  {
    name: "翠鸟",
    image: "assets/birds/common-kingfisher.png",
    clue: "观察尖长嘴、蓝色背部和橙色腹部。",
    hint: "它常出现在水边，身体颜色非常鲜明。",
    detail: "翠鸟多靠近溪流活动，尖长嘴和蓝背橙腹的配色非常鲜明。",
    options: ["翠鸟", "白鹭", "白头鹎", "普通燕鸥"],
    soundDesc: "短促尖细，和水边环境线索很容易连起来。",
    audio: "assets/audio/kingfisher.mp3",
    credit: "Xeno-canto XC1153867",
    x: 21,
    y: 65,
  },
  {
    name: "白鹭",
    image: "assets/birds/little-egret.png",
    clue: "观察通体白色、细长的腿和尖长的嘴。",
    hint: "它全身大多是白色，腿和嘴都比较长。",
    detail: "白鹭常在浅水里缓慢行走觅食，白色身体和细长腿最容易看出来。",
    options: ["白鹭", "普通燕鸥", "珠颈斑鸠", "翠鸟"],
    soundDesc: "白鹭更适合结合站姿和水边环境来记忆，也可以顺带熟悉它较轻的鸣叫。",
    audio: "assets/audio/little-egret.mp3",
    credit: "Xeno-canto XC1151421",
    x: 58,
    y: 60,
  },
  {
    name: "黑水鸡",
    image: "assets/birds/common-moorhen.png",
    clue: "观察深色身体、红色额甲和黄尖嘴。",
    hint: "嘴和额头前面的红色非常明显。",
    detail: "黑水鸡喜欢在水草边活动，黑色身体配红黄色嘴很好认。",
    options: ["黑水鸡", "珠颈斑鸠", "白鹭", "乌鸫"],
    soundDesc: "黑水鸡活动多在湿地，听声音时也要一起记住它总在水草边出现。",
    audio: "assets/audio/moorhen.mp3",
    credit: "Xeno-canto XC1152369",
    x: 90,
    y: 63,
  },
  {
    name: "乌鸫",
    image: "assets/birds/common-blackbird.png",
    clue: "观察通体黑色、黄色嘴和黄色眼圈。",
    hint: "它全身很黑，嘴和眼圈偏黄。",
    detail: "雄性乌鸫颜色很统一，黑色身体配黄色嘴，是很稳的外形特征。",
    options: ["乌鸫", "麻雀", "珠颈斑鸠", "喜鹊"],
    soundDesc: "乌鸫的鸣唱旋律变化丰富，是很好的听觉辨认练习对象。",
    audio: "assets/audio/blackbird.mp3",
    credit: "Xeno-canto XC1154607",
    x: 31,
    y: 84,
  },
  {
    name: "普通燕鸥",
    image: "assets/birds/common-tern.png",
    clue: "观察白灰色身体、黑色头顶和细长翅形。",
    hint: "它看起来更轻更尖，常在水面附近活动。",
    detail: "普通燕鸥常在江河湖泊上空活动，细长翅和黑色头顶很有特点。",
    options: ["普通燕鸥", "白鹭", "翠鸟", "珠颈斑鸠"],
    soundDesc: "普通燕鸥更适合结合飞行姿态和水面环境一起听，声音通常比较尖细。",
    audio: "assets/audio/common-tern.mp3",
    credit: "Xeno-canto XC1155021",
    x: 57,
    y: 82,
  },
];

const modelCopy = {
  dongniao: "懂鸟 AI 先定位图片里的每只鸟，再返回每个鸟框的鸟种候选结果。",
};

const modelModes = {
  dongniao: { label: "懂鸟 AI 检测 + 鸟种识别", mode: "detect-then-classify" },
};

function getDefaultApiEndpoint() {
  return "./api/birds/recognize";
}

const choices = document.getElementById("choices");
const feedback = document.getElementById("feedback");
const speciesWrap = document.getElementById("species");
const forestScene = document.getElementById("forestScene");
const sceneCaption = document.getElementById("sceneCaption");
const question = document.getElementById("question");
const quizImage = document.getElementById("quizImage");
const nextQuestion = document.getElementById("nextQuestion");
const hotspotLayer = document.getElementById("hotspotLayer");
const selectionPulse = document.getElementById("selectionPulse");
const selectionHint = document.getElementById("selectionHint");
const selectionThumb = document.getElementById("selectionThumb");
const showAllBirds = document.getElementById("showAllBirds");
const hideAllBirds = document.getElementById("hideAllBirds");
const birdUpload = document.getElementById("birdUpload");
const uploadPreview = document.getElementById("uploadPreview");
const detectionOverlay = document.getElementById("detectionOverlay");
const uploadPrompt = document.getElementById("uploadPrompt");
const modelChoice = document.getElementById("modelChoice");
const apiEndpoint = document.getElementById("apiEndpoint");
const modelHelp = document.getElementById("modelHelp");
const identifyBird = document.getElementById("identifyBird");
const recognitionResult = document.getElementById("recognitionResult");
const runtimeLog = document.getElementById("runtimeLog");
const runtimeLogState = document.getElementById("runtimeLogState");
const submitKnowledgeCheck = document.getElementById("submitKnowledgeCheck");
const aiModelAnswer = document.getElementById("aiModelAnswer");
const assessmentStatus = document.getElementById("assessmentStatus");
const birdAudio = document.getElementById("birdAudio");
const soundCredit = document.getElementById("soundCredit");
const birdIntro = document.getElementById("birdIntro");
const soundGallery = document.getElementById("soundGallery");

let uploadedImageUrl = "";
let uploadedImageBitmap = null;
let markersVisible = false;
let currentDetectionBoxes = [];
let currentLesson = 0;
let runtimePollTimer = null;
let seenRuntimeEvents = new Set();
let runtimeLogStartedAt = 0;

function clearRuntimeLog(state = "等待图片") {
  runtimeLog.innerHTML = "";
  runtimeLogState.textContent = state;
  seenRuntimeEvents = new Set();
  runtimeLogStartedAt = Date.now();
}

function addRuntimeLog(message, state = "running") {
  const item = document.createElement("li");
  item.dataset.state = state;
  item.textContent = `${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${message}`;
  runtimeLog.append(item);
  runtimeLog.scrollTop = runtimeLog.scrollHeight;
}

function getRuntimeEndpoint() {
  return apiEndpoint.value.trim().replace(/\/birds\/recognize$/, "/birds/runtime");
}

async function readRuntimeStatus() {
  const endpoint = getRuntimeEndpoint();
  if (!endpoint.endsWith("/birds/runtime")) return;
  const response = await fetch(endpoint, { headers: { 'X-Course-Launch': window.ZhikeCourseware.state.launchToken }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`运行状态接口 HTTP ${response.status}`);
  const status = await response.json();
  const events = Array.isArray(status.events) ? status.events : [];
  events.forEach((event) => {
    const eventTime = Date.parse(event.time || "");
    if (Number.isFinite(eventTime) && eventTime + 1000 < runtimeLogStartedAt) return;
    const key = `${event.time || ""}-${event.stage || ""}-${event.message || ""}`;
    if (seenRuntimeEvents.has(key)) return;
    seenRuntimeEvents.add(key);
    const duration = typeof event.durationMs === "number" ? `（${event.durationMs} ms）` : "";
    addRuntimeLog(`服务器：${event.message || event.stage || "模型状态更新"}${duration}`, event.state || "running");
  });
  if (status.status === "ready") runtimeLogState.textContent = "模型已就绪";
  if (status.status === "loading") runtimeLogState.textContent = "服务器正在加载模型";
  if (status.status === "failed") runtimeLogState.textContent = "服务器模型启动失败";
}

function startRuntimePolling() {
  window.clearInterval(runtimePollTimer);
  readRuntimeStatus().catch(() => {});
  runtimePollTimer = window.setInterval(() => {
    readRuntimeStatus().catch(() => {});
  }, 2000);
}

function stopRuntimePolling() {
  window.clearInterval(runtimePollTimer);
  runtimePollTimer = null;
}

async function submitAssignment() {
  const features = [...document.querySelectorAll(".bird-feature")].map((input) => input.value.trim());
  const payload = {
    features,
    aiModelAnswer: aiModelAnswer.value.trim(),
  };
  if (features.some((item) => !item) || !payload.aiModelAnswer) return;
  submitKnowledgeCheckButton.disabled = true;
  document.querySelectorAll('.bird-feature, #aiModelAnswer').forEach((input) => { input.disabled = true; });
  assessmentStatus.textContent = "正在提交给老师...";
  try {
    const contentBase64 = btoa(unescape(encodeURIComponent(JSON.stringify({
      submittedAt: new Date().toISOString(),
      features: payload.features,
      aiModelAnswer: payload.aiModelAnswer,
    }))));
    await window.ZhikeCourseware.complete({
      score: null,
      brief: "学习小测已提交，等待评价。",
      processSummary: "学生提交了识别特征和 AI 模型开发认识；学习环节进度独立记录。",
      pendingArtifacts: [{
        localId: "knowledge-check-v1",
        fileName: "birdai-knowledge-check.json",
        mimeType: "application/json",
        kind: "knowledge-check",
        contentBase64,
        metadata: { title: "观鸟学习小测" },
      }],
    });
    submitKnowledgeCheckButton.textContent = "已提交";
    assessmentStatus.textContent = window.ZhikeCourseware.state.demo ? "本地预览，成绩不会保存" : "作品已保存，未评分，等待评价。";
    document.getElementById('returnPortal').hidden = window.ZhikeCourseware.state.demo;
  } catch (error) {
    submitKnowledgeCheckButton.disabled = false;
    assessmentStatus.textContent = `提交未完成：${String(error.message || error)}`;
    submitKnowledgeCheckButton.textContent = "重试保存";
  }
}

function renderSpecies() {
  speciesWrap.innerHTML = species.map((item) => `
    <article class="species-card" style="--accent:${item.color}">
      <img src="${item.image}" alt="${item.name}真实照片风格图像" loading="lazy" />
      <strong>${item.name}</strong><em>${item.scientific}</em><p>${item.short}</p>
    </article>
  `).join("");
}

function renderHotspots() {
  hotspotLayer.innerHTML = lessonSpecies.map((item) => `
    <button
      class="bird-hotspot avatar-hotspot"
      data-bird="${item.name}"
      style="left:${item.x}%; top:${item.y}%; background-image:url('${item.image}');"
      aria-label="选择这只鸟进入下一步"
      title="选择这只鸟"
    ></button>
  `).join("");

  hotspotLayer.querySelectorAll(".bird-hotspot").forEach((button) => {
    button.addEventListener("click", () => {
      selectLessonSpecies(button.dataset.bird, "scene");
    });
  });
}

function renderChoices() {
  const item = lessonSpecies[currentLesson];
  choices.innerHTML = "";
  item.options.forEach((optionName) => {
    const button = document.createElement("button");
    button.className = "choice";
    button.textContent = optionName;
    button.addEventListener("click", () => {
      document.querySelectorAll(".choice").forEach((choice) => choice.classList.remove("correct", "wrong"));
      const correct = optionName === item.name;
      button.classList.add(correct ? "correct" : "wrong");
      feedback.textContent = correct
        ? `答对了：这是${item.name}。${item.detail}`
        : `再看一遍。提示：${item.hint} 正确答案是 ${item.name}。${item.detail}`;
      updateSoundCard();
      window.ZhikeCourseware.progress("完成外形辨认");
    });
    choices.appendChild(button);
  });
}

function renderQuestion() {
  const item = lessonSpecies[currentLesson];
  quizImage.src = item.image;
  quizImage.alt = `${item.name}观察图`;
  question.textContent = `${item.clue} 这只鸟最可能是什么？`;
  feedback.textContent = "先观察外形，再选择名字。步骤 1 不直接告诉你答案。";
  renderChoices();
}

function renderSoundGallery() {
  soundGallery.innerHTML = lessonSpecies.map((item, index) => `
    <button class="sound-chip ${index === currentLesson ? "active" : ""}" data-sound="${item.name}" ${item.audio ? "" : "data-muted='true'"}>
      <img src="${item.image}" alt="" aria-hidden="true" />
      <span>${item.name}</span>
      <small>${item.audio ? "可播放" : "录音补充中"}</small>
    </button>
  `).join("");

  soundGallery.querySelectorAll(".sound-chip").forEach((button) => {
    button.addEventListener("click", () => {
      selectLessonSpecies(button.dataset.sound, "sound");
    });
  });
}

function setMarkersVisible(visible) {
  markersVisible = visible;
  forestScene.classList.toggle("markers-hidden", !visible);
}

function showSelectionFeedback(item) {
  selectionThumb.src = item.image;
  selectionThumb.alt = `${item.name}缩略图`;
  selectionHint.hidden = false;
  selectionPulse.hidden = false;
  selectionPulse.style.left = `${item.x}%`;
  selectionPulse.style.top = `${item.y}%`;
  window.clearTimeout(showSelectionFeedback.hideTimer);
  showSelectionFeedback.hideTimer = window.setTimeout(() => {
    selectionPulse.hidden = true;
  }, 1400);
}

function highlightCurrentHotspot() {
  hotspotLayer.querySelectorAll(".bird-hotspot").forEach((button) => {
    button.classList.toggle("active", button.dataset.bird === lessonSpecies[currentLesson].name);
  });
}

function selectLessonSpecies(name, source = "scene") {
  const index = lessonSpecies.findIndex((item) => item.name === name);
  if (index === -1) return;
  currentLesson = index;
  const item = lessonSpecies[index];
  renderQuestion();
  updateSoundCard();
  renderSoundGallery();
  highlightCurrentHotspot();
  if (source === "scene") {
    showSelectionFeedback(item);
    feedback.textContent = "你已经锁定了一只鸟。现在去步骤 2，猜猜它最可能是什么。";
    window.ZhikeCourseware.progress("完成树林找鸟");
  }
}

function updateSoundCard() {
  const item = lessonSpecies[currentLesson];
  document.getElementById("soundName").textContent = item.name;
  document.getElementById("soundDesc").textContent = `先听这只鸟的声音。播放结束后，再看它的整体介绍。`;
  birdIntro.hidden = true;
  birdIntro.innerHTML = `
    <strong>${item.name}</strong>
    <p>${item.detail}</p>
  `;
  if (item.audio) {
    birdAudio.src = item.audio;
    birdAudio.hidden = false;
    birdAudio.load();
    soundCredit.textContent = `录音来源：${item.credit}，Xeno-canto 公民科学录音库。按原许可使用。`;
  } else {
    birdAudio.removeAttribute("src");
    birdAudio.hidden = true;
    soundCredit.textContent = "这只鸟的真实录音还在补充中，当前先通过外形和环境线索学习。";
    birdIntro.hidden = false;
  }
}

async function loadImageBitmap(file) {
  const objectUrl = URL.createObjectURL(file);
  uploadedImageUrl = objectUrl;
  uploadPreview.src = objectUrl;
  uploadPreview.hidden = false;
  uploadPrompt.hidden = true;
  detectionOverlay.hidden = false;
  identifyBird.disabled = false;
  recognitionResult.textContent = "图片已准备好。请选择模型后开始识别。";
  uploadedImageBitmap = await createImageBitmap(file);
  currentDetectionBoxes = [];
  renderDetectionOverlay([]);
  clearRuntimeLog("图片已准备");
  addRuntimeLog(`已选择图片：${file.name}（${Math.round(file.size / 1024)} KB）`, "done");
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function callRecognitionApi(endpoint, payload) {
  if (window.ZhikeCourseware.state.demo) throw new Error('本地预览不调用付费识别，请从学生后台正式进入。');
  if (new URL(endpoint, location.href).href !== new URL(getDefaultApiEndpoint(), location.href).href) throw new Error('识别地址无效');
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Course-Launch": window.ZhikeCourseware.state.launchToken },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(100000),
  });
  if (!response.ok) {
    let detail = "";
    try {
      const errorBody = await response.json();
      detail = errorBody.detail || errorBody.message || "";
    } catch {
      // Keep the HTTP status if the proxy returned a non-JSON error page.
    }
    throw new Error(detail ? `HTTP ${response.status}: ${detail}` : `HTTP ${response.status}`);
  }
  return response.json();
}

function renderApiResult(data) {
  const birds = Array.isArray(data.birds) ? data.birds : [];
  const title = escapeHTML(data.title || "模型返回结果");
  const summary = escapeHTML(data.summary || "已完成识别。");
  const boxes = birds.map((item, index) => normalizeBox(item.box, index, item.name));
  currentDetectionBoxes = boxes;
  renderDetectionOverlay(boxes);
  (Array.isArray(data.logs) ? data.logs : []).forEach((entry) => {
    const duration = typeof entry.durationMs === "number" ? `（${entry.durationMs} ms）` : "";
    addRuntimeLog(`${entry.message || entry.stage || "后端步骤完成"}${duration}`, "done");
  });
  runtimeLogState.textContent = birds.length ? `完成：${birds.length} 只鸟` : "完成：未检测到鸟";
  if (!birds.length) {
    recognitionResult.innerHTML = `
      <strong>${title}</strong><br>
      ${summary}<br>
      <span style="color: var(--green); font-weight: 700;">后端没有返回鸟框，前端无法展示具体标注。</span>
    `;
    return;
  }

  recognitionResult.innerHTML = `
    <strong>${title}</strong><br>
    ${summary}<br>
    <div style="margin-top:10px;display:grid;gap:8px;">
      ${birds.map((item, index) => `
        <div style="padding:10px;border-radius:12px;background:#fff;border:1px solid var(--line);">
          <b>${index + 1}. ${escapeHTML(item.name || "未知鸟类")}</b><br>
          位置：${formatBox(item.box)}<br>
          置信度：${typeof item.confidence === "number" ? `${Math.round(item.confidence * 100)}%` : "未提供"}<br>
          ${Array.isArray(item.candidates) && item.candidates.length > 1 ? `候选：${item.candidates.slice(1).map((candidate) => `${escapeHTML(candidate.name)} ${Math.round(candidate.confidence * 100)}%`).join("；")}<br>` : ""}
          ${item.note ? `<span style="color:var(--green);font-weight:700;">${escapeHTML(item.note)}</span>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function formatBox(box) {
  if (!box || typeof box !== "object") return "未提供";
  const values = [box.x, box.y, box.w, box.h];
  if (values.every((value) => typeof value === "number")) {
    return `左 ${box.x.toFixed(1)}%，上 ${box.y.toFixed(1)}%，宽 ${box.w.toFixed(1)}%，高 ${box.h.toFixed(1)}%`;
  }
  return "未提供";
}

function normalizeBox(box, index, name) {
  if (box && typeof box === "object") {
    if ("x" in box && "y" in box && "w" in box && "h" in box) {
      return { x: box.x, y: box.y, w: box.w, h: box.h, label: box.label || name || `目标${index + 1}` };
    }
    if ("left" in box && "top" in box && "width" in box && "height" in box) {
      return { x: box.left, y: box.top, w: box.width, h: box.height, label: box.label || name || `目标${index + 1}` };
    }
  }
  return { x: 10 + index * 8, y: 12 + index * 5, w: 18, h: 14, label: name || `目标${index + 1}` };
}

function renderDetectionOverlay(boxes) {
  detectionOverlay.innerHTML = boxes.map((box) => `
    <div class="detection-box" style="left:${box.x}%;top:${box.y}%;width:${box.w}%;height:${box.h}%;">
      <div class="detection-label">${escapeHTML(box.label)}</div>
    </div>
  `).join("");
  detectionOverlay.hidden = boxes.length === 0;
}

async function identifyBirds() {
  const endpoint = apiEndpoint.value.trim();
  const file = birdUpload.files[0];
  if (!file) return;

  try {
    identifyBird.disabled = true;
    recognitionResult.textContent = "正在请求真实模型服务...";
    detectionOverlay.hidden = true;
    clearRuntimeLog("正在运行");
    addRuntimeLog("开始读取图片", "running");
    startRuntimePolling();
    const imageData = await readFileAsDataURL(file);
    addRuntimeLog("图片已编码，正在发送到模型服务", "done");
    const payload = {
      model: modelChoice.value,
      mode: modelModes[modelChoice.value].mode,
      image: imageData,
      filename: file.name,
      mimeType: file.type,
    };
    addRuntimeLog("懂鸟 AI 正在检测图片中的鸟，并识别每个鸟框的物种", "running");
    const data = await callRecognitionApi(endpoint, payload);
    addRuntimeLog("懂鸟 AI 已返回鸟框和鸟种候选结果", "done");
    renderApiResult(data);
    window.ZhikeCourseware.progress("完成 AI 鸟类识别");
  } catch (error) {
    runtimeLogState.textContent = "运行失败";
    addRuntimeLog(`请求失败：${String(error.message || error)}`, "error");
    const isOffline = String(error.message || error).includes("Failed to fetch");
    recognitionResult.innerHTML = `
      <strong>真实接口请求失败</strong><br>
      ${isOffline ? "识别服务暂时无法连接，请检查网络后重试；如持续失败，请联系教师或管理员。" : escapeHTML(error.message || error)}
    `;
  } finally {
    stopRuntimePolling();
    identifyBird.disabled = false;
  }
}

birdUpload.addEventListener("change", async () => {
  const file = birdUpload.files[0];
  if (!file) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    birdUpload.value = ''; recognitionResult.textContent = '请选择小于 8 MB 的 JPG、PNG 或 WebP 图片'; return;
  }
  try { await loadImageBitmap(file); setMarkersVisible(true); }
  catch { birdUpload.value = ''; recognitionResult.textContent = '图片无法读取，请换图重试'; }
});

modelChoice.addEventListener("change", () => {
  modelHelp.textContent = modelCopy[modelChoice.value];
});

identifyBird.addEventListener("click", async () => {
  recognitionResult.textContent = "模型正在分析图片...";
  await identifyBirds();
});

const submitKnowledgeCheckButton = submitKnowledgeCheck;
submitKnowledgeCheckButton.addEventListener("click", submitAssignment);

showAllBirds.addEventListener("click", () => setMarkersVisible(true));
hideAllBirds.addEventListener("click", () => setMarkersVisible(false));

nextQuestion.addEventListener("click", () => {
  currentLesson = (currentLesson + 1) % lessonSpecies.length;
  renderQuestion();
  updateSoundCard();
  renderSoundGallery();
  highlightCurrentHotspot();
});

document.getElementById("switchSound").addEventListener("click", () => {
  currentLesson = (currentLesson + 1) % lessonSpecies.length;
  renderQuestion();
  updateSoundCard();
  renderSoundGallery();
  highlightCurrentHotspot();
});

document.getElementById("playSound").addEventListener("click", async () => {
  const item = lessonSpecies[currentLesson];
  if (!item.audio) return;
  await birdAudio.play();
});

birdAudio.addEventListener("ended", () => {
  birdIntro.hidden = false;
  window.ZhikeCourseware.progress("完成鸟叫学习");
});

renderSpecies();
renderHotspots();
renderQuestion();
updateSoundCard();
renderSoundGallery();
highlightCurrentHotspot();
setMarkersVisible(false);
modelChoice.value = "dongniao";
modelHelp.textContent = modelCopy[modelChoice.value];
if (!apiEndpoint.value.trim()) {
  apiEndpoint.value = getDefaultApiEndpoint();
}
(async function initializePlatform() {
  const gate = document.getElementById("platformGate");
  try {
    await window.ZhikeCourseware.initialize();
    document.body.classList.remove("platform-pending");
    gate.remove();
    if (!window.ZhikeCourseware.state.demo) readRuntimeStatus().catch(() => {});
  } catch (error) {
    gate.textContent = String(error.message || "无法验证学习平台入口，请从学生后台重新打开课件。");
    gate.classList.add("platform-gate-error");
  }
})();

document.getElementById('returnPortal').addEventListener('click', () => window.ZhikeCourseware.returnToPortal());
