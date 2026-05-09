import { useState, useRef } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis,
  ReferenceLine, ResponsiveContainer, Cell, Tooltip,
} from "recharts";

// ═══════════════════════════════════════════════════════════════════════════════
//  Indicator Math (unchanged)
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
//  Technical Analysis (unchanged)
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
  if (dif > 0 && macd > 0) tScore += 8;
  else if (dif < 0 && macd < 0) tScore -= 8;
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
//  Chip Analysis (unchanged)
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
  const s1     = ai?.s1     ?? "—";
  const r1     = ai?.r1     ?? "—";
  const stop   = ai?.stop   ?? "—";
  const ma20   = ai?.ma20   != null ? +ai.ma20.toFixed(2) : "—";
  const kdK    = ai?.kdK    ?? 50;
  const dif    = ai?.dif    ?? 0;
  const dea    = ai?.dea    ?? 0;
  const volStatus  = ai?.volStatus  ?? "";
  const maStatus   = ai?.maStatus   ?? "";
  const bulls = [];

  if (rsi > 78)
    bulls.push(`RSI ${rsi.toFixed(1)} 嚴重超買，短線隨時拉回，等回測 ${s1} 支撐再評估`);
  else if (rsi > 70)
    bulls.push(`RSI ${rsi.toFixed(1)} 進入超買區，漲幅過大，可分批停利保護獲利`);
  else if (rsi > 60)
    bulls.push(`RSI ${rsi.toFixed(1)} 偏強未過熱，趨勢向上，回檔至 ${ma20} 可布局`);
  else if (rsi < 25)
    bulls.push(`RSI ${rsi.toFixed(1)} 極度超賣，短線有強彈機會，量能放大確認後進場`);
  else if (rsi < 35)
    bulls.push(`RSI ${rsi.toFixed(1)} 超賣，守住 ${s1} 再分批承接`);
  else
    bulls.push(`RSI ${rsi.toFixed(1)} 中性，等待突破 ${r1} 壓力或量能明顯放大再介入`);

  if (maStatus.includes("多頭排列"))
    bulls.push(`均線多頭排列（MA20:${ma20}↑），回測不破 ${ma20} 視為健康整理，可持股`);
  else if (maStatus.includes("空頭排列"))
    bulls.push(`均線空頭排列，反彈至 ${ma20} 附近視為壓力，宜減碼`);
  else
    bulls.push(`均線糾結整理，等待 MA20:${ma20} 方向明確再行動`);

  if (kdK < 20)
    bulls.push(`KD K值 ${kdK.toFixed(0)} 低檔，留意底部黃金交叉訊號`);
  else if (kdK > 80)
    bulls.push(`KD K值 ${kdK.toFixed(0)} 高檔鈍化，已持股可設移動停利`);

  if (dif > 0 && dif > dea)
    bulls.push(`MACD 多頭擴張，趨勢仍多，持股信心偏正向`);
  else if (dif < 0 && dif < dea)
    bulls.push(`MACD 空頭擴張，多方動能不足，不宜重押`);

  if (volStatus === "放量上漲")
    bulls.push(`今日放量上漲，量價配合，停損設 ${stop}`);
  else if (volStatus === "放量下跌")
    bulls.push(`放量下跌，賣壓沉重，跌破 ${s1} 應果斷停損`);
  else if (volStatus === "縮量回檔")
    bulls.push(`縮量回檔屬正常整理，守住 ${s1} 有機會再攻`);
  else
    bulls.push(`量能平穩，等待放量突破 ${r1} 再確認多方訊號`);

  if (chip) {
    const f5 = chip.foreign5, t5 = chip.trust5;
    if (f5 > 3000)
      bulls.push(`外資近5日大買超 +${f5.toLocaleString()} 張，主力資金進駐`);
    else if (f5 > 500)
      bulls.push(`外資近5日買超 +${f5.toLocaleString()} 張，籌碼偏正向`);
    else if (f5 < -3000)
      bulls.push(`外資近5日賣超 ${f5.toLocaleString()} 張，謹慎追高`);
    if (t5 > 500)
      bulls.push(`投信近5日買超 +${t5.toLocaleString()} 張，法人認同`);
  }

  bulls.push(`停損參考：收盤跌破 ${stop} 應出場，不宜凹單`);
  return [...new Map(bulls.map(b => [b, b])).values()].slice(0, 5);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════
function tickRound(price) {
  const tick = price < 10 ? 0.01 : price < 50 ? 0.05 : price < 100 ? 0.1 : price < 500 ? 0.5 : 1;
  return Math.round(price / tick) * tick;
}

function generateHeadline(stock, ai, chipAnalysis) {
  const techPart = ai.tScore >= 70 ? "強勢突破創新高" :
                   ai.tScore >= 60 ? "多頭格局明確" :
                   ai.tScore >= 50 ? "技術回檔整理" :
                   ai.tScore >= 40 ? "盤整蓄勢待發" : "技術面偏弱震盪";
  let chipPart = "";
  if (chipAnalysis) {
    if (chipAnalysis.foreign5 > 3000 && chipAnalysis.trust5 > 500)
      chipPart = "法人回補 + 主力買超點火！";
    else if (chipAnalysis.foreign5 > 1000)
      chipPart = "外資連買超，法人挺進中！";
    else if (chipAnalysis.total5 > 2000)
      chipPart = "主力買超點火！";
    else if (chipAnalysis.total5 > 0)
      chipPart = "法人積極回補！";
    else if (chipAnalysis.foreign5 < -3000)
      chipPart = "外資持續賣超，注意風險！";
    else chipPart = "籌碼面持續觀察！";
  }
  return chipPart ? `${techPart}，${chipPart}` : `${techPart}！`;
}

function generateSubtitle(stock, ai, chipAnalysis) {
  const parts = [];
  if (chipAnalysis?.foreign5 > 500) parts.push("外資連續買超");
  if (chipAnalysis?.trust5 > 200) parts.push("投信積極回補");
  if (chipAnalysis?.total5 > 1000) parts.push("主力資金回流");
  if (ai.maStatus.includes("多頭排列")) parts.push("均線多頭排列");
  if (ai.volStatus === "放量上漲") parts.push("量價齊揚");
  if (stock.changePct > 3) parts.push(`強勢上漲 +${stock.changePct.toFixed(2)}%`);
  return parts.length > 0 ? parts.join(" + ") + "，帶動成長！" : ai.techConclude;
}

function calcChipDistribution(instData) {
  if (!instData?.length) return null;
  const rec = instData.slice(-20);
  const fBuy = Math.max(0, rec.reduce((s, d) => s + d.foreign, 0));
  const tBuy = Math.max(0, rec.reduce((s, d) => s + d.trust, 0));
  const dBuy = Math.max(0, rec.reduce((s, d) => s + d.dealer, 0));
  const baseF = 3500, baseT = 1200, baseD = 600, baseR = 4700;
  const totF = baseF + fBuy / 100;
  const totT = baseT + tBuy / 100;
  const totD = baseD + dBuy / 100;
  const total = totF + totT + totD + baseR;
  const rnd = v => Math.round(v / total * 1000) / 10;
  const fPct = rnd(totF), tPct = rnd(totT), dPct = rnd(totD);
  const rPct = Math.round((100 - fPct - tPct - dPct) * 10) / 10;
  return [
    { name: "外資",   pct: fPct,            color: "#3b82f6" },
    { name: "投信",   pct: tPct,            color: "#ef4444" },
    { name: "自營商", pct: dPct,            color: "#a855f7" },
    { name: "散戶",   pct: Math.max(0, rPct), color: "#f59e0b" },
  ];
}

