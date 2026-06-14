const guessCategories = [
  {
    word: "apple",
    label: "苹果",
    hints: { roundness: 0.8, strokes: 3, topMark: true },
  },
  {
    word: "bicycle",
    label: "自行车",
    hints: { circles: 2, width: 0.85, strokes: 5 },
  },
  {
    word: "sun",
    label: "太阳",
    hints: { roundness: 0.75, radial: true, strokes: 8 },
  },
  {
    word: "house",
    label: "房子",
    hints: { corners: 4, height: 0.75, strokes: 4 },
  },
  {
    word: "tree",
    label: "树",
    hints: { vertical: true, height: 0.85, strokes: 4 },
  },
  {
    word: "umbrella",
    label: "雨伞",
    hints: { arc: true, height: 0.65, strokes: 3 },
  },
  { word: "circle", label: "圆", hints: { roundness: 1, strokes: 1 } },
  { word: "clock", label: "时钟", hints: { roundness: 0.95, strokes: 3, topMark: true } },
  { word: "face", label: "脸", hints: { roundness: 0.9, strokes: 5 } },
  { word: "eye", label: "眼睛", hints: { arc: true, width: 0.5, strokes: 3 } },
  { word: "moon", label: "月亮", hints: { arc: true, vertical: true, strokes: 2 } },
  { word: "cloud", label: "云", hints: { horizontal: true, width: 0.65, strokes: 4 } },
  { word: "flower", label: "花", hints: { radial: true, roundness: 0.7, strokes: 6 } },
  { word: "star", label: "星星", hints: { corners: 5, strokes: 2 } },
  { word: "triangle", label: "三角形", hints: { corners: 3, strokes: 3 } },
  { word: "square", label: "正方形", hints: { corners: 4, roundness: 0.85, strokes: 4 } },
  { word: "door", label: "门", hints: { vertical: true, corners: 4, strokes: 3 } },
  { word: "window", label: "窗户", hints: { corners: 4, strokes: 5 } },
  { word: "table", label: "桌子", hints: { horizontal: true, width: 0.7, strokes: 4 } },
  { word: "chair", label: "椅子", hints: { corners: 4, height: 0.6, strokes: 5 } },
  { word: "bed", label: "床", hints: { horizontal: true, width: 0.75, strokes: 4 } },
  { word: "book", label: "书", hints: { corners: 4, width: 0.45, strokes: 4 } },
  { word: "pencil", label: "铅笔", hints: { horizontal: true, width: 0.75, strokes: 3 } },
  { word: "knife", label: "刀", hints: { horizontal: true, width: 0.65, strokes: 2 } },
  { word: "spoon", label: "勺子", hints: { roundness: 0.55, vertical: true, strokes: 2 } },
  { word: "cup", label: "杯子", hints: { corners: 4, height: 0.55, strokes: 3 } },
  { word: "bottle", label: "瓶子", hints: { vertical: true, height: 0.85, strokes: 3 } },
  { word: "fish", label: "鱼", hints: { horizontal: true, width: 0.65, strokes: 3 } },
  { word: "bird", label: "鸟", hints: { arc: true, width: 0.55, strokes: 3 } },
  { word: "cat", label: "猫", hints: { roundness: 0.7, topMark: true, strokes: 6 } },
  { word: "dog", label: "狗", hints: { horizontal: true, width: 0.65, strokes: 6 } },
  { word: "rabbit", label: "兔子", hints: { vertical: true, topMark: true, strokes: 5 } },
  { word: "butterfly", label: "蝴蝶", hints: { roundness: 0.8, width: 0.65, strokes: 5 } },
  { word: "car", label: "汽车", hints: { horizontal: true, width: 0.8, strokes: 4 } },
  { word: "bus", label: "公交车", hints: { horizontal: true, width: 0.85, corners: 4, strokes: 5 } },
  { word: "train", label: "火车", hints: { horizontal: true, width: 0.85, strokes: 6 } },
  { word: "boat", label: "船", hints: { horizontal: true, arc: true, width: 0.75, strokes: 3 } },
  { word: "airplane", label: "飞机", hints: { horizontal: true, width: 0.85, strokes: 4 } },
  { word: "rocket", label: "火箭", hints: { vertical: true, height: 0.85, strokes: 5 } },
  { word: "mountain", label: "山", hints: { corners: 3, width: 0.7, strokes: 2 } },
  { word: "river", label: "河流", hints: { horizontal: true, width: 0.85, strokes: 2 } },
  { word: "rain", label: "雨", hints: { vertical: true, strokes: 8 } },
  { word: "snowman", label: "雪人", hints: { roundness: 0.85, vertical: true, strokes: 4 } },
  { word: "lollipop", label: "棒棒糖", hints: { roundness: 0.8, vertical: true, strokes: 2 } },
  { word: "balloon", label: "气球", hints: { roundness: 0.85, vertical: true, strokes: 3 } },
  { word: "smiley face", label: "笑脸", hints: { roundness: 0.9, strokes: 4 } },
  { word: "camera", label: "相机", hints: { corners: 4, width: 0.55, strokes: 5 } },
  { word: "phone", label: "手机", hints: { vertical: true, corners: 4, strokes: 3 } },
  { word: "computer", label: "电脑", hints: { corners: 4, width: 0.65, strokes: 4 } },
  { word: "guitar", label: "吉他", hints: { vertical: true, roundness: 0.45, strokes: 4 } },
  { word: "microphone", label: "麦克风", hints: { vertical: true, roundness: 0.55, strokes: 4 } },
  { word: "crown", label: "皇冠", hints: { corners: 5, horizontal: true, strokes: 4 } },
  { word: "hat", label: "帽子", hints: { horizontal: true, arc: true, strokes: 3 } },
  { word: "shoe", label: "鞋子", hints: { horizontal: true, width: 0.7, strokes: 3 } },
  { word: "key", label: "钥匙", hints: { horizontal: true, roundness: 0.4, strokes: 3 } },
  { word: "scissors", label: "剪刀", hints: { roundness: 0.6, strokes: 4 } },
  { word: "ladder", label: "梯子", hints: { vertical: true, height: 0.85, strokes: 7 } },
  { word: "bridge", label: "桥", hints: { horizontal: true, arc: true, width: 0.8, strokes: 4 } },
];

const roundsPerGame = 8;
const guessesToShow = 8;
const launchParams = new URLSearchParams(window.location.search);
const launchToken = launchParams.get("launchToken");
const platformApiBase = (launchParams.get("platformApiBase") || "").replace(/\/+$/, "");
const returnUrl = launchParams.get("returnUrl") || "";
const kidFriendlyPromptWords = [
  "apple",
  "banana",
  "birthday_cake",
  "cake",
  "carrot",
  "cat",
  "dog",
  "fish",
  "bird",
  "butterfly",
  "bee",
  "bear",
  "cow",
  "horse",
  "penguin",
  "rabbit",
  "tree",
  "flower",
  "leaf",
  "bush",
  "cloud",
  "sun",
  "moon",
  "rain",
  "rainbow",
  "snowman",
  "mountain",
  "ocean",
  "house",
  "door",
  "chair",
  "table",
  "bed",
  "book",
  "pencil",
  "crayon",
  "cup",
  "mug",
  "clock",
  "face",
  "smiley_face",
  "eye",
  "star",
  "circle",
  "square",
  "triangle",
  "umbrella",
  "hat",
  "shoe",
  "car",
  "bus",
  "school_bus",
  "train",
  "airplane",
  "sailboat",
  "hot_air_balloon",
  "bicycle",
  "lollipop",
  "crown",
  "camera",
  "cell_phone",
  "computer",
];
let prompts = [];

const sampleDrawing = [
  [
    [70, 82, 94, 110, 128, 146, 160, 169, 170, 164, 151, 134, 112, 92, 77, 68, 66, 70],
    [92, 70, 58, 52, 53, 60, 75, 97, 122, 145, 161, 168, 166, 157, 141, 119, 102, 92],
    [0, 24, 49, 82, 118, 151, 187, 224, 260, 299, 336, 371, 410, 452, 491, 530, 565, 600],
  ],
  [
    [116, 120, 128, 137, 143],
    [54, 39, 27, 19, 14],
    [630, 650, 671, 690, 712],
  ],
  [
    [134, 151, 163],
    [35, 27, 28],
    [730, 752, 776],
  ],
];

