const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'range',
  'Access-Control-Expose-Headers': 'content-range, content-length, accept-ranges',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const REFERER = 'https://player.ojamajo.moe/';

// Cached within the isolate lifetime (~minutes) - cuts cookie subrequests on segments
let cachedCookie = null;
let cookieExpiry = 0;

async function getDdgCookie() {
  const now = Date.now();
  if (cachedCookie && now < cookieExpiry) return cachedCookie;
  const id = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  await fetch('https://player.ojamajo.moe/.well-known/ddos-guard/id/' + id, {
    headers: { 'User-Agent': UA },
  });
  cachedCookie = '__ddg2_=' + id;
  cookieExpiry = now + 60 * 60 * 1000; // reuse for 1 hour
  return cachedCookie;
}

addEventListener('fetch', function(event) {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  // ── /ojamajo/playlist?uuid=<uuid> ─────────────────────────────────────────
  // Resolves the PeerTube API, fetches the 480p m3u8, rewrites segment URLs
  // to go through /ojamajo/seg so the browser never touches player.ojamajo.moe
  if (url.pathname === '/ojamajo/playlist') {
    const uuid = url.searchParams.get('uuid');
    if (!uuid || !/^[\w-]+$/.test(uuid)) {
      return new Response('missing uuid', { status: 400, headers: CORS });
    }

    try {
      const cookie = await getDdgCookie();

      const apiRes = await fetch('https://player.ojamajo.moe/api/v1/videos/' + uuid, {
        headers: { 'User-Agent': UA, 'Cookie': cookie },
      });
      if (!apiRes.ok) return new Response('api error: ' + apiRes.status, { status: 502, headers: CORS });
      const data = await apiRes.json();

      const playlist = data.streamingPlaylists && data.streamingPlaylists[0];
      if (!playlist) return new Response('no playlist', { status: 502, headers: CORS });

      const files = playlist.files || [];
      const target = files.find(function(f) { return f.resolution && f.resolution.id === 1080; })
        || files.find(function(f) { return f.resolution && f.resolution.id === 720; })
        || files[files.length - 1];
      if (!target) return new Response('no files', { status: 502, headers: CORS });

      const m3u8Url = target.playlistUrl;
      const m3u8Res = await fetch(m3u8Url, {
        headers: { 'User-Agent': UA, 'Cookie': cookie, 'Referer': REFERER },
      });
      if (!m3u8Res.ok) return new Response('m3u8 error: ' + m3u8Res.status, { status: 502, headers: CORS });

      const m3u8Text = await m3u8Res.text();
      const workerBase = url.origin;

      // Rewrite segment lines and URI= values to go through /ojamajo/seg
      const rewritten = m3u8Text.split('\n').map(function(line) {
        const t = line.trim();
        // Rewrite URI="..." inside tags like #EXT-X-MAP
        const rewrittenLine = line.replace(/URI="([^"]+)"/g, function(_, u) {
          const abs = u.startsWith('http') ? u : new URL(u, m3u8Url).href;
          return 'URI="' + workerBase + '/ojamajo/seg?url=' + encodeURIComponent(abs) + '"';
        });
        // Rewrite bare segment lines (not comments, not empty)
        if (t === '' || t.startsWith('#')) return rewrittenLine;
        const abs = t.startsWith('http') ? t : new URL(t, m3u8Url).href;
        return workerBase + '/ojamajo/seg?url=' + encodeURIComponent(abs);
      }).join('\n');

      const headers = new Headers(CORS);
      headers.set('Content-Type', 'application/vnd.apple.mpegurl');
      return new Response(rewritten, { status: 200, headers: headers });
    } catch (e) {
      return new Response(e.message, { status: 502, headers: CORS });
    }
  }

  // ── /ojamajo/seg?url=<abs_url> ────────────────────────────────────────────
  // Proxies a single HLS segment (fragmented MP4 byte-range) with a fresh cookie
  if (url.pathname === '/ojamajo/seg') {
    const segUrl = url.searchParams.get('url');
    if (!segUrl) return new Response('missing url', { status: 400, headers: CORS });

    let parsed;
    try { parsed = new URL(segUrl); } catch(_) {
      return new Response('invalid url', { status: 400, headers: CORS });
    }
    if (!parsed.hostname.endsWith('ojamajo.moe')) {
      return new Response('forbidden', { status: 403, headers: CORS });
    }

    try {
      const cookie = await getDdgCookie();
      const range = request.headers.get('Range');
      const upHeaders = { 'User-Agent': UA, 'Referer': REFERER, 'Cookie': cookie };
      if (range) upHeaders['Range'] = range;

      const upstream = await fetch(segUrl, { headers: upHeaders });

      const headers = new Headers(CORS);
      headers.set('Content-Type', upstream.headers.get('Content-Type') || 'video/mp4');
      headers.set('Accept-Ranges', 'bytes');
      const cl = upstream.headers.get('Content-Length');
      const cr = upstream.headers.get('Content-Range');
      if (cl) headers.set('Content-Length', cl);
      if (cr) headers.set('Content-Range', cr);

      return new Response(upstream.body, { status: upstream.status, headers: headers });
    } catch (e) {
      return new Response(e.message, { status: 502, headers: CORS });
    }
  }

  return new Response('not found', { status: 404, headers: CORS });
}
