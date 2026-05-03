import { useState, useEffect, useRef } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  ReferenceLine, ResponsiveContainer, Cell, LineChart, Tooltip,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════════
//  Indicator Math
// ═══════════════════════════════════════════════════════════════════════════════
const calcMA = (a, n) => a.map((_, i) =>
  i < n - 1 ? null : a.slice(i - n + 1, i + 1).reduce((x, y) => x + y, 0) / n);

function calcRSI(c, p = 14) {
  const r = Array(c.length).fill(null);
  if (c.length <= p) return r;
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) { const d = c[i] - c[i - 1]; d > 0 ? ag += d : al -= d; }
  ag /= p; al /= p;
  r[p] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = p + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    ag = (ag * (p - 1) + Math.max(d, 0)) / p;
    al = (al * (p - 1) + Math.max(-d, 0)) / p;
    r[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return r;
}

function calcEMA(v, p) {
  const k = 2 / (p + 1), r = Array(v.length).fill(null);
  let prev = null;
  for (let i = 0; i < v.length; i++) {
    if (v[i] == null) continue;
    prev = prev === null ? v[i] : v[i] * k + prev * (1 - k);
    r[i] = prev;
  }
  return r;
}

function calcMACD(c) {
  const e12 = calcEMA(c, 12), e26 = calcEMA(c, 26);
  const dif = e12.map((v, i) => v != null && e26[i] != null ? v - e26[i] : null);
  const dea = calcEMA(dif.map(v => v ?? 0), 9);
  const hist = dif.map((v, i) => v != null && dea[i] != null ? (v - dea[i]) * 2 : null);
  return { dif, dea, hist };
}

function calcKD(h, l, c, p = 9) {
  const n = c.length, K = Array(n).fill(50), D = Array(n).fill(50);
  for (let i = 0; i < n; i++) {
    const s = Math.max(0, i - p + 1);
    const hh = Math.max(...h.slice(s, i + 1)), ll = Math.min(...l.slice(s, i + 1));
    const rsv = hh === ll ? 50 : (c[i] - ll) / (hh - ll) * 100;
    K[i] = i > 0 ? (2 / 3) * K[i - 1] + (1 / 3) * rsv : rsv;
    D[i] = i > 0 ? (2 / 3) * D[i - 1] + (1 / 3) * K[i] : K[i];
  }
  return { K, D };
}