const canvas = document.querySelector("#drawCanvas");
const ctx = canvas.getContext("2d");
const datasetMosaic = document.querySelector("#datasetMosaic");
const datasetCtx = datasetMosaic.getContext("2d");
const sampleCanvas = document.querySelector("#sampleCanvas");
const sampleCtx = sampleCanvas.getContext("2d");

const startScreen = document.querySelector("#startScreen");
const gameScreen = document.querySelector("#gameScreen");
const landingStartBtn = document.querySelector("#landingStartBtn");
const promptWord = document.querySelector("#promptWord");
const roundLabel = document.querySelector("#roundLabel");
const scoreLabel = document.querySelector("#scoreLabel");
const timerLabel = document.querySelector("#timerLabel");
const roundMessage = document.querySelector("#roundMessage");
const guessList = document.querySelector("#guessList");
const guessTrail = document.querySelector("#guessTrail");
const modelStatus = document.querySelector("#modelStatus");
const startBtn = document.querySelector("#startBtn");
const soundBtn = document.querySelector("#soundBtn");
const undoBtn = document.querySelector("#undoBtn");
const clearBtn = document.querySelector("#clearBtn");
const skipBtn = document.querySelector("#skipBtn");
const brushSize = document.querySelector("#brushSize");
const replayBtn = document.querySelector("#replayBtn");
const sampleJson = document.querySelector("#sampleJson");
const voiceStatus = document.querySelector("#voiceStatus");
const beatStatus = document.querySelector("#beatStatus");
const studentHomeBtn = document.querySelector("#studentHomeBtn");
const userBadge = document.querySelector("#userBadge");

let drawing = false;
let strokes = [];
let currentStroke = null;
let activePromptIndex = 0;
let score = 0;
let timeLeft = 20;
let timer = null;
let running = false;
let acceptedRound = false;
let soundEnabled = true;
let audioContext = null;
let lastStrokeSoundAt = 0;
let lastSpokenGuess = "";
let lastSpokenGuessAt = 0;
let lastGuessRenderAt = 0;
let lastGuessSignature = "";
let lastSpokenPointCount = 0;
let doodleModel = null;
let doodleClassNames = [];
let modelReady = false;
let modelPredicting = false;
let lastModelPredictionAt = 0;
let latestRankedGuesses = [];
let guessedWords = [];
let lastTrailedGuess = "";
let lastTrailedPointCount = 0;
let platformStudent = null;
let platformContext = null;
let platformVerified = false;
let platformWarning = "";
let scoreSavedForGame = false;
let roundRecords = [];
let roundRecorded = false;
let roundStartedAt = 0;
let gameStartedAt = 0;

const minAcceptPoints = 34;
const minAcceptStrokes = 3;
const minRuleAcceptConfidence = 80;
const minModelAcceptConfidence = 10;
const minVisibleModelConfidence = 18;

const classLabelMap = new Map(guessCategories.map((category) => [normalizeClassName(category.word), category.label]));
const extraClassLabels = {
  aircraft_carrier: "航空母舰",
  alarm_clock: "闹钟",
  ambulance: "救护车",
  angel: "天使",
  animal_migration: "动物迁徙",
  ant: "蚂蚁",
  anvil: "铁砧",
  arm: "手臂",
  asparagus: "芦笋",
  axe: "斧头",
  backpack: "背包",
  banana: "香蕉",
  bandage: "绷带",
  barn: "谷仓",
  baseball: "棒球",
  baseball_bat: "棒球棒",
  basketball: "篮球",
  basket: "篮子",
  bat: "蝙蝠",
  bathtub: "浴缸",
  beach: "海滩",
  beard: "胡子",
  bear: "熊",
  bee: "蜜蜂",
  belt: "腰带",
  bench: "长椅",
  binoculars: "望远镜",
  birthday_cake: "生日蛋糕",
  blackberry: "黑莓",
  blueberry: "蓝莓",
  bottlecap: "瓶盖",
  boomerang: "回旋镖",
  bowtie: "领结",
  bread: "面包",
  brain: "大脑",
  bracelet: "手链",
  broccoli: "西兰花",
  broom: "扫帚",
  brush: "刷子",
  bucket: "桶",
  bulldozer: "推土机",
  bush: "灌木",
  calculator: "计算器",
  calendar: "日历",
  camel: "骆驼",
  camouflage: "迷彩",
  campfire: "篝火",
  canoe: "独木舟",
  candle: "蜡烛",
  cannon: "大炮",
  cactus: "仙人掌",
  cake: "蛋糕",
  carrot: "胡萝卜",
  castle: "城堡",
  cello: "大提琴",
  ceiling_fan: "吊扇",
  cell_phone: "手机",
  chandelier: "吊灯",
  church: "教堂",
  clarinet: "单簧管",
  coffee_cup: "咖啡杯",
  compass: "指南针",
  cookie: "饼干",
  cooler: "冷藏箱",
  couch: "沙发",
  cow: "奶牛",
  crab: "螃蟹",
  crayon: "蜡笔",
  crocodile: "鳄鱼",
  cruise_ship: "游轮",
  diamond: "钻石",
  dishwasher: "洗碗机",
  diving_board: "跳水板",
  dolphin: "海豚",
  donut: "甜甜圈",
  dragon: "龙",
  dresser: "梳妆台",
  drill: "电钻",
  drums: "鼓",
  duck: "鸭子",
  dumbbell: "哑铃",
  ear: "耳朵",
  elbow: "肘部",
  elephant: "大象",
  envelope: "信封",
  eraser: "橡皮",
  eyeglasses: "眼镜",
  fan: "风扇",
  feather: "羽毛",
  fence: "栅栏",
  finger: "手指",
  fire_hydrant: "消防栓",
  fireplace: "壁炉",
  firetruck: "消防车",
  flashlight: "手电筒",
  flamingo: "火烈鸟",
  flip_flops: "人字拖",
  floor_lamp: "落地灯",
  flying_saucer: "飞碟",
  foot: "脚",
  fork: "叉子",
  frog: "青蛙",
  frying_pan: "平底锅",
  giraffe: "长颈鹿",
  goatee: "山羊胡",
  garden_hose: "花园水管",
  garden: "花园",
  golf_club: "高尔夫球杆",
  grapes: "葡萄",
  grass: "草",
  hammer: "锤子",
  hamburger: "汉堡",
  hand: "手",
  harp: "竖琴",
  headphones: "耳机",
  hedgehog: "刺猬",
  helicopter: "直升机",
  helmet: "头盔",
  hexagon: "六边形",
  hockey_puck: "冰球",
  hockey_stick: "曲棍球杆",
  horse: "马",
  hospital: "医院",
  hot_air_balloon: "热气球",
  hot_tub: "热水浴缸",
  hot_dog: "热狗",
  hourglass: "沙漏",
  house_plant: "盆栽",
  hurricane: "飓风",
  ice_cream: "冰淇淋",
  jacket: "夹克",
  jail: "监狱",
  kangaroo: "袋鼠",
  keyboard: "键盘",
  knee: "膝盖",
  laptop: "笔记本电脑",
  lantern: "灯笼",
  leaf: "叶子",
  leg: "腿",
  light_bulb: "灯泡",
  lightning: "闪电",
  lighthouse: "灯塔",
  lighter: "打火机",
  line: "线",
  lion: "狮子",
  lipstick: "口红",
  lobster: "龙虾",
  map: "地图",
  marker: "马克笔",
  matches: "火柴",
  megaphone: "扩音器",
  mermaid: "美人鱼",
  microwave: "微波炉",
  mailbox: "邮箱",
  monkey: "猴子",
  mosquito: "蚊子",
  moustache: "小胡子",
  mouth: "嘴",
  mouse: "老鼠",
  mug: "马克杯",
  mushroom: "蘑菇",
  motorbike: "摩托车",
  nail: "钉子",
  necklace: "项链",
  nose: "鼻子",
  ocean: "海洋",
  octagon: "八边形",
  octopus: "章鱼",
  onion: "洋葱",
  oven: "烤箱",
  owl: "猫头鹰",
  paint_can: "油漆桶",
  paintbrush: "画笔",
  palm_tree: "棕榈树",
  panda: "熊猫",
  pants: "裤子",
  paper_clip: "回形针",
  parachute: "降落伞",
  parrot: "鹦鹉",
  passport: "护照",
  peanut: "花生",
  pear: "梨",
  peas: "豌豆",
  penguin: "企鹅",
  pig: "猪",
  paper_clip: "回形针",
  piano: "钢琴",
  picture_frame: "相框",
  pillow: "枕头",
  pineapple: "菠萝",
  pizza: "披萨",
  pickup_truck: "皮卡",
  pliers: "钳子",
  pond: "池塘",
  police_car: "警车",
  pool: "泳池",
  popsicle: "冰棒",
  postcard: "明信片",
  potato: "土豆",
  power_outlet: "插座",
  purse: "手提包",
  radio: "收音机",
  rainbow: "彩虹",
  raccoon: "浣熊",
  rake: "耙子",
  remote_control: "遥控器",
  rhinoceros: "犀牛",
  rifle: "步枪",
  roller_coaster: "过山车",
  rollerskates: "旱冰鞋",
  sailboat: "帆船",
  sandwich: "三明治",
  saw: "锯子",
  saxophone: "萨克斯",
  scorpion: "蝎子",
  screwdriver: "螺丝刀",
  school_bus: "校车",
  sea_turtle: "海龟",
  see_saw: "跷跷板",
  shark: "鲨鱼",
  sheep: "羊",
  shorts: "短裤",
  shovel: "铲子",
  sink: "水槽",
  skateboard: "滑板",
  skyscraper: "摩天大楼",
  skull: "骷髅",
  sleeping_bag: "睡袋",
  snail: "蜗牛",
  snake: "蛇",
  snorkel: "呼吸管",
  snowflake: "雪花",
  sock: "袜子",
  soccer_ball: "足球",
  spider: "蜘蛛",
  spreadsheet: "电子表格",
  speedboat: "快艇",
  squiggle: "弯曲线",
  squirrel: "松鼠",
  steak: "牛排",
  stereo: "音响",
  stethoscope: "听诊器",
  stitches: "缝线",
  stop_sign: "停止标志",
  stove: "炉灶",
  streetlight: "路灯",
  string_bean: "四季豆",
  submarine: "潜水艇",
  suitcase: "手提箱",
  swan: "天鹅",
  sweater: "毛衣",
  swing_set: "秋千",
  sword: "剑",
  syringe: "注射器",
  teddy_bear: "泰迪熊",
  teapot: "茶壶",
  telephone: "电话",
  television: "电视",
  tennis_racquet: "网球拍",
  tent: "帐篷",
  tiger: "老虎",
  stairs: "楼梯",
  strawberry: "草莓",
  toaster: "烤面包机",
  toe: "脚趾",
  toilet: "马桶",
  tornado: "龙卷风",
  toothpaste: "牙膏",
  toothbrush: "牙刷",
  tooth: "牙齿",
  tractor: "拖拉机",
  traffic_light: "红绿灯",
  trombone: "长号",
  trumpet: "小号",
  truck: "卡车",
  t_shirt: "T 恤",
  underwear: "内衣",
  vase: "花瓶",
  van: "货车",
  violin: "小提琴",
  waterslide: "水滑梯",
  watermelon: "西瓜",
  whale: "鲸鱼",
  wheel: "车轮",
  windmill: "风车",
  washing_machine: "洗衣机",
  wine_bottle: "酒瓶",
  wine_glass: "酒杯",
  wristwatch: "手表",
  yoga: "瑜伽",
  zebra: "斑马",
  zigzag: "之字线",
  the_great_wall_of_china: "长城",
  the_mona_lisa: "蒙娜丽莎",
  the_eiffel_tower: "埃菲尔铁塔",
};

