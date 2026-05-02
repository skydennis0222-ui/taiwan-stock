// Vercel Serverless Function: /api/chip
// 三大法人 + 融資融券 proxy (FinMind, no auth required for free datasets)
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

    // Aggregate institutional investors by date → units: 張 (= 1000 shares)
    const byDate = {};
    for (const row of instJson.data || []) {
      const d = row.date;
      if (!byDate[d]) byDate[d] = { date: d, foreign: 0, trust: 0, dealer: 0, total: 0 };
      const net  = Math.round((Number(row.buy) - Number(row.sell)) / 1000);
      const name = row.name || "";
      if (name.includes("外資") || name.includes("外陸資")) byDate[d].foreign += net;
      else if (name.includes("投信"))                       byDate[d].trust   += net;
      else if (name.includes("自營"))                       byDate[d].dealer  += net;
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
