# Google One / Gemini iOS 订阅价格

[English](README.md)

中文查询工具，比较 60 个国家和地区的 iOS App Store Google One / Gemini 订阅价格。[打开网站](https://googleone.laifuyou.com)

## 功能

- 按首期月价、首年月均或续费月价比较套餐，排名用人民币折算价，同时显示原币。
- 首期、优惠期数和续费一起显示，续费跳涨时有提示。
- 60 个国家和地区的价格矩阵，支持按档位排序、按大区筛选，以及搜索市场或币种。
- 国家和地区详情页可查在售套餐与历史报价，变动页可查看最近记录。

## 快速开始

使用仓库锁定的 Node.js 22 和 pnpm 版本。[.nvmrc](.nvmrc) · [package.json](package.json)

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm build
```

`pnpm dev` 启动开发服务器，`pnpm build` 生成 `dist/`。环境变量保留 Lefthook 安装脚本，Wrangler 的依赖直接使用各平台的预编译二进制。

站点使用 Astro、TypeScript 和 Tailwind CSS v4，矩阵通过交互 island 实现。数据快照由 Zod 验证，测试用 Vitest，静态产物部署到 Cloudflare Workers。

## 刷新数据

1. 将新工作簿保存到本地 `data/source/prices.xlsx`，也可使用文件已有的路径。Git 忽略 `data/source/` 下的 `.xlsx`。
2. 运行 `pnpm data:import data/source/prices.xlsx`，验证工作簿并生成 `src/data/snapshot.json`。
3. 对同一文件运行 `pnpm data:check data/source/prices.xlsx`，检查快照 diff。
4. 运行 `pnpm test` 和 `pnpm build`，提交快照并更新 `main`。`main` 上的 CI 通过后自动部署。

工作簿提供原币价格和观测时间。构建时使用 [Frankfurter](https://frankfurter.dev/) v2 混合参考汇率折算人民币，页面单独显示汇率日期。本地构建与 CI 使用已提交的汇率基线。每天定时部署和 `main` 部署都会尝试拉取最新汇率，失败时使用基线。可用 `pnpm fx:update` 更新基线。[数据源说明](docs/data-source.md)

## 项目结构

```text
scripts/                 工作簿导入和对账
src/data/snapshot.json   规范化价格快照
src/data/fx.json         Frankfurter 汇率基线
src/lib/data/            数据结构、价格计算和页面数据
src/pages/               Astro 静态路由
public/                  国旗、字体和其他静态资源
docs/                    数据、设计和部署说明
.github/workflows/       持续集成和生产部署
```

## 部署与贡献

GitHub Actions 构建并部署到 Cloudflare Workers 静态资源。首次配置、手动发布、缓存与回滚见[部署说明](docs/deployment.md)。

提交信息用英文 Conventional Commits，例如 `fix: clarify renewal pricing`。Lefthook 在本地检查暂存文件和提交信息，CI 校验 PR 内的提交信息。

## 许可证与致谢

项目代码和 flag-icons 提供的国旗 SVG 均采用 MIT 许可证。IBM Plex Mono 字体遵循 SIL Open Font License。[项目许可证](LICENSE) · [flag-icons](https://github.com/lipis/flag-icons) · [国旗许可证](public/flags/LICENSE.txt) · [字体许可证](public/fonts/OFL.txt)

价格数据来自对公开 iOS App Store 报价的监控，仅供参考。实际扣款以 App Store 为准。Google、Google One 和 Gemini 是 Google LLC 的商标，本项目与 Google 无关。
