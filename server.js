const http = require("http");
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./lib/env");
const { diagnoseFeishu, pushLeadToFeishu } = require("./lib/feishu");
const { namingKnowledgeForPrompt } = require("./lib/naming-knowledge");
const { buildBazi } = require("./lib/bazi-engine");

loadEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const LEADS_TOKEN = process.env.LEADS_TOKEN || "";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_TIMEOUT_MS = Number(process.env.DEEPSEEK_TIMEOUT_MS || 90_000);
const AI_FREE_GENERATION_LIMIT = Number(process.env.AI_FREE_GENERATION_LIMIT || 2);
const AI_DAILY_GLOBAL_LIMIT = Number(process.env.AI_DAILY_GLOBAL_LIMIT || 500);
const SITE_ENTRY = process.env.SITE_ENTRY || "index.html";
const ROOT = __dirname;
const LEADS_FILE = path.join(ROOT, "leads.json");
const AI_USAGE_FILE = path.join(ROOT, "name-ai-usage.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function ensureLeadsFile() {
  if (!fs.existsSync(LEADS_FILE)) {
    fs.writeFileSync(LEADS_FILE, "[]\n", "utf8");
  }
}

function ensureJsonObjectFile(filePath) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "{}\n", "utf8");
  }
}

function readLeads() {
  ensureLeadsFile();
  const raw = fs.readFileSync(LEADS_FILE, "utf8").trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function createFileUsageStore(filePath) {
  return {
    read() {
      ensureJsonObjectFile(filePath);
      const raw = fs.readFileSync(filePath, "utf8").trim();
      if (!raw) return {};
      return JSON.parse(raw);
    },
    write(usage) {
      fs.writeFileSync(filePath, `${JSON.stringify(usage, null, 2)}\n`, "utf8");
    },
  };
}

const usageStore = createFileUsageStore(AI_USAGE_FILE);

function readAiUsage() {
  return usageStore.read();
}

function writeAiUsage(usage) {
  usageStore.write(usage);
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload, null, 2));
}

function writeJsonWithHeaders(res, statusCode, payload, headers = {}) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", ...headers });
  res.end(JSON.stringify(payload, null, 2));
}

