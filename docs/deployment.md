# 部署与回滚

GitHub Actions 从已提交的原币价格快照与构建采用的汇率生成 Astro 静态站点，使用 Wrangler 将 `dist/` 部署到 Cloudflare Workers 静态资源。`google-one-price` Worker 通过 `googleone.laifuyou.com` 对外提供服务。配置见 [CI](../.github/workflows/ci.yml)、[部署 workflow](../.github/workflows/deploy.yml) 和 [Wrangler 配置](../wrangler.jsonc)。

## 首次部署

1. 在 Cloudflare 确认 `laifuyou.com` 是当前账户下的活跃 zone，目标子域名可以绑定。若已有 CNAME，先确认现有服务和迁移安排。绑定成功后 Cloudflare 会创建 DNS 记录并签发证书。[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
2. 检查仓库 Settings → Secrets and variables → Actions 下的两个 secrets。

   | Secret                  | 值                                        |
   | ----------------------- | ----------------------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | 用于部署和绑定域名的 Cloudflare API Token |
   | `CLOUDFLARE_ACCOUNT_ID` | `laifuyou.com` 所在账户的 ID              |

   创建 Token 时选 **Edit Cloudflare Workers** 模板。账户资源限定为目标账户，保留 `Workers Scripts: Write`（旧界面显示 `Edit`）。Zone 资源限定为 `laifuyou.com`，保留 `Workers Routes: Write`，用于绑定自定义域名。模板中的 KV、R2 和 Tail 权限可移除。凭证存入 GitHub Secrets。[Token 模板](https://developers.cloudflare.com/fundamentals/api/reference/template/) · [Workers 权限](https://developers.cloudflare.com/workers/authorization/workers/)

3. 在仓库 Settings → Environments 建立 `production`，将可部署分支设为 `main`。如需自动上线，保持环境无需人工审批。部署记录会显示站点 URL。
4. 将这两份 workflow 合入默认分支 `main`。`main` 的 push 触发 Deploy，复用 CI 检查，通过后构建同一提交并发布。也可以在 Actions → Deploy → Run workflow 选择 `main`，手动运行同一套 CI 检查后部署。定时部署每天 UTC 22:17（北京时间次日 06:17）从 `main` 构建。Frankfurter 各机构在一天内陆续发布，该时间在欧美常规发布时间之后，也避开 GitHub Actions 整点高峰。生产部署串行执行，发布前均确认待发提交仍是 `main` 最新提交。
5. 部署完成后，核对首页价格观测时间和汇率日期、`/matrix` 和一个国家详情页。检查 `/matrix/` 会跳转到 `/matrix`，不存在的路径返回自定义 404。[生产站点](https://googleone.laifuyou.com)

仓库在安装时启用 Lefthook，`esbuild` 和 `workerd` 使用依赖自带的平台二进制。`pnpm-workspace.yaml` 的 `allowBuilds` 显式跳过后二者的安装脚本，本地与 CI 行为一致。

## 本地手动部署

在待发布的提交上，按 README 安装依赖，先执行构建和 dry run。

```sh
pnpm build
pnpm cf:dry
```

dry run 只验证本地构建与 Wrangler 配置。确定要发布时，登录有生产权限的 Cloudflare 账户，再执行 `pnpm deploy`。

```sh
pnpm exec wrangler login
pnpm deploy
```

也可以在当前进程环境提供两个 `CLOUDFLARE_*` 凭证。`pnpm deploy` 会重新构建并发布到同一个生产域名。

## 缓存与响应头

Astro 将 `public/_headers` 复制到 `dist/`，Cloudflare 按请求路径应用其中的规则。普通 Astro 页面构建为 `<路由>/index.html`，Workers 的 `drop-trailing-slash` 给它们提供无尾斜杠的 URL。找不到资源时返回 `404.html` 和 404 状态码。[响应头规则](https://developers.cloudflare.com/workers/static-assets/headers/) · [HTML 路由](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/)

| 路径                                                                       | 缓存规则                                              |
| -------------------------------------------------------------------------- | ----------------------------------------------------- |
| HTML 和其他默认路径                                                        | `public, max-age=0, must-revalidate`                  |
| `/_astro/*` 中带内容哈希的产物                                             | `public, max-age=31536000, immutable`                 |
| `/flags/*`、`/fonts/*`、`/og.png`、`/favicon.svg`、`/apple-touch-icon.png` | `public, max-age=86400, stale-while-revalidate=86400` |

浏览器再次访问 HTML 时会带上 `If-None-Match`。内容相同时 Workers 返回 304，静态资源更新后重新验证会收到新版 HTML。Cloudflare 的边缘静态资源缓存按 Worker 版本提供内容，部署新版本通常无需手动 purge。为保留更新行为，避免在 zone 的 Cache Rules 中给站点 HTML 强制设置更长的 TTL。[静态资源缓存](https://developers.cloudflare.com/workers/static-assets/#caching-behavior)

全站设置 `X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options` 和 `Permissions-Policy`。页面含内联脚本，CSP 留待按脚本内容生成哈希后启用。

## 回滚

1. 在 Cloudflare 的 Worker Deployments 中找到上一个稳定版本，也可用 `pnpm exec wrangler deployments list` 查询。
2. 用 `pnpm exec wrangler rollback VERSION_ID` 将流量切回该版本，将 `VERSION_ID` 替换为目标版本 ID。也可在 Cloudflare 控制台执行回滚。[Workers 回滚](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
3. 如果目标版本不可用，用旧提交对应的 Node.js、pnpm 和 lockfile 安装依赖，再执行 `pnpm deploy` 重新构建发布。
4. 检查首页的价格观测时间、汇率日期和关键页面。同步把修复或 revert 合入 `main`，避免下次发布带回问题。

## 数据刷新

- 价格刷新时，维护者依次运行 `pnpm data:import <xlsx>` 和 `pnpm data:check <xlsx>`，审查并提交 `src/data/snapshot.json`。合入 `main` 后由 CI 验证并触发部署。发布后核对首页的价格观测时间。工作簿留在本地。[数据源说明](data-source.md)
- Deploy 在构建前拉取 Frankfurter 汇率。以 Actions 缓存中上一次通过校验的汇率为基准，缓存缺失时以仓库 `src/data/fx.json` 为基准。候选日期须等于或晚于基准日期，任一币种变动的绝对值须在 20% 以内。通过校验的汇率写入 `src/data/fx.live.json` 并刷新缓存。仓库基线更新后，缓存从新基线重新累计。
- 拉取或校验失败时，定时运行失败并保留线上版本。push 和手动运行使用上一次通过校验的缓存，缺少可用缓存时回退到仓库基线。Actions 注解和运行摘要会标出降级，页面显示实际采用的汇率日期。
- 本地运行 `pnpm fx:update --live && FX_LIVE=1 pnpm build` 可验证拉取和构建。普通 `pnpm build` 和 CI 校验构建使用已提交的基线。
- 建议每月或收到降级、失败告警后复核仓库基线，运行 `pnpm fx:update`，审查 `src/data/fx.json` 的 diff 并通过 PR 更新。若复核确认超过 20% 的变动属实，可用 `pnpm fx:update --force` 跳过变动阈值。日期和数据结构校验仍会执行。
