// 出口IP信息 — Scripting 版桌面小组件(粘贴到脚本项目的 widget.tsx)
// v1.4:双栏右栏新增「服务状态」—— 读 Uptime Kuma 公开状态页 API(status.vyxh.top),
//       显示 7 项自有服务的实时状态与延迟;延迟模块移至左栏平衡双栏高度。
// v1.3:大号/特大号改双栏 —— 左栏基础信息+组织+时区,右栏「流媒体与 AI 解锁 + 延迟」;
//       中号/小号维持单栏紧凑版。媒体探测:Netflix 双片状态码 / YouTube Premium 地区 /
//       TikTok 页面地区 / ChatGPT trace;延迟:Cloudflare 与 Google 的 204 端点计时。
//       全部探测并行且带 4-5 秒超时,失败只显示「未知」,不会拖垮渲染。
// v1.2:中号高度压缩(更新时间并入标题行、去掉组织行、收紧间距),解决上下溢出裁切。
// v1.1:标题图标用 SF Symbol(远程大图加载失败且吃内存);归属地「国家 · 城市」防截断;
//       新增类型/风险行;请求超时保护。
// 数据:api.ip.sb/geoip(主)/ ip-api.com(备);质量:proxycheck.io + ip-api 扩展字段
// 显示手机当前默认出口(经 Loon 默认策略);刷新节奏由 iOS 决定
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
  tz: string
}

type Quality = {
  typeText: string
  risk: number | null
}

type ServiceStatus = {
  text: string
  color: string
}

type Extras = {
  netflix: ServiceStatus
  youtube: ServiceStatus
  tiktok: ServiceStatus
  chatgpt: ServiceStatus
  cfMs: number | null
  ggMs: number | null
}

type SvcItem = {
  name: string
  up: boolean
  ping: number | null
}

type StatusInfo = {
  total: number
  upCount: number
  items: SvcItem[]
}

const UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

const UNKNOWN: ServiceStatus = { text: "未知", color: "#999999" }

function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return "🌐"
  const up = cc.toUpperCase()
  return String.fromCodePoint(0x1f1e6 + up.charCodeAt(0) - 65, 0x1f1e6 + up.charCodeAt(1) - 65)
}

function withTimeout<T>(job: Promise<T>, ms: number): Promise<T> {
  const timeout = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error("timeout")), ms)
  )
  return Promise.race([job, timeout])
}

function fetchJson(url: string, ms: number): Promise<any> {
  return withTimeout(
    fetch(url).then((r) => r.json()),
    ms
  )
}

