export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET',
          'Access-Control-Allow-Headers': 'content-type, range',
          'Access-Control-Expose-Headers': 'content-range, content-length, accept-ranges',
        }
      });
    }

    // ── /uqload ───────────────────────────────────────────────────────────────
    // ?id=<embed_id>  → resolves m3u8 and returns it rewritten through this proxy
    // ?url=<abs_url>  → proxies a uqload CDN segment/playlist (for HLS.js fetches)
    if (url.pathname === '/uqload') {
      const UQLOAD_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
        'Referer': 'https://uqload.is/',
        'Origin': 'https://uqload.is',
      };
      const CORS = { 'Access-Control-Allow-Origin': '*' };

      // ── ?url= mode: proxy a CDN segment or sub-playlist ──────────────────
      const proxyTarget = url.searchParams.get('url');
      if (proxyTarget) {
        let targetUrl;
        try { targetUrl = new URL(proxyTarget); } catch {
          return new Response('invalid url', { status: 400, headers: CORS });
        }
        if (!targetUrl.hostname.endsWith('uqload.is')) {
          return new Response('forbidden', { status: 403, headers: CORS });
        }

        const res = await fetch(proxyTarget, { headers: UQLOAD_HEADERS });
        if (!res.ok) return new Response(`upstream ${res.status}`, { status: res.status, headers: CORS });

        const contentType = res.headers.get('Content-Type') ?? '';
        const isM3U8 = proxyTarget.includes('.m3u8') || contentType.includes('mpegurl');

        if (isM3U8) {
          const text = await res.text();
          const workerBase = `${url.origin}${url.pathname}`;
          const rewriteUri = (uri) => {
            const abs = uri.startsWith('http') ? uri : new URL(uri, proxyTarget).href;
            return `${workerBase}?url=${encodeURIComponent(abs)}`;
          };
          const rewritten = text.split('\n').map(line => {
            const t = line.trim();
            if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${rewriteUri(u)}"`);
            if (t === '') return line;
            const abs = t.startsWith('http') ? t : new URL(t, proxyTarget).href;
            return `${workerBase}?url=${encodeURIComponent(abs)}`;
          }).join('\n');
          return new Response(rewritten, {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl', ...CORS },
          });
        }

        return new Response(res.body, {
          status: res.status,
          headers: { 'Content-Type': contentType || 'video/mp2t', ...CORS },
        });
      }

      // ── ?id= mode: resolve embed → rewrite m3u8 through proxy ────────────
      const id = url.searchParams.get('id');
      if (!id || !/^[a-z0-9]+$/.test(id)) {
        return new Response(JSON.stringify({ error: 'missing or invalid id' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      const html = await fetch(`https://uqload.is/embed-${id}.html`, { headers: UQLOAD_HEADERS }).then(r => r.text());

      const start = html.indexOf('eval(function(p,a,c,k,e,d)');
      if (start === -1) {
        return new Response(JSON.stringify({ error: 'no eval block found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      const argsMatch = html.slice(start).match(/\}\s*\(\s*'([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([\s\S]*?)'\.split\('\|'\)/);
      if (!argsMatch) {
        return new Response(JSON.stringify({ error: 'could not parse packer args' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      const p = argsMatch[1];
      const a = parseInt(argsMatch[2]);
      const k = argsMatch[4].split('|');
      const decoded = p.replace(/\b\w+\b/g, (word) => {
        const n = parseInt(word, a);
        return (k[n] && k[n] !== '') ? k[n] : word;
      });

      const match = decoded.match(/file:["'](https?:\/\/[^"']+)/);
      if (!match) {
        return new Response(JSON.stringify({ error: 'no source url found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      // Rewrite the master m3u8 URL to go through this proxy
      const workerBase = `${url.origin}${url.pathname}`;
      const proxiedM3u8 = `${workerBase}?url=${encodeURIComponent(match[1])}`;

      return new Response(JSON.stringify({ url: proxiedM3u8 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // ── /seekplayer ──────────────────────────────────────────────────────────
    // ?url=<abs>  → proxies a seekplayer CDN segment or m3u8 with correct Referer
    if (url.pathname === '/seekplayer') {
      const CORS = { 'Access-Control-Allow-Origin': '*' };
      const proxyTarget = url.searchParams.get('url');
      if (!proxyTarget) {
        return new Response('missing url', { status: 400, headers: CORS });
      }
      const SP_HEADERS = { 'Referer': 'https://mhd.seekplayer.me/', 'Origin': 'https://mhd.seekplayer.me', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36' };
      const res = await fetch(proxyTarget, { headers: SP_HEADERS });
      if (!res.ok) return new Response(`upstream ${res.status}`, { status: res.status, headers: CORS });

      const contentType = res.headers.get('Content-Type') ?? '';
      const isM3U8 = proxyTarget.includes('.m3u8') || contentType.includes('mpegurl');

      if (isM3U8) {
        const text = await res.text();
        const workerBase = `${url.origin}${url.pathname}`;
        const rewriteUri = (uri) => {
          const abs = uri.startsWith('http') ? uri : new URL(uri, proxyTarget).href;
          return `${workerBase}?url=${encodeURIComponent(abs)}`;
        };
        const rewritten = text.split('\n').map(line => {
          const t = line.trim();
          if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${rewriteUri(u)}"`);
          if (t === '') return line;
          return rewriteUri(t.startsWith('http') ? t : new URL(t, proxyTarget).href);
        }).join('\n');
        return new Response(rewritten, {
          status: 200,
          headers: { 'Content-Type': 'application/vnd.apple.mpegurl', ...CORS },
        });
      }

      return new Response(res.body, {
        status: res.status,
        headers: { 'Content-Type': contentType || 'video/mp2t', ...CORS },
      });
    }

    // ── odycdn proxy (existing) ───────────────────────────────────────────────
    const mp4 = url.searchParams.get('url');

    if (!mp4 || !mp4.startsWith('https://player.odycdn.com/')) {
      return new Response('Bad request', { status: 400 });
    }

    const outgoingHeaders = {
      'Referer': 'https://odysee.com/',
      'Origin': 'https://odysee.com',
      'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
      'Accept': request.headers.get('Accept') || '*/*',
      'Accept-Language': request.headers.get('Accept-Language') || 'en-US,en;q=0.9',
      'Sec-Fetch-Dest': 'video',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site',
      'Sec-CH-UA': '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
      'Sec-CH-UA-Mobile': '?0',
      'Sec-CH-UA-Platform': '"Windows"',
      'X-Odysee-User-Id': '1933509056',
    };

    const range = request.headers.get('Range');
    if (range) outgoingHeaders['Range'] = range;

    const ifRange = request.headers.get('If-Range');
    if (ifRange) outgoingHeaders['If-Range'] = ifRange;

    const cdnRes = await fetch(mp4, { headers: outgoingHeaders });

    const headers = new Headers({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Expose-Headers': 'content-range, content-length, accept-ranges',
      'Content-Type': cdnRes.headers.get('Content-Type') || 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    if (cdnRes.headers.get('Content-Range')) headers.set('Content-Range', cdnRes.headers.get('Content-Range'));
    if (cdnRes.headers.get('Content-Length')) headers.set('Content-Length', cdnRes.headers.get('Content-Length'));

    return new Response(cdnRes.body, { status: cdnRes.status, headers });
  }
}
