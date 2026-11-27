# 付款条件与产品权益

付款条件来自 Apple 的公开资料，按快照的 60 个 App Store 市场核查。Google 产品权益来自公开套餐资料与帮助中心。`reviewedAt` 记录资料核查日期，以 `YYYY-MM-DD` 保存。

## 地区付款字段

`src/data/country-meta.json` 按三字母市场码 `code` 关联 `snapshot.json`，每区一条。`sources` 是可公开查阅的官方链接，`notes` 可补充付款限制或证据差异。

`giftCard` 专指可兼用于 Apple Store 与 App Store 的通用 **Apple Gift Card**。`official` 表示 Apple 明确列出该卡可兑换账户余额。`none` 表示 Apple 列出了该市场的付款方式，其中没有这种通用卡。`unknown` 表示公开资料不足以确认。分级同时考虑旧版 App Store 礼品卡。

| `paymentMethods`  | Apple 付款清单中的类别                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| `card`            | 信用卡、借记卡或明确列出的卡组织／卡产品。个别市场限定信用卡或指定品牌。 |
| `paypal`          | PayPal。                                                                 |
| `apple-pay`       | Apple Pay。                                                              |
| `carrier`         | 支持的运营商代扣。                                                       |
| `local-wallet`    | Apple Cash、GCash、MoMo 等官方清单列出的钱包或支付应用。                 |
| `bank-payment`    | PIX、UPI 等银行支付网络。                                                |
| `bank-top-up`     | 仅用于账户余额充值的银行付款，如 BLIK、印度网上银行。                    |
| `account-balance` | Apple 账户余额。具体市场可通过直接充值、礼品卡兑换或两者入账。           |
| `gift-card`       | Apple Gift Card 兑换为 Apple 账户余额。                                  |
| `app-store-card`  | App Store Card 或 App Store & iTunes Gift Card 兑换为 Apple 账户余额。   |

## 分级规则

按以下顺序应用 `derivePaymentAccess`。旧版 App Store 卡同样可以兑换 App Store 余额，因此分级与通用 Apple Gift Card 一致。

1. `giftCard` 为 `official`，或 `paymentMethods` 含 `app-store-card` 时，分为 `easy`。
2. `giftCard` 为 `none`，且有账户余额以外的付款方式时，分为 `local-only`。用户需具备该区接受的方式，个别卡片或钱包的资格仍由 Apple 和付款机构判定。
3. 其余情况分为 `unknown`，包括市场未列出或只有余额证据。

账户余额记录不能单独确认礼品卡兑换。Apple Store Gift Card 只适用其硬件零售场景。礼品卡兑换受地区限制，Apple 也说明部分购买要求另绑信用卡、部分订阅无法从余额扣款。[Apple 礼品卡类型](https://support.apple.com/en-us/118407) · [Apple 礼品卡兑换限制](https://support.apple.com/en-us/108285) · [Apple 余额用途](https://support.apple.com/en-us/118245)

## 产品权益与来源

`src/data/products.json` 的 `products` 使用报价数据已有的 `plus`、`pro`、`ultra`、`storage` 产品线键。`storageGb` 记录公开确认的套餐容量，按 1 TB = 1,000 GB 记。`familySharing.maxAdditionalMembers` 不含套餐持有人，`excludedStorageGb` 标记该产品线中不支持共享的容量档位。`familyGroup` 单独记录 Google 家庭组的居住地条件、人数上限和换组限制。`null` 表示该字段未确认，详见记录内的 `notes`。产品线事实的适用范围以 Google 公布的套餐为准，订阅方和权益以实际购买页确认。

- Apple 以按地区列出的 Apple Account 付款方式为主，地区条款和本地支持页用于核实卡型、兑换范围或冲突。[Apple 付款清单](https://support.apple.com/en-us/111741) · [Apple 添加付款方式](https://support.apple.com/en-us/118429) · [Apple 礼品卡条款](https://www.apple.com/legal/internet-services/itunes/giftcards/)
- Google 以帮助中心的方案、共享说明和 iOS 管理方式为主，与公开套餐页交叉核对。[Google One 套餐](https://one.google.com/about/plans) · [Google AI 套餐](https://one.google.com/about/google-ai-plans/) · [Gemini 套餐](https://gemini.google/subscriptions/) · [Google One 家庭共享](https://support.google.com/googleone/answer/9004015?co=GENIE.Platform%3DiOS&hl=en) · [Google 家庭组规则](https://support.google.com/families/answer/6317858?hl=en) · [Gemini iOS 订阅管理](https://support.google.com/gemini/answer/14517446?co=GENIE.Platform%3DiOS&hl=en)

## 已知不确定项

- `BGD`（孟加拉）出现在报价快照，但未列在 Apple 公开付款清单的亚太区，付款方式与礼品卡均未确认。[Apple 亚太付款清单](https://support.apple.com/en-us/111741#asiapacific)
- `SGP`（新加坡）的现行付款清单缺少礼品卡条目，旧版当地 iTunes 卡条款仍可访问。`local-only` 按现行清单得出，旧卡当前兑换状态未确认。[Apple 亚太付款清单](https://support.apple.com/en-us/111741#asiapacific) · [新加坡 iTunes 卡条款](https://www.apple.com/legal/internet-services/itunes/giftcards/sg/terms.html)
- 快照里的 5、10、20、30 TB 存储 SKU 现有权益以及是否有独立纯存储订阅，未能从 Google 公共资料逐 SKU 确认。公开资料将这些容量列在 AI Pro 或 Ultra 下。Ultra 的 YouTube Premium 随地区、家庭资格和计费方式变化，iOS SKU 的具体资格也未逐一确认。[Google One 方案说明](https://support.google.com/googleone/answer/9004013?co=GENIE.Platform%3DiOS&hl=en) · [Google AI 套餐](https://one.google.com/about/google-ai-plans/) · [YouTube Premium 与 iOS 计费](https://support.google.com/googleone/answer/15808277?co=GENIE.Platform%3DiOS&hl=en)
- Apple 未公开各发卡机构、账单地址及账户在各区的实际通过率，分级没有包含该层面的判断。[Apple 添加付款方式](https://support.apple.com/en-us/118429)

## 复核流程

建议至少每季度复核一次。Apple 清单、Google 套餐或市场覆盖变化时同步复核。

1. 按快照市场逐项核对 Apple 现行清单和脚注，必要时对照当地官方页面。遇到旧条款与现行清单差异，在记录中保留来源和差异说明。
2. 更新付款类别与分级，按同一 `derivePaymentAccess` 规则检查。复核 Google 套餐容量、共享资格和 iOS 管理说明，并同步维护对应指南。
3. 只更新实际复核过的 `reviewedAt`。运行 `pnpm format`、`pnpm lint`、`pnpm check`、`pnpm test`、`pnpm build`，在 PR 附分布变化与仍待复核的记录。
