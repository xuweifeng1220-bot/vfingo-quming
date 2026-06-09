const fs = require("fs");
const path = require("path");
const { loadEnv } = require("../lib/env");
const {
  getTenantAccessToken,
  resolveWikiNode,
  createBitable,
  listTables,
  ensureFields,
} = require("../lib/feishu");

const FIELD_NAMES = [
  "创建时间",
  "目标分数",
  "当前成绩/基础",
  "最晚提交时间",
  "用途",
  "微信号/手机号",
  "需求说明",
  "来源",
  "跟进状态",
  "备注",
];

function updateEnv(updates) {
  const envPath = path.join(__dirname, "..", ".env");
  const current = fs.existsSync(envPath)
    ? fs.readFileSync(envPath, "utf8").split(/\r?\n/)
    : [];
  const seen = new Set();
  const next = current.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (!match) return line;
    const key = match[1];
    if (!(key in updates)) return line;
    seen.add(key);
    return `${key}=${updates[key]}`;
  });

  for (const [key, value] of Object.entries(updates)) {
    if (!seen.has(key)) {
      next.push(`${key}=${value}`);
    }
  }

  fs.writeFileSync(envPath, `${next.filter(Boolean).join("\n")}\n`, "utf8");
}

async function main() {
  loadEnv();

  const wikiNodeToken = process.env.FEISHU_WIKI_NODE_TOKEN;
  if (!wikiNodeToken) {
    throw new Error("Missing FEISHU_WIKI_NODE_TOKEN");
  }

  console.log("1. 获取 tenant_access_token...");
  const tenantAccessToken = await getTenantAccessToken();

  let appToken;
  let tables;

  try {
    console.log("2. 解析 Wiki 节点...");
    const node = await resolveWikiNode(tenantAccessToken, wikiNodeToken);
    if (node.obj_type !== "bitable") {
      throw new Error(`Wiki node is ${node.obj_type}, not bitable`);
    }

    appToken = node.obj_token;
    console.log(`   多维表格 app_token: ${appToken}`);

    console.log("3. 查询数据表...");
    tables = await listTables(tenantAccessToken, appToken);
  } catch (error) {
    console.log(`   现有 Wiki 表格不可用：${error.message}`);
    console.log("2. 改为由应用创建新的多维表格...");
    appToken = await createBitable(tenantAccessToken, "托业咨询线索表");
    console.log(`   新多维表格 app_token: ${appToken}`);

    console.log("3. 查询新数据表...");
    tables = await listTables(tenantAccessToken, appToken);
  }

  if (!tables.length) {
    throw new Error("No tables found in this bitable");
  }

  const table = tables.find((item) => item.name === "线索") || tables[0];
  const tableId = table.table_id;
  console.log(`   使用数据表: ${table.name || "(未命名)"} (${tableId})`);

  console.log("4. 检查并创建字段...");
  let result;
  try {
    result = await ensureFields(tenantAccessToken, appToken, tableId, FIELD_NAMES);
  } catch (error) {
    if (appToken === process.env.FEISHU_APP_TOKEN) {
      throw error;
    }

    console.log(`   当前表格无编辑权限：${error.message}`);
    console.log("   改为由应用创建新的多维表格...");
    appToken = await createBitable(tenantAccessToken, "托业咨询线索表");
    tables = await listTables(tenantAccessToken, appToken);
    if (!tables.length) {
      throw new Error("No tables found in newly created bitable");
    }
    const newTable = tables.find((item) => item.name === "线索") || tables[0];
    result = await ensureFields(
      tenantAccessToken,
      appToken,
      newTable.table_id,
      FIELD_NAMES,
    );
    updateEnv({
      FEISHU_APP_TOKEN: appToken,
      FEISHU_TABLE_ID: newTable.table_id,
    });
    console.log(`   新数据表: ${newTable.name || "(未命名)"} (${newTable.table_id})`);
    console.log("5. 已写入 .env:");
    console.log(`   FEISHU_APP_TOKEN=${appToken}`);
    console.log(`   FEISHU_TABLE_ID=${newTable.table_id}`);
    console.log("完成。");
    return;
  }
  if (result.created.length) {
    console.log(`   已创建字段: ${result.created.join(", ")}`);
  } else {
    console.log("   字段已存在，无需创建。");
  }

  updateEnv({
    FEISHU_APP_TOKEN: appToken,
    FEISHU_TABLE_ID: tableId,
  });

  console.log("5. 已写入 .env:");
  console.log(`   FEISHU_APP_TOKEN=${appToken}`);
  console.log(`   FEISHU_TABLE_ID=${tableId}`);
  console.log("完成。");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
