# Google One / Gemini iOS 价格

查询 60 个 App Store 市场的本地订阅价、首期优惠和续费价。首页目前展示数据覆盖范围和刷新时间。

```sh
pnpm install --frozen-lockfile
pnpm dev
```

使用 `.nvmrc` 指定的 Node 22。静态发布产物由 `pnpm build` 生成到 `dist/`。

把新 Excel 放到 `data/source/GoogleOne_iOS_60_Countries_Matrix.xlsx`，运行 `pnpm data:import` 和 `pnpm data:check`，检查并提交 `src/data/snapshot.json`。使用其他文件名时，给两个命令传入相同路径。详见 [数据源说明](docs/data-source.md)。
