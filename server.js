const http = require("http");
const fs = require("fs");
const path = require("path");
const { loadEnv } = require("./lib/env");
const { pushLeadToFeishu } = require("./lib/feishu");

loadEnv();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || (process.env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");
const LEADS_TOKEN = process.env.LEADS_TOKEN || "";
const ROOT = __dirname;
const LEADS_FILE = path.join(ROOT, "leads.json");

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

function readLeads() {
  ensureLeadsFile();
  const raw = fs.readFileSync(LEADS_FILE, "utf8").trim();
  if (!raw) return [];
  return JSON.parse(raw);
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
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
  const safePath = pathname === "/" ? "/index.html" : pathname;
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
      } catch (error) {
        console.error(`Feishu write failed: ${error.message}`);
        feishu = { skipped: false, error: error.message };
      }

      writeJson(res, 201, { ok: true, lead, feishu });
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
server.listen(PORT, HOST, () => {
  console.log(`托业成绩助手已启动：http://${HOST}:${PORT}`);
  if (LEADS_TOKEN) {
    console.log(`线索查看接口：http://${HOST}:${PORT}/api/leads?token=${LEADS_TOKEN}`);
  } else {
    console.log(`线索查看接口：http://${HOST}:${PORT}/api/leads`);
    console.log("生产环境建议设置 LEADS_TOKEN 环境变量保护线索接口。");
  }
});