function calcTechChecklist(stock, ai) {
  const items = [];
  if (ai.ma5 > ai.ma20 && ai.ma20 > ai.ma60)
    items.push({ text: "均線多頭排列", pass: true });
  else if (ai.ma5 < ai.ma20 && ai.ma20 < ai.ma60)
    items.push({ text: "均線空頭排列", pass: false });
  else
    items.push({ text: "均線糾結整理", pass: null });

  if (ai.volStatus === "縮量回檔")
    items.push({ text: "回檔量縮整理", pass: true });
  else if (ai.volStatus === "放量上漲")
    items.push({ text: "放量攻擊型態", pass: true });
  else if (ai.volStatus === "放量下跌")
    items.push({ text: "放量下跌警示", pass: false });
  else
    items.push({ text: "量能平穩觀察", pass: null });

  if (stock.kdK > stock.kdD && stock.kdK < 80)
    items.push({ text: "KD指標轉強", pass: true });
  else if (stock.kdK > 80)
    items.push({ text: "KD高檔鈍化", pass: null });
  else
    items.push({ text: "KD指標轉弱", pass: false });

  if (ai.macdStatus === "多頭擴張")
    items.push({ text: "MACD多頭擴張", pass: true });
  else if (ai.macdStatus === "多頭收斂")
    items.push({ text: "MACD紅柱縮減", pass: null });
  else if (ai.macdStatus === "空頭擴張")
    items.push({ text: "MACD空頭擴張", pass: false });
  else
    items.push({ text: "MACD空頭收斂", pass: null });

  if (stock.price > ai.ma20)
    items.push({ text: "站穩月線支撐", pass: true });
  else
    items.push({ text: "跌破月線支撐", pass: false });

  return items;
}

function generateThemes(stock, ai, chipAnalysis, fundamental, industry) {
  const themes = [];
  const ind = (industry || "").toLowerCase();
  if (ind.includes("半導體") || ind.includes("晶圓"))
    themes.push({ icon: "🤖", text: "AI晶片需求強勁" });
  if (ind.includes("伺服器") || ind.includes("電腦"))
    themes.push({ icon: "🖥️", text: "AI伺服器需求強勁" });
  if (ind.includes("網通") || ind.includes("通訊"))
    themes.push({ icon: "📡", text: "高速網通產品升級" });
  if (ind.includes("車") || ind.includes("汽車"))
    themes.push({ icon: "🚗", text: "車用電子持續成長" });
  if (ind.includes("電子") || ind.includes("零組件"))
    themes.push({ icon: "⚡", text: "電子零組件需求增溫" });
  if (ind.includes("pcb") || ind.includes("電路板"))
    themes.push({ icon: "🔧", text: "高階PCB供不應求" });
  if (ind.includes("工業") || ind.includes("自動化"))
    themes.push({ icon: "🏭", text: "智慧製造與工業自動化成長" });
  if (ai.tScore >= 65)
    themes.push({ icon: "📈", text: "技術多頭，上行動能強" });
  if (chipAnalysis?.foreign5 > 1000)
    themes.push({ icon: "💰", text: "外資持續加碼布局" });
  if (chipAnalysis?.trust5 > 200)
    themes.push({ icon: "🏦", text: "投信法人積極回補" });
  if (fundamental?.per?.pe && fundamental.per.pe < 18)
    themes.push({ icon: "💎", text: `本益比${fundamental.per.pe.toFixed(1)}倍，評價合理` });
  if (fundamental?.per?.div && fundamental.per.div > 4)
    themes.push({ icon: "💵", text: `殖利率${fundamental.per.div.toFixed(1)}%，高現金回報` });
  if (themes.length === 0) {
    themes.push({ icon: "📊", text: "基本面穩健成長" });
    themes.push({ icon: "🌐", text: "全球產業數位轉型加速" });
  }
  return themes.slice(0, 5);
}

const INDUSTRY_MAP = {
  "半導體業":       { desc: "高效能晶片設計與製造服務", items: ["晶片設計", "封裝測試", "AI加速器", "先進製程"] },
  "電腦及週邊設備業": { desc: "電腦系統及週邊設備製造", items: ["伺服器", "儲存設備", "工業電腦", "AI Edge"] },
  "電子零組件業":   { desc: "電子元件與精密模組製造", items: ["被動元件", "連接器", "電源模組", "感測器"] },
  "通信網路業":     { desc: "通訊網路設備與解決方案", items: ["網路設備", "5G設備", "光纖通訊", "雲端服務"] },
  "光電業":         { desc: "光電元件與顯示器技術", items: ["面板", "LED", "背光模組", "光學元件"] },
  "其他電子業":     { desc: "多元電子產品整合製造商", items: ["系統整合", "控制器", "工控模組", "物聯網"] },
  "電機機械":       { desc: "電機設備與動力控制系統", items: ["馬達", "變頻器", "電源系統", "工業控制"] },
  "電路板":         { desc: "印刷電路板製造領導廠商", items: ["高階PCB板", "伺服器板", "車用板", "網通板"] },
};

function getIndustryInfo(industry) {
  for (const [key, val] of Object.entries(INDUSTRY_MAP)) {
    if ((industry || "").includes(key)) return val;
  }
  return { desc: "多角化經營，持續擴展業務版圖", items: ["核心業務", "多角化", "研發創新", "全球布局"] };
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Data Fetching
// ═══════════════════════════════════════════════════════════════════════════════
async function fetchFinMind(code, period = "3m") {
  const res = await fetch(`/api/finmind?code=${code}&period=${period}`);
  if (!res.ok) throw new Error(`FinMind HTTP ${res.status}`);
  const { price, info } = await res.json();
  if (price.status !== 200 || !price.data?.length) throw new Error(`FinMind: ${price.msg || "no data"}`);
  const stockName = info.data?.[0]?.stock_name || code;
  const mktType   = info.data?.[0]?.type || "";
  const industry  = info.data?.[0]?.industry_category || "";
  const market    = mktType.includes("TWSE") || mktType.includes("上市") ? "上市"
    : mktType.includes("OTC") || mktType.includes("上櫃") ? "上櫃" : "台股";
  const candles = price.data.map(d => ({
    ds: d.date.slice(5).replace("-", "/"),
    open: +d.open, high: +d.max, low: +d.min, close: +d.close,
    volume: Math.round(+d.Trading_Volume / 1000),
    trading_money: +d.Trading_money || 0,
  })).filter(c => c.open > 0 && c.close > 0);
  if (candles.length < 5) throw new Error("FinMind: 資料不足");
  return { name: stockName, symbol: code, market, industry, candles, source: "FinMind" };
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
      trading_money: 0,
    };
  }).filter(c => c.open && c.close);
  if (candles.length < 5) throw new Error("Yahoo: 資料不足");
  return { name: meta.shortName || code, symbol: code, market: json._market || "上市", industry: "", candles, source: "Yahoo" };
}

async function fetchStock(code, period = "3m") {
  const errs = [];
  try { return await fetchFinMind(code, period); } catch (e) { errs.push(e.message); }
  try { return await fetchYahoo(code); }           catch (e) { errs.push(e.message); }
  throw new Error(`找不到 ${code}\n${errs.join("\n")}`);
}

