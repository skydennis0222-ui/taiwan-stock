// Vercel Serverless Function: /api/finmind
// Proxies requests to FinMind to avoid CORS issues
export default async function handler(req, res) {
  const { code } = req.query;

  if (!code || !/^\d+$/.test(code)) {
    return res.status(400).json({ error: "Invalid stock code" });
  }

  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 7);
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
    const info = infoResp.ok ? await infoResp.json() : { data: [] };

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ price, info });
  } catch (err) {
    return res.status(500).json({ error: err.message || "fetch failed" });
  }
}
