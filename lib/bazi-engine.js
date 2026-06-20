const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

const STEM_ELEMENTS = {
  甲: "木", 乙: "木",
  丙: "火", 丁: "火",
  戊: "土", 己: "土",
  庚: "金", 辛: "金",
  壬: "水", 癸: "水",
};

const BRANCH_HIDDEN_STEMS = {
  子: ["癸"],
  丑: ["己", "癸", "辛"],
  寅: ["甲", "丙", "戊"],
  卯: ["乙"],
  辰: ["戊", "乙", "癸"],
  巳: ["丙", "戊", "庚"],
  午: ["丁", "己"],
  未: ["己", "丁", "乙"],
  申: ["庚", "壬", "戊"],
  酉: ["辛"],
  戌: ["戊", "辛", "丁"],
  亥: ["壬", "甲"],
};

const GENERATES = {
  木: "火",
  火: "土",
  土: "金",
  金: "水",
  水: "木",
};

const CONTROLS = {
  木: "土",
  土: "水",
  水: "火",
  火: "金",
  金: "木",
};

const CITY_COORDS = {
  北京: { lat: 39.9042, lon: 116.4074 },
  上海: { lat: 31.2304, lon: 121.4737 },
  广州: { lat: 23.1291, lon: 113.2644 },
  深圳: { lat: 22.5431, lon: 114.0579 },
  杭州: { lat: 30.2741, lon: 120.1551 },
  南京: { lat: 32.0603, lon: 118.7969 },
  苏州: { lat: 31.2989, lon: 120.5853 },
  成都: { lat: 30.5728, lon: 104.0668 },
  重庆: { lat: 29.563, lon: 106.5516 },
  武汉: { lat: 30.5928, lon: 114.3055 },
  西安: { lat: 34.3416, lon: 108.9398 },
  天津: { lat: 39.3434, lon: 117.3616 },
  青岛: { lat: 36.0671, lon: 120.3826 },
  厦门: { lat: 24.4798, lon: 118.0894 },
  福州: { lat: 26.0745, lon: 119.2965 },
  长沙: { lat: 28.2282, lon: 112.9388 },
  郑州: { lat: 34.7466, lon: 113.6254 },
  济南: { lat: 36.6512, lon: 117.1201 },
  合肥: { lat: 31.8206, lon: 117.2272 },
  昆明: { lat: 25.0389, lon: 102.7183 },
  南宁: { lat: 22.817, lon: 108.3669 },
  海口: { lat: 20.044, lon: 110.1999 },
  三亚: { lat: 18.2528, lon: 109.512 },
  哈尔滨: { lat: 45.8038, lon: 126.5349 },
  沈阳: { lat: 41.8057, lon: 123.4315 },
  大连: { lat: 38.914, lon: 121.6147 },
  长春: { lat: 43.8171, lon: 125.3235 },
  呼和浩特: { lat: 40.8426, lon: 111.7492 },
  太原: { lat: 37.8706, lon: 112.5489 },
  石家庄: { lat: 38.0428, lon: 114.5149 },
  南昌: { lat: 28.6829, lon: 115.8582 },
  贵阳: { lat: 26.647, lon: 106.6302 },
  兰州: { lat: 36.0611, lon: 103.8343 },
  银川: { lat: 38.4872, lon: 106.2309 },
  西宁: { lat: 36.6171, lon: 101.7782 },
  乌鲁木齐: { lat: 43.8256, lon: 87.6168 },
  拉萨: { lat: 29.652, lon: 91.1721 },
  香港: { lat: 22.3193, lon: 114.1694 },
  澳门: { lat: 22.1987, lon: 113.5439 },
  台北: { lat: 25.033, lon: 121.5654 },
};

