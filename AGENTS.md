# google-one-price

面向中文用户的 Google One / Gemini iOS App Store 跨区订阅价格查询工具。

## 目录

- `data/source/` 存放本地 Excel，Git 忽略其中的 `.xlsx`。
- `scripts/` 存放工作簿读取、字段规范化、地区映射、SKU 解码和对账代码。
- `src/data/snapshot.json` 是提交到 Git 的规范化快照。
- `src/lib/data/` 存放 Zod schema、金额换算、档位、矩阵、页面数据接口和测试。
- `src/pages/` 是 Astro 静态页面入口，`src/styles/` 接入 Tailwind CSS v4。首页决策器使用 Preact island，矩阵使用原生脚本。
- `docs/data-source.md` 说明表结构、口径、异常和刷新流程。

## 命令

使用 Node 22（版本见 `.nvmrc`）和 `package.json` 指定的 pnpm 版本。

| 命令                                       | 用途                                                   |
| ------------------------------------------ | ------------------------------------------------------ |
| `pnpm install --frozen-lockfile`           | 安装依赖和 Lefthook                                    |
| `pnpm dev` / `pnpm build` / `pnpm preview` | 本地开发、静态构建、预览构建产物                       |
| `pnpm format` / `pnpm lint`                | 用 Biome 格式化和检查                                  |
| `pnpm check` / `pnpm test`                 | 运行 Astro 检查和严格 TypeScript 类型检查、运行 Vitest |
| `pnpm data:import [xlsx路径]`              | 校验工作簿并生成 JSON                                  |
| `pnpm data:check [xlsx路径]`               | 对账并确认工作簿与落盘快照一致                         |

## 代码与数据约定

- 代码标识符和注释用英文，项目文档用中文。提交信息用英文 Conventional Commits。提交前 Lefthook 检查已暂存代码的格式和 lint，提交信息由 commitlint 校验。
- Biome 已开启 `.astro` 的完整 HTML 支持，首页的 frontmatter 和模板均由 Biome 处理。
- TypeScript 固定在 Astro 检查器支持的稳定版 6.0.3。[TypeScript 7 发布说明](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
- Excel 使用仍在发布更新的 `read-excel-file` 读取，本次安装的依赖树通过了高危漏洞审计。[项目发布记录](https://github.com/catamphetamine/read-excel-file/blob/master/CHANGELOG.md)
- 原始明细和汇率提供报价事实，变动页提供独立日志。每次导入先验证结构和数据，再原子替换快照。生成 JSON 的序列化由导入程序负责。
- 页面通过 `src/lib/data/index.ts` 读取快照。排名和矩阵从活跃明细派生，历史明细保留其原币和来源，对账只读 Excel 的派生页。

## 部署与发布

- `main` 上的 CI 通过后，GitHub Actions 将 Astro 产物发布到 Cloudflare Workers 静态资源。CI 从已提交的 JSON 快照构建。
- 使用 `pnpm build` 和 `pnpm cf:dry` 验证部署配置。首次配置、手动部署、缓存和回滚见 [部署说明](docs/deployment.md)。

## 协作流程（首版之后的所有改动）

- `main` 受分支保护：禁止直接推送，只能通过 PR 合并，且 CI 必须通过；只允许 squash 合并。
- **开发**：从最新 `main` 拉功能分支（建议用独立 worktree），分支名 `feat/…`、`fix/…`、`chore/…`、`docs/…`；本地 `pnpm format && pnpm lint && pnpm check && pnpm test && pnpm build` 全部通过后推送，用 `gh pr create` 按 PR 模板填写。PR 标题使用 Conventional Commits（英文），它会成为 squash 后 `main` 上的提交信息。
- **审核**：审核者基于 `gh pr diff` 与本地预览独立审核，用 `gh pr review --comment` 给出结论（P0/P1/P2 分级）。开发者在同一分支修复并回复。
- **验收**：确认 CI 通过、审核意见已处理、实际效果符合预期后 squash 合并；合并即自动部署。涉及产品方向的改动需维护者确认。
- 数据刷新同样走 PR（`chore(data): refresh snapshot <时间>`），PR 描述附 `pnpm data:check` 的对账结论。
