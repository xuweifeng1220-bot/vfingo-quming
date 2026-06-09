const FEISHU_API = "https://open.feishu.cn/open-apis";

async function feishuRequest(path, options = {}) {
  const response = await fetch(`${FEISHU_API}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (error) {
      throw new Error(`Feishu returned non-JSON response: ${text.slice(0, 200)}`);
    }
  }

  if (!response.ok || payload.code !== 0) {
    const code = payload.code === undefined ? response.status : payload.code;
    const message = payload.msg || payload.error || response.statusText;
    throw new Error(`Feishu API error ${code}: ${message}`);
  }

  return payload.data || {};
}

async function getTenantAccessToken() {
  const appId = process.env.FEISHU_APP_ID;
  const appSecret = process.env.FEISHU_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error("Missing FEISHU_APP_ID or FEISHU_APP_SECRET");
  }

  const response = await fetch(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });

  const payload = await response.json();
  if (!response.ok || payload.code !== 0) {
    const code = payload.code === undefined ? response.status : payload.code;
    const message = payload.msg || response.statusText;
    throw new Error(`Feishu auth error ${code}: ${message}`);
  }

  if (!payload.tenant_access_token) {
    throw new Error("Feishu tenant_access_token missing from response");
  }

  return payload.tenant_access_token;
}

async function resolveWikiNode(tenantAccessToken, wikiNodeToken) {
  const token = encodeURIComponent(wikiNodeToken);
  const data = await feishuRequest(`/wiki/v2/spaces/get_node?token=${token}`, {
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
    },
  });

  if (!data.node) {
    throw new Error("Feishu wiki node response missing node");
  }

  return data.node;
}

async function listTables(tenantAccessToken, appToken) {
  const data = await feishuRequest(`/bitable/v1/apps/${appToken}/tables`, {
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
    },
  });

  return data.items || [];
}

async function createBitable(tenantAccessToken, name) {
  const data = await feishuRequest("/bitable/v1/apps", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
    },
    body: JSON.stringify({ name }),
  });

  const app = data.app || data;
  const appToken = app.app_token || app.token;
  if (!appToken) {
    throw new Error("Feishu create bitable response missing app_token");
  }

  return appToken;
}

async function listFields(tenantAccessToken, appToken, tableId) {
  const data = await feishuRequest(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
    {
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
      },
    },
  );

  return data.items || [];
}

async function createField(tenantAccessToken, appToken, tableId, fieldName) {
  return feishuRequest(`/bitable/v1/apps/${appToken}/tables/${tableId}/fields`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenantAccessToken}`,
    },
    body: JSON.stringify({
      field_name: fieldName,
      type: 1,
    }),
  });
}

async function ensureFields(tenantAccessToken, appToken, tableId, fieldNames) {
  const fields = await listFields(tenantAccessToken, appToken, tableId);
  const existing = new Set(fields.map((field) => field.field_name));
  const created = [];

  for (const fieldName of fieldNames) {
    if (existing.has(fieldName)) continue;
    await createField(tenantAccessToken, appToken, tableId, fieldName);
    created.push(fieldName);
  }

  return { existing: [...existing], created };
}

async function createRecord(tenantAccessToken, appToken, tableId, fields) {
  return feishuRequest(
    `/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tenantAccessToken}`,
      },
      body: JSON.stringify({ fields }),
    },
  );
}

function leadToFeishuFields(lead) {
  return {
    创建时间: lead.createdAt,
    目标分数: lead.targetScore,
    "当前成绩/基础": lead.currentScore,
    最晚提交时间: lead.deadline,
    用途: lead.purpose,
    "微信号/手机号": lead.contact,
    需求说明: lead.message || "",
    来源: "网站表单",
    跟进状态: "未联系",
    备注: "",
  };
}

async function pushLeadToFeishu(lead) {
  const appToken = process.env.FEISHU_APP_TOKEN;
  const tableId = process.env.FEISHU_TABLE_ID;

  if (!appToken || !tableId) {
    return { skipped: true, reason: "Missing FEISHU_APP_TOKEN or FEISHU_TABLE_ID" };
  }

  const tenantAccessToken = await getTenantAccessToken();
  const data = await createRecord(
    tenantAccessToken,
    appToken,
    tableId,
    leadToFeishuFields(lead),
  );

  return { skipped: false, data };
}

module.exports = {
  getTenantAccessToken,
  resolveWikiNode,
  createBitable,
  listTables,
  ensureFields,
  pushLeadToFeishu,
  leadToFeishuFields,
};