async function fetchText(
  url: string,
  ms: number
): Promise<{ status: number; text: string }> {
  const job = (async () => {
    const r = await fetch(url, { headers: { "User-Agent": UA } })
    const text = await r.text()
    return { status: r.status, text }
  })()
  return withTimeout(job, ms)
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
      tz: d.timezone ?? "",
    }
  } catch (e) {
    const d = await fetchJson(
      "http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,countryCode,regionName,city,isp,org,as,timezone",
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
      tz: d.timezone ?? "",
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

// ---- 流媒体与 AI 探测(经当前出口访问各服务,判断解锁与地区) ----
async function probeNetflix(): Promise<ServiceStatus> {
  try {
    const rs = await Promise.all([
      fetchText("https://www.netflix.com/title/81280792", 5000),
      fetchText("https://www.netflix.com/title/70143836", 5000),
    ])
    const a = rs[0].status
    const b = rs[1].status
    if (a === 403 || b === 403) return { text: "未知 · 疑被拦", color: "#999999" }
    if (a === 200 && b === 200) return { text: "全解锁", color: "#2B8A3E" }
    if (a === 200) return { text: "仅自制剧", color: "#F08C00" }
    return { text: "未提供服务", color: "#E03131" }
  } catch (e) {
    return UNKNOWN
  }
}

async function probeYouTube(): Promise<ServiceStatus> {
  try {
    const r = await fetchText("https://www.youtube.com/premium", 5000)
    const m =
      r.text.match(/"gl"\s*:\s*"([A-Z]{2})"/) ||
      r.text.match(/"countryCode"\s*:\s*"([A-Z]{2})"/)
    if (m) return { text: `可用 · ${m[1]}`, color: "#2B8A3E" }
    if (r.text.length > 5000 && r.text.indexOf("Premium") >= 0)
      return { text: "可用", color: "#2B8A3E" }
    return UNKNOWN
  } catch (e) {
    return UNKNOWN
  }
}

async function probeTikTok(): Promise<ServiceStatus> {
  try {
    const r = await fetchText("https://www.tiktok.com/", 5000)
    const m =
      r.text.match(/"region"\s*:\s*"([A-Z]{2})"/i) ||
      r.text.match(/"storeCountry"\s*:\s*"([A-Z]{2})"/i)
    if (m) return { text: `可用 · ${m[1].toUpperCase()}`, color: "#2B8A3E" }
    return UNKNOWN
  } catch (e) {
    return UNKNOWN
  }
}

async function probeChatGPT(): Promise<ServiceStatus> {
  try {
    const r = await fetchText("https://chatgpt.com/cdn-cgi/trace", 5000)
    const m = r.text.match(/loc=([A-Z]{2})/)
    if (m) return { text: `可用 · ${m[1]}`, color: "#2B8A3E" }
    return UNKNOWN
  } catch (e) {
    return UNKNOWN
  }
}

async function ping(url: string): Promise<number | null> {
  try {
    const t0 = Date.now()
    await fetchText(url, 4000)
    return Date.now() - t0
  } catch (e) {
    return null
  }
}

async function loadExtras(): Promise<Extras> {
  const rs = await Promise.all([
    probeNetflix(),
    probeYouTube(),
    probeTikTok(),
    probeChatGPT(),
    ping("https://cp.cloudflare.com/generate_204"),
    ping("https://www.google.com/generate_204"),
  ])
  return {
    netflix: rs[0] as ServiceStatus,
    youtube: rs[1] as ServiceStatus,
    tiktok: rs[2] as ServiceStatus,
    chatgpt: rs[3] as ServiceStatus,
    cfMs: rs[4] as number | null,
    ggMs: rs[5] as number | null,
  }
}

// ---- VPS 服务状态(Uptime Kuma 公开状态页 API,免登录) ----
const SVC_SHORT: Record<number, string> = {
  6: "VLESS 节点",
  7: "ShadowTLS",
  8: "SS2022",
  9: "SSH",
  10: "状态页",
  11: "MiBot",
  12: "PM 中继",
}

async function loadStatus(): Promise<StatusInfo | null> {
  try {
    const rs = await Promise.all([
      fetchJson("https://status.vyxh.top/api/status-page/main", 5000),
      fetchJson("https://status.vyxh.top/api/status-page/heartbeat/main", 5000),
    ])
    const cfg = rs[0]
    const hb = rs[1]
    const items: SvcItem[] = []
    let upCount = 0
    const groups = (cfg && cfg.publicGroupList) || []
    for (const g of groups) {
      const list = (g && g.monitorList) || []
      for (const m of list) {
        const beats = (hb && hb.heartbeatList && hb.heartbeatList[String(m.id)]) || []
        const last = beats.length ? beats[beats.length - 1] : null
        const up = !!last && last.status === 1
        if (up) upCount++
        items.push({
          name: SVC_SHORT[m.id as number] || String(m.name || m.id),
          up,
          ping: last && typeof last.ping === "number" ? last.ping : null,
        })
      }
    }
    if (!items.length) return null
    return { total: items.length, upCount, items }
  } catch (e) {
    return null
  }
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

function SectionTitle(props: { text: string }) {
  return (
    <Text font={12} foregroundStyle="#333333">
      {props.text}
    </Text>
  )
}

function isWideFamily(): boolean {
  const f = Widget.family
  return f === "systemLarge" || f === "systemExtraLarge" || f === "systemExtraLargePortrait"
}

function WidgetView(props: {
  d: IpInfo
  q: Quality
  x: Extras | null
  st: StatusInfo | null
  time: string
}) {
  const d = props.d
  const q = props.q
  const ex = props.x as Extras
  const st = props.st
  const small = Widget.family === "systemSmall"
  const wide = isWideFamily() && props.x !== null
  const rowSize = wide ? 12 : small ? 12 : 13
  let loc = `${flagEmoji(d.code)} ${d.country}`
  const place = d.city || d.region
  if (place && place !== d.country) loc += ` · ${place}`

  const infoRows: any[] = []
  if (d.ip)
    infoRows.push(<Row key="ip" label="🖥 出口IP:" value={d.ip} color="#D6336C" size={rowSize} />)
  if (d.country)
    infoRows.push(
      <Row key="loc" label="📍 归属地:" value={loc} color="#1971C2" size={rowSize} />
    )
  if (!small && d.isp)
    infoRows.push(
      <Row key="isp" label="📡 运营商:" value={d.isp} color="#E8590C" size={rowSize} />
    )
  if (!small && d.asText)
    infoRows.push(
      <Row key="as" label="🔢 AS:" value={d.asText} color="#6741D9" size={rowSize} />
    )
  if (q.typeText)
    infoRows.push(
      <Row key="type" label="🏷 类型:" value={q.typeText} color="#1098AD" size={rowSize} />
    )
  if (q.risk !== null)
    infoRows.push(
      <Row
        key="risk"
        label="🛡 风险:"
        value={`${q.risk} 分 · ${riskLabel(q.risk)}`}
        color={riskColor(q.risk)}
        size={rowSize}
      />
    )

  const svcRows: any[] = []
  if (st) {
    st.items.forEach((it, i) => {
      svcRows.push(
        <Row
          key={`svc${i}`}
          label={`${it.name}:`}
          value={it.up ? `正常${it.ping !== null ? ` · ${it.ping}ms` : ""}` : "异常"}
          color={it.up ? "#2B8A3E" : "#E03131"}
          size={11}
        />
      )
    })
  } else if (wide) {
    svcRows.push(
      <Row key="svcx" label="状态页:" value="不可达" color="#E03131" size={11} />
    )
  }

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
      {wide ? (
        <HStack spacing={14} alignment="top">
          <VStack alignment="leading" spacing={4} frame={{ maxWidth: "infinity" }}>
            {infoRows}
            {d.org ? (
              <Row label="🏢 组织:" value={d.org} color="#2B8A3E" size={rowSize} />
            ) : null}
            {d.tz ? <Row label="🕐 时区:" value={d.tz} color="#868E96" size={rowSize} /> : null}
            <SectionTitle text="⚡ 延迟" />
            <Row
              label="☁️ Cloudflare:"
              value={ex.cfMs !== null ? `${ex.cfMs} ms` : "超时"}
              color="#495057"
              size={rowSize}
            />
            <Row
              label="🔍 Google:"
              value={ex.ggMs !== null ? `${ex.ggMs} ms` : "超时"}
              color="#495057"
              size={rowSize}
            />
          </VStack>
          <VStack alignment="leading" spacing={3} frame={{ maxWidth: "infinity" }}>
            <SectionTitle text="🎬 流媒体与 AI" />
            <Row label="🎞 Netflix:" value={ex.netflix.text} color={ex.netflix.color} size={rowSize} />
            <Row label="📺 YouTube:" value={ex.youtube.text} color={ex.youtube.color} size={rowSize} />
            <Row label="🎵 TikTok:" value={ex.tiktok.text} color={ex.tiktok.color} size={rowSize} />
            <Row label="🤖 ChatGPT:" value={ex.chatgpt.text} color={ex.chatgpt.color} size={rowSize} />
            <SectionTitle
              text={st ? `📡 服务状态 ${st.upCount}/${st.total} 正常` : "📡 服务状态"}
            />
            {svcRows}
          </VStack>
        </HStack>
      ) : (
        infoRows
      )}
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
    let x: Extras | null = null
    let st: StatusInfo | null = null
    if (isWideFamily()) {
      const both = await Promise.all([loadExtras(), loadStatus()])
      x = both[0]
      st = both[1]
    }
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    Widget.present(<WidgetView d={d} q={q} x={x} st={st} time={time} />)
  } catch (e) {
    Widget.present(<ErrorView />)
  }
}

main()
