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

  // ── ?id= mode: resolve seekplayer hash → proxy master m3u8 ────────────────
  const id = url.searchParams.get("id");
  if (id) {
    if (!/^[a-z0-9]+$/.test(id)) return new Response("invalid id", { status: 400 });

    const SP_HEADERS = {
      "Referer": "https://mhd.seekplayer.me/",
      "Origin": "https://mhd.seekplayer.me",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    };

    const apiRes = await fetch(`https://mhd.seekplayer.me/api/v1/video?id=${id}&w=1920&h=1080&r=`, { headers: SP_HEADERS });
    if (!apiRes.ok) return new Response(`api ${apiRes.status}`, { status: apiRes.status });

    const KEY = new TextEncoder().encode("kiemtienmua911ca");
    const IV  = new TextEncoder().encode("1234567890oiuytr");
    const hex = await apiRes.text();
    const cipher = new Uint8Array(hex.match(/../g)!.map((h: string) => parseInt(h, 16)));
    const cryptoKey = await crypto.subtle.importKey("raw", KEY, { name: "AES-CBC" }, false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-CBC", iv: IV }, cryptoKey, cipher);
    const data = JSON.parse(new TextDecoder().decode(plain));

    if (!data.source) return new Response("no source", { status: 502 });

    const m3u8Res = await fetch(data.source, { headers: SP_HEADERS });
    if (!m3u8Res.ok) return new Response(`m3u8 ${m3u8Res.status}`, { status: m3u8Res.status });

    const text = await m3u8Res.text();
    const workerBase = `${url.origin}${url.pathname}`;
    const rewriteUri = (uri: string) => {
      const abs = uri.startsWith("http") ? uri : new URL(uri, data.source).href;
      return `${workerBase}?url=${encodeURIComponent(abs)}`;
    };
    const rewritten = text.split("\n").map((line: string) => {
      const t = line.trim();
      if (t.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_: string, u: string) => `URI="${rewriteUri(u)}"`);
      if (t === "") return line;
      return rewriteUri(t.startsWith("http") ? t : new URL(t, data.source).href);
    }).join("\n");

    return new Response(rewritten, {
      status: 200,
      headers: { "Content-Type": "application/vnd.apple.mpegurl", "Access-Control-Allow-Origin": "*" },
    });
  }

  // ── ?url= mode: proxy segment / m3u8 ──────────────────────────────────────
  const target = url.searchParams.get("url");

  if (!target) return new Response("missing url param", { status: 400 });

  let targetUrl: URL;
  try {
    targetUrl = new URL(target);
  } catch {
    return new Response("invalid url", { status: 400 });
  }

  const isSeekplayer = /^\d+\.\d+\.\d+\.\d+$/.test(targetUrl.hostname) || targetUrl.hostname.endsWith("seekplayer.me");
  const isSenpai = targetUrl.hostname.endsWith("senpai-stream.club");

  if (!isSenpai && !isSeekplayer) {
    return new Response("forbidden", { status: 403 });
  }

  const fetchHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    ...(isSeekplayer ? {
      "Origin": "https://mhd.seekplayer.me",
      "Referer": "https://mhd.seekplayer.me/",
    } : {
      "Origin": "https://purstream.ac",
      "Referer": "https://purstream.ac/",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
    }),
  };

  const res = await fetch(target, {
    method: req.method,
    headers: fetchHeaders,
  });

  if (!res.ok) {
    return new Response(`upstream ${res.status}`, { status: res.status });
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
