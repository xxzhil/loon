// 出口IP信息 — 交互意图(app_intents.tsx)
// 小组件标题行的「刷新」按钮绑定本意图:点击后重新加载全部 Scripting 小组件,
// 实现手动随时刷新(系统自动刷新之外的人工触发方式)。
import { AppIntentManager, AppIntentProtocol, Widget } from "scripting"

export const RefreshWidgetIntent = AppIntentManager.register({
  name: "RefreshIPWidgetIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async () => {
    Widget.reloadAll()
  },
})
