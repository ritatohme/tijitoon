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

  if (!targetUrl.hostname.endsWith("senpai-stream.club")) {
    return new Response("forbidden", { status: 403, headers: corsHeaders });
  }

  const res = await fetch(target, {
    method: req.method,
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
      "Accept": "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Origin": "https://purstream.ac",
      "Referer": "https://purstream.ac/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
    },
  });

  if (!res.ok) {
    return new Response(`upstream ${res.status}`, { status: res.status, headers: corsHeaders });
  }

  const contentType = res.headers.get("Content-Type") ?? "";
  const isM3U8 = target.includes(".m3u8") || contentType.includes("mpegurl");

  if (isM3U8) {
    const text = await res.text();
    const workerBase = `${url.origin}${url.pathname}`;

    const rewriteUri = (uri: string) => {
      const absolute = uri.startsWith("http") ? uri : new URL(uri, target).href;
      return `${workerBase}?url=${encodeURIComponent(absolute)}`;
    };

    const rewritten = text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        // Rewrite URI="..." attributes in any tag line
        if (trimmed.startsWith("#")) {
          return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${rewriteUri(uri)}"`);
        }
        if (trimmed === "") return line;
        // Bare URL line (segment or sub-playlist)
        const absolute = trimmed.startsWith("http") ? trimmed : new URL(trimmed, target).href;
        return `${workerBase}?url=${encodeURIComponent(absolute)}`;
      })
      .join("\n");

    return new Response(rewritten, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": contentType || "video/mp2t",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