const JIE_BOUNDARIES = [
  { name: "小寒", month: 1, day: 6, branch: "丑", monthIndex: 11 },
  { name: "立春", month: 2, day: 4, branch: "寅", monthIndex: 0 },
  { name: "惊蛰", month: 3, day: 6, branch: "卯", monthIndex: 1 },
  { name: "清明", month: 4, day: 5, branch: "辰", monthIndex: 2 },
  { name: "立夏", month: 5, day: 6, branch: "巳", monthIndex: 3 },
  { name: "芒种", month: 6, day: 6, branch: "午", monthIndex: 4 },
  { name: "小暑", month: 7, day: 7, branch: "未", monthIndex: 5 },
  { name: "立秋", month: 8, day: 8, branch: "申", monthIndex: 6 },
  { name: "白露", month: 9, day: 8, branch: "酉", monthIndex: 7 },
  { name: "寒露", month: 10, day: 8, branch: "戌", monthIndex: 8 },
  { name: "立冬", month: 11, day: 7, branch: "亥", monthIndex: 9 },
  { name: "大雪", month: 12, day: 7, branch: "子", monthIndex: 10 },
];

function normalizeCity(city) {
  const text = String(city || "").replace(/[市省自治区特别行政区\s]/g, "");
  return Object.keys(CITY_COORDS).find((name) => text.includes(name) || name.includes(text)) || "北京";
}

function getCityInfo(city) {
  const matched = normalizeCity(city);
  return { name: matched, ...CITY_COORDS[matched] };
}

function parseLocalBirth(value) {
  const text = String(value || "");
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})T?(\d{2})?:?(\d{2})?/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00"] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function ganzhi(index) {
  const normalized = ((index % 60) + 60) % 60;
  return {
    stem: STEMS[normalized % 10],
    branch: BRANCHES[normalized % 12],
    text: `${STEMS[normalized % 10]}${BRANCHES[normalized % 12]}`,
    index: normalized,
  };
}

function dayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysBetween(a, b) {
  return Math.floor((dayStart(a).getTime() - dayStart(b).getTime()) / 86400000);
}

function getLiChunDate(year) {
  return new Date(year, 1, 4, 10, 0, 0, 0);
}

function getYearPillar(date) {
  const year = date < getLiChunDate(date.getFullYear()) ? date.getFullYear() - 1 : date.getFullYear();
  return ganzhi(year - 1984);
}

function boundaryDate(year, boundary) {
  return new Date(year, boundary.month - 1, boundary.day, 0, 0, 0, 0);
}

function getMonthBoundary(date) {
  const year = date.getFullYear();
  let current = JIE_BOUNDARIES[0];
  for (const boundary of JIE_BOUNDARIES) {
    if (date >= boundaryDate(year, boundary)) current = boundary;
  }
  if (date < boundaryDate(year, JIE_BOUNDARIES[0])) {
    current = JIE_BOUNDARIES[JIE_BOUNDARIES.length - 1];
  }
  return current;
}

function getMonthPillar(date, yearStem) {
  const boundary = getMonthBoundary(date);
  const yearStemIndex = STEMS.indexOf(yearStem);
  const firstMonthStemMap = {
    0: 2, 5: 2,
    1: 4, 6: 4,
    2: 6, 7: 6,
    3: 8, 8: 8,
    4: 0, 9: 0,
  };
  const firstStem = firstMonthStemMap[yearStemIndex];
  const stem = STEMS[(firstStem + boundary.monthIndex) % 10];
  return {
    stem,
    branch: boundary.branch,
    text: `${stem}${boundary.branch}`,
    solarTerm: boundary.name,
    monthIndex: boundary.monthIndex,
  };
}

function getDayPillar(date) {
  const reference = new Date(1984, 1, 2);
  return ganzhi(daysBetween(date, reference));
}

function getHourBranchIndex(date) {
  const hour = date.getHours();
  if (hour === 23) return 0;
  return Math.floor((hour + 1) / 2) % 12;
}

function getHourPillar(date, dayStem) {
  const branchIndex = getHourBranchIndex(date);
  const dayStemIndex = STEMS.indexOf(dayStem);
  const firstHourStemMap = {
    0: 0, 5: 0,
    1: 2, 6: 2,
    2: 4, 7: 4,
    3: 6, 8: 6,
    4: 8, 9: 8,
  };
  const stem = STEMS[(firstHourStemMap[dayStemIndex] + branchIndex) % 10];
  const branch = BRANCHES[branchIndex];
  return { stem, branch, text: `${stem}${branch}` };
}

