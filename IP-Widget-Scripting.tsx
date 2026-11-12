// 出口IP信息 — Scripting 版桌面小组件(粘贴到脚本项目的 widget.tsx)
// v1.2:中号高度放不下 8 行会上下溢出裁切,故压缩布局 —— 更新时间并入标题行、
//       组织行去掉(与运营商多为同一信息,面板版保留)、间距与内边距收紧。
// v1.1:标题图标改用系统 SF Symbol(远程大图在小组件里加载失败且吃内存,官方亦建议少用图);
//       归属地改「国家 · 城市」短组合 + 值文本弹性宽度,解决截断;
//       新增「类型 / 风险」两行(与 Loon 面板版同款数据源);全部请求带超时,慢源不会拖死渲染。
// 数据:api.ip.sb/geoip(主,https)/ ip-api.com(备);质量:proxycheck.io + ip-api 扩展字段
// 显示手机当前默认出口(经 Loon 默认策略);刷新节奏由 iOS 决定,底部有更新时间
import { HStack, Image, Spacer, Text, VStack, Widget } from "scripting"

type IpInfo = {
  ip: string
  country: string
  code: string
  region: string
  city: string
  isp: string
  org: string
  asText: string
}

type Quality = {
  typeText: string
  risk: number | null
}

function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return "🌐"
  const up = cc.toUpperCase()
  return String.fromCodePoint(0x1f1e6 + up.charCodeAt(0) - 65, 0x1f1e6 + up.charCodeAt(1) - 65)
}

function fetchJson(url: string, ms: number): Promise<any> {
  const timeout = new Promise<any>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  )
  return Promise.race([
    fetch(url).then((r) => r.json()),
    timeout,
  ])
}

async function loadBasic(): Promise<IpInfo> {
  try {
    const d = await fetchJson("https://api.ip.sb/geoip", 6000)
    if (!d || !d.ip) throw new Error("ip.sb empty")
    return {
      ip: d.ip ?? "",
      country: d.country ?? "",
      code: d.country_code ?? "",
      region: d.region ?? "",
      city: d.city ?? "",
      isp: d.isp ?? "",
      org: d.organization ?? "",
      asText: d.asn ? `AS${d.asn}` : "",
    }
  } catch (e) {
    const d = await fetchJson(
      "http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,countryCode,regionName,city,isp,org,as",
      5000
    )
    if (!d || d.status !== "success") throw new Error("both sources failed")
    return {
      ip: d.query ?? "",
      country: d.country ?? "",
      code: d.countryCode ?? "",
      region: d.regionName ?? "",
      city: d.city ?? "",
      isp: d.isp ?? "",
      org: d.org ?? "",
      asText: d.as ?? "",
    }
  }
}

function typeZh(t: string): string {
  const m: Record<string, string> = {
    Residential: "住宅",
    Hosting: "机房",
    Business: "商用",
    VPN: "VPN",
    Wireless: "移动网络",
    Education: "教育网",
    Government: "政府机构",
  }
  return m[t] || t
}

async function loadQuality(ip: string): Promise<Quality> {
  let pc: any = null
  let ia: any = null
  const jobs = [
    fetchJson(`https://proxycheck.io/v2/${ip}?vpn=1&asn=1&risk=1`, 4000)
      .then((j) => {
        if (j && j[ip]) pc = j[ip]
      })
      .catch(() => {}),
    fetchJson(`http://ip-api.com/json/${ip}?fields=status,proxy,hosting,mobile`, 4000)
      .then((j) => {
        if (j && j.status === "success") ia = j
      })
      .catch(() => {}),
  ]
  await Promise.all(jobs)
  let typeText = ""
  if (ia && ia.hosting) typeText = "机房"
  else if (ia && ia.mobile) typeText = "移动网络"
  else if (pc && pc.type) typeText = typeZh(pc.type)
  if (ia && ia.proxy) typeText = typeText ? typeText + " · 有代理特征" : "有代理特征"
  const risk = pc && typeof pc.risk === "number" ? pc.risk : null
  return { typeText, risk }
}

function riskLabel(risk: number): string {
  return risk <= 33 ? "低风险" : risk <= 66 ? "中风险" : "高风险"
}

function riskColor(risk: number): string {
  return risk <= 33 ? "#2B8A3E" : risk <= 66 ? "#F08C00" : "#E03131"
}

function Row(props: { label: string; value: string; color: string; size: number }) {
  return (
    <HStack spacing={2}>
      <Text font={props.size} foregroundStyle="#333333" lineLimit={1}>
        {props.label}
      </Text>
      <Text
        font={props.size}
        foregroundStyle={props.color}
        lineLimit={2}
        frame={{ maxWidth: "infinity", alignment: "leading" }}
      >
        {props.value}
      </Text>
    </HStack>
  )
}

function WidgetView(props: { d: IpInfo; q: Quality; time: string }) {
  const d = props.d
  const q = props.q
  const small = Widget.family === "systemSmall"
  const rowSize = small ? 12 : 13
  let loc = `${flagEmoji(d.code)} ${d.country}`
  const place = d.city || d.region
  if (place && place !== d.country) loc += ` · ${place}`
  return (
    <VStack
      alignment="leading"
      spacing={4}
      padding={small ? 13 : 14}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      background={{
        gradient: [
          { color: "#ff9a9e", location: 0 },
          { color: "#fadfd8", location: 1 },
        ],
        startPoint: { x: 0, y: 0 },
        endPoint: { x: 1, y: 1 },
      }}
    >
      <HStack spacing={6}>
        <Image systemName="globe" resizable scaleToFit frame={{ width: 20, height: 20 }} />
        <Text font={15} foregroundStyle="#333333">
          出口IP信息
        </Text>
        <Spacer />
        <Text font={9} foregroundStyle="#888888">
          {`更新于 ${props.time}`}
        </Text>
      </HStack>
      {d.ip ? <Row label="🖥 出口IP:" value={d.ip} color="#D6336C" size={rowSize} /> : null}
      {d.country ? <Row label="📍 归属地:" value={loc} color="#1971C2" size={rowSize} /> : null}
      {!small && d.isp ? (
        <Row label="📡 运营商:" value={d.isp} color="#E8590C" size={rowSize} />
      ) : null}
      {!small && d.asText ? (
        <Row label="🔢 AS:" value={d.asText} color="#6741D9" size={rowSize} />
      ) : null}
      {q.typeText ? (
        <Row label="🏷 类型:" value={q.typeText} color="#1098AD" size={rowSize} />
      ) : null}
      {q.risk !== null ? (
        <Row
          label="🛡 风险:"
          value={`${q.risk} 分 · ${riskLabel(q.risk)}`}
          color={riskColor(q.risk)}
          size={rowSize}
        />
      ) : null}
      <Spacer />
    </VStack>
  )
}

function ErrorView() {
  return (
    <VStack alignment="leading" padding={16}>
      <Text font={13} foregroundStyle="#E03131">
        🛑 查询失败,请检查网络后重试
      </Text>
    </VStack>
  )
}

async function main() {
  try {
    const d = await loadBasic()
    const q: Quality = d.ip ? await loadQuality(d.ip) : { typeText: "", risk: null }
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    Widget.present(<WidgetView d={d} q={q} time={time} />)
  } catch (e) {
    Widget.present(<ErrorView />)
  }
}

main()
