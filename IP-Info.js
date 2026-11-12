/**
 * 出口IP信息面板 — Loon Generic Script(面板脚本)
 * 由 Muse 与 Kaggle 上的 Qwen3-14B 联合开发
 *
 * 数据源:api.ip.sb/geoip(主) / ip-api.com(备)
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

function finish(lines, ok) {
  var html =
    '<p style="text-align: center; font-family: -apple-system; font-size: large;">' +
    lines.join("</br>") +
    "</p>";
  $done({
    title: "🌐 出口IP信息",
    content: lines.join("\n"),
    htmlMessage: html,
    icon: "globe",
    "icon-color": ok ? "#007AFF" : "#FF3B30"
  });
}

function req(url) {
  var p = { url: url, timeout: 4000 };
  if (NODE) p.node = NODE;
  return p;
}

function fromIpSb(data) {
  var d = JSON.parse(data);
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

$httpClient.get(req("https://api.ip.sb/geoip"), function (error, response, data) {
  if (!error && data) {
    try {
      finish(fromIpSb(data), true);
      return;
    } catch (e) {}
  }
  // 主数据源失败,走备用源
  $httpClient.get(
    req("http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,countryCode,regionName,city,isp,org,as"),
    function (error2, response2, data2) {
      if (!error2 && data2) {
        try {
          finish(fromIpApi(data2), true);
          return;
        } catch (e) {}
      }
      finish(["🛑 查询失败,请检查网络后重试"], false);
    }
  );
});
