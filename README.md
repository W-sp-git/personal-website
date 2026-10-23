# NORTHBOUND · 王舒鹏

线上地址：https://wang-shupeng.vercel.app/

王舒鹏的极北个人网站，包含峡湾、雪原、极光三段旅程和关于页。昼夜切换、WebGL 动效、飘雪与环境音均在浏览器端运行。

## 本地预览

```sh
npm run dev
```

打开 http://localhost:4173，无需安装依赖。

## Vercel 部署

导入此仓库，选择 Hobby 免费方案。根目录的 vercel.json 已配置 Other 框架、跳过安装和构建、发布 dist 目录。无需环境变量或服务器。

部署后可直接访问首页和 /about/，后续推送到 main 会自动更新网站。

## 检查

```sh
npm run check
```

风景为 AI 生成的艺术场景。Manrope、Phosphor 与 GSAP 的许可说明保留在 dist/assets 及其子目录中。
