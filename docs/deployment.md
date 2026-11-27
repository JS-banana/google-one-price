# 部署与回滚

GitHub Actions 从已提交的 JSON 快照生成 Astro 静态站点，使用 Wrangler 将 `dist/` 部署到 Cloudflare Workers 静态资源。`google-one-price` Worker 通过 `googleone.laifuyou.com` 对外提供服务。配置见 [CI](../.github/workflows/ci.yml)、[部署 workflow](../.github/workflows/deploy.yml) 和 [Wrangler 配置](../wrangler.jsonc)。

## 首次部署

1. 在 Cloudflare 确认 `laifuyou.com` 是当前账户下的活跃 zone，目标子域名可以绑定。若已有 CNAME，先确认现有服务和迁移安排。绑定成功后 Cloudflare 会创建 DNS 记录并签发证书。[Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
2. 检查仓库 Settings → Secrets and variables → Actions 下的两个 secrets。

   | Secret                  | 值                                        |
   | ----------------------- | ----------------------------------------- |
   | `CLOUDFLARE_API_TOKEN`  | 用于部署和绑定域名的 Cloudflare API Token |
   | `CLOUDFLARE_ACCOUNT_ID` | `laifuyou.com` 所在账户的 ID              |

   创建 Token 时选 **Edit Cloudflare Workers** 模板。账户资源限定为目标账户，保留 `Workers Scripts: Write`（旧界面显示 `Edit`）。Zone 资源限定为 `laifuyou.com`，保留 `Workers Routes: Write`，用于绑定自定义域名。模板中的 KV、R2 和 Tail 权限可移除。凭证存入 GitHub Secrets。[Token 模板](https://developers.cloudflare.com/fundamentals/api/reference/template/) · [Workers 权限](https://developers.cloudflare.com/workers/authorization/workers/)

3. 在仓库 Settings → Environments 建立 `production`，将可部署分支设为 `main`。如需自动上线，保持环境无需人工审批。部署记录会显示站点 URL。
4. 将这两份 workflow 合入默认分支 `main`。`main` 的 push CI 通过后，Deploy 会重新构建同一提交并发布。也可以在 Actions → Deploy → Run workflow 选择 `main`，手动运行同一套 CI 检查后部署。生产部署串行执行，发布前会确认待发提交仍是 `main` 最新提交。
5. 部署完成后，核对首页数据更新时间、`/matrix` 和一个国家详情页。检查 `/matrix/` 会跳转到 `/matrix`，不存在的路径返回自定义 404。[生产站点](https://googleone.laifuyou.com)

仓库在安装时启用 Lefthook，`esbuild` 和 `workerd` 使用依赖自带的平台二进制。CI 通过 `pnpm_config_allow_builds` 跳过后二者的安装脚本，本地命令见 [README](../README.zh-CN.md#快速开始)。

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

浏览器再次访问 HTML 时会带上 `If-None-Match`。内容相同时 Workers 返回 304，快照更新后重新验证会收到新版 HTML。Cloudflare 的边缘静态资源缓存按 Worker 版本提供内容，部署新版本通常无需手动 purge。为保留更新行为，避免在 zone 的 Cache Rules 中给站点 HTML 强制设置更长的 TTL。[静态资源缓存](https://developers.cloudflare.com/workers/static-assets/#caching-behavior)

全站设置 `X-Content-Type-Options`、`Referrer-Policy`、`X-Frame-Options` 和 `Permissions-Policy`。页面含内联脚本，CSP 留待按脚本内容生成哈希后启用。

## 回滚

1. 在 Cloudflare 的 Worker Deployments 中找到上一个稳定版本，也可用 `pnpm exec wrangler deployments list` 查询。
2. 用 `pnpm exec wrangler rollback VERSION_ID` 将流量切回该版本，将 `VERSION_ID` 替换为目标版本 ID。也可在 Cloudflare 控制台执行回滚。[Workers 回滚](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
3. 如果目标版本不可用，用旧提交对应的 Node.js、pnpm 和 lockfile 安装依赖，再执行 `pnpm deploy` 重新构建发布。
4. 检查首页的快照时间和关键页面。同步把修复或 revert 合入 `main`，避免下次发布带回问题。

## 数据刷新

维护者在本地拿到新工作簿后，依次运行 `pnpm data:import <xlsx>` 和 `pnpm data:check <xlsx>`，审查并提交 `src/data/snapshot.json`。快照进入 `main` 后由 CI 验证，并触发 Workers 部署。发布后对照首页数据更新时间检查结果。工作簿始终保存在本地，CI 只用 JSON 快照。[数据源说明](data-source.md)