async function fetchChip(code) {
  try {
    const res = await fetch(`/api/chip?code=${code}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

async function fetchFundamental(code) {
  try {
    const res = await fetch(`/api/fundamental?code=${code}`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════════════════════════
const fv = (v, d = 2) => v != null && !isNaN(v) ? Number(v).toFixed(d) : "—";
const numColor = v => v > 0 ? "#f87171" : v < 0 ? "#4ade80" : "#94a3b8";
const numFmt   = v => v === 0 ? "0" : v > 0 ? `+${v.toLocaleString()}` : v.toLocaleString();

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
//  UI Components
// ═══════════════════════════════════════════════════════════════════════════════

// ── Semi-circle Gauge ─────────────────────────────────────────────────────────
function SemiGauge({ score }) {
  const toRad = a => a * Math.PI / 180;
  const cx = 100, cy = 82, R = 68, thick = 13;
  const svgPt = a => [cx + R * Math.cos(toRad(a)), cy + R * Math.sin(toRad(a))];
  const scoreAngle = 180 + (score / 100) * 180;
  const needleLen = R - 18;
  const na = toRad(scoreAngle);
  const nxS = cx + needleLen * Math.cos(na), nyS = cy + needleLen * Math.sin(na);
  const clr = score >= 65 ? "#ef4444" : score >= 50 ? "#f97316" : score >= 35 ? "#eab308" : "#22c55e";
  const toneLabel = score >= 65 ? "強勢" : score >= 50 ? "趨勢偏強" : score >= 35 ? "中性" : "偏弱";

  const seg = (a1, a2, c, opacity = 0.35) => {
    const [x1, y1] = svgPt(a1), [x2, y2] = svgPt(a2);
    return <path key={a1} d={`M ${x1} ${y1} A ${R} ${R} 0 0 1 ${x2} ${y2}`}
      fill="none" stroke={c} strokeWidth={thick} opacity={opacity} />;
  };

  const [ax, ay] = svgPt(180);
  const [ex, ey] = svgPt(scoreAngle);
  const largeArc = scoreAngle - 180 > 180 ? 1 : 0;

  return (
    <svg viewBox="0 0 200 112" style={{ width: "100%", maxHeight: "140px" }}>
      {seg(180, 360, "#0f2035", 1)}
      {seg(180, 225, "#22c55e")}
      {seg(225, 270, "#eab308")}
      {seg(270, 315, "#f97316")}
      {seg(315, 360, "#ef4444")}
      {score > 0 && (
        <path d={`M ${ax} ${ay} A ${R} ${R} 0 ${largeArc} 1 ${ex} ${ey}`}
          fill="none" stroke={clr} strokeWidth={thick + 1} strokeLinecap="round" />
      )}
      {[0, 25, 50, 75, 100].map(v => {
        const a = toRad(180 + v * 1.8);
        const ox = cx + R * Math.cos(a), oy = cy + R * Math.sin(a);
        const ix = cx + (R - thick - 2) * Math.cos(a), iy = cy + (R - thick - 2) * Math.sin(a);
        return <line key={v} x1={ox} y1={oy} x2={ix} y2={iy} stroke="#0a1828" strokeWidth="2.5" />;
      })}
      <line x1={cx} y1={cy} x2={nxS} y2={nyS} stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="5" fill="white" />
      <text x={cx - 5} y={cy + 20} textAnchor="middle" fill={clr} fontSize="26" fontWeight="900">{score}</text>
      <text x={cx + 18} y={cy + 14} fill={clr} fontSize="9">/100</text>
      <text x={20} y={cy + 22} fill="#22c55e" fontSize="8" fontWeight="bold">弱勢</text>
      <text x={162} y={cy + 22} fill="#ef4444" fontSize="8" fontWeight="bold">強勢</text>
      <text x={cx} y={cy + 36} textAnchor="middle" fill={clr} fontSize="10" fontWeight="bold">{toneLabel}</text>
    </svg>
  );
}

// ── Donut Chart ───────────────────────────────────────────────────────────────
function DonutChart({ data }) {
  if (!data) return <div style={{ color: "#334155", fontSize: "0.68rem", padding: "16px", textAlign: "center" }}>籌碼資料載入中...</div>;
  const cx = 72, cy = 72, R = 55, innerR = 34;
  const toRad = a => a * Math.PI / 180;
  const total = data.reduce((s, d) => s + d.pct, 0);
  let startAngle = -90;
  const paths = data.map((d) => {
    const slice = (d.pct / total) * 360;
    const end = startAngle + slice;
    const x1 = cx + R * Math.cos(toRad(startAngle)), y1 = cy + R * Math.sin(toRad(startAngle));
    const x2 = cx + R * Math.cos(toRad(end)),         y2 = cy + R * Math.sin(toRad(end));
    const xi1 = cx + innerR * Math.cos(toRad(startAngle)), yi1 = cy + innerR * Math.sin(toRad(startAngle));
    const xi2 = cx + innerR * Math.cos(toRad(end)),         yi2 = cy + innerR * Math.sin(toRad(end));
    const large = slice > 180 ? 1 : 0;
    const path = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${xi2} ${yi2} A ${innerR} ${innerR} 0 ${large} 0 ${xi1} ${yi1} Z`;
    startAngle = end;
    return { path, color: d.color, name: d.name, pct: d.pct };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <svg viewBox="0 0 144 144" style={{ width: "110px", flexShrink: 0 }}>
        {paths.map((p, i) => (
          <path key={i} d={p.path} fill={p.color} opacity="0.85" stroke="#020b18" strokeWidth="1.5" />
        ))}
        <text x={cx} y={cy - 5} textAnchor="middle" fill="#475569" fontSize="9">籌碼</text>
        <text x={cx} y={cy + 8} textAnchor="middle" fill="#475569" fontSize="9">分布</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
        {paths.map((p, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.65rem" }}>
            <span style={{ width: "9px", height: "9px", borderRadius: "50%", background: p.color, flexShrink: 0 }} />
            <span style={{ color: "#64748b", minWidth: "34px" }}>{p.name}</span>
            <span style={{ color: p.color, fontWeight: 700 }}>{p.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Candle Chart ──────────────────────────────────────────────────────────────
function CandleChart({ candles, bb, displayN, resistance, support }) {
  const data = candles.slice(-displayN);
  const bbSlice = bb ? bb.slice(-displayN) : null;
  const prices = data.flatMap(c => [c.high, c.low]).filter(v => v > 0);
  if (!prices.length) return null;
  const bbPrices = bbSlice ? bbSlice.flatMap(b => [b?.upper, b?.lower]).filter(v => v != null) : [];
  const refPrices = [resistance, support].filter(Boolean);
  const allPrices = [...prices, ...bbPrices, ...refPrices];
  const minP = Math.min(...allPrices), maxP = Math.max(...allPrices), span = maxP - minP || 1;
  const pMin = minP - span * 0.07, pMax = maxP + span * 0.07;
  const W = 1000, H = 260, pT = 8, pB = 4;
  const cW = W / data.length, bW = cW * 0.62;
  const py = p => pT + (1 - (p - pMin) / (pMax - pMin)) * (H - pT - pB);
  const cxFn = i => (i + 0.5) * cW;
  const cls = data.map(c => c.close);
  const maLine = (ma, clr, w = 2.2) => {
    const segs = []; let seg = [];
    ma.forEach((v, i) => { if (v != null) seg.push(`${cxFn(i).toFixed(1)},${py(v).toFixed(1)}`); else if (seg.length) { segs.push(seg); seg = []; } });
    if (seg.length) segs.push(seg);
    return segs.map((s, j) => <polyline key={j} points={s.join(" ")} fill="none" stroke={clr} strokeWidth={w} />);
  };
  const bbLine = (vals, clr) => {
    if (!vals) return null;
    const segs = []; let seg = [];
    vals.forEach((v, i) => { if (v != null) seg.push(`${cxFn(i).toFixed(1)},${py(v).toFixed(1)}`); else if (seg.length) { segs.push(seg); seg = []; } });
    if (seg.length) segs.push(seg);
    return segs.map((s, j) => <polyline key={j} points={s.join(" ")} fill="none" stroke={clr} strokeWidth="1" strokeDasharray="5 3" opacity="0.4" />);
  };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "200px", display: "block" }} preserveAspectRatio="none">
      {[0.2, 0.4, 0.6, 0.8].map(r => <line key={r} x1={0} x2={W} y1={pT + r * (H - pT - pB)} y2={pT + r * (H - pT - pB)} stroke="#0a1828" strokeWidth="1" />)}
      {bbSlice && bbLine(bbSlice.map(b => b?.upper), "#475569")}
      {bbSlice && bbLine(bbSlice.map(b => b?.mid),   "#475569")}
      {bbSlice && bbLine(bbSlice.map(b => b?.lower), "#475569")}
      {maLine(calcMA(cls, 5), "#f59e0b")}
      {maLine(calcMA(cls, 10), "#22d3ee")}
      {maLine(calcMA(cls, 20), "#818cf8")}
      {resistance && <>
        <line x1={0} x2={W} y1={py(resistance)} y2={py(resistance)} stroke="#f87171" strokeWidth="1.5" strokeDasharray="8 4" opacity="0.75" />
        <text x={W - 6} y={py(resistance) - 5} textAnchor="end" fill="#f87171" fontSize="18" fontWeight="bold">壓力值：{resistance}</text>
      </>}
      {support && <>
        <line x1={0} x2={W} y1={py(support)} y2={py(support)} stroke="#4ade80" strokeWidth="1.5" strokeDasharray="8 4" opacity="0.75" />
        <text x={W - 6} y={py(support) + 20} textAnchor="end" fill="#4ade80" fontSize="18" fontWeight="bold">支撐值：{support}</text>
      </>}
      {data.map((c, i) => {
        const up = c.close >= c.open, clr = up ? "#f87171" : "#4ade80";
        const bT = py(Math.max(c.open, c.close)), bB = py(Math.min(c.open, c.close));
        return <g key={i}>
          <line x1={cxFn(i)} x2={cxFn(i)} y1={py(c.high)} y2={py(c.low)} stroke={clr} strokeWidth="1.5" />
          <rect x={cxFn(i) - bW / 2} y={bT} width={bW} height={Math.max(1.5, bB - bT)} fill={clr} />
        </g>;
      })}
    </svg>
  );
}

function VolChart({ candles, displayN }) {
  const data = candles.slice(-displayN);
  const maxV = Math.max(...data.map(c => c.volume || 0));
  const W = 1000, H = 55, cW = W / data.length, bW = cW * 0.65;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "44px", display: "block" }} preserveAspectRatio="none">
      {data.map((c, i) => {
        const up = c.close >= c.open, h = maxV > 0 ? (c.volume || 0) / maxV * H * 0.95 : 0;
        return <rect key={i} x={(i + 0.5) * cW - bW / 2} y={H - h} width={bW} height={h} fill={up ? "#f87171" : "#4ade80"} opacity="0.65" />;
      })}
    </svg>
  );
}

// ── Panel Box ─────────────────────────────────────────────────────────────────
const BADGE_CLR = ["", "#1d4ed8","#0e7490","#b45309","#7c3aed","#065f46","#92400e","#9f1239"];
function PanelBox({ num, title, children, conclude, warn }) {
  const bc = BADGE_CLR[num] || "#1d4ed8";
  return (
    <div style={{ background: warn ? "#180808" : "#060e1b", border: `1px solid ${warn ? "#7f1d1d" : "#0e2438"}`, borderRadius: "10px", padding: "8px 9px", display: "flex", flexDirection: "column", gap: "5px", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{ background: bc, color: "#fff", borderRadius: "50%", width: "20px", height: "20px", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.68rem", fontWeight: 900, flexShrink: 0 }}>{num}</span>
        <span style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.68rem", lineHeight: 1.2 }}>{title}</span>
      </div>
      <div style={{ flex: 1 }}>{children}</div>
      {conclude && (
        <div style={{ background: "#020b18", borderRadius: "5px", padding: "4px 7px", fontSize: "0.6rem", color: "#22d3ee", lineHeight: 1.4, borderTop: "1px solid #0e2438" }}>
          {conclude}
        </div>
      )}
    </div>
  );
}

// ① Institutional Bars
function InstitutionalPanel({ instData }) {
  if (!instData.length) return <div style={{ color: "#1e3a5f", fontSize: "0.65rem", padding: "12px", textAlign: "center" }}>法人資料載入中...</div>;
  const rec10 = instData.slice(-10);
  const tot = {
    foreign: rec10.reduce((s, d) => s + d.foreign, 0),
    trust:   rec10.reduce((s, d) => s + d.trust,   0),
    dealer:  rec10.reduce((s, d) => s + d.dealer,  0),
    total:   rec10.reduce((s, d) => s + d.total,   0),
  };
  const maxAbs = Math.max(Math.abs(tot.foreign), Math.abs(tot.trust), Math.abs(tot.dealer), Math.abs(tot.total), 1);
  const BarItem = ({ val, color, label }) => {
    const pct = Math.abs(val) / maxAbs * 100;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px", flex: 1 }}>
        <div style={{ height: "55px", display: "flex", alignItems: "flex-end", width: "100%", justifyContent: "center" }}>
          <div style={{ width: "70%", background: color, height: `${Math.max(3, pct * 0.55)}%`, borderRadius: "2px 2px 0 0", minHeight: "3px" }} />
        </div>
        <span style={{ fontSize: "0.52rem", color: "#334155" }}>{label}</span>
        <span style={{ fontSize: "0.58rem", color: numColor(val), fontWeight: 700 }}>{numFmt(val)}</span>
      </div>
    );
  };
  return (
    <div>
      <div style={{ fontSize: "0.56rem", color: "#334155", marginBottom: "3px" }}>單位：張</div>
      <div style={{ display: "flex", gap: "3px", marginBottom: "5px" }}>
        <BarItem val={tot.foreign} color="#3b82f6" label="外資" />
        <BarItem val={tot.trust}   color="#ef4444" label="投信" />
        <BarItem val={tot.dealer}  color="#a855f7" label="自營商" />
        <BarItem val={tot.total}   color="#f59e0b" label="合計" />
      </div>
      <div style={{ borderTop: "1px solid #0e2438", paddingTop: "4px" }}>
        {[["外資", tot.foreign], ["投信", tot.trust], ["自營商", tot.dealer], ["合計", tot.total]].map(([k, v]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6rem", marginBottom: "1px" }}>
            <span style={{ color: "#475569" }}>{k}</span>
            <span style={{ color: numColor(v), fontWeight: 700 }}>{numFmt(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ② Main Force Line Chart
function MainForcePanel({ instData, candles }) {
  if (!instData.length) return <div style={{ color: "#1e3a5f", fontSize: "0.65rem", padding: "12px", textAlign: "center" }}>載入中...</div>;
  const rec10 = instData.slice(-10);
  const priceMap = {};
  for (const c of candles) priceMap[c.ds] = c.close;
  let cum = 0;
  const rows = rec10.map(d => {
    cum += d.total;
    return { date: d.date.slice(5), daily: d.total, cum, price: priceMap[d.date.slice(5).replace("-", "/")] ?? null };
  });
  const latestRow = rows[rows.length - 1];
  const today = candles[candles.length - 1];
  const prev  = candles[candles.length - 2];
  const pctChg = prev ? ((today.close - prev.close) / prev.close * 100).toFixed(2) : "0.00";
  const allNets = rows.flatMap(r => [r.daily, r.cum]);
  const maxAbs  = Math.max(...allNets.map(Math.abs), 1);
  const prices  = rows.map(r => r.price).filter(Boolean);
  const pMin = prices.length ? Math.min(...prices) * 0.98 : 0;
  const pMax = prices.length ? Math.max(...prices) * 1.02 : 1;
  return (
    <div>
      <ResponsiveContainer width="100%" height={105}>
        <ComposedChart data={rows} margin={{ top: 2, right: 26, bottom: 0, left: -30 }}>
          <XAxis dataKey="date" tick={{ fontSize: 7, fill: "#334155" }} tickLine={false} />
          <YAxis yAxisId="l" domain={[-maxAbs * 1.2, maxAbs * 1.2]} tick={{ fontSize: 7, fill: "#3b82f6" }} tickLine={false}
            tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v} />
          <YAxis yAxisId="r" orientation="right" domain={[pMin, pMax]} tick={{ fontSize: 7, fill: "#f59e0b" }} tickLine={false} />
          <ReferenceLine yAxisId="l" y={0} stroke="#0e2438" />
          <Tooltip contentStyle={{ background: "#050d1a", border: "1px solid #0e2438", borderRadius: "5px", fontSize: "0.6rem" }}
            formatter={(v, n) => [typeof v === "number" ? v.toLocaleString() : v, n]} />
          <Bar yAxisId="l" dataKey="daily" name="每日增減" maxBarSize={9}>
            {rows.map((r, i) => <Cell key={i} fill={r.daily >= 0 ? "#3b82f6" : "#f87171"} />)}
          </Bar>
          <Line yAxisId="l" dataKey="cum" name="10日累計" stroke="#f59e0b" dot={false} strokeWidth={2} connectNulls />
          <Line yAxisId="r" dataKey="price" name="收盤價" stroke="#fb923c" dot={false} strokeWidth={1.5} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px", marginTop: "3px", fontSize: "0.58rem" }}>
        {[["主力增減", numFmt(latestRow?.daily ?? 0)], ["10日累計", numFmt(latestRow?.cum ?? 0)],
          ["收盤價", fv(today?.close)], ["股價幅度", `${pctChg >= 0 ? "+" : ""}${pctChg}%`]].map(([k, v]) => (
          <div key={k} style={{ background: "#020b18", borderRadius: "4px", padding: "2px 5px", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#334155" }}>{k}</span>
            <span style={{ color: "#c0cfe0", fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ③ Tech Checklist
function TechChecklistPanel({ stock, ai }) {
  const items = calcTechChecklist(stock, ai);
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "7px" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.65rem" }}>
            <span style={{ fontSize: "0.8rem", flexShrink: 0, lineHeight: 1,
              color: item.pass === true ? "#22c55e" : item.pass === false ? "#ef4444" : "#f59e0b" }}>
              {item.pass === true ? "✓" : item.pass === false ? "✗" : "△"}
            </span>
            <span style={{ color: item.pass === true ? "#d1fae5" : item.pass === false ? "#fee2e2" : "#fef3c7" }}>
              {item.text}
            </span>
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px", fontSize: "0.58rem" }}>
        <div>
          <div style={{ color: "#334155", marginBottom: "3px" }}>均線數據</div>
          {[["5MA", fv(stock.ma5), "#f59e0b"], ["10MA", fv(stock.ma10), "#22d3ee"], ["20MA", fv(stock.ma20), "#818cf8"]].map(([k, v, c]) => (
            <div key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: "2px" }}>
              <span style={{ color: c }}>{k}</span><span style={{ color: "#cbd5e1" }}>{v}</span>
            </div>
          ))}
        </div>
        <div>
          <div style={{ color: "#334155", marginBottom: "3px" }}>重點區間</div>
          <div style={{ background: "rgba(239,68,68,0.1)", borderRadius: "4px", padding: "2px 5px", marginBottom: "3px" }}>
            <div style={{ color: "#f87171", fontSize: "0.54rem" }}>壓力區</div>
            <div style={{ color: "#fca5a5", fontWeight: 700 }}>{ai.s1} ～ {ai.r1}</div>
          </div>
          <div style={{ background: "rgba(74,222,128,0.1)", borderRadius: "4px", padding: "2px 5px" }}>
            <div style={{ color: "#4ade80", fontSize: "0.54rem" }}>支撐區</div>
            <div style={{ color: "#86efac", fontWeight: 700 }}>{ai.s2} ～ {ai.s1}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ⑤ Theme Panel
function ThemePanel({ themes }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
      {themes.map((t, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.65rem", color: "#cbd5e1" }}>
          <span style={{ fontSize: "0.9rem", flexShrink: 0 }}>{t.icon}</span>
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

// ⑥ Risk Panel
function RiskPanel({ ai, chip, stock }) {
  const risks = [];
  if (stock.changePct > 5) risks.push("短線漲幅大，回檔風險升高");
  if (ai.rsi > 70) risks.push("RSI超買，注意高檔拉回");
  if (chip?.foreign5 < -500) risks.push("外資獲利了結賣壓出現");
  if (ai.volStatus === "放量下跌") risks.push("量增價跌，賣壓沉重");
  if (risks.length === 0) risks.push("技術面健康，注意量能變化");
  risks.push("終端需求不如預期風險");
  return (
    <div>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px", marginBottom: "7px" }}>
        {risks.slice(0, 4).map((r, i) => (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "4px", fontSize: "0.62rem" }}>
            <span style={{ color: "#f59e0b", flexShrink: 0, marginTop: "1px" }}>⚠</span>
            <span style={{ color: "#fef3c7" }}>{r}</span>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
        {[["壓力", ai.r1, "#f87171"], ["支撐", ai.s1, "#4ade80"], ["停損", ai.stop, "#fb923c"]].map(([k, v, c]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.62rem" }}>
            <span style={{ color: "#475569" }}>{k}</span>
            <span style={{ color: c, fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ⑦ Strategy Panel
function StrategyPanel({ ai, chip, recs }) {
  const medRecs = [
    ai.maStatus.includes("多頭排列") ? "趨勢多頭，逢回分批布局" : "等均線走穩後分批介入",
    chip?.foreign5 > 0 ? "法人持續買超，長線看好" : "法人動向持續觀察",
    `站穩 ${ai.s1} 以上，續抱波段`,
  ];
  return (
    <div>
      <div style={{ marginBottom: "7px" }}>
        <div style={{ color: "#f59e0b", fontSize: "0.62rem", fontWeight: 700, marginBottom: "4px" }}>短線操作（1～5日）</div>
        {recs.slice(0, 3).map((r, i) => (
          <div key={i} style={{ display: "flex", gap: "4px", fontSize: "0.6rem", color: "#cbd5e1", marginBottom: "3px", lineHeight: 1.3 }}>
            <span style={{ color: "#38bdf8", flexShrink: 0 }}>{i + 1}.</span><span>{r}</span>
          </div>
        ))}
      </div>
      <div>
        <div style={{ color: "#22d3ee", fontSize: "0.62rem", fontWeight: 700, marginBottom: "4px" }}>波段操作（1～4週）</div>
        {medRecs.map((r, i) => (
          <div key={i} style={{ display: "flex", gap: "4px", fontSize: "0.6rem", color: "#cbd5e1", marginBottom: "3px", lineHeight: 1.3 }}>
            <span style={{ color: "#22d3ee", flexShrink: 0 }}>{i + 1}.</span><span>{r}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Key Data Grid ─────────────────────────────────────────────────────────────
function KeyDataGrid({ stock, dateStr }) {
  const PC = stock.isUp ? "#f87171" : "#4ade80";
  const cells = [
    ["收盤", fv(stock.price), PC],
    ["漲跌", `${stock.isUp ? "▲" : "▼"} ${fv(Math.abs(stock.change))}`, PC],
    ["漲跌幅", `${stock.isUp ? "+" : ""}${fv(stock.changePct)}%`, PC],
    ["振幅", stock.amplitude ? `${fv(stock.amplitude, 2)}%` : "—", "#fbbf24"],
    ["最高", fv(stock.high), "#f87171"],
    ["漲停價", fv(stock.upLimit), "#f87171"],
    ["最低", fv(stock.low), "#4ade80"],
    ["跌停價", fv(stock.downLimit), "#4ade80"],
    ["成交量", `${(stock.vol || 0).toLocaleString()}`, "#e2e8f0"],
    ["成交金額", stock.trading_money ? `${(stock.trading_money / 1e8).toFixed(2)}億` : "—", "#94a3b8"],
  ];
  return (
    <div>
      <div style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.68rem", marginBottom: "5px" }}>
        關鍵數據 <span style={{ color: "#334155", fontWeight: 400, fontSize: "0.58rem" }}>({dateStr})</span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px 6px" }}>
        {cells.map(([k, v, c]) => (
          <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderBottom: "1px solid #0a1828" }}>
            <span style={{ color: "#334155", fontSize: "0.6rem" }}>{k}</span>
            <span style={{ color: c, fontSize: "0.63rem", fontWeight: 700 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Main App
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [code, setCode]             = useState("");
  const [quickCode, setQuickCode]   = useState("");
  const [period, setPeriod]         = useState("3m");
  const [phase, setPhase]           = useState("idle");
  const [stock, setStock]           = useState(null);
  const [candles, setCandles]       = useState([]);
  const [bb, setBb]                 = useState(null);
  const [ai, setAi]                 = useState(null);
  const [chip, setChip]             = useState(null);
  const [sig, setSig]               = useState(null);
  const [chipAnalysis, setChipAnalysis] = useState(null);
  const [fundamental, setFundamental]   = useState(null);
  const [industry, setIndustry]     = useState("");
  const [err, setErr]               = useState("");
  const [source, setSource]         = useState("");
  const watchlist = useWatchlist();
  const periodCandles = { "1m": 22, "3m": 65, "6m": 130, "1y": 252 };

  const run = async (overrideCode, overridePeriod) => {
    const c = (overrideCode ?? code).trim().replace(/\D/g, "");
    if (!c) return;
    if (overrideCode) setCode(overrideCode);
    const p = overridePeriod ?? period;
    setErr(""); setPhase("loading");
    setChip(null); setChipAnalysis(null); setBb(null); setFundamental(null); setIndustry("");

    try {
      const data = await fetchStock(c, p);
      const all   = data.candles;
      const cls   = all.map(x => x.close);
      const highs = all.map(x => x.high);
      const lows  = all.map(x => x.low);
      const ma5a  = calcMA(cls, 5);
      const ma10a = calcMA(cls, 10);
      const ma20a = calcMA(cls, 20);
      const ma60a = calcMA(cls, Math.min(60, cls.length));
      const rsia  = calcRSI(cls);
      const { dif, dea, hist } = calcMACD(cls);
      const { K, D } = calcKD(highs, lows, cls);
      const bba   = calcBB(cls);
      const n = cls.length - 1;

      const today = all[n], prevClose = all[n - 1]?.close ?? today.open;
      const change = today.close - prevClose, changePct = (change / prevClose) * 100;
      const amplitude  = (today.high - today.low) / prevClose * 100;
      const upLimit    = tickRound(prevClose * 1.1);
      const downLimit  = tickRound(prevClose * 0.9);

      const ind = {
        ma5: ma5a[n], ma10: ma10a[n], ma20: ma20a[n], ma60: ma60a[n],
        rsi: rsia[n], dif: dif[n], dea: dea[n], macd: hist[n], kdK: K[n], kdD: D[n],
      };
      const analysis = analyzeStock(today.close, all, ind);

      const stockObj = {
        name: data.name, code: c, exchange: data.market,
        price: today.close, open: today.open, high: today.high, low: today.low,
        vol: today.volume, trading_money: today.trading_money || 0,
        change, changePct, isUp: change >= 0,
        amplitude, upLimit, downLimit,
        ...ind,
      };

      const displayN = periodCandles[p] ?? 65;
      setSource(data.source); setCandles(all); setBb(bba);
      setStock(stockObj); setIndustry(data.industry || "");
      setAi({ ...analysis, rsi: rsia[n], ma10: ma10a[n] });
      setSig(calcFullSignal({ ...analysis, rsi: rsia[n] }, null));
      setPhase("done");

      fetchChip(c).then(raw => {
        if (!raw?.inst?.length) return;
        setChip(raw);
        const ca = analyzeChip(raw.inst, raw.margin || []);
        setChipAnalysis(ca);
        setSig(calcFullSignal({ ...analysis, rsi: rsia[n] }, ca));
      });
      fetchFundamental(c).then(fd => { if (fd) setFundamental(fd); });
    } catch (e) {
      setErr(e.message || "未知錯誤"); setPhase("error");
    }
  };

  // ── Idle / Error ──────────────────────────────────────────────────────────────
  if (phase === "idle" || phase === "error") return (
    <div style={{ minHeight: "100vh", background: "#020b18", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1.5rem" }}>
      <div style={{ textAlign: "center", marginBottom: "2rem" }}>
        <div style={{ fontSize: "0.65rem", color: "#1e3a5f", letterSpacing: "0.25em", marginBottom: "8px" }}>TAIWAN STOCK ANALYSIS SYSTEM</div>
        <h1 style={{ color: "#38bdf8", fontSize: "1.8rem", fontWeight: 900, textShadow: "0 0 30px #38bdf850", marginBottom: "6px" }}>台股技術分析系統</h1>
        <p style={{ color: "#334155", fontSize: "0.78rem" }}>FinMind ＋ Yahoo Finance ＋ 三大法人籌碼分析</p>
      </div>
      <div style={{ width: "100%", maxWidth: "400px", display: "flex", flexDirection: "column", gap: "0.7rem" }}>
        <input value={code} onChange={e => setCode(e.target.value)} onKeyDown={e => e.key === "Enter" && run()}
          placeholder="輸入股票代碼（如 2330）" autoFocus inputMode="numeric"
          style={{ width: "100%", padding: "1rem", borderRadius: "12px", background: "#060e1b", border: `2px solid ${phase === "error" ? "#ef4444" : "#1a3554"}`, color: "#f1f5f9", fontSize: "1.3rem", outline: "none", textAlign: "center", letterSpacing: "0.2em", boxSizing: "border-box" }} />
        <button onClick={() => run()} style={{ padding: "1rem", borderRadius: "12px", background: "linear-gradient(135deg,#1d4ed8,#7c3aed)", border: "none", color: "#fff", fontSize: "1rem", fontWeight: 700, cursor: "pointer" }}>
          開始分析 →
        </button>
        {phase === "error" && (
          <div style={{ background: "#180808", border: "1px solid #7f1d1d", borderRadius: "10px", padding: "0.8rem", color: "#fca5a5", fontSize: "0.75rem", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>⚠️ {err}</div>
        )}
        {watchlist.list.length > 0 && (
          <div style={{ background: "#060e1b", borderRadius: "10px", padding: "0.8rem", border: "1px solid #0e2438" }}>
            <div style={{ color: "#fbbf24", fontSize: "0.68rem", marginBottom: "6px", fontWeight: 700 }}>⭐ 自選股</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
              {watchlist.list.map(w => (
                <button key={w.code} onClick={() => run(w.code)}
                  style={{ background: "#0d1e30", border: "1px solid #1e3a5f", borderRadius: "6px", color: "#fbbf24", padding: "5px 10px", fontSize: "0.68rem", cursor: "pointer" }}>
                  {w.code} <span style={{ color: "#475569" }}>{w.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ background: "#060e1b", borderRadius: "10px", padding: "0.8rem", border: "1px solid #0e2438" }}>
          <div style={{ color: "#1e3a5f", fontSize: "0.66rem", marginBottom: "6px", fontWeight: 700 }}>熱門代碼</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
            {[["2330","台積電"],["2454","聯發科"],["6669","緯穎"],["2379","瑞昱"],["2313","華通"],["3661","世芯"],["2395","研華"],["2317","鴻海"]].map(([c, n]) => (
              <button key={c} onClick={() => run(c)} style={{ background: "#0a1828", border: "1px solid #1e3550", borderRadius: "5px", color: "#475569", padding: "5px 9px", fontSize: "0.68rem", cursor: "pointer" }}>{c} {n}</button>
            ))}
          </div>
        </div>
        <div style={{ color: "#1e3550", fontSize: "0.58rem", textAlign: "center" }}>資料來源：FinMind ＋ Yahoo Finance｜僅供技術分析參考，不構成投資建議</div>
      </div>
    </div>
  );

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (phase === "loading") return (
    <div style={{ minHeight: "100vh", background: "#020b18", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
      <div style={{ color: "#38bdf8", fontSize: "1.1rem", fontWeight: 700, marginBottom: "8px" }}>📡 連線資料源中...</div>
      <div style={{ color: "#334155", fontSize: "0.8rem" }}>股票代碼：{code}</div>
      <div style={{ display: "flex", gap: "8px", marginTop: "1.5rem" }}>
        {[0, 1, 2].map(i => <div key={i} style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#3b82f6", animation: `dot 0.8s ease-in-out ${i * 0.18}s infinite alternate` }} />)}
      </div>
      <style>{`@keyframes dot{from{transform:translateY(0);opacity:0.4}to{transform:translateY(-12px);opacity:1}}`}</style>
    </div>
  );

  if (!stock || !ai) return null;

  // ── Dashboard Values ──────────────────────────────────────────────────────────
  const PC        = stock.isUp ? "#f87171" : "#4ade80";
  const instData  = chip?.inst ?? [];
  const chipDist  = calcChipDistribution(instData.length ? instData : null);
  const recs      = genRecommendations(ai, chipAnalysis);
  const themes    = generateThemes(stock, ai, chipAnalysis, fundamental, industry);
  const mfWarning = calcMainForceWarning(ai, chipAnalysis, stock.changePct);
  const headline  = generateHeadline(stock, ai, chipAnalysis);
  const subtitle  = generateSubtitle(stock, ai, chipAnalysis);
  const indInfo   = getIndustryInfo(industry);
  const displayN  = periodCandles[period] ?? 65;
  const inWatch   = watchlist.has(stock.code);
  const now = new Date();
  const dateStr = `${now.getMonth() + 1}/${String(now.getDate()).padStart(2, "0")}`;

  return (
    <div style={{ minHeight: "100vh", background: "#020b18", color: "#f1f5f9", fontSize: "12px" }}>

      {/* ── TITLE HEADER ── */}
      <div style={{ background: "#030d1c", borderBottom: "1px solid #0e2438", padding: "8px 14px 6px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: "1.45rem", fontWeight: 900, color: "#f1f5f9", lineHeight: 1.15, marginBottom: "2px" }}>
              {stock.name}（{stock.code}）{headline}
            </h1>
            <div style={{ color: "#475569", fontSize: "0.72rem" }}>{subtitle}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
            <form onSubmit={e => { e.preventDefault(); const c = quickCode.trim().replace(/\D/g,""); if (c) { run(c); setQuickCode(""); } }} style={{ display: "flex", gap: "3px" }}>
              <input value={quickCode} onChange={e => setQuickCode(e.target.value)} placeholder="換股" inputMode="numeric"
                style={{ width: "65px", padding: "4px 7px", borderRadius: "6px", background: "#060e1b", border: "1px solid #1a3554", color: "#e2e8f0", fontSize: "0.7rem", outline: "none", textAlign: "center" }} />
              <button type="submit" style={{ padding: "4px 9px", borderRadius: "6px", background: "#1a3554", border: "none", color: "#38bdf8", fontSize: "0.7rem", cursor: "pointer" }}>→</button>
            </form>
            <button onClick={() => watchlist.toggle(stock.code, stock.name)}
              style={{ background: inWatch ? "rgba(251,191,36,0.12)" : "none", border: `1px solid ${inWatch ? "#fbbf24" : "#1a3554"}`, borderRadius: "6px", color: inWatch ? "#fbbf24" : "#334155", padding: "4px 9px", cursor: "pointer", fontSize: "0.82rem" }}>
              {inWatch ? "★" : "☆"}
            </button>
            <button onClick={() => { setPhase("idle"); setStock(null); setAi(null); setChip(null); setChipAnalysis(null); }}
              style={{ background: "none", border: "1px solid #1a3554", borderRadius: "6px", color: "#334155", padding: "4px 9px", cursor: "pointer", fontSize: "0.68rem" }}>🏠</button>
            <div style={{ display: "flex", gap: "2px" }}>
              {[["1m","1M"],["3m","3M"],["6m","6M"],["1y","1Y"]].map(([p, label]) => (
                <button key={p} onClick={() => { setPeriod(p); run(undefined, p); }}
                  style={{ padding: "3px 7px", borderRadius: "4px", fontSize: "0.6rem", cursor: "pointer", fontWeight: period === p ? 800 : 400, background: period === p ? "#1a3554" : "none", border: `1px solid ${period === p ? "#3b82f6" : "#1a3554"}`, color: period === p ? "#60a5fa" : "#334155" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── TOP SECTION: 3 columns ── */}
      <div style={{ display: "grid", gridTemplateColumns: "400px 1fr 230px", gap: "7px", padding: "7px 10px 5px" }}>

        {/* LEFT: Company */}
        <div style={{ background: "#060e1b", border: "1px solid #0e2438", borderRadius: "10px", padding: "14px 16px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px", borderBottom: "1px solid #0e2438", paddingBottom: "7px" }}>
            <div style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.82rem" }}>公司主要經營項目</div>
            <div style={{ fontSize: "0.6rem", background: "#0a1828", border: "1px solid #1a3554", borderRadius: "5px", padding: "2px 8px", color: "#475569" }}>{industry || "電子科技產業"}</div>
          </div>

          {/* Description */}
          <div style={{ color: "#64748b", fontSize: "0.72rem", lineHeight: 1.65, marginBottom: "12px", padding: "6px 10px", background: "#020b18", borderRadius: "7px", border: "1px solid #0e2438" }}>
            ▶ {indInfo.desc}
          </div>

          {/* Product items: 2x2 grid, bigger cells */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "12px" }}>
            {indInfo.items.map((item, i) => (
              <div key={i} style={{ background: "#0a1828", borderRadius: "8px", padding: "12px 10px", textAlign: "center", border: "1px solid #1a3554", display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                <div style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600 }}>{item}</div>
              </div>
            ))}
          </div>

          {/* Signal box — wider layout */}
          <div style={{ background: "#020b18", borderRadius: "8px", padding: "10px 14px", border: `1px solid ${sig?.color || "#1a3554"}50`, display: "flex", alignItems: "center", gap: "14px" }}>
            <div style={{ fontSize: "2.2rem", fontWeight: 900, color: sig?.color, lineHeight: 1, flexShrink: 0,
              textShadow: `0 0 20px ${sig?.color}80`, border: `2px solid ${sig?.color}60`, borderRadius: "8px", padding: "2px 14px", background: `${sig?.color}18` }}>
              {sig?.char}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: sig?.color, fontSize: "0.8rem", fontWeight: 700, marginBottom: "2px" }}>{sig?.action}</div>
              <div style={{ color: "#64748b", fontSize: "0.65rem", marginBottom: "2px" }}>{sig?.desc}</div>
              <div style={{ color: "#334155", fontSize: "0.6rem" }}>{sig?.subtitle}</div>
            </div>
          </div>
        </div>

        {/* CENTER: K-chart */}
        <div style={{ background: "#060e1b", border: "1px solid #0e2438", borderRadius: "10px", padding: "8px 10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px", flexWrap: "wrap", gap: "4px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ color: "#334155", fontSize: "0.62rem", fontWeight: 700 }}>日K線圖</span>
              <span style={{ color: "#f59e0b", fontSize: "0.6rem" }}>5MA {fv(stock.ma5)}</span>
              <span style={{ color: "#22d3ee", fontSize: "0.6rem" }}>10MA {fv(stock.ma10)}</span>
              <span style={{ color: "#818cf8", fontSize: "0.6rem" }}>20MA {fv(stock.ma20)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div style={{ background: "#020b18", borderRadius: "5px", padding: "4px 8px", fontSize: "0.62rem", border: "1px solid #0e2438" }}>
                <span style={{ color: "#475569" }}>最高 </span><b style={{ color: "#f87171" }}>{fv(stock.high)}</b>
                <span style={{ color: "#475569", marginLeft: "8px" }}>最低 </span><b style={{ color: "#4ade80" }}>{fv(stock.low)}</b>
                <span style={{ color: "#475569", marginLeft: "8px" }}>收盤 </span><b style={{ color: PC }}>{fv(stock.price)}</b>
              </div>
              <div>
                <div style={{ fontSize: "1.4rem", fontWeight: 900, color: PC, lineHeight: 1 }}>{fv(stock.price)}</div>
                <div style={{ color: PC, fontSize: "0.7rem", fontWeight: 700 }}>
                  {stock.isUp ? "▲" : "▼"} {fv(Math.abs(stock.change))} ({stock.isUp ? "+" : ""}{fv(stock.changePct)}%)
                </div>
              </div>
            </div>
          </div>
          <CandleChart candles={candles} bb={bb} displayN={displayN} resistance={ai.r1} support={ai.s1} />
          <div style={{ borderTop: "1px solid #090f1e", paddingTop: "2px" }}>
            <div style={{ color: "#1a3554", fontSize: "0.56rem", marginBottom: "1px" }}>成交量 {(stock.vol || 0).toLocaleString()} 張</div>
            <VolChart candles={candles} displayN={displayN} />
          </div>
        </div>

        {/* RIGHT: Key data + Gauge */}
        <div style={{ display: "flex", flexDirection: "column", gap: "7px" }}>
          <div style={{ background: "#060e1b", border: "1px solid #0e2438", borderRadius: "10px", padding: "10px" }}>
            <KeyDataGrid stock={stock} dateStr={dateStr} />
          </div>
          <div style={{ background: "#060e1b", border: "1px solid #0e2438", borderRadius: "10px", padding: "10px", flex: 1 }}>
            <div style={{ color: "#38bdf8", fontWeight: 700, fontSize: "0.68rem", marginBottom: "2px" }}>技術趨勢強度</div>
            <SemiGauge score={sig?.total ?? ai.tScore} />
            <div style={{ textAlign: "center", fontSize: "0.58rem", color: "#1e3a5f", marginTop: "3px", lineHeight: 1.4 }}>
              {sig?.desc || ai.techConclude}
            </div>
          </div>
        </div>
      </div>

      {/* ── BOTTOM: 7 panels ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "6px", padding: "0 10px 8px" }}>
        <PanelBox num={1} title="三大法人進出（10日）"
          conclude={chipAnalysis ? `${chipAnalysis.foreign5 > 0 ? "外資連買超，" : "外資賣超，"}法人資金${chipAnalysis.total5 > 0 ? "積極回補！" : "持續觀察"}` : "法人資料載入中..."}>
          <InstitutionalPanel instData={instData} />
        </PanelBox>

        <PanelBox num={2} title="主力進出（10日累計）"
          conclude={instData.length ? `主力資金${chipAnalysis?.total5 > 0 ? "回流，近3日加碼明顯！" : "中性，持續留意方向"}` : "載入中..."}>
          <MainForcePanel instData={instData} candles={candles} />
        </PanelBox>

        <PanelBox num={3} title="技術面分析"
          conclude={ai.tScore >= 60 ? `技術健康，${ai.volStatus === "縮量回檔" ? "整理後有利續攻！" : "多頭格局強勢！"}` : ai.tScore >= 45 ? "技術中性，等待方向確認" : "技術偏弱，謹慎操作"}>
          <TechChecklistPanel stock={stock} ai={ai} />
        </PanelBox>

        <PanelBox num={4} title="籌碼結構"
          conclude={chipAnalysis ? `籌碼${chipAnalysis.cScore >= 60 ? "偏多，對股價形成支撐！" : "中性，持續觀察法人動向"}` : "載入中..."}>
          <DonutChart data={chipDist} />
        </PanelBox>

        <PanelBox num={5} title="題材與基本面"
          conclude={chipAnalysis?.cScore >= 60 ? "AI + 產業雙引擎，長線成長可期！" : "基本面持續追蹤中"}>
          <ThemePanel themes={themes} />
        </PanelBox>

        <PanelBox num={6} title="風險提醒" warn={mfWarning.stars >= 4}
          conclude={stock.changePct > 5 ? "短線漲幅大，追價風險升高！" : "順勢操作，嚴守停損紀律"}>
          <RiskPanel ai={ai} chip={chipAnalysis} stock={stock} />
        </PanelBox>

        <PanelBox num={7} title="操作策略"
          conclude="順勢操作，嚴守停損紀律管風險">
          <StrategyPanel ai={ai} chip={chipAnalysis} recs={recs} />
        </PanelBox>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ background: "#030d1c", borderTop: "1px solid #0e2438", padding: "6px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.58rem", color: "#1a3554" }}>
          <span>⚙️</span><span>資料來源：{source} ｜ {dateStr}</span>
        </div>
        <div style={{ color: "#ef4444", fontWeight: 700, fontSize: "0.75rem" }}>
          ⚠ 投資有風險，請謹慎評估
        </div>
        <div style={{ fontSize: "0.58rem", color: source === "FinMind" ? "#22c55e" : "#fbbf24" }}>
          ● {source}
        </div>
      </div>
    </div>
  );
}
