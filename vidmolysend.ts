// t99
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "range",
  "Access-Control-Expose-Headers": "content-range, content-length, accept-ranges",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

Deno.serve(async (request: Request) => {
  const url = new URL(request.url);

  if (request.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  // ── /vidmoly?id=<embed_id> ────────────────────────────────────────────────
  if (url.pathname === "/vidmoly") {
    const id = url.searchParams.get("id");
    if (!id || !/^[a-z0-9]+$/i.test(id)) {
      return new Response("missing id", { status: 400, headers: CORS });
    }

    try {
      const html = await fetch("https://vidmoly.biz/embed-" + id + ".html", {
        headers: { "User-Agent": UA, "Referer": "https://vidmoly.biz/" },
      }).then((r: Response) => r.text());

      const match = html.match(/file:\s*'(https?:\/\/[^']+\.m3u8[^']+)'/);
      if (!match) return new Response("no m3u8 found", { status: 502, headers: CORS });

      const m3u8Url = match[1];
      const m3u8Res = await fetch(m3u8Url, {
        headers: { "User-Agent": UA, "Referer": "https://vidmoly.biz/" },
      });
      if (!m3u8Res.ok) return new Response("m3u8 error: " + m3u8Res.status, { status: 502, headers: CORS });

      const m3u8Text = await m3u8Res.text();
      const proxyBase = url.origin;

      const rewritten = m3u8Text.split("\n").map((line: string) => {
        const t = line.trim();
        const rewrittenLine = line.replace(/URI="([^"]+)"/g, (_: string, u: string) => {
          const abs = u.startsWith("http") ? u : new URL(u, m3u8Url).href;
          return `URI="${proxyBase}/vidmoly/seg?url=${encodeURIComponent(abs)}"`;
        });
        if (t === "" || t.startsWith("#")) return rewrittenLine;
        const abs = t.startsWith("http") ? t : new URL(t, m3u8Url).href;
        return `${proxyBase}/vidmoly/seg?url=${encodeURIComponent(abs)}`;
      }).join("\n");

      return new Response(rewritten, {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl" },
      });
    } catch (e: unknown) {
      return new Response(e instanceof Error ? e.message : "error", { status: 502, headers: CORS });
    }
  }

  // ── /vidmoly/seg?url=<abs_url> ────────────────────────────────────────────
  if (url.pathname === "/vidmoly/seg") {
    const segUrl = url.searchParams.get("url");
    if (!segUrl) return new Response("missing url", { status: 400, headers: CORS });

    let parsed: URL;
    try { parsed = new URL(segUrl); } catch (_) {
      return new Response("invalid url", { status: 400, headers: CORS });
    }
    if (!parsed.hostname.endsWith("vmeas.cloud") && !parsed.hostname.endsWith("vidmoly.biz")) {
      return new Response("forbidden", { status: 403, headers: CORS });
    }

    try {
      const upHeaders: Record<string, string> = { "User-Agent": UA, "Referer": "https://vidmoly.biz/" };
      const range = request.headers.get("Range");
      if (range) upHeaders["Range"] = range;

      const upstream = await fetch(segUrl, { headers: upHeaders });
      const contentType = upstream.headers.get("Content-Type") || "";
      const isM3u8 = segUrl.includes(".m3u8") || contentType.includes("mpegurl");

      if (isM3u8) {
        const text = await upstream.text();
        const proxyBase = url.origin;
        const rewritten = text.split("\n").map((line: string) => {
          const t = line.trim();
          const rewrittenLine = line.replace(/URI="([^"]+)"/g, (_: string, u: string) => {
            const abs = u.startsWith("http") ? u : new URL(u, segUrl).href;
            return `URI="${proxyBase}/vidmoly/seg?url=${encodeURIComponent(abs)}"`;
          });
          if (t === "" || t.startsWith("#")) return rewrittenLine;
          const abs = t.startsWith("http") ? t : new URL(t, segUrl).href;
          return `${proxyBase}/vidmoly/seg?url=${encodeURIComponent(abs)}`;
        }).join("\n");
        return new Response(rewritten, {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/vnd.apple.mpegurl" },
        });
      }

      const resHeaders = new Headers(CORS);
      resHeaders.set("Content-Type", contentType || "video/mp2t");
      resHeaders.set("Accept-Ranges", "bytes");
      const cl = upstream.headers.get("Content-Length");
      const cr = upstream.headers.get("Content-Range");
      if (cl) resHeaders.set("Content-Length", cl);
      if (cr) resHeaders.set("Content-Range", cr);

      return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
    } catch (e: unknown) {
      return new Response(e instanceof Error ? e.message : "error", { status: 502, headers: CORS });
    }
  }

  // ── /sendvid?id=<embed_id> ────────────────────────────────────────────────
  if (url.pathname === "/sendvid") {
    const id = url.searchParams.get("id");
    if (!id || !/^[a-z0-9]+$/i.test(id)) {
      return new Response("missing id", { status: 400, headers: CORS });
    }

    try {
      const html = await fetch("https://sendvid.com/embed/" + id, {
        headers: { "User-Agent": UA, "Referer": "https://sendvid.com/" },
      }).then((r: Response) => r.text());

      const match = html.match(/var video_source\s*=\s*"(https?:\/\/[^"]+)"/);
      if (!match) return new Response("no mp4 found", { status: 502, headers: CORS });

      const mp4Url = match[1];
      const upHeaders: Record<string, string> = { "User-Agent": UA, "Referer": "https://sendvid.com/" };
      const range = request.headers.get("Range");
      if (range) upHeaders["Range"] = range;

      const upstream = await fetch(mp4Url, { headers: upHeaders });

      const resHeaders = new Headers(CORS);
      resHeaders.set("Content-Type", upstream.headers.get("Content-Type") || "video/mp4");
      resHeaders.set("Accept-Ranges", "bytes");
      const cl = upstream.headers.get("Content-Length");
      const cr = upstream.headers.get("Content-Range");
      if (cl) resHeaders.set("Content-Length", cl);
      if (cr) resHeaders.set("Content-Range", cr);

      return new Response(upstream.body, { status: upstream.status, headers: resHeaders });
    } catch (e: unknown) {
      return new Response(e instanceof Error ? e.message : "error", { status: 502, headers: CORS });
    }
  }

  return new Response("not found", { status: 404, headers: CORS });
});