function addElementScore(scores, element, value) {
  scores[element] = Number((scores[element] + value).toFixed(2));
}

function scoreElements(pillars, monthBranch) {
  const scores = { 木: 0, 火: 0, 土: 0, 金: 0, 水: 0 };
  Object.values(pillars).forEach((pillar) => {
    addElementScore(scores, STEM_ELEMENTS[pillar.stem], 1);
    const hidden = BRANCH_HIDDEN_STEMS[pillar.branch] || [];
    hidden.forEach((stem, index) => addElementScore(scores, STEM_ELEMENTS[stem], index === 0 ? 0.75 : 0.35));
  });
  const hidden = BRANCH_HIDDEN_STEMS[monthBranch] || [];
  hidden.forEach((stem, index) => addElementScore(scores, STEM_ELEMENTS[stem], index === 0 ? 0.8 : 0.3));
  return scores;
}

function inverseGenerates(element) {
  return Object.entries(GENERATES).find(([, child]) => child === element)?.[0];
}

function inverseControls(element) {
  return Object.entries(CONTROLS).find(([, controlled]) => controlled === element)?.[0];
}

function inferUsefulElements(dayMasterElement, elementScores) {
  const same = elementScores[dayMasterElement] || 0;
  const mother = inverseGenerates(dayMasterElement);
  const support = same + (elementScores[mother] || 0) * 0.75;
  const total = Object.values(elementScores).reduce((sum, value) => sum + value, 0);
  const ratio = support / total;
  const child = GENERATES[dayMasterElement];
  const wealth = CONTROLS[dayMasterElement];
  const officer = inverseControls(dayMasterElement);
  if (ratio < 0.28) {
    return {
      strength: "偏弱",
      useful: [dayMasterElement, mother],
      avoid: [officer, child],
      note: "日主支持度偏弱，取名宜先补同类与生扶之气，避免再加强克泄。",
    };
  }
  if (ratio > 0.43) {
    return {
      strength: "偏旺",
      useful: [child, wealth, officer],
      avoid: [dayMasterElement, mother],
      note: "日主支持度偏旺，取名宜取疏泄、制衡或财星方向，不宜继续堆同类。",
    };
  }
  return {
    strength: "相对平衡",
    useful: [child, wealth],
    avoid: [],
    note: "日主支持度较平衡，取名更应重视调候、字义、音律、重名风险与家庭偏好。",
  };
}

function buildBazi(input) {
  const birth = parseLocalBirth(input.birth);
  if (!birth) {
    throw new Error("Invalid birth datetime");
  }
  const city = getCityInfo(input.city);
  const trueSolarOffsetMinutes = Math.round((city.lon - 120) * 4);
  const trueSolarTime = addMinutes(birth, trueSolarOffsetMinutes);
  const year = getYearPillar(trueSolarTime);
  const month = getMonthPillar(trueSolarTime, year.stem);
  const day = getDayPillar(trueSolarTime);
  const hour = getHourPillar(trueSolarTime, day.stem);
  const pillars = { year, month, day, hour };
  const elementScores = scoreElements(pillars, month.branch);
  const dayMasterElement = STEM_ELEMENTS[day.stem];
  const useful = inferUsefulElements(dayMasterElement, elementScores);
  return {
    input: {
      birth: input.birth,
      city: city.name,
      longitude: city.lon,
      latitude: city.lat,
    },
    trueSolarOffsetMinutes,
    trueSolarTime: trueSolarTime.toISOString(),
    pillars: {
      year: year.text,
      month: month.text,
      day: day.text,
      hour: hour.text,
    },
    stemsBranches: pillars,
    dayMaster: {
      stem: day.stem,
      element: dayMasterElement,
      strength: useful.strength,
    },
    solarTerm: month.solarTerm,
    elementScores,
    usefulElements: useful.useful,
    avoidElements: useful.avoid,
    note: useful.note,
    caveat: "v1 使用固定节气边界与真太阳时近似校正，适合产品筛选；专业版本应接入精确天文节气与历法库复核。",
  };
}

module.exports = {
  buildBazi,
  STEMS,
  BRANCHES,
  STEM_ELEMENTS,
  BRANCH_HIDDEN_STEMS,
};
