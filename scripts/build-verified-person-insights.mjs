import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUTPUT = path.join(ROOT, "name-person-insights.js");

function pad(value) {
  return String(value).padStart(2, "0");
}

function daysInMonth(month) {
  return new Date(2024, month, 0).getDate();
}

function hint(keywords) {
  const joined = keywords.join("、");
  if (keywords.includes("求真")) return `可转化为知、明、衡、闻等方向，表达${joined}。`;
  if (keywords.includes("仁心")) return `可转化为安、怀、清、济等方向，表达${joined}。`;
  if (keywords.includes("创造")) return `可转化为承、昭、远、舟等方向，表达${joined}。`;
  if (keywords.includes("文心")) return `可转化为言、砚、闻、知等方向，表达${joined}。`;
  if (keywords.includes("审美")) return `可转化为清、岚、棠、霁等方向，表达${joined}。`;
  if (keywords.includes("远行")) return `可转化为川、舟、望、远等方向，表达${joined}。`;
  return `可转化为安、宁、衡、远等方向，表达${joined}。`;
}

// Strict list: keep only people whose public Gregorian birth date has been checked.
// If a date is disputed, lunar-only, year-only, or ambiguous across calendars, leave it out.
const PEOPLE = [
  { name: "莫扎特", region: "奥地利", date: "1756-01-27", field: "音乐", contribution: "以高度天赋和作品密度影响古典音乐。", keywords: ["天赋", "秩序", "表达"] },
  { name: "达尔文", region: "英国", date: "1809-02-12", field: "科学", contribution: "提出进化论，改变人类理解生命的方式。", keywords: ["求真", "观察", "生命"] },
  { name: "李娜", region: "中国", date: "1982-02-26", field: "体育", contribution: "在网球领域实现突破，代表独立与韧性。", keywords: ["突破", "自律", "独立"] },
  { name: "竺可桢", region: "中国", date: "1890-03-07", field: "科学与教育", contribution: "推动中国气象学和现代大学教育。", keywords: ["求真", "教育", "长期主义"] },
  { name: "爱因斯坦", region: "德国/美国", date: "1879-03-14", field: "科学", contribution: "提出相对论，重塑现代物理图景。", keywords: ["求真", "想象", "明辨"] },
  { name: "珍·古道尔", region: "英国", date: "1934-04-03", field: "科学与自然保护", contribution: "长期研究黑猩猩并推动自然保护。", keywords: ["观察", "耐心", "仁心"] },
  { name: "梁思成", region: "中国", date: "1901-04-20", field: "建筑与教育", contribution: "系统研究中国古建筑并推动保护。", keywords: ["结构", "传承", "审美"] },
  { name: "贝聿铭", region: "中国/美国", date: "1917-04-26", field: "建筑", contribution: "以现代建筑语言连接几何、光线与公共空间。", keywords: ["结构", "光明", "创造"] },
  { name: "南丁格尔", region: "英国", date: "1820-05-12", field: "医学与护理", contribution: "推动现代护理制度和医疗统计。", keywords: ["仁心", "守护", "秩序"] },
  { name: "吴健雄", region: "中国/美国", date: "1912-05-31", field: "科学", contribution: "在实验物理领域作出重要贡献。", keywords: ["求真", "严谨", "突破"] },
  { name: "林徽因", region: "中国", date: "1904-06-10", field: "建筑与文学", contribution: "参与中国建筑史研究，也留下文学与审美贡献。", keywords: ["审美", "结构", "文心"] },
  { name: "顾方舟", region: "中国", date: "1926-06-16", field: "医学", contribution: "推动脊髓灰质炎疫苗研究与防治。", keywords: ["仁心", "守护", "长期主义"] },
  { name: "图灵", region: "英国", date: "1912-06-23", field: "科学", contribution: "奠定现代计算理论基础。", keywords: ["求真", "逻辑", "开拓"] },
  { name: "邓稼先", region: "中国", date: "1924-06-25", field: "科学", contribution: "为中国核科学与国防科技作出重要贡献。", keywords: ["求真", "担当", "长期主义"] },
  { name: "马拉拉", region: "巴基斯坦", date: "1997-07-12", field: "教育与公益", contribution: "倡导女童教育并获得诺贝尔和平奖。", keywords: ["勇气", "教育", "公共精神"] },
  { name: "曼德拉", region: "南非", date: "1918-07-18", field: "公共贡献", contribution: "以和解精神推动社会转型。", keywords: ["宽厚", "坚韧", "公共精神"] },
  { name: "费德勒", region: "瑞士", date: "1981-08-08", field: "体育", contribution: "以长期稳定和优雅技术影响网球。", keywords: ["自律", "稳定", "优雅"] },
  { name: "特蕾莎修女", region: "印度/阿尔巴尼亚", date: "1910-08-26", field: "公益", contribution: "长期服务贫困与弱势群体。", keywords: ["仁心", "服务", "坚韧"] },
  { name: "谷爱凌", region: "中国/美国", date: "2003-09-03", field: "体育", contribution: "在冰雪运动与跨文化表达中形成影响力。", keywords: ["突破", "自信", "开阔"] },
  { name: "姚明", region: "中国", date: "1980-09-12", field: "体育与公益", contribution: "连接中外篮球文化并推动公益事业。", keywords: ["高度", "连接", "担当"] },
  { name: "鲁迅", region: "中国", date: "1881-09-25", field: "文学与思想", contribution: "以文学和思想批判推动现代启蒙。", keywords: ["文心", "明辨", "勇气"] },
  { name: "杨振宁", region: "中国/美国", date: "1922-10-01", field: "科学", contribution: "在理论物理领域作出世界级贡献。", keywords: ["求真", "思辨", "远见"] },
  { name: "冰心", region: "中国", date: "1900-10-05", field: "文学", contribution: "以儿童、母爱与自然主题影响现代文学。", keywords: ["温柔", "文心", "清澈"] },
  { name: "梅兰芳", region: "中国", date: "1894-10-22", field: "艺术", contribution: "京剧表演艺术代表人物。", keywords: ["审美", "传承", "表达"] },
  { name: "居里夫人", region: "波兰/法国", date: "1867-11-07", field: "科学", contribution: "开创放射性研究，两获诺贝尔奖。", keywords: ["求真", "坚韧", "探索"] },
  { name: "丰子恺", region: "中国", date: "1898-11-09", field: "艺术与文学", contribution: "以漫画和散文表达温厚审美。", keywords: ["温厚", "审美", "童心"] },
  { name: "钱钟书", region: "中国", date: "1910-11-21", field: "文学与学术", contribution: "以学识、幽默和文学创作著称。", keywords: ["文心", "博学", "洞察"] },
  { name: "巴金", region: "中国", date: "1904-11-25", field: "文学", contribution: "以现代文学表达家国、青春与人性。", keywords: ["表达", "真诚", "人文"] },
  { name: "阿达·洛夫莱斯", region: "英国", date: "1815-12-10", field: "科学与计算", contribution: "被视为早期计算思想的重要先驱。", keywords: ["逻辑", "创造", "远见"] },
  { name: "郎平", region: "中国", date: "1960-12-10", field: "体育", contribution: "作为运动员与教练长期代表坚韧和团队精神。", keywords: ["坚韧", "团队", "突破"] },
  { name: "钱学森", region: "中国", date: "1911-12-11", field: "科学与工程", contribution: "推动中国航天与系统工程发展。", keywords: ["求真", "担当", "开拓"] },
  { name: "屠呦呦", region: "中国", date: "1930-12-30", field: "医学", contribution: "发现青蒿素，为全球疟疾治疗作出重大贡献。", keywords: ["仁心", "求真", "济世"] },
];

const calendar = {};
for (let month = 1; month <= 12; month += 1) {
  for (let day = 1; day <= daysInMonth(month); day += 1) {
    calendar[`${pad(month)}-${pad(day)}`] = [];
  }
}

for (const person of PEOPLE) {
  const key = person.date.slice(5, 10);
  calendar[key].push({
    ...person,
    namingHint: hint(person.keywords),
    match: "verified-birth-date",
  });
}

const body = `window.NAME_PERSON_INSIGHTS = ${JSON.stringify(calendar, null, 2)};\n`;
fs.writeFileSync(OUTPUT, body, "utf8");
console.log(`Wrote ${OUTPUT} with ${PEOPLE.length} verified people.`);
