/**
 * 出口IP信息面板 — Loon Generic Script(面板脚本)
 * 由 Muse 与 Kaggle 上的 Qwen3-14B 联合开发
 *
 * 数据源:api.ip.sb/geoip(主) / ip-api.com(备);质量行:proxycheck.io(类型/风险)+ ip-api 扩展字段(机房/移动判定)
 * 质量模块的划分与数据源参考 MaYIHEI「节点 IP 质量检测」(github.com/MaYIHEI/paperclip)
 * 用法:在仪表盘长按某个节点或策略,选择本脚本运行 -> 查询该节点的出口 IP;
 *       直接从脚本列表运行 -> 查询当前默认出口。
 * 返回格式同时带 Loon 的 htmlMessage 与通用 content/icon 字段。
 */

var NODE = null;
try {
  if (typeof $environment !== "undefined" && $environment.params && $environment.params.node) {
    NODE = $environment.params.node;
  }
} catch (e) {}

function flagEmoji(cc) {
  if (!cc || cc.length !== 2) return "🌐";
  cc = cc.toUpperCase();
  return String.fromCodePoint(0x1f1e6 + cc.charCodeAt(0) - 65, 0x1f1e6 + cc.charCodeAt(1) - 65);
}

// 每个字段值的配色:颜色是 Loon 渲染器确认可生效的文字层样式
var LINE_COLORS = [
  ["🖥 出口IP", "#D6336C"],
  ["📍 归属地", "#1971C2"],
  ["📡 运营商", "#E8590C"],
  ["🏢 组织", "#2B8A3E"],
  ["🔢 AS", "#6741D9"],
  ["🏷 类型", "#1098AD"],
  ["🛡 风险", "#2B8A3E"],
  ["🚀 节点", "#0B7285"],
  ["🛑 查询失败", "#E03131"]
];

// 个别行的颜色按数值动态决定(如风险等级),优先于上表
var DYNAMIC_COLORS = {};

function colorLine(line) {
  for (var i = 0; i < LINE_COLORS.length; i++) {
    if (line.indexOf(LINE_COLORS[i][0]) === 0) {
      var color = DYNAMIC_COLORS[LINE_COLORS[i][0]] || LINE_COLORS[i][1];
      var idx = line.indexOf(":");
      if (idx < 0) return '<span style="color:' + color + ';">' + line + "</span>";
      return line.slice(0, idx + 1) + '<span style="color:' + color + ';">' + line.slice(idx + 1) + "</span>";
    }
  }
  return line;
}

function finish(lines, ok) {
  // 内容区样式:Kaggle 模型设计(粉彩渐变卡片),字体栈经 Muse 修正为 iOS 手写感字体打头
  // 真机实测结论(2026-11-12,经 v4 标记版验证):Loon 的 htmlMessage 只渲染字体类样式
  // (字体/字号/粗细/颜色/阴影),背景、圆角、阴影框、居中一律不生效——内容区背景改不了;
  // 下列样式中实际生效的是字体部分,其余为无害冗余,保留以待 Loon 渲染器改进。
  var style =
    "background: linear-gradient(135deg, #ff9a9e, #fadfd8);" +
    "border-radius: 15px;" +
    "padding: 20px 14px;" +
    "box-shadow: 0 4px 14px rgba(255, 154, 158, 0.45);" +
    "text-align: center;" +
    "font-family: 'Chalkboard SE', 'Comic Sans MS', 'Marker Felt', 'Apple Color Emoji', -apple-system, sans-serif;" +
    "color: #333;" +
    "font-size: 16px;" +
    "font-weight: 600;" +
    "line-height: 1.8;" +
    "margin: 0;" +
    "text-shadow: 1px 1px 2px #fff;";
  var html = '<p style="' + style + '">' + lines.map(colorLine).join("</br>") + "</p>";
  $done({
    title: "🌐 出口IP信息",
    content: lines.join("\n"),
    htmlMessage: html,
    icon: "globe",
    "icon-color": ok ? "#007AFF" : "#FF3B30"
  });
}

var CURRENT_IP = "";

function req(url) {
  var p = { url: url, timeout: 4000 };
  if (NODE) p.node = NODE;
  return p;
}

