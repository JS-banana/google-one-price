# google-one-price

面向中文用户的 Google One / Gemini iOS App Store 跨区订阅价格查询工具。

## 目录

- `data/source/` 存放本地 Excel，Git 忽略其中的 `.xlsx`。
- `scripts/` 存放工作簿读取、字段规范化、地区映射、SKU 解码和对账代码。
- `src/data/snapshot.json` 是提交到 Git 的规范化快照。
- `src/lib/data/` 存放 Zod schema、金额换算、档位、矩阵、页面数据接口和测试。
- `src/pages/` 是 Astro 静态页面入口，`src/styles/` 接入 Tailwind CSS v4。矩阵使用 Preact island。
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