function getOrigin(req) {
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${req.headers.host}`;
}

function writeText(res, statusCode, contentType, body) {
  res.writeHead(statusCode, { "Content-Type": contentType });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .reduce((cookies, item) => {
      const equalsIndex = item.indexOf("=");
      if (equalsIndex === -1) return cookies;
      cookies[decodeURIComponent(item.slice(0, equalsIndex))] = decodeURIComponent(item.slice(equalsIndex + 1));
      return cookies;
    }, {});
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
}

function getClientIp(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || req.socket.remoteAddress || "";
}

function getBrowserHash(req) {
  const ip = getClientIp(req).replace(/:\d+$/, "");
  const browserData = [
    req.headers["user-agent"] || "",
    req.headers["accept-language"] || "",
    req.headers["sec-ch-ua"] || "",
    ip,
  ].join("|");
  return hashValue(browserData);
}

function getAiUser(req, usage) {
  const cookies = parseCookies(req);
  const browserHash = getBrowserHash(req);
  let userId = cookies.name_ai_uid;
  if (!userId || !/^[a-f0-9-]{32,64}$/i.test(userId)) {
    const matched = Object.entries(usage).find(([, record]) => record.browserHash === browserHash);
    userId = matched ? matched[0] : crypto.randomUUID();
  }
  if (!usage[userId]) {
    usage[userId] = {
      browserHash,
      count: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } else {
    usage[userId].browserHash = browserHash;
    usage[userId].updatedAt = new Date().toISOString();
  }
  return { userId, record: usage[userId] };
}

function getChinaDateKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getDailyAiUsage(usage) {
  const day = getChinaDateKey();
  if (!usage.daily || usage.daily.day !== day) {
    usage.daily = {
      day,
      total: 0,
      updatedAt: new Date().toISOString(),
    };
  }
  return usage.daily;
}

function incrementDailyAiUsage(usage) {
  const daily = getDailyAiUsage(usage);
  daily.total = Number(daily.total || 0) + 1;
  daily.updatedAt = new Date().toISOString();
  usage.daily = daily;
  return daily;
}

function makeAiUserCookie(userId) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `name_ai_uid=${encodeURIComponent(userId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}

function sanitizeNameInput(input) {
  const sanitized = {
    surname: String(input.surname || "").trim().slice(0, 4),
    gender: String(input.gender || "neutral").trim().slice(0, 16),
    birth: String(input.birth || "").trim().slice(0, 40),
    city: String(input.city || "").trim().slice(0, 40),
    nameLength: String(input.nameLength || "2").trim() === "1" ? "1" : "2",
    style: String(input.style || "classic").trim().slice(0, 24),
    requiredChars: String(input.requiredChars || "").trim().slice(0, 12),
    blockedChars: String(input.blockedChars || "").trim().slice(0, 24),
    wishes: String(input.wishes || "").trim().slice(0, 120),
    neededElement: String(input.neededElement || "").trim().slice(0, 16),
    preferences: Array.isArray(input.preferences) ? input.preferences.slice(0, 5).map((item) => ({
      label: String(item.label || "").slice(0, 12),
      tone: String(item.tone || "").slice(0, 40),
      elements: Array.isArray(item.elements) ? item.elements.slice(0, 3).map(String) : [],
    })) : [],
    people: Array.isArray(input.people) ? input.people.slice(0, 2).map((item) => ({
      name: String(item.name || "").slice(0, 24),
      field: String(item.field || "").slice(0, 24),
      contribution: String(item.contribution || "").slice(0, 100),
      namingHint: String(item.namingHint || "").slice(0, 100),
      keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 6).map(String) : [],
    })) : [],
  };
  try {
    sanitized.bazi = buildBazi(sanitized);
    sanitized.neededElement = sanitized.bazi.usefulElements?.[0] || sanitized.neededElement;
  } catch (error) {
    sanitized.baziError = error.message;
  }
  return sanitized;
}

function buildNamePrompt(input) {
  return [
    "你是一名严谨克制的中文新生儿取名顾问。你可以参考传统命理、五行、音律、典故、重名风险和家长期望，但不得宣称拥有官方同名数据库，不得做改命承诺。",
    "请严格遵守内置知识体系：八字看喜用方向，不机械缺啥补啥；五格数理只做民俗姓名学辅助，不凌驾于现实可用性。",
    "服务端已提供确定性排盘结果。你必须以 bazi 字段为准，不得自行改写四柱、日主、五行强弱和喜用方向；如 caveat 提示为近似算法，请如实说明。",
    "请生成 9 个候选名。名字必须真实可用，避免生僻到难认、网红堆字、正反字序凑数、谐音风险、过度玄学；同一批候选不得大量重复同一个字、同一个偏旁或同一种意象。",
    "注意：given 字段只能填写名字本身，绝对不能包含姓氏。例如姓氏为许、双字名时，given 应为“昭明”，不得写“许昭明”。",
    "每个候选名必须给出家长能理解的决策解释：先说这个名字的核心气质，再说明为什么适合当前孩子，尤其要解释为什么要补某个五行、这个名字如何回应该五行、补足后给名字带来什么气质。不要只写“缺火补火”这类短句。",
    "典故和文化联想必须克制真实：能确认出处才写具体出处；不能确认时明确写文化联想，不得伪造古籍篇名、诗句、作者。",
    "评分必须有区分度：9 个候选名总分建议分布在 82-94，不得全部相同。风险提醒必须真实，包括重名、谐音、生僻、网红感、过度特别、长辈接受度等。",
    "输出必须是 JSON，不要 Markdown，不要额外解释。",
    "JSON 结构：{\"analysis\":{\"destiny\":\"基于输入信息的命理取向说明\",\"baziNote\":\"说明当前是否为完整四柱排盘，不得编造四柱\",\"wugeNote\":\"五格数理如何作为辅助参考\",\"method\":\"本次生成如何结合五行、字义、重名、音律、五格\",\"caveat\":\"边界声明\"},\"candidates\":[{\"given\":\"两个字或一个字\",\"category\":\"低重名探索/清朗自然/稳妥经典/家长指定字优先\",\"total\":88,\"scores\":{\"destiny\":88,\"rarity\":86,\"sound\":87,\"meaning\":90,\"trend\":82,\"writing\":84},\"tags\":[\"...\"],\"verdict\":\"一句话主判断：说明这个名字的核心气质和适合什么样的家庭期待\",\"destinyFit\":\"命理取向：为什么当前取名倾向补某五行；这个名字用哪些字义或意象回应该五行；补足后给名字带来什么气质。必须结合 bazi.usefulElements，不得机械堆偏旁。\",\"meaningFit\":\"名字寓意：解释整个名字合在一起的含义，不要只逐字释义。\",\"cultureFit\":\"典故/文化联想：能确认才写出处，不能确认就写文化联想；不得伪造。\",\"riskNote\":\"使用提醒：说明重名、谐音、生僻、网红感、过度特别或长辈接受度风险，以及如何复核。\",\"elderPitch\":\"给长辈解释的一句话\",\"parts\":[{\"char\":\"安\",\"element\":\"土\",\"meaning\":\"单字含义\",\"allusion\":\"真实文化联想或典故出处，不确定则写文化联想\",\"elder\":\"给长辈解释的话\"}],\"reasons\":[\"兼容旧字段，可为空或概括以上判断\"]}]}",
    `内置知识体系：${namingKnowledgeForPrompt()}`,
    `确定性排盘结果：${JSON.stringify(input.bazi || { error: input.baziError || "unavailable" })}`,
    `用户输入：${JSON.stringify(input)}`,
  ].join("\n");
}

function requestDeepSeek(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      temperature: 0.65,
      max_tokens: 4200,
      response_format: { type: "json_object" },
    });

    const request = https.request({
      hostname: "api.deepseek.com",
      path: "/chat/completions",
      method: "POST",
      headers: {
        "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: DEEPSEEK_TIMEOUT_MS,
    }, (response) => {
      let data = "";
      response.on("data", (chunk) => {
        data += chunk;
      });
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`DeepSeek API failed: ${response.statusCode} ${data.slice(0, 300)}`));
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.message?.content || "";
          resolve({ raw: parsed, content });
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("DeepSeek API timeout"));
    });
    request.on("error", reject);
    request.write(body);
    request.end();
  });
}

