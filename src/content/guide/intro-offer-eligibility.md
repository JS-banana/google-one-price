---

title: 谁可以用首期优惠或免费试用
summary: 用 Apple 的订阅组规则判断资格，并以购买确认页的条款为准。
order: 2
reviewedAt: "2026-11-27"
sources:

- https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions/
- https://developer.apple.com/documentation/storekit/implementing-introductory-offers-in-your-app
- https://developer.apple.com/app-store/subscriptions/

---

- Apple 将免费试用和首期折扣都纳入首期优惠。每个订阅组只可兑换一次。同组内已用过优惠，换成另一档或改账期也不能再领同组的首期优惠。新订阅者可符合资格，已到期的订阅者如果从未用过同组首期优惠，也可能符合资格。[Apple 首期优惠规则](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions/) · [StoreKit 资格说明](https://developer.apple.com/documentation/storekit/implementing-introductory-offers-in-your-app)
- 本站快照里，`.acq` 等 SKU 后缀是识别拉新报价的线索，具体优惠受商店地区、活动时间和账户资格影响。公开报价无法判断你的订阅组历史。购买前以 Apple 确认页实际显示的优惠、时长和续费价为准。[Apple 自动续费与优惠说明](https://developer.apple.com/app-store/subscriptions/) · [Apple 首期优惠配置](https://developer.apple.com/help/app-store-connect/manage-subscriptions/set-up-introductory-offers-for-auto-renewable-subscriptions/)
