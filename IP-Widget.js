// 出口IP信息 — Scriptable 桌面小组件
// 与 Loon 面板(IP-Info)同一套数据:api.ip.sb(主)/ ip-api.com(备)
// 小组件原生支持渐变背景与彩色文字:Kaggle 模型的粉彩渐变设计在这里完整实现
// 显示的是手机当前默认出口(经 Loon 默认策略);刷新节奏由 iOS 系统决定
// 用法:Scriptable 新建脚本粘贴本文件 -> 运行一次 -> 桌面添加 Scriptable 中号小组件并选择本脚本

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "🌐";
  cc = cc.toUpperCase();
  return String.fromCodePoint(0x1f1e6 + cc.charCodeAt(0) - 65, 0x1f1e6 + cc.charCodeAt(1) - 65);
}

async function loadData() {
  try {
    const r = new Request("https://api.ip.sb/geoip");
    r.timeoutInterval = 8;
    const d = await r.loadJSON();
    return {
      ip: d.ip || "",
      country: d.country || "",
      code: d.country_code || "",
      region: d.region || "",
      city: d.city || "",
      isp: d.isp || "",
      org: d.organization || "",
      asText: d.asn ? "AS" + d.asn : ""
    };
  } catch (e) {
    const r2 = new Request("http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,countryCode,regionName,city,isp,org,as");
    r2.timeoutInterval = 8;
    const d = await r2.loadJSON();
    if (d.status !== "success") throw new Error("both sources failed");
    return {
      ip: d.query || "",
      country: d.country || "",
      code: d.countryCode || "",
      region: d.regionName || "",
      city: d.city || "",
      isp: d.isp || "",
      org: d.org || "",
      asText: d.as || ""
    };
  }
}

function addRow(widget, label, value, color) {
  const s = widget.addStack();
  const l = s.addText(label);
  l.font = Font.boldRoundedSystemFont(13);
  l.textColor = new Color("#333333");
  const v = s.addText(value);
  v.font = Font.boldRoundedSystemFont(13);
  v.textColor = new Color(color);
  v.lineLimit = 2;
  widget.addSpacer(5);
}

async function buildWidget(d) {
  const w = new ListWidget();
  const grad = new LinearGradient();
  grad.colors = [new Color("#ff9a9e"), new Color("#fadfd8")];
  grad.locations = [0, 1];
  w.backgroundGradient = grad;
  w.setPadding(14, 16, 10, 16);

  // 标题行:猫咪地球图标 + 名称
  const head = w.addStack();
  head.centerAlignContent();
  try {
    const ir = new Request("https://status.vyxh.top/ip-icon.png");
    ir.timeoutInterval = 6;
    const img = await ir.loadImage();
    const im = head.addImage(img);
    im.imageSize = new Size(26, 26);
    im.cornerRadius = 6;
    head.addSpacer(6);
  } catch (e) {}
  const t = head.addText("🌐 出口IP信息");
  t.font = Font.boldRoundedSystemFont(15);
  t.textColor = new Color("#333333");
  w.addSpacer(8);

  const family = config.widgetFamily || "medium";
  if (d.ip) addRow(w, "🖥 出口IP:", d.ip, "#D6336C");
  let loc = flagEmoji(d.code) + " " + d.country;
  if (d.region && d.region !== d.country) loc += " · " + d.region;
  if (d.city && d.city !== d.region) loc += " · " + d.city;
  if (d.country) addRow(w, "📍 归属地:", loc, "#1971C2");
  if (d.isp) addRow(w, "📡 运营商:", d.isp, "#E8590C");
  if (family !== "small") {
    if (d.org && d.org !== d.isp) addRow(w, "🏢 组织:", d.org, "#2B8A3E");
    if (d.asText) addRow(w, "🔢 AS:", d.asText, "#6741D9");
  }

  const df = new DateFormatter();
  df.useShortTimeStyle();
  const foot = w.addText("更新于 " + df.string(new Date()));
  foot.font = Font.roundedSystemFont(10);
  foot.textColor = new Color("#888888");
  return w;
}

function errorWidget(msg) {
  const w = new ListWidget();
  const t = w.addText("🛑 " + msg);
  t.font = Font.boldRoundedSystemFont(13);
  t.textColor = new Color("#E03131");
  return w;
}

let widget;
try {
  const data = await loadData();
  widget = await buildWidget(data);
} catch (e) {
  widget = errorWidget("查询失败,点开重试");
}

widget.url = "scriptable:///run/" + encodeURIComponent(Script.name());
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium();
}
Script.complete();
