# 店铺记账

这是一个适合部署到 GitHub Pages 的轻量级订单与收付款登记系统。

## 功能

- 订单登记：订单号、店铺、客户、日期、金额、状态、备注
- 收款登记：关联订单，记录收款金额、方式和日期
- 付款登记：记录采购、物流、退款、人工等支出
- 汇总看板：订单总额、已收款、未收款、总支出、现金利润
- CSV 导出
- Supabase 登录和数据库存储
- 登录邮箱白名单
- 未配置 Supabase 时自动使用浏览器本地演示数据

## 本地运行

```bash
npm install
npm run dev
```

## 连接 Supabase

1. 在 Supabase 新建项目。
2. 打开 SQL Editor，执行 `supabase/schema.sql`。
3. 复制 `.env.example` 为 `.env.local`。
4. 填入项目的 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY` 和 `VITE_ALLOWED_EMAILS`。
5. 在 Supabase Authentication 里开启 Email 登录。

```bash
cp .env.example .env.local
npm run dev
```

## 部署到 GitHub Pages

项目使用 Vite。推到 GitHub 后，可以在仓库 Settings 里开启 Pages，并使用 GitHub Actions 或手动部署 `dist` 目录。

GitHub Actions 部署时需要在仓库 Secrets 里添加：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_ALLOWED_EMAILS
```

构建命令：

```bash
npm run build
```

构建产物目录：

```text
dist
```

## 数据安全

订单和收付款数据不要放在 GitHub 仓库里。这个项目只把网页代码部署到 GitHub Pages，真实数据由 Supabase 保存，并通过 Row Level Security 限制只有白名单邮箱可以访问数据。
