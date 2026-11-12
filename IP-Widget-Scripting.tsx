// 出口IP信息 — Scripting 版桌面小组件(粘贴到脚本项目的 widget.tsx)
// 数据:api.ip.sb/geoip(主,https)/ ip-api.com(备) — 与 Loon 面板同一套
// 界面:粉彩渐变背景(Kaggle 模型设计)+ 每字段独立配色 + 圆体感系统字体
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

function flagEmoji(cc: string): string {
  if (!cc || cc.length !== 2) return "🌐"
  const up = cc.toUpperCase()
  return String.fromCodePoint(0x1f1e6 + up.charCodeAt(0) - 65, 0x1f1e6 + up.charCodeAt(1) - 65)
}

async function loadData(): Promise<IpInfo> {
  try {
    const r = await fetch("https://api.ip.sb/geoip")
    const d = await r.json()
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
    const r2 = await fetch(
      "http://ip-api.com/json/?lang=zh-CN&fields=status,query,country,countryCode,regionName,city,isp,org,as"
    )
    const d = await r2.json()
    if (d.status !== "success") throw new Error("both sources failed")
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

function Row(props: { label: string; value: string; color: string }) {
  return (
    <HStack spacing={2}>
      <Text font={13} foregroundStyle="#333333">
        {props.label}
      </Text>
      <Text font={13} foregroundStyle={props.color} lineLimit={2}>
        {props.value}
      </Text>
    </HStack>
  )
}

function WidgetView(props: { d: IpInfo; time: string }) {
  const d = props.d
  const small = Widget.family === "systemSmall"
  let loc = `${flagEmoji(d.code)} ${d.country}`
  if (d.region && d.region !== d.country) loc += ` · ${d.region}`
  if (d.city && d.city !== d.region) loc += ` · ${d.city}`
  return (
    <VStack
      alignment="leading"
      spacing={5}
      padding={16}
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
        <Image
          imageUrl="https://status.vyxh.top/ip-icon.png"
          resizable
          scaleToFit
          frame={{ width: 26, height: 26 }}
        />
        <Text font={16} foregroundStyle="#333333">
          出口IP信息
        </Text>
      </HStack>
      {d.ip ? <Row label="🖥 出口IP:" value={d.ip} color="#D6336C" /> : null}
      {d.country ? <Row label="📍 归属地:" value={loc} color="#1971C2" /> : null}
      {d.isp ? <Row label="📡 运营商:" value={d.isp} color="#E8590C" /> : null}
      {!small && d.org && d.org !== d.isp ? (
        <Row label="🏢 组织:" value={d.org} color="#2B8A3E" />
      ) : null}
      {!small && d.asText ? <Row label="🔢 AS:" value={d.asText} color="#6741D9" /> : null}
      <Spacer />
      <Text font={10} foregroundStyle="#888888">
        {`更新于 ${props.time}`}
      </Text>
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
    const d = await loadData()
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    Widget.present(<WidgetView d={d} time={time} />)
  } catch (e) {
    Widget.present(<ErrorView />)
  }
}

main()
