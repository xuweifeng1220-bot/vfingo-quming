const NAMING_KNOWLEDGE = {
  bazi: {
    title: "四柱八字",
    purpose: "用出生年月日时排出年柱、月柱、日柱、时柱，再围绕日主、月令、五行强弱和喜用方向判断取名倾向。",
    rules: [
      "不能把八字简化为缺什么补什么，必须区分缺失、偏弱、过旺、调候与格局需要。",
      "日柱天干为日主，月令对旺衰判断权重很高。",
      "五行判断应综合天干、地支、藏干、季节旺衰、通根、生克制化。",
      "当前版本未接入确定性四柱排盘时，不得编造年柱、月柱、日柱、时柱。",
    ],
  },
  fiveElements: {
    木: ["生发", "仁厚", "舒展", "成长", "文气"],
    火: ["明亮", "表达", "礼序", "行动", "温暖"],
    土: ["承载", "稳定", "信实", "秩序", "家风"],
    金: ["规则", "清正", "判断", "节制", "贵重"],
    水: ["智慧", "流动", "包容", "清润", "远行"],
  },
  nameStudies: {
    title: "姓名学与五格数理",
    position: "五格数理属于民俗姓名学辅助系统，可作为筛选参考，但不应凌驾于八字喜用、字义音律、重名风险和现实可用性。",
    strokeSource: "常用康熙笔画作为计算口径。",
    grids: [
      { name: "天格", meaning: "姓氏笔画相关，常被解释为家族、先天背景。" },
      { name: "人格", meaning: "姓最后一字与名第一字相关，常被视为姓名学核心格。" },
      { name: "地格", meaning: "名字笔画相关，常被解释为基础发展与前运。" },
      { name: "外格", meaning: "总格与人格之外的关系，常被解释为外部关系。" },
      { name: "总格", meaning: "姓名总笔画，常被解释为整体走势。" },
    ],
  },
  productRules: [
    "命理取向只给参考，不承诺改命。",
    "名字必须同时通过字义、音律、书写、识别、重名风险和家庭解释。",
    "同名人数以公安一网通办或相关 APP 官方查询为准。",
    "避免过度使用同一偏旁、同一元素或同一种清冷网红审美。",
    "避免正反字序凑数，例如青南、南青不能同时作为主要候选。",
  ],
  scoring: [
    { factor: "八字喜用 / 五行取向", weight: 25 },
    { factor: "重名风险", weight: 25 },
    { factor: "字义典故 / 文化解释", weight: 20 },
    { factor: "音律字形 / 书写识别", weight: 15 },
    { factor: "五格数理", weight: 10 },
    { factor: "趋势稳定性", weight: 5 },
  ],
};

function namingKnowledgeForPrompt() {
  return JSON.stringify({
    bazi: NAMING_KNOWLEDGE.bazi,
    fiveElements: NAMING_KNOWLEDGE.fiveElements,
    nameStudies: NAMING_KNOWLEDGE.nameStudies,
    productRules: NAMING_KNOWLEDGE.productRules,
    scoring: NAMING_KNOWLEDGE.scoring,
  });
}

module.exports = { NAMING_KNOWLEDGE, namingKnowledgeForPrompt };
