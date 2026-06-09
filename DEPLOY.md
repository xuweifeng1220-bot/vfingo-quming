# 部署说明

## 推荐方案：Render Web Service

这个项目需要 Node 后端来接收表单，所以不要部署到纯静态平台。

### 1. 推送到 GitHub

```bash
git add index.html server.js package.json leads.json assets/wechat-qr.png .gitignore DEPLOY.md
git commit -m "Initial TOEIC lead site"
git branch -M main
git remote add origin <你的 GitHub 仓库地址>
git push -u origin main
```

### 2. Render 配置

- New -> Web Service
- Connect GitHub 仓库
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/healthz`

### 3. 环境变量

建议设置：

```text
NODE_ENV=production
LEADS_TOKEN=设置一个你自己知道的查询密码
FEISHU_APP_ID=飞书应用 App ID
FEISHU_APP_SECRET=飞书应用 App Secret
FEISHU_APP_TOKEN=多维表格 app_token
FEISHU_TABLE_ID=数据表 table_id
```

Render 会自动注入 `PORT`，不用手动设置。

如果使用仓库里的 `render.yaml` 创建 Blueprint，Render 会自动读取构建命令、启动命令和健康检查路径，但仍需要你在 Render 控制台手动填写带 `sync: false` 的密钥变量。

### 4. 查看线索

如果你的域名是：

```text
https://your-site.onrender.com
```

线索查询地址为：

```text
https://your-site.onrender.com/api/leads?token=你的查询密码
```

## 重要风险

当前线索存储在 `leads.json`。这适合 MVP，但不适合长期生产：

- 免费云服务重启或重新部署后，文件可能丢失。
- 多实例部署时，文件数据可能不一致。

正式投放后建议把线索改到数据库、飞书表格、Supabase、Airtable 或 Google Sheet。

## 飞书多维表格接入

本地初始化：

```bash
npm run feishu:init
```

脚本会读取 `.env` 中的：

```text
FEISHU_APP_ID
FEISHU_APP_SECRET
FEISHU_WIKI_NODE_TOKEN
```

并自动写入：

```text
FEISHU_APP_TOKEN
FEISHU_TABLE_ID
```

表单提交后会优先写入本地 `leads.json`，再尝试写入飞书多维表格。即使飞书写入失败，本地也会保留线索备份。

## 搜索引擎基础入口

服务会自动生成：

```text
/robots.txt
/sitemap.xml
/healthz
```

上线后可以把 `https://你的域名/sitemap.xml` 提交到 Google Search Console 和百度搜索资源平台。