for (const [key, label] of Object.entries(extraClassLabels)) {
  classLabelMap.set(key, label);
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
    platformWarning = "本地预览模式：请从学生后台进入课件后回传成绩。";
    platformStudent = null;
    renderIdentityState();
    return;
  }

  try {
    const data = await platformRequest("/course-runtime/launch/verify", { launchToken });
    platformContext = data.context || null;
    platformVerified = Boolean(platformContext);
    platformStudent = platformContext?.student
      ? {
          id: platformContext.student.id,
          email: platformContext.student.email || "",
          displayName: platformContext.student.displayName || "同学",
        }
      : null;
    platformWarning = platformVerified ? "" : "未获得学生上下文，完成后可能无法回传成绩。";
  } catch (error) {
    platformVerified = false;
    platformWarning = `底座身份校验失败：${error.message}`;
  }
  renderIdentityState();
}

function renderIdentityState() {
  if (platformStudent) {
    studentHomeBtn.classList.remove("is-hidden");
    userBadge.classList.remove("is-hidden");
    userBadge.textContent = `当前学生：${platformStudent.displayName || platformStudent.email}`;
  } else {
    studentHomeBtn.classList.remove("is-hidden");
    userBadge.classList.add("is-hidden");
    userBadge.textContent = "";
  }
}

async function refreshCurrentUser() {
  if (launchToken && !platformVerified) await verifyPlatformLaunch();
  renderIdentityState();
}

async function requireAuthenticatedForGame() {
  if (launchToken && !platformVerified) await verifyPlatformLaunch();
  if ((!launchToken && !platformApiBase) || platformVerified) return true;
  roundMessage.textContent = platformWarning || "请从学生后台重新进入课件。";
  return false;
}

async function saveScoreIfLoggedIn() {
  if (!launchToken || !platformApiBase || scoreSavedForGame) {
    if (!launchToken || !platformApiBase) roundMessage.textContent = `完成。总分 ${score}，本地预览模式未回传。`;
    return;
  }
  scoreSavedForGame = true;
  const maxScore = Math.max(1, prompts.length * 20);
  const normalizedScore = Math.max(0, Math.min(100, Math.round((score / maxScore) * 100)));
  const durationSeconds = Math.max(1, Math.round((Date.now() - gameStartedAt) / 1000));
  try {
    const response = await fetch("./api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        launchToken,
        platformApiBase,
        score: normalizedScore,
        durationSeconds,
        rawScore: score,
        maxRawScore: maxScore,
        roundCount: prompts.length,
        recognizedCount: roundRecords.filter((round) => round.recognized).length,
        imageDataUrl: makeWorkImageDataUrl(roundRecords),
        roundImages: roundRecords.map((round) => ({
          index: round.index,
          imageDataUrl: makeRoundImageDataUrl(round),
        })),
        rounds: roundRecords,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "作品保存失败");
    roundMessage.textContent = `完成。总分 ${score}，作品和成绩已回传到底座。`;
  } catch (error) {
    scoreSavedForGame = false;
    roundMessage.textContent = `完成。总分 ${score}，提交失败：${error.message}`;
  }
}

const AudioEngine = {
  async unlock() {
    if (!window.AudioContext && !window.webkitAudioContext) return;
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }
  },

  setStatus(voice, beat) {
    voiceStatus.textContent = voice;
    beatStatus.textContent = beat;
  },

  tone(frequency, duration = 0.12, type = "sine", gain = 0.07, delay = 0) {
    if (!soundEnabled || !audioContext) return;
    const now = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(gain, now + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    oscillator.connect(envelope);
    envelope.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.03);
  },

  tick(urgent = false) {
    this.tone(urgent ? 880 : 520, urgent ? 0.09 : 0.055, "square", urgent ? 0.08 : 0.045);
  },

  draw() {
    const now = performance.now();
    if (now - lastStrokeSoundAt < 70) return;
    lastStrokeSoundAt = now;
    const pitch = 170 + Math.random() * 90;
    this.tone(pitch, 0.045, "triangle", 0.025);
  },

  success() {
    this.tone(523.25, 0.1, "sine", 0.09, 0);
    this.tone(659.25, 0.1, "sine", 0.09, 0.1);
    this.tone(783.99, 0.16, "sine", 0.09, 0.2);
  },

  fail() {
    this.tone(220, 0.16, "sawtooth", 0.07, 0);
    this.tone(164.81, 0.2, "sawtooth", 0.065, 0.17);
  },

  skip() {
    this.tone(330, 0.08, "square", 0.055, 0);
    this.tone(247, 0.08, "square", 0.055, 0.09);
  },

  speak(text, { rate = 1.05, pitch = 1.1, interrupt = true } = {}) {
    if (!soundEnabled || !("speechSynthesis" in window)) return;
    if (interrupt) window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = rate;
    utterance.pitch = pitch;
    window.speechSynthesis.speak(utterance);
  },
};