function clampNumber(value, fallback = 80) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeGivenName(value, input) {
  const expectedLength = Number(input.nameLength);
  let given = String(value || "")
    .replace(/\s/g, "")
    .replace(/[^\u4e00-\u9fff]/g, "");
  const surname = String(input.surname || "").trim();
  if (surname && given.startsWith(surname)) {
    given = given.slice(surname.length);
  }
  while (surname && given.startsWith(surname)) {
    given = given.slice(surname.length);
  }
  if (given.length !== expectedLength) return "";
  if (surname && `${surname}${given}`.startsWith(`${surname}${surname}`)) return "";
  if (new Set(given).size !== given.length) return "";
  return given;
}

function normalizeAiPart(part, fallbackChar, input) {
  const char = String(part?.char || fallbackChar || "").replace(/[^\u4e00-\u9fff]/g, "").slice(0, 1);
  if (!char) return null;
  return {
    c: char,
    e: String(part?.element || input.neededElement || "").slice(0, 8),
    tags: ["ai"],
    meaning: String(part?.meaning || "").slice(0, 80),
    allusion: String(part?.allusion || "").slice(0, 120),
    elder: String(part?.elder || "").slice(0, 100),
  };
}

function normalizeAiPayload(input, content) {
  const parsed = JSON.parse(content);
  const candidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const seenNames = new Set();
  const seenCombos = new Set();
  const normalizedCandidates = [];
  for (const candidate of candidates) {
    const given = normalizeGivenName(candidate.given, input);
    if (!given) continue;
    const fullName = `${input.surname}${given}`;
    const comboKey = [...given].sort().join("");
    if (seenNames.has(fullName) || seenCombos.has(comboKey)) continue;
    seenNames.add(fullName);
    seenCombos.add(comboKey);

    const scores = candidate.scores || {};
    const parts = Array.isArray(candidate.parts) ? candidate.parts : [];
    const normalizedParts = [...given].map((char, index) => normalizeAiPart(parts[index], char, input)).filter(Boolean);
    if (normalizedParts.length !== given.length) continue;

    normalizedCandidates.push({
      given,
      fullName,
      comboKey,
      category: String(candidate.category || "AI 精选候选").slice(0, 16),
      total: clampNumber(candidate.total, 84),
      destiny: clampNumber(scores.destiny, 84),
      rarity: clampNumber(scores.rarity, 82),
      sound: clampNumber(scores.sound, 82),
      meaning: clampNumber(scores.meaning, 86),
      trend: clampNumber(scores.trend, 80),
      writing: { total: clampNumber(scores.writing, 80) },
      aiTags: Array.isArray(candidate.tags) ? candidate.tags.slice(0, 5).map((tag) => String(tag).slice(0, 12)) : [],
      aiReasons: Array.isArray(candidate.reasons) ? candidate.reasons.slice(0, 4).map((reason) => String(reason).slice(0, 180)) : [],
      explanation: {
        verdict: String(candidate.verdict || "").slice(0, 180),
        destinyFit: String(candidate.destinyFit || "").slice(0, 320),
        meaningFit: String(candidate.meaningFit || "").slice(0, 260),
        cultureFit: String(candidate.cultureFit || "").slice(0, 260),
        riskNote: String(candidate.riskNote || "").slice(0, 220),
        elderPitch: String(candidate.elderPitch || "").slice(0, 180),
      },
      parts: normalizedParts,
      source: "ai",
    });
    if (normalizedCandidates.length >= 9) break;
  }
  return {
    analysis: parsed.analysis || {},
    candidates: normalizedCandidates,
  };
}

