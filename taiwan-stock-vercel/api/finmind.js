// Vercel Serverless Function: /api/finmind
// Proxies requests to FinMind to avoid CORS issues
// period: "1m"=1月, "3m"=3月(預設), "6m"=6月, "1y"=15月
export default async function handler(req, res) {
  const { code, period } = req.query;

  if (!code || !/^\d+$/.test(code)) {
    return res.status(400).json({ error: "Invalid stock code" });
  }

  // 根據 period 決定往回抓幾個月
  const monthsMap = { "1m": 3, "3m": 7, "6m": 10, "1y": 15 };
  const months = monthsMap[period] ?? 7;   // 預設 7 個月（約 3M 顯示用）

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - months);
  const startStr = startDate.toISOString().split("T")[0];

  try {
    const [priceResp, infoResp] = await Promise.all([
      fetch(
        `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${code}&start_date=${startStr}`
      ),
      fetch(
        `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockInfo&data_id=${code}`
      ),
    ]);

    const price = await priceResp.json();
    const info  = infoResp.ok ? await infoResp.json() : { data: [] };

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ price, info });
  } catch (err) {
    return res.status(500).json({ error: err.message || "fetch failed" });
  }
}
