// Vercel Serverless Function: /api/yahoo
// Fallback proxy to Yahoo Finance
export default async function handler(req, res) {
  const { code } = req.query;

  if (!code || !/^\d+$/.test(code)) {
    return res.status(400).json({ error: "Invalid stock code" });
  }

  const tryFetch = async (suffix) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${code}${suffix}?interval=1d&range=6mo`;
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!r.ok) return null;
    const json = await r.json();
    if (!json?.chart?.result?.[0]) return null;
    return { json, suffix };
  };

  try {
    let result = await tryFetch(".TW");
    let market = "上市";
    if (!result) {
      result = await tryFetch(".TWO");
      market = "上櫃";
    }

    if (!result) {
      return res.status(404).json({ error: `Stock ${code} not found on Yahoo` });
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json({ ...result.json, _market: market });
  } catch (err) {
    return res.status(500).json({ error: err.message || "fetch failed" });
  }
}