function sanitizeLead(input) {
  const lead = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    targetScore: String(input.targetScore || "").trim(),
    currentScore: String(input.currentScore || "").trim(),
    deadline: String(input.deadline || "").trim(),
    purpose: String(input.purpose || "").trim(),
    contact: String(input.contact || "").trim(),
    message: String(input.message || "").trim(),
  };

  const required = [
    "targetScore",
    "currentScore",
    "deadline",
    "purpose",
    "contact",
  ];
  for (const key of required) {
    if (!lead[key]) {
      throw new Error(`Missing field: ${key}`);
    }
  }

  return lead;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const safeEntry = SITE_ENTRY.replace(/^\/+/, "");
  const safePath = pathname === "/" ? `/${safeEntry}` : pathname;
  const filePath = path.normalize(path.join(ROOT, safePath));

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === "GET" && url.pathname === "/healthz") {
      writeJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/health/feishu") {
      if (LEADS_TOKEN && url.searchParams.get("token") !== LEADS_TOKEN) {
        writeJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }

      try {
        const diagnostics = await diagnoseFeishu();
        writeJson(res, diagnostics.ok ? 200 : 500, diagnostics);
      } catch (error) {
        writeJson(res, 500, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/robots.txt") {
      const origin = getOrigin(req);
      writeText(
        res,
        200,
        "text/plain; charset=utf-8",
        `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/sitemap.xml") {
      const origin = getOrigin(req);
      writeText(
        res,
        200,
        "application/xml; charset=utf-8",
        `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          `  <url><loc>${origin}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n` +
          `</urlset>\n`,
      );
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/leads") {
      if (LEADS_TOKEN && url.searchParams.get("token") !== LEADS_TOKEN) {
        writeJson(res, 401, { ok: false, error: "Unauthorized" });
        return;
      }

      writeJson(res, 200, readLeads());
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/leads") {
      const body = await readRequestBody(req);
      const input = JSON.parse(body || "{}");
      const lead = sanitizeLead(input);
      const leads = readLeads();
      leads.unshift(lead);
      fs.writeFileSync(LEADS_FILE, `${JSON.stringify(leads, null, 2)}\n`, "utf8");

      let feishu = { skipped: true };
      try {
        feishu = await pushLeadToFeishu(lead);
        if (feishu.skipped) {
          console.warn(`Feishu write skipped: ${feishu.reason || "unknown reason"}`);
        } else {
          const recordId = feishu.data?.record?.record_id || feishu.data?.record_id || "unknown";
          console.log(`Feishu write success: ${recordId}`);
        }
      } catch (error) {
        console.error(`Feishu write failed: ${error.message}`);
        feishu = { skipped: false, error: error.message };
      }

      writeJson(res, 201, { ok: true, lead, feishu });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/generate-name") {
      const requestStartedAt = Date.now();
      const usage = readAiUsage();
      const { userId, record } = getAiUser(req, usage);
      const daily = getDailyAiUsage(usage);
      const headers = { "Set-Cookie": makeAiUserCookie(userId) };
      const remaining = Math.max(0, AI_FREE_GENERATION_LIMIT - Number(record.count || 0));
      const baseDebug = {
        model: DEEPSEEK_MODEL,
        timeoutMs: DEEPSEEK_TIMEOUT_MS,
        userKey: hashValue(userId).slice(0, 12),
      };

      if (Number(daily.total || 0) >= AI_DAILY_GLOBAL_LIMIT) {
        writeJsonWithHeaders(res, 429, {
          ok: false,
          source: "local",
          error: "global_quota_exceeded",
          message: "今日免费 AI 生成名额已用完，已回退本地规则生成。",
          remaining,
          dailyRemaining: 0,
          latencyMs: Date.now() - requestStartedAt,
          debug: { ...baseDebug, source: "local", errorCode: "global_quota_exceeded" },
          fallbackAllowed: true,
        }, headers);
        return;
      }

      if (remaining <= 0) {
        writeJsonWithHeaders(res, 429, {
          ok: false,
          source: "local",
          error: "quota_exceeded",
          message: `免费 AI 生成次数已用完。本轮每位用户可生成 ${AI_FREE_GENERATION_LIMIT} 次。`,
          remaining: 0,
          dailyRemaining: Math.max(0, AI_DAILY_GLOBAL_LIMIT - Number(daily.total || 0)),
          latencyMs: Date.now() - requestStartedAt,
          debug: { ...baseDebug, source: "local", errorCode: "quota_exceeded" },
          fallbackAllowed: true,
        }, headers);
        return;
      }

      if (!DEEPSEEK_API_KEY) {
        const body = await readRequestBody(req);
        const input = sanitizeNameInput(JSON.parse(body || "{}"));
        writeJsonWithHeaders(res, 503, {
          ok: false,
          source: "local",
          error: "ai_not_configured",
          message: "服务端尚未配置 DEEPSEEK_API_KEY，已回退本地规则生成。",
          remaining,
          dailyRemaining: Math.max(0, AI_DAILY_GLOBAL_LIMIT - Number(daily.total || 0)),
          latencyMs: Date.now() - requestStartedAt,
          debug: { ...baseDebug, source: "local", errorCode: "ai_not_configured" },
          bazi: input.bazi || null,
          fallbackAllowed: true,
        }, headers);
        return;
      }

      const body = await readRequestBody(req);
      const input = sanitizeNameInput(JSON.parse(body || "{}"));
      if (!input.surname || !input.birth || !input.city) {
        writeJsonWithHeaders(res, 400, {
          ok: false,
          source: "local",
          error: "invalid_input",
          message: "请至少填写姓氏、出生时间和出生城市。",
          remaining,
          dailyRemaining: Math.max(0, AI_DAILY_GLOBAL_LIMIT - Number(daily.total || 0)),
          latencyMs: Date.now() - requestStartedAt,
          debug: { ...baseDebug, source: "local", errorCode: "invalid_input" },
          bazi: input.bazi || null,
          fallbackAllowed: true,
        }, headers);
        return;
      }

      try {
        record.count = Number(record.count || 0) + 1;
        record.updatedAt = new Date().toISOString();
        record.lastModel = DEEPSEEK_MODEL;
        usage[userId] = record;
        const updatedDaily = incrementDailyAiUsage(usage);
        writeAiUsage(usage);
        console.log(`AI name generation attempt: user=${userId} count=${record.count}/${AI_FREE_GENERATION_LIMIT} daily=${updatedDaily.total}/${AI_DAILY_GLOBAL_LIMIT} model=${DEEPSEEK_MODEL}`);

        const aiResponse = await requestDeepSeek([
          { role: "system", content: "你只输出可解析 JSON，必须克制、真实、可解释。" },
          { role: "user", content: buildNamePrompt(input) },
        ]);

        const normalized = normalizeAiPayload(input, aiResponse.content);
        const latencyMs = Date.now() - requestStartedAt;
        console.log(`AI name generation success: user=${userId} latencyMs=${latencyMs} candidates=${normalized.candidates.length}`);
        writeJsonWithHeaders(res, 200, {
          ok: true,
          source: "ai",
          model: DEEPSEEK_MODEL,
          remaining: Math.max(0, AI_FREE_GENERATION_LIMIT - record.count),
          dailyRemaining: Math.max(0, AI_DAILY_GLOBAL_LIMIT - Number(updatedDaily.total || 0)),
          latencyMs,
          debug: { ...baseDebug, source: "ai", errorCode: null },
          bazi: input.bazi || null,
          analysis: normalized.analysis,
          candidates: normalized.candidates,
        }, headers);
      } catch (error) {
        console.error(`AI name generation failed: ${error.message}`);
        const errorCode = error.message.includes("timeout") ? "timeout" : "ai_generation_failed";
        writeJsonWithHeaders(res, 502, {
          ok: false,
          error: "ai_generation_failed",
          message: "AI 生成暂时失败，已回退本地规则生成。",
          remaining: Math.max(0, AI_FREE_GENERATION_LIMIT - Number(record.count || 0)),
          dailyRemaining: Math.max(0, AI_DAILY_GLOBAL_LIMIT - Number(getDailyAiUsage(usage).total || 0)),
          latencyMs: Date.now() - requestStartedAt,
          bazi: input.bazi || null,
          source: "local",
          debug: { ...baseDebug, source: "local", errorCode },
          fallbackAllowed: true,
        }, headers);
      }
      return;
    }

    if (req.method === "GET" || req.method === "HEAD") {
      serveStatic(req, res);
      return;
    }

    writeJson(res, 405, { ok: false, error: "Method not allowed" });
  } catch (error) {
    writeJson(res, 400, { ok: false, error: error.message });
  }
});

ensureLeadsFile();
ensureJsonObjectFile(AI_USAGE_FILE);
server.listen(PORT, HOST, () => {
  console.log(`托业成绩助手已启动：http://${HOST}:${PORT}`);
  if (LEADS_TOKEN) {
    console.log(`线索查看接口：http://${HOST}:${PORT}/api/leads?token=${LEADS_TOKEN}`);
  } else {
    console.log(`线索查看接口：http://${HOST}:${PORT}/api/leads`);
    console.log("生产环境建议设置 LEADS_TOKEN 环境变量保护线索接口。");
  }
});
