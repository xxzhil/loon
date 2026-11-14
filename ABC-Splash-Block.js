// 农行开屏拦截 — 按 Operation-Type 拦截农业银行 App 的三条 mPaaS RPC 通道
// 三条通道共用同一个网关地址 /mgw.htm,只能靠请求头 Operation-Type 区分,
// 所以用 http-request 脚本判断:命中开启的通道就回一个空 200,让 RPC 软失败,
// App 拿不到开屏配置/素材就走默认流程。未命中的请求原样放行。
const args = $argument || {};
function on(v) {
  return v === true || v === "true";
}
const BLOCK = {
  "alipay.client.getUnionResource": on(args.UnionResource),
  "com.abchina.mbank.common.homepage.getStartParam": on(args.StartParam),
  "alipay.client.mcube.custom.resource": on(args.Mcube),
};

let op = "";
const headers = $request.headers || {};
for (const k of Object.keys(headers)) {
  const lk = k.toLowerCase();
  if (lk === "operation-type" || lk === "operationtype") {
    op = String(headers[k]).trim();
    break;
  }
}

if (op && BLOCK[op]) {
  console.log(`[农行开屏拦截] 已拦截 ${op}`);
  $done({
    response: {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=UTF-8" },
      body: "",
    },
  });
} else {
  $done({});
}
