// Vercel Serverless Function: /api/fundamental
// 基本面速覽：本益比/PBR/殖利率 + 月營收 (FinMind 免費版)
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  const { code } = req.query;
  if (!code || !/^\d+$/.test(code)) {
    return res.status(400).json({ error: "Invalid stock code" });
  }

  const BASE = "https://api.finmindtrade.com/api/v4/data";

  // 本益比抓近 90 天（取最後一筆）
  const perStart = new Date();
  perStart.setDate(perStart.getDate() - 90);
  const perStartStr = perStart.toISOString().split("T")[0];

  // 月營收抓近 2 年（計算同期比較）
  const revStart = new Date();
  revStart.setFullYear(revStart.getFullYear() - 2);
  const revStartStr = revStart.toISOString().split("T")[0];

  try {
    const [perResp, revResp] = await Promise.all([
      fetch(`${BASE}?dataset=TaiwanStockPER&data_id=${code}&start_date=${perStartStr}`),
      fetch(`${BASE}?dataset=TaiwanStockMonthRevenue&data_id=${code}&start_date=${revStartStr}`),
    ]);

    const perJson = perResp.ok ? await perResp.json() : { data: [] };
    const revJson = revResp.ok ? await revResp.json() : { data: [] };

    // 取最新一筆 PER/PBR/殖利率
    const perRows = perJson.data || [];
    const latest  = perRows.length ? perRows[perRows.length - 1] : null;
    const per = latest ? {
      date:   latest.date,
      pe:     Number(latest.PER)           || null,
      pb:     Number(latest.PBR)           || null,
      div:    Number(latest.DividendYield) || null,
    } : null;

    // 月營收：近 13 筆（最近 13 個月，方便計算同期年增率）
    const revRaw   = revJson.data || [];
    const revSlice = revRaw.slice(-13);

    const revenue = revSlice.map((r, i) => {
      const rev    = Number(r.revenue || 0);
      const prevYr = revSlice[i - 12]?.revenue ?? null;  // 去年同期
      const yoy    = prevYr ? ((rev - prevYr) / prevYr * 100) : null;
      return {
        label:   `${r.revenue_year}/${String(r.revenue_month).padStart(2, "0")}`,
        year:    r.revenue_year,
        month:   r.revenue_month,
        revenue: rev,                                     // 單位：千元
        yoy:     yoy != null ? Math.round(yoy * 10) / 10 : null,
      };
    }).slice(-12); // 最近 12 個月

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
    return res.status(200).json({ per, revenue });
  } catch (err) {
    return res.status(500).json({ error: err.message || "fundamental fetch failed" });
  }
}