function fromIpSb(data) {
  var d = JSON.parse(data);
  CURRENT_IP = d.ip || "";
  var lines = [];
  if (d.ip) lines.push("🖥 出口IP:" + d.ip);
  var loc = flagEmoji(d.country_code) + " " + (d.country || "");
  if (d.region && d.region !== d.country) loc += " · " + d.region;
  if (d.city && d.city !== d.region) loc += " · " + d.city;
  lines.push("📍 归属地:" + loc);
  if (d.isp) lines.push("📡 运营商:" + d.isp);
  if (d.organization && d.organization !== d.isp) lines.push("🏢 组织:" + d.organization);
  if (d.asn) lines.push("🔢 AS:AS" + d.asn);
  if (NODE) lines.push("🚀 节点:" + NODE);
  return lines;
}

function fromIpApi(data) {
  var d = JSON.parse(data);
  if (d.status !== "success") throw new Error("ip-api fail");
  CURRENT_IP = d.query || "";
  var lines = [];
  if (d.query) lines.push("🖥 出口IP:" + d.query);
  var loc = flagEmoji(d.countryCode) + " " + (d.country || "");
  if (d.regionName) loc += " · " + d.regionName;
  if (d.city && d.city !== d.regionName) loc += " · " + d.city;
  lines.push("📍 归属地:" + loc);
  if (d.isp) lines.push("📡 运营商:" + d.isp);
  if (d.org && d.org !== d.isp) lines.push("🏢 组织:" + d.org);
  if (d.as) lines.push("🔢 AS:" + d.as);
  if (NODE) lines.push("🚀 节点:" + NODE);
  return lines;
}

// ---- IP 质量行(参考 MaYIHEI 节点 IP 质量检测的类型/风险模块) ----
// 按 IP 查询,与节点走向无关,故走 DIRECT;任一源失败只是少一行,不影响基础信息
function typeZh(t) {
  var m = {
    Residential: "住宅",
    Hosting: "机房",
    Business: "商用",
    VPN: "VPN",
    Wireless: "移动网络",
    Education: "教育网",
    Government: "政府机构"
  };
  return m[t] || t;
}

function qualityLines(pc, ia) {
  var out = [];
  var type = "";
  if (ia && ia.hosting) type = "机房";
  else if (ia && ia.mobile) type = "移动网络";
  else if (pc && pc.type) type = typeZh(pc.type);
  if (ia && ia.proxy) type = type ? type + " · 有代理特征" : "有代理特征";
  if (type) out.push("🏷 类型:" + type);
  if (pc && typeof pc.risk === "number") {
    var r = pc.risk;
    var lv = r <= 33 ? "低风险" : r <= 66 ? "中风险" : "高风险";
    DYNAMIC_COLORS["🛡 风险"] = r <= 33 ? "#2B8A3E" : r <= 66 ? "#F08C00" : "#E03131";
    out.push("🛡 风险:" + r + " 分 · " + lv);
  }
  return out;
}

function enrich(lines) {
  var ip = CURRENT_IP;
  if (!ip) {
    finish(lines, true);
    return;
  }
  var pc = null;
  var ia = null;
  var pending = 2;
  function step() {
    if (--pending > 0) return;
    var q = qualityLines(pc, ia);
    if (q.length) {
      var idx = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf("🚀 节点") === 0) {
          idx = i;
          break;
        }
      }
      if (idx < 0) lines = lines.concat(q);
      else lines = lines.slice(0, idx).concat(q).concat(lines.slice(idx));
    }
    finish(lines, true);
  }
  $httpClient.get(
    { url: "https://proxycheck.io/v2/" + ip + "?vpn=1&asn=1&risk=1", node: "DIRECT", timeout: 4000 },
    function (e, r, d) {
      if (!e && d) {
        try {
          pc = JSON.parse(d)[ip] || null;
        } catch (x) {}
      }
      step();
    }
  );
  $httpClient.get(
    { url: "http://ip-api.com/json/" + ip + "?fields=status,proxy,hosting,mobile", node: "DIRECT", timeout: 4000 },
    function (e, r, d) {
      if (!e && d) {
        try {
          var j = JSON.parse(d);
          if (j.status === "success") ia = j;
        } catch (x) {}
      }
      step();
    }
  );
}

$httpClient.get(req("https://api.ip.sb/geoip"), function (error, response, data) {
  if (!error && data) {
    try {
      enrich(fromIpSb(data));
      return;
    } catch (e) {}
  }
  // 主数据源失败,走备用源
  $httpClient.get(
    req("http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,countryCode,regionName,city,isp,org,as"),
    function (error2, response2, data2) {
      if (!error2 && data2) {
        try {
          enrich(fromIpApi(data2));
          return;
        } catch (e) {}
      }
      finish(["🛑 查询失败,请检查网络后重试"], false);
    }
  );
});
