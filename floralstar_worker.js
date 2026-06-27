// dessinanime-worker — fetches a dessinanime.cc episode page (Next.js RSC)
// and extracts the direct video source URL.
// Route: GET /dessinanime?url=<full_dessinanime_episode_url>
// Returns: { source: "https://..." }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:152.0) Gecko/20100101 Firefox/152.0';

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });

    if (url.pathname !== '/dessinanime') {
      return new Response('not found', { status: 404, headers: CORS });
    }

    const epUrl = url.searchParams.get('url');
    if (!epUrl) {
      return new Response(JSON.stringify({ error: 'missing url param' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    let parsed;
    try { parsed = new URL(epUrl); } catch {
      return new Response(JSON.stringify({ error: 'invalid url' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    if (parsed.hostname !== 'dessinanime.cc') {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    // Parse /tv/{slug}/{season}/{episode} to build RSC headers
    const m = parsed.pathname.match(/^\/tv\/([\w-]+)\/(\d+)\/(\d+)/);
    if (!m) {
      return new Response(JSON.stringify({ error: 'unrecognised url format' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }
    const [, slug, season, episode] = m;
    const targetUrl = `${epUrl}${parsed.search ? parsed.search + '&' : '?'}_rsc=tijitoon`;

    let text;
    try {
      const res = await fetch(targetUrl, {
        headers: {
          'User-Agent': UA,
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': `https://dessinanime.cc/tv/${slug}`,
          'rsc': '1',
          'next-url': `/tv/${slug}`,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
        },
      });

      if (!res.ok) {
        return new Response(JSON.stringify({ error: `upstream ${res.status}` }), {
          status: res.status, headers: { 'Content-Type': 'application/json', ...CORS },
        });
      }

      text = await res.text();
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 502, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    const sourceMatch = text.match(/"source":"([^"]+)"/);
    const source = sourceMatch ? sourceMatch[1] : null;

    if (!source) {
      return new Response(JSON.stringify({ error: 'no source found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...CORS },
      });
    }

    return new Response(JSON.stringify({ source }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...CORS },
    });
  },
};