// 布林通道 Bollinger Bands (20 期, ±2σ)
function calcBB(c, p = 20, k = 2) {
  return c.map((_, i) => {
    if (i < p - 1) return { upper: null, mid: null, lower: null };
    const s = c.slice(i - p + 1, i + 1);
    const m = s.reduce((a, b) => a + b, 0) / p;
    const std = Math.sqrt(s.reduce((a, b) => a + (b - m) ** 2, 0) / p);
    return { upper: m + k * std, mid: m, lower: m - k * std };
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Technical Analysis
// ═══════════════════════════════════════════════════════════════════════════════
function analyzeStock(price, candles, ind) {
  const { ma5, ma20, ma60, rsi, kdK, kdD, dif, dea, macd } = ind;
  const f = v => price >= 100 ? Math.round(v) : +(v.toFixed(2));

  let trend = "盤整";
  if (price > ma5 && price > ma20 && price > ma60) trend = "多頭趨勢";
  else if (price < ma5 && price < ma20 && price < ma60) trend = "空頭趨勢";
  else if (price > ma20 && price > ma60) trend = "高檔整理";
  else if (price < ma20 && price < ma60) trend = "低檔整理";

  let maStatus = "糾結整理";
  if (ma5 > ma20 && ma20 > ma60) maStatus = "多頭排列";
  else if (ma5 < ma20 && ma20 < ma60) maStatus = "空頭排列";
  else if (ma5 > ma20) maStatus = "短中期偏多";

  let kdStatus = "正常";
  if (kdK > 80) kdStatus = "高檔鈍化";
  else if (kdK < 20) kdStatus = "低檔超賣";
  else if (kdK > kdD && kdK < 50) kdStatus = "低檔黃金交叉";
  else if (kdK < kdD && kdK > 50) kdStatus = "高檔死亡交叉";

  let macdStatus = "中性";
  if (dif > 0 && macd > 0) macdStatus = "多頭擴張";
  else if (dif > 0 && macd < 0) macdStatus = "多頭收斂";
  else if (dif < 0 && macd < 0) macdStatus = "空頭擴張";
  else if (dif < 0 && macd > 0) macdStatus = "空頭收斂";

  const vols = candles.map(c => c.volume);
  const avg5Vol  = vols.slice(-5).reduce((s, v) => s + v, 0) / 5;
  const avg20Vol = vols.slice(-25, -5).reduce((s, v) => s + v, 0) / 20;
  const volRatio = avg5Vol / Math.max(avg20Vol, 1);
  const priceUp  = candles.slice(-1)[0].close >= candles.slice(-2)[0]?.close;

  let volStatus = "量能平穩", pvNote = "整理待變";
  if (volRatio > 1.3 && priceUp)  { volStatus = "放量上漲"; pvNote = "量價配合"; }
  else if (volRatio > 1.3)         { volStatus = "放量下跌"; pvNote = "賣壓沉重"; }
  else if (volRatio < 0.7)         { volStatus = "縮量回檔"; pvNote = "觀望氣氛"; }

  const r20 = candles.slice(-20), r60 = candles.slice(-60);
  const r1 = f(Math.max(...r20.map(c => c.high)));
  const r2 = f(Math.max(...r60.map(c => c.high)));
  const s1 = f(Math.min(...r20.map(c => c.low)));
  const s2 = f(Math.min(...r60.map(c => c.low)));
  const strongSupport = f(ma60);
  const stopLoss = f(ma60 * 0.97);

  let tScore = 50;
  if (price > ma5 && ma5 > ma20 && ma20 > ma60) tScore += 15;
  else if (price < ma5 && ma5 < ma20 && ma20 < ma60) tScore -= 15;
  else if (price > ma20) tScore += 6;
  else tScore -= 6;
  if (rsi < 30) tScore += 20;
  else if (rsi < 45) tScore += 8;
  else if (rsi > 70) tScore -= 20;
  else if (rsi > 60) tScore -= 8;
  if (dif > dea && dif > 0) tScore += 8;
  else if (dif < dea && dif < 0) tScore -= 8;
  if (kdK < 20 && kdD < 20) tScore += 10;
  else if (kdK > 80 && kdD > 80) tScore -= 10;
  tScore = Math.max(0, Math.min(100, Math.round(tScore)));

  let winRate = 50;
  if (trend.includes("多")) winRate += 8;
  if (trend.includes("空")) winRate -= 8;
  if (maStatus.includes("多頭排列")) winRate += 7;
  if (maStatus.includes("空頭排列")) winRate -= 7;
  if (kdStatus.includes("黃金")) winRate += 5;
  if (kdStatus.includes("死亡")) winRate -= 5;
  if (volStatus === "放量上漲") winRate += 5;
  if (volStatus === "放量下跌") winRate -= 5;
  if (rsi > 70) winRate -= 8;
  if (rsi < 30) winRate += 5;
  winRate = Math.max(25, Math.min(80, Math.round(winRate)));

  const conclusion = `${trend}，${maStatus}，KD ${kdStatus}，${volStatus}`;
  const techConclude = rsi > 70
    ? "短線漲幅過大，技術面偏過熱，容易出現拉回震盪。"
    : rsi < 30
    ? "RSI 超賣，有短線反彈空間，量能配合轉強再確認。"
    : tScore >= 60
    ? "技術面偏多，均線多頭排列，趨勢向上。"
    : tScore <= 40
    ? "技術面偏弱，均線空頭排列，謹慎持有。"
    : "技術面中性，盤整待變，等待量能突破。";

  return {
    trend, maStatus, kdStatus, macdStatus, volStatus, pvNote,
    r1, r2, s1, s2, strongSupport, stopLoss,
    tScore, winRate, conclusion, techConclude,
    trendLabel: tScore >= 60 ? "偏強" : tScore >= 45 ? "中性" : "偏弱",
    techLabel:  rsi > 70 ? "過熱" : tScore >= 60 ? "偏強" : tScore >= 45 ? "中性" : "偏弱",
    path1cond: `突破 ${r1}`, path1target: f(r1 * 1.04),
    path2cond: `跌破 ${s1}`, path2target: f((s1 + ma20) / 2),
    path3cond: `跌破 ${strongSupport}`, path3target: stopLoss,
    entry: `${f(price * 0.97)}～${f(price * 0.99)}`,
    stop: stopLoss, t1: r1, t2: r2,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Chip Analysis
// ═══════════════════════════════════════════════════════════════════════════════
function analyzeChip(instData, marginData) {
  if (!instData.length) return null;
  let cScore = 50;
  const rec5 = instData.slice(-5);
  const total5   = rec5.reduce((s, d) => s + d.total,   0);
  const foreign5 = rec5.reduce((s, d) => s + d.foreign, 0);
  const trust5   = rec5.reduce((s, d) => s + d.trust,   0);
  if      (total5 >  5000) cScore += 20;
  else if (total5 >  1000) cScore += 10;
  else if (total5 < -5000) cScore -= 20;
  else if (total5 < -1000) cScore -= 10;
  if      (foreign5 >  3000) cScore += 10;
  else if (foreign5 < -3000) cScore -= 10;
  if      (trust5 >  500) cScore += 5;
  else if (trust5 < -500) cScore -= 5;
  if (marginData.length >= 2) {
    const mChg = marginData.at(-1).margin_balance - marginData.at(-2).margin_balance;
    if (mChg < 0) cScore += 8;
    else if (mChg > 0) cScore -= 5;
  }
  cScore = Math.max(0, Math.min(100, Math.round(cScore)));
  const rec10 = instData.slice(-10);
  const mainNet10  = rec10.reduce((s, d) => s + d.dealer,  0);
  const totalNet10 = rec10.reduce((s, d) => s + d.total,   0);
  const chipLabel  = cScore >= 60 ? "偏多" : cScore >= 45 ? "觀察" : "偏空";
  const chipConc   = foreign5 < -1000
    ? "外資持續賣超，若股價同步上漲代表籌碼分歧，追高風險高。"
    : foreign5 >  1000
    ? "外資持續買超，籌碼面偏正向，支撐股價上行。"
    : "法人動向中性，籌碼面尚待觀察。";
  return { cScore, total5, foreign5, trust5, mainNet10, totalNet10, chipLabel, chipConc };
}

function calcFullSignal(ai, chip) {
  const t = ai?.tScore ?? 50;
  const c = chip?.cScore ?? 50;
  const total = Math.round(t * 0.4 + c * 0.4 + 50 * 0.2);
  let action, char, color, desc;
  if      (total >= 72) { action = "強力做多"; char = "買"; color = "#f87171"; desc = "技術與籌碼均強，可積極布局"; }
  else if (total >= 58) { action = "偏多觀察"; char = "買"; color = "#fb923c"; desc = "多項指標偏多，可逢回分批買進"; }
  else if (total >= 44) { action = "中性觀望"; char = "觀"; color = "#fbbf24"; desc = "訊號混合，等待方向明確再行動"; }
  else if (total >= 30) { action = "偏空觀察"; char = "賣"; color = "#a3e635"; desc = "指標轉弱，建議減碼或停利"; }
  else                  { action = "強力規避"; char = "賣"; color = "#4ade80"; desc = "技術與籌碼均弱，大幅降低部位"; }
  const rsi = ai?.rsi ?? 50;
  const subtitle =
    rsi > 75 ? "短線過熱，等待回測" :
    rsi > 70 ? "短線偏強，高檔追高風險大" :
    total >= 65 ? "短線偏強，回檔找買點" :
    total >= 55 ? "趨勢偏多，注意量能配合" :
    total <= 35 ? "弱勢格局，謹慎操作" :
    total <= 45 ? "趨勢偏弱，觀望為宜" :
    "盤整震盪，等待方向確立";
  return { action, char, color, total, desc, subtitle };
}

function calcWinRate(ai, chip) {
  let wr = ai?.winRate ?? 50;
  if (chip) {
    if (chip.cScore >= 70) wr += 5;
    else if (chip.cScore >= 60) wr += 2;
    else if (chip.cScore <= 30) wr -= 8;
    else if (chip.cScore <= 40) wr -= 4;
    if (chip.foreign5 < -2000) wr -= 5;
  }
  return Math.max(20, Math.min(82, Math.round(wr)));
}

function calcMainForceWarning(ai, chip, pricePct) {
  if (!chip) return { stars: 1, level: "正常", desc: "籌碼健康，無明顯出貨跡象" };
  let stars = 1;
  if (pricePct > 0 && chip.foreign5 < 0) stars += 2;
  else if (pricePct > 0 && chip.cScore < 45) stars += 1;
  if ((ai?.rsi ?? 50) > 70) stars += 1;
  if ((ai?.tScore ?? 50) > 65 && chip.cScore < 40) stars += 1;
  stars = Math.min(5, stars);
  const [level, desc] =
    stars >= 4 ? ["高度警戒", "主力明顯出貨，建議大幅降低部位"] :
    stars >= 3 ? ["中度觀察", "短線籌碼轉弱，疑似出貨，請降低部位"] :
    stars >= 2 ? ["輕度注意", "輕度籌碼分歧，持股可設移動停利"] :
                 ["正常",     "籌碼健康，無明顯出貨跡象"];
  return { stars, level, desc };
}

function genRecommendations(ai, chip) {
  const rsi    = ai?.rsi    ?? 50;
  const tScore = ai?.tScore ?? 50;
  const s1     = ai?.s1     ?? "—";
  const r1     = ai?.r1     ?? "—";
  const stop   = ai?.stop   ?? "—";
  const ma20   = ai?.ma20   != null ? +ai.ma20.toFixed(2) : "—";
  const ma60   = ai?.ma60   != null ? +ai.ma60.toFixed(2) : "—";
  const kdK    = ai?.kdK    ?? 50;
  const dif    = ai?.dif    ?? 0;
  const dea    = ai?.dea    ?? 0;
  const volStatus  = ai?.volStatus  ?? "";
  const maStatus   = ai?.maStatus   ?? "";

  const bulls = [];

  // ① RSI
  if (rsi > 78)
    bulls.push(`RSI ${rsi.toFixed(1)} 嚴重超買，短線隨時拉回，建議不追高，等回測 ${s1} 支撐再評估`);
  else if (rsi > 70)
    bulls.push(`RSI ${rsi.toFixed(1)} 進入超買區，短線漲幅過大，可分批停利保護獲利`);
  else if (rsi > 60)
    bulls.push(`RSI ${rsi.toFixed(1)} 偏強但未過熱，趨勢向上，回檔至 ${ma20} 附近可考慮布局`);
  else if (rsi < 25)
    bulls.push(`RSI ${rsi.toFixed(1)} 極度超賣，短線有強彈機會，量能放大確認後再進場`);
  else if (rsi < 35)
    bulls.push(`RSI ${rsi.toFixed(1)} 超賣，等待量能轉強訊號，守住 ${s1} 再分批承接`);
  else if (rsi < 45)
    bulls.push(`RSI ${rsi.toFixed(1)} 偏弱，暫時觀望，等跌深反彈或守穩 ${ma20} 再行動`);
  else
    bulls.push(`RSI ${rsi.toFixed(1)} 中性，等待突破 ${r1} 壓力或量能明顯放大再介入`);

  // ② 均線
  if (maStatus.includes("多頭排列"))
    bulls.push(`均線多頭排列（MA20:${ma20}↑），回測不破 ${ma20} 視為健康整理，可持股`);
  else if (maStatus.includes("空頭排列"))
    bulls.push(`均線空頭排列（MA20:${ma20}↓），反彈至 ${ma20} 附近視為壓力，宜減碼`);
  else if (maStatus.includes("短中期偏多"))
    bulls.push(`短中期均線偏多，但長線 MA60:${ma60} 待確認，操作以短線為主`);
  else
    bulls.push(`均線糾結整理，等待均線方向明確（觀察 MA20:${ma20} 是否站穩）再行動`);

  // ③ KD
  if (kdK < 20)
    bulls.push(`KD K值 ${kdK.toFixed(0)} 低檔，留意底部黃金交叉訊號，一旦出現可短多`);
  else if (kdK > 80)
    bulls.push(`KD K值 ${kdK.toFixed(0)} 高檔鈍化，追高風險增加，已持股可設移動停利`);

  // ④ MACD
  if (dif > 0 && dif > dea)
    bulls.push(`MACD 多頭擴張（DIF>${dea > 0 ? "+" : ""}${dea.toFixed(2)}），趨勢仍多，持股信心偏正向`);
  else if (dif < 0 && dif < dea)
    bulls.push(`MACD 空頭擴張，多方動能不足，不宜重押，輕倉觀察為主`);

  // ⑤ 量價
  if (volStatus === "放量上漲")
    bulls.push(`今日放量上漲，量價配合，趨勢向上，持股或跟進，停損設 ${stop}`);
  else if (volStatus === "放量下跌")
    bulls.push(`放量下跌，賣壓沉重，務必控管風險，跌破 ${s1} 應果斷停損`);
  else if (volStatus === "縮量回檔")
    bulls.push(`縮量回檔屬正常整理，守住 ${s1} 支撐有機會再攻，可低接`);
  else
    bulls.push(`量能平穩，等待放量突破 ${r1} 再確認多方訊號`);

  // ⑥ 籌碼
  if (chip) {
    const f5 = chip.foreign5, t5 = chip.trust5;
    if (f5 > 3000)
      bulls.push(`外資近5日大買超 +${f5.toLocaleString()} 張，主力資金進駐，籌碼面強勢`);
    else if (f5 > 500)
      bulls.push(`外資近5日買超 +${f5.toLocaleString()} 張，籌碼偏正向，可偏多操作`);
    else if (f5 < -3000)
      bulls.push(`外資近5日賣超 ${f5.toLocaleString()} 張，主力撤退，謹慎追高`);
    else if (f5 < -500)
      bulls.push(`外資近5日小幅賣超 ${f5.toLocaleString()} 張，籌碼分歧，操作宜保守`);
    if (t5 > 500)
      bulls.push(`投信近5日買超 +${t5.toLocaleString()} 張，法人認同，有助股價支撐`);
    else if (t5 < -500)
      bulls.push(`投信近5日賣超 ${t5.toLocaleString()} 張，需觀察是否持續`);
  }

  // ⑦ 停損
  bulls.push(`停損參考：收盤跌破 ${stop} 應出場，不宜凹單`);

  return [...new Map(bulls.map(b => [b, b])).values()].slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Data Fetching
// ═══════════════════════════════════════════════════════════════════════════════
async function fetchFinMind(code) {
  const res = await fetch(`/api/finmind?code=${code}`);
  if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`);
  const { price, info } = await res.json();
  if (price.status !== 200 || !price.data?.length) throw new Error(`FinMind: ${price.msg || "no data"}`);
  const stockName = info.data?.[0]?.stock_name || code;
  const mktType   = info.data?.[0]?.type || "";
  const market    = mktType.includes("TWSE") || mktType.includes("上市") ? "上市"
    : mktType.includes("OTC") || mktType.includes("上櫃") ? "上櫃" : "台股";
  const candles = price.data.map(d => ({
    ds: d.date.slice(5).replace("-", "/"),
    open: +d.open, high: +d.max, low: +d.min, close: +d.close,
    volume: Math.round(+d.Trading_Volume / 1000),
  })).filter(c => c.open > 0 && c.close > 0);
  if (candles.length < 5) throw new Error("FinMind: 資料不足");
  return { name: stockName, symbol: code, market, candles, source: "FinMind" };
}

async function fetchYahoo(code) {
  const res = await fetch(`/api/yahoo?code=${code}`);
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error("Yahoo: no data");
  const meta = result.meta, ts = result.timestamp || [], q = result.indicators?.quote?.[0] || {};
  const candles = ts.map((t, i) => {
    const d = new Date(t * 1000);
    return {
      ds: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`,
      open: q.open?.[i], high: q.high?.[i], low: q.low?.[i], close: q.close?.[i],
      volume: Math.round((q.volume?.[i] || 0) / 1000),
    };
  }).filter(c => c.open && c.close);
  if (candles.length < 5) throw new Error("Yahoo: 資料不足");
  return { name: meta.shortName || code, symbol: code, market: json._market || "上市", candles, source: "Yahoo" };
}

async function fetchStock(code) {
  const errs = [];
  try { return await fetchFinMind(code); } catch (e) { errs.push(e.message); }
  try { return await fetchYahoo(code); }   catch (e) { errs.push(e.message); }
  throw new Error(`找不到 ${code}\n${errs.join("\n")}`);
}

async function fetchChip(code) {
  try {
    const res = await fetch(`/api/chip?code=${code}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  UI Components
// ═══════════════════════════════════════════════════════════════════════════════
const f = (v, d = 2) => v != null && !isNaN(v) ? Number(v).toFixed(d) : "—";
const numColor = v => v > 0 ? "#f87171" : v < 0 ? "#4ade80" : "#94a3b8";
const numFmt   = v => v === 0 ? "0" : v > 0 ? `+${v.toLocaleString()}` : v.toLocaleString();

// ── Tooltip 說明泡泡 ──────────────────────────────────────────────────────────
function InfoTip({ text }) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const close = e => { if (ref.current && !ref.current.contains(e.target)) setShow(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <span ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", marginLeft: "5px" }}>
      <span
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={e => { e.stopPropagation(); setShow(v => !v); }}
        style={{ cursor: "help", color: "#475569", fontSize: "0.55rem", border: "1px solid #334155", borderRadius: "50%", width: "13px", height: "13px", display: "inline-flex", alignItems: "center", justifyContent: "center", userSelect: "none", flexShrink: 0, lineHeight: 1 }}
      >?</span>
      {show && (
        <div style={{ position: "absolute", bottom: "130%", left: "50%", transform: "translateX(-50%)", background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: "8px", padding: "8px 10px", minWidth: "170px", maxWidth: "230px", fontSize: "0.62rem", color: "#94a3b8", lineHeight: 1.65, zIndex: 999, pointerEvents: "none", boxShadow: "0 4px 20px #000c", whiteSpace: "normal" }}>
          {text}
        </div>
      )}
    </span>
  );
}

// ── Panel 容器（支援摺疊）────────────────────────────────────────────────────
function Panel({ title, titleNode, children, extra, warn, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const hasHeader = title || titleNode || extra;
  const toggleable = collapsible && hasHeader;
  return (
    <div style={{ background: warn ? "#1a0a0a" : "#0b1a2e", border: `1px solid ${warn ? "#7f1d1d" : "#1e3550"}`, borderRadius: "12px", padding: "10px 12px" }}>
      {hasHeader && (
        <div
          onClick={toggleable ? () => setOpen(o => !o) : undefined}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: open ? "8px" : 0, cursor: toggleable ? "pointer" : "default", userSelect: "none" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 }}>
            {titleNode
              ? titleNode
              : title && <span style={{ color: warn ? "#fca5a5" : "#38bdf8", fontWeight: 700, fontSize: "0.72rem", display: "flex", alignItems: "center" }}>{title}</span>}
            {extra && <span style={{ fontSize: "0.65rem", color: "#64748b" }}>{extra}</span>}
          </div>
          {toggleable && (
            <span style={{ color: "#334155", fontSize: "0.7rem", flexShrink: 0, marginLeft: "6px", transition: "transform 0.2s", display: "inline-block", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>▼</span>
          )}
        </div>
      )}
      {(!collapsible || open) && children}
    </div>
  );
}

function Row({ k, v, vc }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid #132030" }}>
      <span style={{ color: "#7c8fa8", fontSize: "0.7rem" }}>{k}</span>
      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: vc || "#c0cfe0" }}>{v || "—"}</span>
    </div>
  );
}

// ── K 線圖（含布林通道）────────────────────────────────────────────────────────
function CandleChart({ candles, bb }) {
  const data  = candles.slice(-65);
  const bbSlice = bb ? bb.slice(-65) : null;
  const prices = data.flatMap(c => [c.high, c.low]).filter(v => v > 0);
  if (!prices.length) return null;

  // 若有布林通道，上下軌也要納入 Y 軸範圍
  const bbPrices = bbSlice
    ? bbSlice.flatMap(b => [b?.upper, b?.lower]).filter(v => v != null)
    : [];
  const allPrices = [...prices, ...bbPrices];
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices), span = maxP - minP || 1;
  const pMin = minP - span * 0.04, pMax = maxP + span * 0.04;
  const W = 1000, H = 230, pT = 8, pB = 4, cW = W / data.length, bW = cW * 0.62;
  const py = p => pT + (1 - (p - pMin) / (pMax - pMin)) * (H - pT - pB);
  const cx = i => (i + 0.5) * cW;

  const maLine = (ma, clr) => {
    const segs = []; let seg = [];
    ma.forEach((v, i) => { if (v != null) seg.push(`${cx(i).toFixed(1)},${py(v).toFixed(1)}`); else if (seg.length) { segs.push(seg); seg = []; } });
    if (seg.length) segs.push(seg);
    return segs.map((s, j) => <polyline key={j} points={s.join(" ")} fill="none" stroke={clr} strokeWidth="2.5" />);
  };

  const bbLine = (vals, clr, dash) => {
    if (!vals) return null;
    const segs = []; let seg = [];
    vals.forEach((v, i) => { if (v != null) seg.push(`${cx(i).toFixed(1)},${py(v).toFixed(1)}`); else if (seg.length) { segs.push(seg); seg = []; } });
    if (seg.length) segs.push(seg);
    return segs.map((s, j) => <polyline key={j} points={s.join(" ")} fill="none" stroke={clr} strokeWidth="1.2" strokeDasharray={dash} opacity="0.65" />);
  };

  const cls = data.map(c => c.close);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "185px", display: "block" }} preserveAspectRatio="none">
      {[0.2, 0.4, 0.6, 0.8].map(r => <line key={r} x1={0} x2={W} y1={pT + r * (H - pT - pB)} y2={pT + r * (H - pT - pB)} stroke="#0f2035" strokeWidth="1" />)}
      {/* 布林通道 */}
      {bbSlice && bbLine(bbSlice.map(b => b?.upper), "#64748b", "5 3")}
      {bbSlice && bbLine(bbSlice.map(b => b?.mid),   "#64748b", "2 3")}
      {bbSlice && bbLine(bbSlice.map(b => b?.lower), "#64748b", "5 3")}
      {/* MA 線 */}
      {maLine(calcMA(cls, 5), "#f59e0b")}
      {maLine(calcMA(cls, 20), "#60a5fa")}
      {maLine(calcMA(cls, Math.min(60, cls.length)), "#c084fc")}
      {/* K 線本體 */}
      {data.map((c, i) => {
        const up = c.close >= c.open, clr = up ? "#f87171" : "#4ade80";
        const bT = py(Math.max(c.open, c.close)), bB = py(Math.min(c.open, c.close));
        return <g key={i}><line x1={cx(i)} x2={cx(i)} y1={py(c.high)} y2={py(c.low)} stroke={clr} strokeWidth="1.5" /><rect x={cx(i) - bW / 2} y={bT} width={bW} height={Math.max(1.5, bB - bT)} fill={clr} /></g>;
      })}
    </svg>
  );
}

function VolChart({ candles }) {
  const data = candles.slice(-65), maxV = Math.max(...data.map(c => c.volume || 0));
  const W = 1000, H = 50, cW = W / data.length, bW = cW * 0.65;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "42px", display: "block" }} preserveAspectRatio="none">
      {data.map((c, i) => {
        const up = c.close >= c.open, h = maxV > 0 ? (c.volume || 0) / maxV * H * 0.95 : 0;
        return <rect key={i} x={(i + 0.5) * cW - bW / 2} y={H - h} width={bW} height={h} fill={up ? "#f87171" : "#4ade80"} opacity="0.65" />;
      })}
    </svg>
  );
}

function Gauge({ v, label }) {
  const pct = Math.min(100, Math.max(0, v || 50));
  const rad = a => a * Math.PI / 180, cx = 60, cy = 58, r = 44;
  const angle = -135 + (pct / 100) * 270;
  const aX = cx + r * Math.cos(rad(angle)), aY = cy + r * Math.sin(rad(angle));
  const sX = cx + r * Math.cos(rad(-135)), sY = cy + r * Math.sin(rad(-135));
  const la = (pct / 100) * 270 > 180 ? 1 : 0;
  const clr = pct >= 65 ? "#f87171" : pct >= 50 ? "#fbbf24" : pct >= 35 ? "#fb923c" : "#4ade80";
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 120 78" style={{ width: "100%", maxWidth: "140px", height: "72px" }}>
        <path d={`M ${sX} ${sY} A ${r} ${r} 0 1 1 ${cx + r * Math.cos(rad(45))} ${cy + r * Math.sin(rad(45))}`} fill="none" stroke="#0f2035" strokeWidth="9" strokeLinecap="round" />
        {pct > 0 && <path d={`M ${sX} ${sY} A ${r} ${r} 0 ${la} 1 ${aX} ${aY}`} fill="none" stroke={clr} strokeWidth="9" strokeLinecap="round" />}
        <text x={cx} y={cy + 7} textAnchor="middle" fill={clr} fontSize="17" fontWeight="bold">{pct}%</text>
      </svg>
      {label && <div style={{ fontSize: "0.65rem", color: "#475569", marginTop: "-4px" }}>{label}</div>}
    </div>
  );
}

function SignalBadge({ sig }) {
  if (!sig) return null;
  const glow = `0 0 24px ${sig.color}80, 0 0 48px ${sig.color}40`;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "6px 0", gap: "4px" }}>
      <div style={{ fontSize: "3.8rem", fontWeight: 900, color: sig.color, textShadow: glow, lineHeight: 1, border: `3px solid ${sig.color}`, borderRadius: "10px", padding: "4px 20px", background: `${sig.color}18` }}>
        {sig.char}
      </div>
      <div style={{ fontSize: "0.75rem", color: sig.color, fontWeight: 700 }}>{sig.action}</div>
      <div style={{ fontSize: "0.65rem", color: "#64748b", background: "#0f172a", borderRadius: "5px", padding: "2px 8px" }}>{sig.subtitle}</div>
    </div>
  );
}

function ChipTable({ instData }) {
  const recent = instData.slice(-10).reverse();
  if (!recent.length) return <div style={{ color: "#334155", fontSize: "0.7rem", padding: "8px" }}>暫無資料</div>;
  const th = { color: "#38bdf8", fontSize: "0.62rem", padding: "3px 5px", borderBottom: "1px solid #1a2f4a", textAlign: "right", whiteSpace: "nowrap" };
  const td = (v) => ({ color: numColor(v), fontSize: "0.65rem", padding: "3px 5px", textAlign: "right", fontWeight: v !== 0 ? 700 : 400 });
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.65rem" }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: "left" }}>日期</th>
            <th style={th}>外資</th>
            <th style={th}>投信</th>
            <th style={th}>自營商</th>
            <th style={th}>合計</th>
          </tr>
        </thead>
        <tbody>
          {recent.map(d => (
            <tr key={d.date} style={{ borderBottom: "1px solid #0d1b2a" }}>
              <td style={{ color: "#475569", fontSize: "0.62rem", padding: "3px 5px" }}>{d.date.slice(5)}</td>
              <td style={td(d.foreign)}>{numFmt(d.foreign)}</td>
              <td style={td(d.trust)}>{numFmt(d.trust)}</td>
              <td style={td(d.dealer)}>{numFmt(d.dealer)}</td>
              <td style={{ ...td(d.total), borderLeft: "1px solid #1a2f4a" }}>{numFmt(d.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChipBarChart({ instData, candles }) {
  if (!instData.length) return <div style={{ color: "#334155", fontSize: "0.7rem", padding: "16px", textAlign: "center" }}>暫無法人資料</div>;
  const recent10 = instData.slice(-10);
  const priceMap = {};
  for (const c of candles) priceMap[c.ds] = c.close;
  const rows = recent10.map(d => ({
    date: d.date.slice(5),
    foreign: d.foreign, trust: d.trust, dealer: d.dealer,
    price: priceMap[d.date.slice(5).replace("-", "/")] ?? null,
  }));
  const allNets = rows.flatMap(r => [r.foreign, r.trust, r.dealer]);
  const maxAbs = Math.max(Math.abs(Math.max(...allNets)), Math.abs(Math.min(...allNets)), 1);
  const prices = rows.map(r => r.price).filter(Boolean);
  const pMin = Math.min(...prices), pMax = Math.max(...prices);
  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={rows} margin={{ top: 4, right: 30, bottom: 0, left: -20 }}>
        <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} />
        <YAxis yAxisId="l" domain={[-maxAbs * 1.1, maxAbs * 1.1]} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v} tick={{ fontSize: 9, fill: "#475569" }} tickLine={false} />
        <YAxis yAxisId="r" orientation="right" domain={[pMin * 0.97, pMax * 1.03]} tick={{ fontSize: 9, fill: "#fbbf24" }} tickLine={false} />
        <ReferenceLine yAxisId="l" y={0} stroke="#1a2f4a" />
        <Tooltip contentStyle={{ background: "#0b1a2e", border: "1px solid #1a2f4a", borderRadius: "8px", fontSize: "0.65rem" }} formatter={(v, n) => [v?.toLocaleString() + " 張", n]} />
        <Bar yAxisId="l" dataKey="foreign" name="外資"   fill="#60a5fa" opacity={0.85} maxBarSize={12} />
        <Bar yAxisId="l" dataKey="trust"   name="投信"   fill="#f87171" opacity={0.85} maxBarSize={12} />
        <Bar yAxisId="l" dataKey="dealer"  name="自營商" fill="#c084fc" opacity={0.85} maxBarSize={12} />
        <Line yAxisId="r" dataKey="price" name="股價" stroke="#fbbf24" dot={false} strokeWidth={2} connectNulls />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function StarRating({ stars, max = 5 }) {
  return (
    <div style={{ display: "flex", gap: "3px" }}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{ color: i < stars ? "#fbbf24" : "#1a2f4a", fontSize: "1rem" }}>★</span>
      ))}
    </div>
  );
}

// ── 自選股 ────────────────────────────────────────────────────────────────────
function useWatchlist() {
  const [list, setList] = useState(() => {
    try { return JSON.parse(localStorage.getItem("watchlist") || "[]"); } catch { return []; }
  });
  const toggle = (code, name) => setList(prev => {
    const next = prev.some(w => w.code === code)
      ? prev.filter(w => w.code !== code)
      : [...prev, { code, name }];
    localStorage.setItem("watchlist", JSON.stringify(next));
    return next;
  });
  const has = code => list.some(w => w.code === code);
  return { list, toggle, has };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Main App
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [code, setCode]       = useState("");
  const [quickCode, setQuickCode] = useState("");  // 快速換股輸入
  const [phase, setPhase]     = useState("idle");
  const [stock, setStock]     = useState(null);
  const [candles, setCandles] = useState([]);
  const [bb, setBb]           = useState(null);
  const [rows, setRows]       = useState([]);
  const [ai, setAi]           = useState(null);
  const [chip, setChip]       = useState(null);
  const [sig, setSig]         = useState(null);
  const [chipAnalysis, setChipAnalysis] = useState(null);
  const [err, setErr]         = useState("");
  const [source, setSource]   = useState("");
  const watchlist = useWatchlist();

  const run = async (overrideCode) => {
    const c = (overrideCode ?? code).trim().replace(/\D/g, "");
    if (!c) return;
    if (overrideCode) setCode(overrideCode);
    setErr(""); setPhase("loading");
    setChip(null); setChipAnalysis(null); setBb(null);

    try {
      const data = await fetchStock(c);
      const all  = data.candles;
      const cls  = all.map(x => x.close);
      const highs = all.map(x => x.high);
      const lows  = all.map(x => x.low);
      const ma5a  = calcMA(cls, 5);
      const ma20a = calcMA(cls, 20);
      const ma60a = calcMA(cls, Math.min(60, cls.length));
      const rsia  = calcRSI(cls);
      const { dif, dea, hist } = calcMACD(cls);
      const { K, D } = calcKD(highs, lows, cls);
      const bba   = calcBB(cls);
      const n = cls.length - 1;

      const today = all[n], prev = all[n - 1]?.close ?? today.open;
      const change = today.close - prev, changePct = (change / prev) * 100;
      const ind = { ma5: ma5a[n], ma20: ma20a[n], ma60: ma60a[n], rsi: rsia[n], dif: dif[n], dea: dea[n], macd: hist[n], kdK: K[n], kdD: D[n] };
      const analysis = analyzeStock(today.close, all, ind);

      const stockObj = {
        name: data.name, code: c, exchange: data.market,
        price: today.close, open: today.open, high: today.high, low: today.low, vol: today.volume,
        change, changePct, isUp: change >= 0, ...ind, rsi: rsia[n],
      };

      setSource(data.source); setCandles(all); setBb(bba); setStock(stockObj);
      const off = all.length - Math.min(65, all.length);
      setRows(all.slice(-65).map((_, i) => ({
        date: all[off + i].ds,
        rsi: rsia[off + i], dif: dif[off + i], dea: dea[off + i], hist: hist[off + i],
        kdK: K[off + i], kdD: D[off + i],
      })));
      setAi({ ...analysis, rsi: rsia[n] });
      setSig(calcFullSignal({ ...analysis, rsi: rsia[n] }, null));
      setPhase("done");

      fetchChip(c).then(raw => {
        if (!raw?.inst?.length) return;
        setChip(raw);
        const ca = analyzeChip(raw.inst, raw.margin || []);
        setChipAnalysis(ca);
        setSig(calcFullSignal({ ...analysis, rsi: rsia[n] }, ca));
      });
    } catch (e) {
      setErr(e.message || "未知錯誤"); setPhase("error");
    }
  };

  // ─── Idle / Error ────────────────────────────────────────────────────────────
  if (phase === "idle" || phase === "error") return (
    <div style={{ minHeight: "100vh", background: "#030712", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>📊</div>
        <h1 style={{ color: "#f1f5f9", fontSize: "1.6rem", fontWeight: 800 }}>台股技術分析系統</h1>
        <p style={{ color: "#64748b", marginTop: "0.5rem", fontSize: "0.85rem" }}>FinMind ＋ Yahoo Finance ＋ 籌碼面分析</p>
      </div>
      <div style={{ width: "100%", maxWidth: "380px", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <input
          value={code} onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === "Enter" && run()}
          placeholder="輸入股票代碼（如 2379）"
          autoFocus inputMode="numeric"
          style={{ width: "100%", padding: "1.1rem", borderRadius: "14px", background: "#0f172a", border: `2px solid ${phase === "error" ? "#ef4444" : "#334155"}`, color: "#f1f5f9", fontSize: "1.2rem", outline: "none", textAlign: "center", letterSpacing: "0.15em", boxSizing: "border-box" }}
        />
        <button onClick={() => run()} style={{ padding: "1.1rem", borderRadius: "14px", background: "linear-gradient(135deg,#2563eb,#7c3aed)", border: "none", color: "#fff", fontSize: "1.05rem", fontWeight: 700, cursor: "pointer" }}>
          開始分析 →
        </button>
        {phase === "error" && (
          <div style={{ background: "#450a0a", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "0.8rem 1rem", color: "#fca5a5", fontSize: "0.78rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>⚠️ {err}</div>
        )}

        {/* ── 自選股清單 ── */}
        {watchlist.list.length > 0 && (
          <div style={{ background: "#0f172a", borderRadius: "10px", padding: "0.8rem" }}>
            <div style={{ color: "#fbbf24", fontSize: "0.7rem", marginBottom: "6px", fontWeight: 700 }}>⭐ 自選股</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {watchlist.list.map(w => (
                <button key={w.code} onClick={() => run(w.code)}
                  style={{ background: "#1a2f4a", border: "1px solid #1e3a5f", borderRadius: "6px", color: "#fbbf24", padding: "6px 10px", fontSize: "0.72rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>{w.code}</span>
                  <span style={{ color: "#94a3b8" }}>{w.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── 熱門代碼 ── */}
        <div style={{ background: "#0f172a", borderRadius: "10px", padding: "0.8rem" }}>
          <div style={{ color: "#64748b", fontSize: "0.7rem", marginBottom: "6px", fontWeight: 700 }}>熱門代碼</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {[["2330","台積電"],["2454","聯發科"],["6669","緯穎"],["2379","瑞昱"],["2383","台光電"],["2337","旺宏"],["2317","鴻海"],["2382","廣達"]].map(([c, n]) => (
              <button key={c} onClick={() => run(c)} style={{ background: "#1e293b", border: "none", borderRadius: "5px", color: "#94a3b8", padding: "6px 10px", fontSize: "0.72rem", cursor: "pointer" }}>{c} {n}</button>
            ))}
          </div>
        </div>
        <div style={{ color: "#1e3a5f", fontSize: "0.65rem", textAlign: "center", lineHeight: 1.6 }}>資料來源：FinMind ＋ Yahoo Finance ｜ 僅供技術分析參考，不構成投資建議</div>
      </div>
    </div>
  );

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (phase === "loading") return (
    <div style={{ minHeight: "100vh", background: "#030712", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ fontSize: "3rem", marginBottom: "1.5rem" }}>📈</div>
      <div style={{ color: "#60a5fa", fontSize: "1.1rem", fontWeight: 700 }}>連線資料源中...</div>
      <div style={{ color: "#475569", fontSize: "0.85rem", marginTop: "8px" }}>股票代碼：{code}</div>
      <div style={{ display: "flex", gap: "8px", marginTop: "1.5rem" }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#3b82f6", animation: `dot 0.8s ease-in-out ${i * 0.18}s infinite alternate` }} />)}
      </div>
      <style>{`@keyframes dot{from{transform:translateY(0);opacity:0.4}to{transform:translateY(-12px);opacity:1}}`}</style>
    </div>
  );

  if (!stock || !ai) return null;

  const PC  = stock.isUp ? "#f87171" : "#4ade80";
  const PBG = stock.isUp ? "rgba(239,68,68,0.12)" : "rgba(74,222,128,0.12)";
  const winRate    = calcWinRate(ai, chipAnalysis);
  const mfWarning  = calcMainForceWarning(ai, chipAnalysis, stock.changePct);
  const recs       = genRecommendations(ai, chipAnalysis);
  const trendColor = ai.trend.includes("多") ? "#f87171" : ai.trend.includes("空") ? "#4ade80" : "#fbbf24";
  const instData   = chip?.inst ?? [];
  const inWatch    = watchlist.has(stock.code);

  // ─── Dashboard ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: "#020b18", color: "#f1f5f9", fontSize: "12px", padding: "6px", paddingTop: "max(6px, env(safe-area-inset-top))", paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>

      {/* ── Header ── */}
      <div style={{ background: "#0b1a2e", border: "1px solid #1e3550", borderRadius: "12px", padding: "10px 14px", marginBottom: "5px" }}>
        {/* 麵包屑導覽列 */}
        <div style={{ fontSize: "0.62rem", color: "#334155", marginBottom: "8px", display: "flex", alignItems: "center", gap: "5px" }}>
          <button onClick={() => { setPhase("idle"); setStock(null); setAi(null); setChip(null); setChipAnalysis(null); }}
            style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "0.62rem", padding: 0, textDecoration: "underline" }}>🏠 首頁</button>
          <span style={{ color: "#1e3550" }}>›</span>
          <span style={{ color: "#64748b" }}>{stock.exchange}</span>
          <span style={{ color: "#1e3550" }}>›</span>
          <span style={{ color: "#94a3b8", fontWeight: 600 }}>{stock.name}（{stock.code}）</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* ⭐ 自選股按鈕 */}
            <button
              onClick={() => watchlist.toggle(stock.code, stock.name)}
              title={inWatch ? "從自選股移除" : "加入自選股"}
              style={{ background: inWatch ? "rgba(251,191,36,0.15)" : "none", border: `1px solid ${inWatch ? "#fbbf24" : "#1e3550"}`, borderRadius: "6px", color: inWatch ? "#fbbf24" : "#475569", padding: "5px 9px", cursor: "pointer", fontSize: "0.9rem", lineHeight: 1 }}>
              {inWatch ? "★" : "☆"}
            </button>
            <div>
              <span style={{ fontSize: "1.2rem", fontWeight: 900 }}>{stock.name}</span>
              <span style={{ color: "#475569", margin: "0 5px", fontSize: "0.78rem" }}>{stock.code}</span>
              <span style={{ fontSize: "0.62rem", background: "#0f2035", color: "#64748b", padding: "2px 6px", borderRadius: "4px" }}>{stock.exchange}</span>
              <span style={{ marginLeft: "5px", fontSize: "0.6rem", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", color: "#4ade80", padding: "1px 5px", borderRadius: "4px" }}>{source}</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            {/* 快速換股搜尋框 */}
            <form onSubmit={e => { e.preventDefault(); const c = quickCode.trim().replace(/\D/g,""); if (c) { run(c); setQuickCode(""); } }}
              style={{ display: "flex", gap: "4px" }}>
              <input
                value={quickCode} onChange={e => setQuickCode(e.target.value)}
                placeholder="換股 代碼" inputMode="numeric"
                style={{ width: "80px", padding: "5px 8px", borderRadius: "7px", background: "#0f2035", border: "1px solid #1e3550", color: "#e2e8f0", fontSize: "0.72rem", outline: "none", textAlign: "center" }}
              />
              <button type="submit"
                style={{ padding: "5px 10px", borderRadius: "7px", background: "#1e3a5f", border: "none", color: "#60a5fa", fontSize: "0.72rem", cursor: "pointer", fontWeight: 700 }}>→</button>
            </form>
            <div>
              <div style={{ fontSize: "1.7rem", fontWeight: 900, color: PC, lineHeight: 1.1 }}>{f(stock.price)}</div>
              <div style={{ background: PBG, color: PC, borderRadius: "5px", padding: "1px 7px", fontSize: "0.7rem", fontWeight: 700 }}>
                {stock.isUp ? "▲" : "▼"} {f(Math.abs(stock.change))} ({f(stock.changePct)}%)
              </div>
            </div>
            <div style={{ borderLeft: "1px solid #1e3550", paddingLeft: "12px", color: "#64748b", fontSize: "0.66rem", lineHeight: 2 }}>
              <div>開 <b style={{ color: "#c0cfe0" }}>{f(stock.open)}</b></div>
              <div>高 <b style={{ color: "#f87171" }}>{f(stock.high)}</b>　低 <b style={{ color: "#4ade80" }}>{f(stock.low)}</b></div>
              <div>量 <b style={{ color: "#c0cfe0" }}>{(stock.vol || 0).toLocaleString()} 張</b></div>
            </div>
          </div>
        </div>
      </div>

      {/* ── MA + BB 圖例 ── */}
      <div style={{ display: "flex", gap: "12px", marginBottom: "6px", paddingLeft: "3px", fontSize: "0.66rem", flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "#475569" }}>日K線</span>
        <span style={{ color: "#f59e0b" }}>MA5 {f(stock.ma5)}</span>
        <span style={{ color: "#60a5fa" }}>MA20 {f(stock.ma20)}</span>
        <span style={{ color: "#c084fc" }}>MA60 {f(stock.ma60)}</span>
        <span style={{ color: "#64748b" }}>╌ BB(20)</span>
      </div>

      {/* ── Main grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "7px" }}>

        {/* ── Col 1: K-line + indicators ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          <Panel title="技術面分析（日K線）">
            <SignalBadge sig={sig} />
            <CandleChart candles={candles} bb={bb} />
            <div style={{ borderTop: "1px solid #0f2035", paddingTop: "2px" }}>
              <span style={{ color: "#1a3a5c", fontSize: "0.6rem" }}>成交量（張）</span>
              <VolChart candles={candles} />
            </div>
          </Panel>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "7px" }}>
            {/* RSI Panel with Tooltip */}
            <Panel
              collapsible
              titleNode={
                <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.72rem", display: "flex", alignItems: "center" }}>
                  RSI {f(stock.rsi, 1)}
                  <InfoTip text="相對強弱指數（0-100）。＞70 超買（紅線），短線過熱；＜30 超賣（綠線），可能反彈。一般 50 以上偏多，50 以下偏空。" />
                </span>
              }
              extra={stock.rsi > 70 ? "⚠️超買" : stock.rsi < 30 ? "💡超賣" : ""}
            >
              <ResponsiveContainer width="100%" height={72}>
                <LineChart data={rows}>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0, 100]} hide />
                  <ReferenceLine y={70} stroke="#ef444440" strokeDasharray="3 2" />
                  <ReferenceLine y={50} stroke="#1e3550"   strokeDasharray="2 4" />
                  <ReferenceLine y={30} stroke="#22c55e40" strokeDasharray="3 2" />
                  <Line type="monotone" dataKey="rsi" stroke="#f59e0b" dot={false} strokeWidth={1.8} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>

            {/* KD Panel with Tooltip */}
            <Panel
              collapsible
              titleNode={
                <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.72rem", display: "flex", alignItems: "center" }}>
                  KD {f(stock.kdK,1)}/{f(stock.kdD,1)}
                  <InfoTip text="隨機指標（0-100）。K 線（黃）向上穿越 D 線（藍）為黃金交叉買訊；向下穿越為死亡交叉賣訊。K＞80 高檔鈍化，K＜20 低檔超賣。" />
                </span>
              }
            >
              <ResponsiveContainer width="100%" height={72}>
                <LineChart data={rows}>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0, 100]} hide />
                  <ReferenceLine y={80} stroke="#ef444440" strokeDasharray="3 2" />
                  <ReferenceLine y={50} stroke="#1e3550"   strokeDasharray="2 4" />
                  <ReferenceLine y={20} stroke="#22c55e40" strokeDasharray="3 2" />
                  <Line type="monotone" dataKey="kdK" stroke="#f59e0b" dot={false} strokeWidth={1.8} connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="kdD" stroke="#60a5fa" dot={false} strokeWidth={1.8} connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          {/* MACD Panel with Tooltip */}
          <Panel
            collapsible
            titleNode={
              <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.72rem", display: "flex", alignItems: "center" }}>
                MACD {f(stock.dif,2)}/{f(stock.dea,2)}
                <InfoTip text="指數平滑移動平均線。DIF（黃）＞DEA（藍）且柱狀體（紅）為正，代表多頭擴張；反之為空頭。DIF 由負轉正是重要買訊。" />
              </span>
            }
          >
            <ResponsiveContainer width="100%" height={72}>
              <ComposedChart data={rows}>
                <XAxis dataKey="date" hide /><YAxis hide />
                <ReferenceLine y={0} stroke="#0f2035" strokeWidth={1} />
                <Bar dataKey="hist" isAnimationActive={false}>
                  {rows.map((e, i) => <Cell key={i} fill={(e.hist ?? 0) >= 0 ? "#f87171" : "#4ade80"} />)}
                </Bar>
                <Line type="monotone" dataKey="dif" stroke="#f59e0b" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
                <Line type="monotone" dataKey="dea" stroke="#60a5fa" dot={false} strokeWidth={1.5} connectNulls isAnimationActive={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>

          <Panel title="技術面結論" collapsible>
            <div style={{ color: "#94a3b8", lineHeight: 1.7, fontSize: "0.7rem" }}>{ai.techConclude}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginTop: "6px" }}>
              {[["趨勢", ai.trend, trendColor], ["MA", ai.maStatus, "#fbbf24"], ["KD", ai.kdStatus, null], ["MACD", ai.macdStatus, null], ["量能", ai.volStatus, null]].map(([k, v, vc]) => (
                <span key={k} style={{ background: "#0f2035", borderRadius: "4px", padding: "2px 6px", fontSize: "0.62rem", color: vc || "#64748b" }}>{k}：{v}</span>
              ))}
            </div>
          </Panel>
        </div>

        {/* ── Col 2: Chip Analysis ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          <Panel
            titleNode={
              <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.72rem", display: "flex", alignItems: "center" }}>
                籌碼面分析
                <InfoTip text="三大法人指外資、投信（國內基金）和自營商。三者合計買超代表機構資金流入，通常對股價偏正面；賣超則反之。融資增加代表散戶借錢買股，過高時需注意風險。" />
              </span>
            }
          >
            <div style={{ fontSize: "0.65rem", color: "#38bdf8", marginBottom: "4px" }}>三大法人近10日動向</div>
            <div style={{ display: "flex", gap: "10px", marginBottom: "4px", fontSize: "0.6rem" }}>
              <span style={{ color: "#60a5fa" }}>■ 外資</span>
              <span style={{ color: "#f87171" }}>■ 投信</span>
              <span style={{ color: "#c084fc" }}>■ 自營商</span>
              <span style={{ color: "#fbbf24" }}>— 股價</span>
            </div>
            <ChipBarChart instData={instData} candles={candles} />

            {instData.length > 0 && (
              <>
                <div style={{ fontSize: "0.65rem", color: "#38bdf8", margin: "8px 0 4px" }}>法人買賣超（張）</div>
                <ChipTable instData={instData} />

                {chipAnalysis && (
                  <>
                    <div style={{ fontSize: "0.65rem", color: "#38bdf8", margin: "8px 0 4px" }}>主力進出分析（近10日）</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px" }}>
                      {[
                        ["主力增減(張)", chipAnalysis.mainNet10, true],
                        ["10日累計(張)", chipAnalysis.totalNet10, true],
                        ["外資近5日",   chipAnalysis.foreign5,   true],
                        ["籌碼評分",    chipAnalysis.cScore + " / 100", false],
                      ].map(([k, v, colored]) => (
                        <div key={k} style={{ background: "#0f2035", borderRadius: "6px", padding: "5px 8px" }}>
                          <div style={{ color: "#334155", fontSize: "0.58rem" }}>{k}</div>
                          <div style={{ color: colored ? numColor(v) : "#94a3b8", fontWeight: 700, fontSize: "0.8rem" }}>
                            {colored && typeof v === "number" ? numFmt(v) : v}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div style={{ marginTop: "8px", background: "#0a1624", border: "1px solid #0f2035", borderRadius: "8px", padding: "6px 10px", fontSize: "0.68rem", color: "#64748b", lineHeight: 1.5 }}>
                  {chipAnalysis?.chipConc ?? "法人資料載入中..."}
                </div>
              </>
            )}

            {!instData.length && (
              <div style={{ color: "#334155", fontSize: "0.68rem", padding: "12px", textAlign: "center" }}>
                法人資料載入中... <br /><span style={{ fontSize: "0.6rem" }}>（FinMind 部分個股需稍等）</span>
              </div>
            )}
          </Panel>

          <Panel title="技術分析總覽" collapsible>
            {[
              ["趨勢方向",     ai.trend,     trendColor],
              ["短期均線(MA5)",  f(stock.ma5),  "#f59e0b"],
              ["中期均線(MA20)", f(stock.ma20), "#60a5fa"],
              ["長期均線(MA60)", f(stock.ma60), "#c084fc"],
              ["KD指標",  `K:${f(stock.kdK,1)} D:${f(stock.kdD,1)}  ${ai.kdStatus}`, null],
              ["MACD",    ai.macdStatus, null],
              ["量價關係", `${ai.volStatus} → ${ai.pvNote}`, null],
            ].map(([k, v, vc]) => <Row key={k} k={k} v={v} vc={vc} />)}
          </Panel>
        </div>

        {/* ── Col 3: Recommendations + Levels ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>

          <Panel title="操作建議（短線）">
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              {recs.map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", fontSize: "0.7rem", color: "#cbd5e1", lineHeight: 1.4 }}>
                  <span style={{ color: "#fbbf24", flexShrink: 0 }}>★</span>
                  <span>{r}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="成交量分析（盤後）" collapsible>
            <Row k="成交量"   v={`${(stock.vol || 0).toLocaleString()} 張`} />
            <Row k="5日均量"  v={`${Math.round(candles.slice(-6, -1).reduce((s, c) => s + (c.volume || 0), 0) / 5).toLocaleString()} 張`} />
            <Row k="量價判讀" v={ai.volStatus} vc={ai.volStatus.includes("上漲") ? "#f87171" : ai.volStatus.includes("下跌") ? "#4ade80" : "#fbbf24"} />
            <div style={{ marginTop: "6px", fontSize: "0.65rem", color: "#64748b", lineHeight: 1.5 }}>
              {ai.volStatus === "放量上漲" ? "股價上漲伴隨量能放大，多方強勢，但需留意高檔震盪風險。"
               : ai.volStatus === "放量下跌" ? "量增價跌，賣壓沉重，建議控管風險。"
               : ai.volStatus === "縮量回檔" ? "量縮回檔屬正常整理，若守住支撐有機會再攻。"
               : "量能平穩，等待方向明確再行動。"}
            </div>
          </Panel>

          <Panel title="主力出貨警示" warn={mfWarning.stars >= 4}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "5px" }}>
              <StarRating stars={mfWarning.stars} />
              <span style={{ fontSize: "0.65rem", color: mfWarning.stars >= 4 ? "#fca5a5" : mfWarning.stars >= 3 ? "#fbbf24" : "#4ade80", fontWeight: 700 }}>{mfWarning.level}</span>
            </div>
            <div style={{ fontSize: "0.67rem", color: "#64748b", lineHeight: 1.5 }}>{mfWarning.desc}</div>
          </Panel>

          <Panel title="短線進場勝率" extra={winRate >= 60 ? "偏高" : winRate >= 45 ? "中等" : "偏低"}>
            <Gauge v={winRate} />
            <div style={{ fontSize: "0.65rem", color: "#475569", textAlign: "center", lineHeight: 1.5, marginTop: "2px" }}>
              {winRate >= 65 ? "多項指標共振向上，短線進場勝率較佳。"
               : winRate >= 50 ? "訊號混合，中性區間，需觀察量能配合。"
               : winRate >= 35 ? "震盪區間，風險較高，不建議追高進場。"
               : "技術偏弱，建議等待更明確反轉訊號。"}
            </div>
          </Panel>

          <Panel title="關鍵價位">
            <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "7px", padding: "5px 9px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#f87171", fontSize: "0.7rem" }}>壓力區</span>
                <span style={{ color: "#fca5a5", fontWeight: 700, fontSize: "0.72rem" }}>{ai.r1} ～ {ai.r2}</span>
              </div>
              <div style={{ background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: "7px", padding: "5px 9px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#4ade80", fontSize: "0.7rem" }}>支撐區</span>
                <span style={{ color: "#86efac", fontWeight: 700, fontSize: "0.72rem" }}>{ai.s1} ～ {ai.s2}</span>
              </div>
              <Row k="強支撐"  v={ai.strongSupport} vc="#60a5fa" />
              <Row k="停損參考" v={`${ai.stop} 以下收盤`} vc="#fb923c" />
            </div>
          </Panel>

          <Panel title="可能路徑" collapsible>
            {[
              { no: "①", label: "上漲路徑", cond: ai.path1cond, dir: "→ 挑戰", target: ai.path1target, clr: "#f87171" },
              { no: "②", label: "回檔路徑", cond: ai.path2cond, dir: "→ 回測", target: ai.path2target, clr: "#fbbf24" },
              { no: "③", label: "轉弱路徑", cond: ai.path3cond, dir: "→ 轉空", target: ai.path3target, clr: "#60a5fa" },
            ].map(p => (
              <div key={p.no} style={{ background: "rgba(255,255,255,0.02)", borderLeft: `2px solid ${p.clr}`, borderRadius: "0 6px 6px 0", padding: "5px 9px", marginBottom: "4px" }}>
                <div style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "0.72rem" }}>{p.no} {p.label}</div>
                <div style={{ color: "#475569", fontSize: "0.64rem" }}>{p.cond} {p.dir} <b style={{ color: p.clr }}>{p.target}</b></div>
              </div>
            ))}
          </Panel>
        </div>
      </div>

      {/* ── Summary Bar ── */}
      <div style={{ marginTop: "7px", background: "#0b1a2e", border: "1px solid #1a2f4a", borderRadius: "12px", padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px", marginBottom: "6px" }}>
          <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.75rem" }}>📋 重點總結</span>
          <span style={{ background: "rgba(251,146,60,0.15)", color: "#fb923c", borderRadius: "5px", padding: "2px 10px", fontSize: "0.65rem" }}>⚠️ {ai.conclusion.split("，").pop() || "謹慎操作"}</span>
        </div>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {[
            ["趨勢", ai.trendLabel, ai.tScore >= 60 ? "#f87171" : ai.tScore >= 45 ? "#fbbf24" : "#4ade80"],
            ["技術", ai.techLabel,  ai.rsi > 70 ? "#fb923c" : ai.tScore >= 60 ? "#f87171" : "#fbbf24"],
            ["籌碼", chipAnalysis?.chipLabel ?? "載入中", chipAnalysis ? (chipAnalysis.cScore >= 60 ? "#f87171" : chipAnalysis.cScore >= 45 ? "#fbbf24" : "#4ade80") : "#334155"],
            ["難度", winRate >= 60 ? "偏低" : winRate >= 45 ? "中等" : "偏高", winRate >= 60 ? "#4ade80" : winRate >= 45 ? "#fbbf24" : "#fb923c"],
          ].map(([k, v, clr]) => (
            <div key={k} style={{ background: "#0f2035", borderRadius: "7px", padding: "5px 12px", textAlign: "center" }}>
              <div style={{ color: "#334155", fontSize: "0.58rem" }}>{k}</div>
              <div style={{ color: clr, fontWeight: 700, fontSize: "0.75rem" }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: "5px", color: "#1e3a5f", fontSize: "0.6rem" }}>
          資料來源 {source}・本系統不代表保證獲利，操作前請依個人資金控管與風險承受度判斷。
        </div>
      </div>
    </div>
  );
}
