// Vercel Serverless Function: /api/chip
// 三大法人 + 融資融券 proxy (FinMind)
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { code } = req.query;
  if (!code || !/^\d+$/.test(code)) {
    return res.status(400).json({ error: "Invalid stock code" });
  }

  const start = new Date();
  start.setDate(start.getDate() - 50);
  const startStr = start.toISOString().split("T")[0];
  const BASE = "https://api.finmindtrade.com/api/v4/data";

  try {
    const [instResp, marginResp] = await Promise.all([
      fetch(`${BASE}?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${code}&start_date=${startStr}`),
      fetch(`${BASE}?dataset=TaiwanStockMarginPurchaseShortSale&data_id=${code}&start_date=${startStr}`),
    ]);

    const instJson   = await instResp.json();
    const marginJson = marginResp.ok ? await marginResp.json() : { data: [] };

    const rows = instJson.data || [];

    // 用第一筆 buy 或 sell > 0 的資料偵測單位（避免取到 0 值列）
    const nonZero = rows.find(r => Number(r.buy || 0) > 0 || Number(r.sell || 0) > 0);
    const sampleVal = nonZero
      ? Math.max(Number(nonZero.buy || 0), Number(nonZero.sell || 0))
      : 0;
    // FinMind 可能回傳「股」(需 /1000) 或「張」(直接用)
    // 台股散戶單日 1 張 = 1000 股；法人通常幾千張，若 sampleVal > 500000 視為股
    const divisor = sampleVal > 500000 ? 1000 : 1;

    // FinMind 機構名稱：中文或英文皆相容
    // 英文版: Foreign_Institutional_Investors, Investment_Trust, Dealer_self, Dealer_Hedging, Foreign_Dealer_Self
    // 中文版: 外資及陸資(不含外資自營商), 投信, 自營商(自行買賣), 自營商(避險), 外資自營商
    // Foreign: 任何 "Foreign" 開頭但不含 "Dealer" 的名稱，或中文外資名稱
    // 已知: Foreign_Institutional_Investors / Foriegnr / Foreign_Institutional_Investor
    const isForeign = n =>
      (n.startsWith("Foreign") && !n.includes("Dealer")) ||
      n.includes("外資及陸資") ||
      n.includes("外陸資") ||
      n === "外資";
    const isTrust = n =>
      n === "Investment_Trust" ||
      n.includes("投信");
    // Dealer: 自行買賣、避險、外資自營商
    const isDealer = n =>
      n.includes("Dealer") ||
      n.includes("自營");

    // Aggregate by date
    const byDate = {};
    for (const row of rows) {
      const d = row.date;
      if (!byDate[d]) byDate[d] = { date: d, foreign: 0, trust: 0, dealer: 0, total: 0 };
      const net  = Math.round((Number(row.buy || 0) - Number(row.sell || 0)) / divisor);
      const name = row.name || "";
      if      (isForeign(name)) byDate[d].foreign += net;
      else if (isTrust(name))   byDate[d].trust   += net;
      else if (isDealer(name))  byDate[d].dealer  += net;
    }

    const instData = Object.values(byDate)
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .map(d => ({ ...d, total: d.foreign + d.trust + d.dealer }))
      .slice(-20);

    // Margin / short data
    const marginData = (marginJson.data || []).slice(-20).map(r => ({
      date:           r.date,
      margin_balance: Number(r.MarginPurchaseTodayBalance || 0),
      margin_buy:     Number(r.MarginPurchaseBuy          || 0),
      margin_sell:    Number(r.MarginPurchaseSell         || 0),
      short_balance:  Number(r.ShortSaleTodayBalance      || 0),
      short_sell:     Number(r.ShortSaleSell              || 0),
      short_buy:      Number(r.ShortSaleBuy               || 0),
    }));

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({ inst: instData, margin: marginData });
  } catch (err) {
    return res.status(500).json({ error: err.message || "chip fetch failed" });
  }
}