function normalizeClassName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function displayClassName(name) {
  const normalized = normalizeClassName(name);
  return classLabelMap.get(normalized) || name.replace(/_/g, " ");
}

function makeGuess(word, confidence) {
  return {
    word: normalizeClassName(word),
    label: displayClassName(word),
    confidence,
  };
}

function getRuleScoreForWord(word, features = getFeatures()) {
  const category = guessCategories.find((item) => normalizeClassName(item.word) === normalizeClassName(word));
  return category ? scorePrompt(category, features) : 0;
}

function makePromptFromWord(word) {
  const normalized = normalizeClassName(word);
  const ruleCategory = guessCategories.find((category) => normalizeClassName(category.word) === normalized);
  return ruleCategory || { word: normalized, label: displayClassName(normalized), hints: {} };
}

function createPromptSet() {
  const availableWords = modelReady && doodleClassNames.length
    ? new Set(doodleClassNames.map(normalizeClassName))
    : new Set(guessCategories.map((category) => normalizeClassName(category.word)));
  const source = kidFriendlyPromptWords
    .filter((word) => availableWords.has(normalizeClassName(word)))
    .map(makePromptFromWord);

  return [...source]
    .sort(() => Math.random() - 0.5)
    .slice(0, roundsPerGame);
}

async function loadDoodleModel() {
  if (location.protocol === "file:") {
    modelStatus.textContent = "模型需要通过课件运行区或本地静态服务加载。";
    return;
  }

  if (!window.tf) {
    modelStatus.textContent = "TF.js 未加载，使用规则识别";
    return;
  }

  try {
    modelStatus.textContent = "正在加载 345 类涂鸦识别模型...";
    const [model, classText] = await Promise.all([
      tf.loadLayersModel("./models/doodlenet/model.json"),
      fetch("./models/doodlenet/class_names.txt").then((response) => {
        if (!response.ok) throw new Error(`class_names ${response.status}`);
        return response.text();
      }),
    ]);
    doodleModel = model;
    doodleClassNames = classText.split(/\r?\n/).map((name) => name.trim()).filter(Boolean);
    modelReady = doodleClassNames.length === 345;
    modelStatus.textContent = modelReady
      ? "涂鸦识别模型已启用：345 类实时识别"
      : `类别数异常：${doodleClassNames.length}，使用规则识别`;
    if (modelReady && !running) {
      prompts = createPromptSet();
      updateLabels();
    }
    if (modelReady) updateGuesses({ force: true });
  } catch (error) {
    modelReady = false;
    modelStatus.textContent = "模型加载失败，使用规则识别";
    console.error("Failed to load doodleNet", error);
  }
}

function fitCanvasToDisplay() {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * scale));
  canvas.height = Math.max(1, Math.round(rect.height * scale));
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  redraw();
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
    t: Date.now(),
  };
}

function startStroke(event) {
  if (!running) return;
  drawing = true;
  currentStroke = [pointerPosition(event)];
  strokes.push(currentStroke);
  canvas.setPointerCapture(event.pointerId);
  AudioEngine.draw();
  updateGuesses({ force: true });
}

function addPoint(event) {
  if (!drawing || !currentStroke) return;
  currentStroke.push(pointerPosition(event));
  redraw();
  AudioEngine.draw();
  updateGuesses();
}

function endStroke() {
  drawing = false;
  currentStroke = null;
  updateGuesses();
}

