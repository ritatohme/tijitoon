Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }

  const url = new URL(req.url);
  const target = url.searchParams.get("url");

  const corsHeaders = { "Access-Control-Allow-Origin": "*" };

  if (!target) return new Response("missing url param", { status: 400, headers: corsHeaders });

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("invalid url", { status: 400, headers: corsHeaders });
  }

  if (targetUrl.hostname !== "player.odycdn.com") {
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  const upstreamHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Origin": "https://odysee.com",
    "Referer": "https://odysee.com/",
    "Sec-Fetch-Dest": "video",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "cross-site",
    "Sec-CH-UA": '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    "Sec-CH-UA-Mobile": "?0",
    "Sec-CH-UA-Platform": '"Windows"',
    "X-Odysee-User-Id": "1933509056",
  };

  const range = req.headers.get("Range");
  if (range) upstreamHeaders["Range"] = range;

  const ifRange = req.headers.get("If-Range");
  if (ifRange) upstreamHeaders["If-Range"] = ifRange;

  // Warm up the URL with a HEAD request first, then do the real request
  await fetch(target, { method: "HEAD", headers: upstreamHeaders });

  const res = await fetch(target, { method: req.method, headers: upstreamHeaders });

  console.log("upstream", res.status, target);

  const resHeaders = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Expose-Headers": "content-range, content-length, accept-ranges",
    "Content-Type": res.headers.get("Content-Type") || "video/mp4",
    "Accept-Ranges": "bytes",
  });
  if (res.headers.get("Content-Range")) resHeaders.set("Content-Range", res.headers.get("Content-Range")!);
  if (res.headers.get("Content-Length")) resHeaders.set("Content-Length", res.headers.get("Content-Length")!);

  return new Response(res.body, { status: res.status, headers: resHeaders });
});