function redraw() {
  const rect = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#151515";
  ctx.lineWidth = Number(brushSize.value);

  for (const stroke of strokes) {
    if (stroke.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(stroke[0].x, stroke[0].y);
    for (const point of stroke.slice(1)) {
      ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }
}

function flattenPoints() {
  return strokes.flat();
}

function getFeatures() {
  const points = flattenPoints();
  if (!points.length) {
    return { points: 0, strokes: 0, width: 0, height: 0, aspect: 0, roundness: 0, vertical: false, lollipopShape: false };
  }
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const rect = canvas.getBoundingClientRect();
  const aspect = width / height;
  const density = points.length / Math.max(1, strokes.length);
  const roundness = 1 - Math.min(1, Math.abs(aspect - 1));
  const topMark = strokes.some((stroke) => stroke.some((point) => point.y < minY + height * 0.2));
  const vertical = height > width * 1.2;
  const horizontal = width > height * 1.35;
  const strokeBoxes = strokes.map((stroke) => getPointBox(stroke)).filter(Boolean);
  const wheelBoxes = strokeBoxes.filter((box) => {
    const strokeAspect = box.width / box.height;
    const strokeRoundness = 1 - Math.min(1, Math.abs(strokeAspect - 1));
    const centerY = box.minY + box.height / 2;
    return (
      strokeRoundness > 0.48 &&
      box.width > width * 0.12 &&
      box.height > height * 0.14 &&
      centerY > minY + height * 0.48
    );
  });
  const hasTwoSeparatedWheels = wheelBoxes.some((leftBox, index) =>
    wheelBoxes.slice(index + 1).some((rightBox) => {
      const leftCenter = leftBox.minX + leftBox.width / 2;
      const rightCenter = rightBox.minX + rightBox.width / 2;
      return Math.abs(rightCenter - leftCenter) > width * 0.35;
    }),
  );
  const bicycleShape = hasTwoSeparatedWheels && horizontal && strokes.length >= 4;
  const headCutoff = minY + height * 0.58;
  const lowerCutoff = minY + height * 0.5;
  const headPoints = points.filter((point) => point.y <= headCutoff);
  const lowerPoints = points.filter((point) => point.y >= lowerCutoff);
  const headBox = getPointBox(headPoints);
  const lowerBox = getPointBox(lowerPoints);
  const headAspect = headBox ? headBox.width / headBox.height : 0;
  const headRoundness = headBox ? 1 - Math.min(1, Math.abs(headAspect - 1)) : 0;
  const lowerNarrow = lowerBox ? lowerBox.width < width * 0.38 : false;
  const lowerTall = lowerBox && headBox ? lowerBox.height > headBox.height * 0.45 : false;
  const lollipopShape =
    strokes.length >= 2 &&
    headPoints.length >= 16 &&
    lowerPoints.length >= 5 &&
    headRoundness > 0.48 &&
    lowerNarrow &&
    lowerTall;

  return {
    points: points.length,
    strokes: strokes.length,
    width: width / rect.width,
    height: height / rect.height,
    aspect,
    roundness,
    density,
    topMark,
    vertical,
    horizontal,
    hasTwoSeparatedWheels,
    bicycleShape,
    headRoundness,
    lowerNarrow,
    lowerTall,
    lollipopShape,
  };
}

function getPointBox(points) {
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function scorePrompt(prompt, features) {
  if (!features.points) return 2;
  let value = Math.min(14, features.points * 0.22) + Math.min(10, features.strokes * 2.2);
  const normalizedPrompt = normalizeClassName(prompt.word);

  if (prompt.hints.roundness) value += (1 - Math.abs(features.roundness - prompt.hints.roundness)) * 30;
  if (prompt.hints.width) value += (1 - Math.abs(features.width - prompt.hints.width)) * 26;
  if (prompt.hints.height) value += (1 - Math.abs(features.height - prompt.hints.height)) * 24;
  if (prompt.hints.strokes) value += Math.max(0, 16 - Math.abs(features.strokes - prompt.hints.strokes) * 4);
  if (prompt.hints.topMark && features.topMark) value += 14;
  if (prompt.hints.vertical && features.vertical) value += 18;
  if (prompt.hints.horizontal && features.horizontal) value += 18;
  if (prompt.hints.radial && features.strokes >= 5) value += 16;
  if (prompt.hints.arc && features.aspect > 1.1) value += 12;
  if (prompt.hints.corners && features.strokes >= 3) value += 10;
  if (prompt.hints.circles && features.roundness > 0.55 && features.strokes >= 2) value += 14;
  if (features.points < 12 && prompt.hints.strokes && prompt.hints.strokes <= 2) value += 8;
  if (features.points > 60 && prompt.hints.strokes && prompt.hints.strokes >= 5) value += 8;
  if (prompt.hints.vertical && features.horizontal) value -= 14;
  if (prompt.hints.horizontal && features.vertical) value -= 14;
  if (prompt.hints.roundness && Math.abs(features.roundness - prompt.hints.roundness) > 0.5) value -= 12;
  if (prompt.hints.width && Math.abs(features.width - prompt.hints.width) > 0.35) value -= 10;
  if (prompt.hints.height && Math.abs(features.height - prompt.hints.height) > 0.35) value -= 10;
  if (normalizedPrompt === "lollipop") {
    if (features.lollipopShape) value += 54;
    if (features.headRoundness > 0.48) value += 12;
    if (features.lowerNarrow && features.lowerTall) value += 18;
  }
  if (normalizedPrompt === "bicycle") {
    if (features.bicycleShape) value += 54;
    if (features.hasTwoSeparatedWheels) value += 24;
    if (features.horizontal) value += 10;
  }

  return Math.max(0, Math.min(99, Math.round(value)));
}

function getRankedGuesses() {
  const features = getFeatures();
  return guessCategories
    .map((prompt) => ({
      ...prompt,
      confidence: Math.max(0, scorePrompt(prompt, features) - (guessedWords.includes(prompt.label) ? 16 : 0)),
    }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, guessesToShow);
}

function getCurrentRankedGuesses() {
  if (modelReady) {
    return latestRankedGuesses;
  }
  return getRankedGuesses();
}

function serializeStrokes() {
  return strokes.map((stroke) =>
    stroke.map((point) => ({
      x: Math.round(point.x * 10) / 10,
      y: Math.round(point.y * 10) / 10,
      t: Math.max(0, Math.round(point.t - roundStartedAt)),
    })),
  );
}

function drawSerializedStrokesToCanvas(targetCanvas, serializedStrokes, label = "") {
  const targetCtx = targetCanvas.getContext("2d");
  targetCtx.fillStyle = "#fff";
  targetCtx.fillRect(0, 0, targetCanvas.width, targetCanvas.height);

  if (label) {
    targetCtx.fillStyle = "#151515";
    targetCtx.font = "700 22px system-ui, sans-serif";
    targetCtx.fillText(label, 18, 34);
  }

  const points = Array.isArray(serializedStrokes) ? serializedStrokes.flat() : [];
  if (!points.length) return;

  const xs = points.map((point) => Number(point.x || 0));
  const ys = points.map((point) => Number(point.y || 0));
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const drawingWidth = Math.max(1, maxX - minX);
  const drawingHeight = Math.max(1, maxY - minY);
  const padding = 34;
  const topPadding = label ? 58 : padding;
  const scale = Math.min(
    (targetCanvas.width - padding * 2) / drawingWidth,
    (targetCanvas.height - topPadding - padding) / drawingHeight,
  );
  const offsetX = (targetCanvas.width - drawingWidth * scale) / 2;
  const offsetY = topPadding + (targetCanvas.height - topPadding - padding - drawingHeight * scale) / 2;

  targetCtx.lineCap = "round";
  targetCtx.lineJoin = "round";
  targetCtx.strokeStyle = "#151515";
  targetCtx.lineWidth = 5;
  serializedStrokes.forEach((stroke) => {
    if (!Array.isArray(stroke) || stroke.length < 2) return;
    targetCtx.beginPath();
    targetCtx.moveTo((stroke[0].x - minX) * scale + offsetX, (stroke[0].y - minY) * scale + offsetY);
    stroke.slice(1).forEach((point) => {
      targetCtx.lineTo((point.x - minX) * scale + offsetX, (point.y - minY) * scale + offsetY);
    });
    targetCtx.stroke();
  });
}

function makeRoundImageDataUrl(round) {
  const imageCanvas = document.createElement("canvas");
  imageCanvas.width = 900;
  imageCanvas.height = 640;
  drawSerializedStrokesToCanvas(imageCanvas, round.strokes, round.promptLabel || round.promptWord || "");
  return imageCanvas.toDataURL("image/png");
}

function makeWorkImageDataUrl(rounds) {
  const imageCanvas = document.createElement("canvas");
  const imageCtx = imageCanvas.getContext("2d");
  imageCanvas.width = 1200;
  imageCanvas.height = 900;
  imageCtx.fillStyle = "#fff";
  imageCtx.fillRect(0, 0, imageCanvas.width, imageCanvas.height);
  imageCtx.fillStyle = "#151515";
  imageCtx.font = "800 34px system-ui, sans-serif";
  imageCtx.fillText("神经网络涂鸦识别作品", 36, 54);

  const columns = 4;
  const rows = 2;
  const cellW = imageCanvas.width / columns;
  const cellH = (imageCanvas.height - 90) / rows;
  rounds.slice(0, columns * rows).forEach((round, index) => {
    const cellCanvas = document.createElement("canvas");
    cellCanvas.width = Math.round(cellW - 30);
    cellCanvas.height = Math.round(cellH - 28);
    drawSerializedStrokesToCanvas(cellCanvas, round.strokes, `${index + 1}. ${round.promptLabel || round.promptWord || ""}`);
    const x = (index % columns) * cellW + 15;
    const y = 90 + Math.floor(index / columns) * cellH + 12;
    imageCtx.strokeStyle = "#d9d4ca";
    imageCtx.lineWidth = 2;
    imageCtx.strokeRect(x, y, cellCanvas.width, cellCanvas.height);
    imageCtx.drawImage(cellCanvas, x, y);
  });

  return imageCanvas.toDataURL("image/png");
}

function snapshotGuesses() {
  return getCurrentRankedGuesses()
    .slice(0, guessesToShow)
    .map((guess) => ({
      word: guess.word,
      label: guess.label,
      confidence: guess.confidence,
    }));
}

function recordCurrentRound(outcome, scoreAwarded = 0) {
  if (roundRecorded || !prompts[activePromptIndex]) return;
  const current = prompts[activePromptIndex];
  roundRecorded = true;
  roundRecords.push({
    index: activePromptIndex + 1,
    promptWord: current.word,
    promptLabel: current.label,
    outcome,
    recognized: outcome === "recognized",
    scoreAwarded,
    remainingSeconds: timeLeft,
    guesses: snapshotGuesses(),
    guessedLabels: [...guessedWords],
    strokes: serializeStrokes(),
    pointCount: flattenPoints().length,
    createdAt: new Date().toISOString(),
  });
}

function isCurrentPromptRecognized(ranked, features = getFeatures()) {
  if (!running || acceptedRound || !ranked.length) return false;
  const current = prompts[activePromptIndex];
  const currentWord = normalizeClassName(current.word);
  if (features.points < minAcceptPoints) return false;
  const hasSpecificShape =
    (currentWord === "lollipop" && features.lollipopShape) ||
    (currentWord === "bicycle" && features.bicycleShape);
  const completeEnough = features.strokes >= minAcceptStrokes || hasSpecificShape;
  if (!completeEnough) return false;

  if (!modelReady) {
    return (
      ranked[0]?.word === current.word &&
      ranked[0].confidence >= minRuleAcceptConfidence
    );
  }

  const topGuess = ranked[0];
  const promptGuessIndex = ranked.findIndex((guess) => guess.word === currentWord);
  const promptGuess = promptGuessIndex >= 0 ? ranked[promptGuessIndex] : null;
  const ruleScore = getRuleScoreForWord(currentWord, features);
  return (
    (topGuess?.word === currentWord && topGuess.confidence >= minModelAcceptConfidence) ||
    (promptGuessIndex >= 0 && promptGuessIndex < guessesToShow && promptGuess.confidence >= minVisibleModelConfidence) ||
    ruleScore >= minRuleAcceptConfidence + 4
  );
}

function acceptCurrentRound() {
  const current = prompts[activePromptIndex];
  acceptedRound = true;
  const scoreAwarded = Math.max(5, timeLeft);
  score += scoreAwarded;
  recordCurrentRound("recognized", scoreAwarded);
  scoreLabel.textContent = String(score);
  roundMessage.textContent = `识别为“${current.label}”，本回合通过。`;
  AudioEngine.setStatus("识别成功", "通过");
  AudioEngine.success();
  AudioEngine.speak(`好棒，我认出来了，这是${current.label}`, { rate: 1.08 });
  window.setTimeout(nextRound, 700);
}

function updateGuesses({ force = false } = {}) {
  const now = performance.now();
  if (!force && running && now - lastGuessRenderAt < 120) return;
  lastGuessRenderAt = now;

  if (modelReady) requestModelPrediction({ force });
  const ranked = getCurrentRankedGuesses();
  renderGuessRows(ranked);

  appendGuessToTrail(pickTrailGuess(ranked));
  const features = getFeatures();
  maybeSpeakGuess(ranked[0]);
  if (isCurrentPromptRecognized(ranked, features)) acceptCurrentRound();
}

function requestModelPrediction({ force = false } = {}) {
  if (!modelReady || modelPredicting) return;
  const now = performance.now();
  if (!force && now - lastModelPredictionAt < 180) return;
  if (flattenPoints().length < 10) {
    latestRankedGuesses = [];
    return;
  }

  modelPredicting = true;
  lastModelPredictionAt = now;
  window.setTimeout(async () => {
    try {
      latestRankedGuesses = await predictWithDoodleModel();
      renderGuessRows(latestRankedGuesses);
      appendGuessToTrail(pickTrailGuess(latestRankedGuesses));
      maybeSpeakGuess(latestRankedGuesses[0]);

      const features = getFeatures();
      if (isCurrentPromptRecognized(latestRankedGuesses, features)) acceptCurrentRound();
    } catch (error) {
      console.error("doodleNet prediction failed", error);
      modelStatus.textContent = "模型推理失败，使用规则识别";
      modelReady = false;
      latestRankedGuesses = [];
      updateGuesses({ force: true });
    } finally {
      modelPredicting = false;
    }
  }, 0);
}

function renderGuessRows(ranked) {
  guessList.innerHTML = ranked
    .map(
      (guess) => `
        <div class="guess-row">
          <strong>${guess.label}</strong>
          <div class="guess-meter"><span style="width:${guess.confidence}%"></span></div>
          <span>${guess.confidence}%</span>
        </div>
      `,
    )
    .join("");
}

function pickTrailGuess(ranked) {
  if (!ranked.length) return null;
  return ranked.find((guess) => guess.confidence >= 3 && !guessedWords.includes(guess.label)) || ranked[0];
}

function appendGuessToTrail(guess) {
  const pointCount = flattenPoints().length;
  if (!running || acceptedRound || !guess || guess.confidence < 3 || pointCount < 3) return;
  if (pointCount <= lastTrailedPointCount) return;
  if (guess.word === lastTrailedGuess) return;

  lastTrailedGuess = guess.word;
  lastTrailedPointCount = pointCount;
  guessedWords.push(guess.label);
  if (guessedWords.length > 18) guessedWords = guessedWords.slice(-18);

  guessTrail.innerHTML = guessedWords.map((label) => `<span class="guess-chip">${label}</span>`).join("");
}

function resetGuessTrail() {
  guessedWords = [];
  lastTrailedGuess = "";
  lastTrailedPointCount = 0;
  guessTrail.innerHTML = "";
}

async function predictWithDoodleModel() {
  const tensor = tf.tidy(() => tf.tensor4d(getModelInput(), [1, 28, 28, 1]));
  const prediction = doodleModel.predict(tensor);
  const probabilities = await prediction.data();
  tensor.dispose();
  prediction.dispose();

  const features = getFeatures();
  return Array.from(probabilities)
    .map((probability, index) => {
      const word = doodleClassNames[index];
      const ruleScore = getRuleScoreForWord(word, features);
      const confidence = Math.round(probability * 100 + Math.min(8, ruleScore * 0.08));
      return { word, probability, confidence };
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, guessesToShow)
    .map((item) => makeGuess(item.word, item.confidence));
}

function getModelInput() {
  const size = 28;
  const offscreen = document.createElement("canvas");
  offscreen.width = size;
  offscreen.height = size;
  const offscreenCtx = offscreen.getContext("2d", { willReadFrequently: true });
  const points = flattenPoints();
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const drawingWidth = Math.max(1, maxX - minX);
  const drawingHeight = Math.max(1, maxY - minY);
  const scale = Math.min(20 / drawingWidth, 20 / drawingHeight);
  const offsetX = (size - drawingWidth * scale) / 2;
  const offsetY = (size - drawingHeight * scale) / 2;

  offscreenCtx.fillStyle = "#fff";
  offscreenCtx.fillRect(0, 0, size, size);
  offscreenCtx.lineCap = "round";
  offscreenCtx.lineJoin = "round";
  offscreenCtx.strokeStyle = "#000";
  offscreenCtx.lineWidth = Math.max(1.2, Number(brushSize.value) * scale);

  for (const stroke of strokes) {
    if (stroke.length < 2) continue;
    offscreenCtx.beginPath();
    offscreenCtx.moveTo((stroke[0].x - minX) * scale + offsetX, (stroke[0].y - minY) * scale + offsetY);
    for (const point of stroke.slice(1)) {
      offscreenCtx.lineTo((point.x - minX) * scale + offsetX, (point.y - minY) * scale + offsetY);
    }
    offscreenCtx.stroke();
  }

  const pixels = offscreenCtx.getImageData(0, 0, size, size).data;
  const input = [];
  for (let i = 0; i < size * size; i += 1) {
    input.push((255 - pixels[i * 4]) / 255);
  }
  return input;
}

function seededRandom(seed) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
}

const appleOutlineTemplates = [
  [[-0.34, -0.34], [-0.48, -0.2], [-0.52, 0.08], [-0.42, 0.34], [-0.16, 0.45], [0.14, 0.43], [0.39, 0.28], [0.48, 0], [0.4, -0.25], [0.16, -0.39], [-0.08, -0.34], [-0.34, -0.34]],
  [[-0.42, -0.26], [-0.5, -0.06], [-0.45, 0.24], [-0.24, 0.45], [0.04, 0.49], [0.33, 0.39], [0.49, 0.17], [0.48, -0.12], [0.28, -0.32], [0.04, -0.34], [-0.12, -0.24], [-0.3, -0.31], [-0.42, -0.26]],
  [[-0.28, -0.42], [-0.45, -0.31], [-0.52, -0.06], [-0.48, 0.24], [-0.26, 0.43], [0.04, 0.44], [0.32, 0.38], [0.48, 0.15], [0.45, -0.18], [0.22, -0.38], [0.02, -0.36], [-0.1, -0.24], [-0.28, -0.42]],
  [[-0.38, -0.18], [-0.48, 0.02], [-0.44, 0.3], [-0.2, 0.45], [0.1, 0.42], [0.38, 0.35], [0.5, 0.08], [0.36, -0.17], [0.14, -0.29], [-0.06, -0.28], [-0.18, -0.18], [-0.38, -0.18]],
  [[-0.24, -0.35], [-0.45, -0.22], [-0.5, 0.08], [-0.36, 0.34], [-0.1, 0.48], [0.18, 0.47], [0.42, 0.3], [0.48, 0.03], [0.38, -0.22], [0.08, -0.36], [-0.07, -0.25], [-0.24, -0.35]],
  [[-0.48, -0.15], [-0.52, 0.18], [-0.36, 0.42], [-0.04, 0.49], [0.26, 0.43], [0.46, 0.22], [0.5, -0.05], [0.32, -0.24], [0.1, -0.29], [-0.08, -0.22], [-0.24, -0.32], [-0.48, -0.15]],
  [[-0.36, -0.36], [-0.5, -0.12], [-0.44, 0.2], [-0.22, 0.42], [0.04, 0.48], [0.25, 0.38], [0.3, 0.18], [0.46, 0.08], [0.42, -0.18], [0.18, -0.36], [-0.04, -0.32], [-0.18, -0.42], [-0.36, -0.36]],
  [[-0.3, -0.28], [-0.48, -0.12], [-0.48, 0.2], [-0.28, 0.4], [0, 0.44], [0.34, 0.38], [0.5, 0.15], [0.48, -0.18], [0.22, -0.3], [0.04, -0.24], [-0.12, -0.34], [-0.3, -0.28]],
  [[-0.42, -0.24], [-0.53, 0.02], [-0.46, 0.32], [-0.2, 0.5], [0.14, 0.45], [0.42, 0.26], [0.5, -0.02], [0.36, -0.28], [0.12, -0.36], [-0.06, -0.27], [-0.2, -0.34], [-0.42, -0.24]],
  [[-0.28, -0.38], [-0.48, -0.28], [-0.52, 0.04], [-0.42, 0.34], [-0.12, 0.45], [0.12, 0.4], [0.34, 0.42], [0.48, 0.16], [0.44, -0.12], [0.22, -0.28], [0.02, -0.25], [-0.1, -0.34], [-0.28, -0.38]],
];

function jitterPoint(point, amount, random) {
  return [
    point[0] + (random() - 0.5) * amount,
    point[1] + (random() - 0.5) * amount,
  ];
}

function makeOrganicApplePoints(random) {
  const pointCount = 10 + Math.floor(random() * 8);
  const points = [];
  const flatness = 0.84 + random() * 0.34;
  const width = 0.72 + random() * 0.28;
  const notch = 0.05 + random() * 0.18;
  for (let i = 0; i < pointCount; i += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * i) / pointCount;
    const topDip = Math.max(0, 1 - Math.abs(angle + Math.PI / 2) * 2.4);
    const bottomBump = Math.max(0, 1 - Math.abs(angle - Math.PI / 2) * 1.5);
    const sideLobe = Math.abs(Math.cos(angle));
    const rough = 0.86 + random() * 0.28;
    const x = Math.cos(angle) * width * rough * (0.52 + sideLobe * 0.08);
    const y = Math.sin(angle) * flatness * rough * (0.48 + bottomBump * 0.06) + topDip * notch;
    points.push([x, y + 0.04]);
  }
  points.push(points[0]);
  return points;
}

function drawSketchPolyline(targetCtx, points, size, random, options = {}) {
  if (points.length < 2) return;
  const { closePath = false, jitter = 0.08, looseness = 0.05, broken = 0 } = options;
  targetCtx.beginPath();
  const first = jitterPoint(points[0], jitter, random);
  targetCtx.moveTo(first[0] * size, first[1] * size);
  for (let i = 1; i < points.length; i += 1) {
    if (broken && random() < broken) {
      const lift = jitterPoint(points[i], jitter, random);
      targetCtx.moveTo(lift[0] * size, lift[1] * size);
      continue;
    }
    const point = jitterPoint(points[i], jitter, random);
    const previous = jitterPoint(points[i - 1], jitter * 0.5, random);
    const midX = (previous[0] + point[0]) / 2 + (random() - 0.5) * looseness;
    const midY = (previous[1] + point[1]) / 2 + (random() - 0.5) * looseness;
    targetCtx.quadraticCurveTo(midX * size, midY * size, point[0] * size, point[1] * size);
  }
  if (closePath && random() > 0.24) targetCtx.closePath();
  targetCtx.stroke();
}

function drawDoodleApple(targetCtx, centerX, centerY, size, random) {
  const template =
    random() > 0.42
      ? appleOutlineTemplates[Math.floor(random() * appleOutlineTemplates.length)]
      : makeOrganicApplePoints(random);
  const scaleX = 0.68 + random() * 0.58;
  const scaleY = 0.7 + random() * 0.54;
  const translatedTemplate = template.map(([x, y]) => [
    x * scaleX + (random() - 0.5) * 0.05,
    y * scaleY + (random() - 0.5) * 0.05,
  ]);
  const roughness = 0.04 + random() * 0.12;

  targetCtx.save();
  targetCtx.translate(centerX, centerY);
  targetCtx.rotate((random() - 0.5) * 0.52);
  drawSketchPolyline(targetCtx, translatedTemplate, size, random, {
    closePath: true,
    jitter: roughness,
    looseness: 0.035 + random() * 0.09,
    broken: random() > 0.72 ? 0.04 : 0,
  });

  if (random() > 0.78) {
    const inner = translatedTemplate
      .filter((_, index) => index % 2 === 0)
      .map(([x, y]) => [x * (0.9 + random() * 0.08), y * (0.9 + random() * 0.08)]);
    drawSketchPolyline(targetCtx, inner, size, random, {
      closePath: true,
      jitter: roughness * 0.55,
      looseness: 0.03,
      broken: 0.16,
    });
  }

  const stemX = (random() - 0.5) * 0.16;
  const stemTopX = stemX + (random() - 0.5) * 0.34;
  const stemTopY = -0.64 - random() * 0.34;
  if (random() > 0.03) {
    drawSketchPolyline(
      targetCtx,
      [
        [stemX, -0.43 - random() * 0.08],
        [(stemX + stemTopX) / 2 + (random() - 0.5) * 0.12, -0.62 - random() * 0.08],
        [stemTopX, stemTopY],
      ],
      size,
      random,
      { jitter: 0.04 + random() * 0.08, looseness: 0.05 },
    );
  }

  if (random() > 0.3) {
    const leafSide = random() > 0.5 ? 1 : -1;
    const base = [stemX + leafSide * 0.02, -0.62 - random() * 0.08];
    const tip = [stemX + leafSide * (0.18 + random() * 0.28), -0.66 + (random() - 0.5) * 0.22];
    const outer = [stemX + leafSide * (0.16 + random() * 0.1), -0.82 - random() * 0.08];
    if (random() > 0.46) {
      drawSketchPolyline(targetCtx, [base, outer, tip, base], size, random, {
        closePath: true,
        jitter: 0.05,
        looseness: 0.04,
      });
    } else {
      drawSketchPolyline(targetCtx, [base, outer, tip], size, random, { jitter: 0.05, looseness: 0.04 });
    }
  }

  if (random() > 0.84) {
    drawSketchPolyline(
      targetCtx,
      [
        [-0.1 + random() * 0.1, -0.08 + random() * 0.08],
        [-0.04 + random() * 0.12, -0.1 + random() * 0.08],
      ],
      size,
      random,
      { jitter: 0.04, looseness: 0.04 },
    );
  }
  targetCtx.restore();
}

function drawDatasetMosaic() {
  if (!datasetMosaic) return;
  const rect = datasetMosaic.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  datasetMosaic.width = Math.max(1, Math.round(rect.width * dpr));
  datasetMosaic.height = Math.max(1, Math.round(rect.height * dpr));
  datasetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  datasetCtx.clearRect(0, 0, rect.width, rect.height);
  datasetCtx.fillStyle = "#fff";
  datasetCtx.fillRect(0, 0, rect.width, rect.height);
  datasetCtx.strokeStyle = "#111";
  datasetCtx.lineWidth = Math.max(0.62, Math.min(0.95, rect.width / 900));
  datasetCtx.lineCap = "round";
  datasetCtx.lineJoin = "round";

  const random = seededRandom(20260513);
  const columns = Math.max(12, Math.floor(rect.width / 38));
  const rows = Math.max(7, Math.floor(rect.height / 40));
  const cellW = rect.width / columns;
  const cellH = rect.height / rows;
  const size = Math.min(cellW, cellH) * 0.66;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const x = col * cellW + cellW * (0.5 + (random() - 0.5) * 0.36);
      const y = row * cellH + cellH * (0.52 + (random() - 0.5) * 0.3);
      drawDoodleApple(datasetCtx, x, y, size * (0.68 + random() * 0.54), random);
    }
  }
}

function maybeSpeakGuess(guess) {
  if (!running || acceptedRound || !guess || guess.confidence < 24) return;
  const pointCount = flattenPoints().length;
  if (pointCount <= lastSpokenPointCount) return;
  const now = performance.now();
  const signature = `${guess.word}:${Math.floor(guess.confidence / 12)}`;
  if (signature === lastGuessSignature || now - lastSpokenGuessAt < 1400) return;
  lastSpokenGuess = guess.word;
  lastGuessSignature = signature;
  lastSpokenGuessAt = now;
  lastSpokenPointCount = pointCount;
  AudioEngine.setStatus(`像${guess.label}`, beatStatus.textContent);
  const phrase = guess.confidence >= 55 ? `我看像${guess.label}` : `可能是${guess.label}`;
  AudioEngine.speak(phrase, { rate: 1.22, pitch: 1.18, interrupt: false });
}

async function startGame(options = {}) {
  if (!options.skipAuthCheck && !(await requireAuthenticatedForGame())) return;
  AudioEngine.unlock().catch((error) => {
    console.warn("Audio unlock failed", error);
    AudioEngine.setStatus("音频待授权", "20 秒");
  });
  prompts = createPromptSet();
  score = 0;
  scoreSavedForGame = false;
  roundRecords = [];
  gameStartedAt = Date.now();
  activePromptIndex = 0;
  scoreLabel.textContent = "0";
  startRound();
}

async function enterGame() {
  if (!(await requireAuthenticatedForGame())) return;
  startScreen.classList.add("is-hidden");
  gameScreen.classList.remove("is-hidden");
  fitCanvasToDisplay();
  startGame({ skipAuthCheck: true });
}

function startRound() {
  running = true;
  acceptedRound = false;
  roundRecorded = false;
  roundStartedAt = Date.now();
  strokes = [];
  timeLeft = 20;
  lastSpokenGuess = "";
  lastSpokenGuessAt = 0;
  lastGuessSignature = "";
  lastSpokenPointCount = 0;
  lastGuessRenderAt = 0;
  latestRankedGuesses = [];
  resetGuessTrail();
  clearInterval(timer);
  updateLabels();
  redraw();
  updateGuesses();
  startBtn.textContent = "重开";
  roundMessage.textContent = "正在识别你的笔画特征。";
  AudioEngine.setStatus("播报题目", "20 秒");
  AudioEngine.speak(`请画${prompts[activePromptIndex].label}`, { rate: 0.98, pitch: 1.05 });
  AudioEngine.tick();
  timer = setInterval(() => {
    timeLeft -= 1;
    timerLabel.textContent = String(timeLeft);
    beatStatus.textContent = timeLeft <= 5 ? "加速" : `${timeLeft} 秒`;
    if (timeLeft <= 5 || timeLeft % 5 === 0) AudioEngine.tick(timeLeft <= 5);
    updateGuesses({ force: true });
    if (timeLeft <= 0) {
      if (acceptedRound) return;
      if (isCurrentPromptRecognized(getCurrentRankedGuesses(), getFeatures())) return;
      nextRound();
    }
  }, 1000);
}

function nextRound() {
  clearInterval(timer);
  if (activePromptIndex >= prompts.length - 1) {
    if (!acceptedRound) recordCurrentRound("timeout", 0);
    running = false;
    startBtn.textContent = "再玩一次";
    timerLabel.textContent = "0";
    roundMessage.textContent = `完成。总分 ${score}，可重开继续测试。`;
    AudioEngine.setStatus("游戏结束", "静默");
    AudioEngine.speak(`完成，总分${score}`, { rate: 1 });
    saveScoreIfLoggedIn();
    return;
  }
  if (!acceptedRound) {
    recordCurrentRound("timeout", 0);
    AudioEngine.fail();
    AudioEngine.speak("时间到，下一题", { rate: 1.12 });
  }
  activePromptIndex += 1;
  startRound();
}

function updateLabels() {
  const prompt = prompts[activePromptIndex];
  promptWord.textContent = prompt.label;
  roundLabel.textContent = `${activePromptIndex + 1} / ${prompts.length}`;
  timerLabel.textContent = String(timeLeft);
}

function clearDrawing() {
  strokes = [];
  latestRankedGuesses = [];
  resetGuessTrail();
  redraw();
  updateGuesses({ force: true });
  AudioEngine.tone(300, 0.07, "triangle", 0.04);
}

function undoStroke() {
  strokes.pop();
  latestRankedGuesses = [];
  resetGuessTrail();
  redraw();
  updateGuesses({ force: true });
  AudioEngine.tone(260, 0.06, "triangle", 0.035);
}

function drawSampleFrame(progress) {
  sampleCtx.clearRect(0, 0, sampleCanvas.width, sampleCanvas.height);
  sampleCtx.lineWidth = 4;
  sampleCtx.lineCap = "round";
  sampleCtx.lineJoin = "round";
  sampleCtx.strokeStyle = "#151515";

  const allSegments = sampleDrawing.flatMap((stroke) => {
    const [xs, ys] = stroke;
    return xs.slice(1).map((_, index) => ({
      x1: xs[index],
      y1: ys[index],
      x2: xs[index + 1],
      y2: ys[index + 1],
    }));
  });
  const visibleCount = Math.ceil(allSegments.length * progress);
  for (const segment of allSegments.slice(0, visibleCount)) {
    sampleCtx.beginPath();
    sampleCtx.moveTo(segment.x1, segment.y1);
    sampleCtx.lineTo(segment.x2, segment.y2);
    sampleCtx.stroke();
  }
}

function replaySample() {
  const startedAt = performance.now();
  const duration = 1200;
  function tick(now) {
    const progress = Math.min(1, (now - startedAt) / duration);
    drawSampleFrame(progress);
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function init() {
  prompts = createPromptSet();
  verifyPlatformLaunch();
  sampleJson.textContent = JSON.stringify(
    {
      word: "apple",
      recognized: true,
      drawing: sampleDrawing,
    },
    null,
    2,
  );
  updateLabels();
  updateGuesses();
  drawDatasetMosaic();
  replaySample();
  fitCanvasToDisplay();
  loadDoodleModel();
}

canvas.addEventListener("pointerdown", startStroke);
canvas.addEventListener("pointermove", addPoint);
canvas.addEventListener("pointerup", endStroke);
canvas.addEventListener("pointercancel", endStroke);
window.addEventListener("resize", () => {
  fitCanvasToDisplay();
  drawDatasetMosaic();
});
brushSize.addEventListener("input", redraw);
startBtn.addEventListener("click", () => startGame());
landingStartBtn.addEventListener("click", enterGame);
soundBtn.addEventListener("click", async () => {
  soundEnabled = !soundEnabled;
  soundBtn.textContent = soundEnabled ? "声音开" : "静音";
  soundBtn.setAttribute("aria-pressed", String(soundEnabled));
  if (soundEnabled) {
    await AudioEngine.unlock();
    AudioEngine.setStatus("已开启", beatStatus.textContent);
    AudioEngine.tone(660, 0.08, "sine", 0.07);
    AudioEngine.speak("声音已开启", { rate: 1.1 });
  } else {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    AudioEngine.setStatus("已静音", "静默");
  }
});
clearBtn.addEventListener("click", clearDrawing);
undoBtn.addEventListener("click", undoStroke);
skipBtn.addEventListener("click", () => {
  if (!running) return;
  recordCurrentRound("skipped", 0);
  acceptedRound = true;
  AudioEngine.skip();
  nextRound();
});
replayBtn.addEventListener("click", replaySample);
studentHomeBtn.addEventListener("click", () => {
  if (returnUrl) {
    window.location.href = returnUrl;
    return;
  }
  window.history.back();
});

init();
