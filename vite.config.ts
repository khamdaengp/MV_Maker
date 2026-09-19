import { defineConfig, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

function fetchRemote(
  url: string,
  headers: Record<string, string> = {}
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  text: string;
  finalUrl: string;
}> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...headers,
        },
        rejectUnauthorized: false,
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = new URL(res.headers.location, url).toString();
          return resolve(fetchRemote(next, headers));
        }
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          resolve({
            status: res.statusCode || 200,
            headers: res.headers,
            body,
            text: body.toString('utf-8'),
            finalUrl: url,
          });
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function postRemoteJson(
  url: string,
  bodyData: unknown,
  headers: Record<string, string> = {}
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const bodyStr = JSON.stringify(bodyData);
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr),
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          ...headers,
        },
        rejectUnauthorized: false,
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          resolve({ status: res.statusCode || 200, text });
        });
      }
    );
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

function linkProxyPlugin(): Plugin {
  return {
    name: 'link-proxy-plugin',
    configureServer(server) {
      // 1. Resolve Link Info: /api/link-info?url=...
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/link-info')) {
          return next();
        }

        try {
          const parsedReq = new URL(req.url, 'http://localhost');
          const targetUrl = parsedReq.searchParams.get('url');

          if (!targetUrl) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing url parameter' }));
            return;
          }

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
          res.setHeader('Content-Type', 'application/json');

          // Case A: Suno Link (suno.com/s/... or suno.com/song/...)
          if (targetUrl.includes('suno.com') || targetUrl.includes('suno.ai')) {
            const page = await fetchRemote(targetUrl);
            const canonicalMatch = page.text.match(/<link rel="canonical" href="([^"]+)"/);
            const resolvedUrl = canonicalMatch ? canonicalMatch[1] : page.finalUrl;
            
            // Extract UUID
            const uuidMatch = resolvedUrl.match(/song\/([0-9a-fA-F-]{32,36})/) ||
              targetUrl.match(/song\/([0-9a-fA-F-]{32,36})/) ||
              page.text.match(/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/);
            
            const songId = uuidMatch ? uuidMatch[1] : null;

            // Extract Title
            const titleMatch = page.text.match(/<meta property="og:title" content="([^"]+)"/) ||
              page.text.match(/<title>([^<]+)<\/title>/);
            let title = titleMatch ? titleMatch[1].replace(' | Suno', '').trim() : 'Suno Music';

            // Extract Artist / Author
            const descMatch = page.text.match(/<meta property="og:description" content="([^"]+)"/);
            let artist = 'Suno AI';
            if (descMatch && descMatch[1]) {
              const byMatch = descMatch[1].match(/by\s+([^,.]+)/i);
              if (byMatch) {
                artist = byMatch[1].trim();
              }
            }

            // Audio & Artwork
            const audioUrl = songId
              ? `https://d2lwuy8qc234o3.cloudfront.net/1/clip/${songId}.m4a`
              : null;
            const imageUrl = songId
              ? `https://cdn2.suno.ai/image_large_${songId}.jpeg`
              : null;

            res.statusCode = 200;
            res.end(
              JSON.stringify({
                success: true,
                source: 'suno',
                id: songId,
                title,
                artist,
                audioUrl,
                imageUrl,
                originalUrl: targetUrl,
              })
            );
            return;
          }

          // Case B: YouTube Link (youtu.be/... or youtube.com/watch?v=...)
          if (targetUrl.includes('youtu.be') || targetUrl.includes('youtube.com')) {
            let videoId: string | null = null;
            if (targetUrl.includes('youtu.be/')) {
              videoId = targetUrl.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0] || null;
            } else if (targetUrl.includes('v=')) {
              videoId = new URL(targetUrl).searchParams.get('v');
            } else if (targetUrl.includes('embed/')) {
              videoId = targetUrl.split('embed/')[1]?.split('?')[0] || null;
            } else if (targetUrl.includes('shorts/')) {
              videoId = targetUrl.split('shorts/')[1]?.split('?')[0] || null;
            }

            if (!videoId) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: 'Could not parse YouTube Video ID' }));
              return;
            }

            // Fetch YouTube oEmbed metadata
            let title = 'YouTube Track';
            let artist = 'YouTube Creator';
            let imageUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

            try {
              const oembed = await fetchRemote(
                `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
              );
              if (oembed.status === 200) {
                const data = JSON.parse(oembed.text);
                if (data.title) title = data.title;
                if (data.author_name) artist = data.author_name;
                if (data.thumbnail_url) imageUrl = data.thumbnail_url;
              }
            } catch (oeErr) {
              console.warn('YouTube oEmbed error:', oeErr);
            }

            res.statusCode = 200;
            res.end(
              JSON.stringify({
                success: true,
                source: 'youtube',
                id: videoId,
                title,
                artist,
                audioUrl: null, // Will use audio assistant / resolver
                imageUrl,
                originalUrl: targetUrl,
              })
            );
            return;
          }

          // Case C: Direct Audio Link (.mp3, .wav, .m4a, .ogg, .flac)
          const cleanUrl = targetUrl.split('?')[0];
          const filename = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1) || 'Audio Track';
          const title = decodeURIComponent(filename.replace(/\.[^/.]+$/, ''));

          res.statusCode = 200;
          res.end(
            JSON.stringify({
              success: true,
              source: 'direct',
              title,
              artist: 'Web Audio',
              audioUrl: targetUrl,
              imageUrl: null,
              originalUrl: targetUrl,
            })
          );
        } catch (err: unknown) {
          const error = err as Error;
          res.statusCode = 500;
          res.end(JSON.stringify({ error: error.message || 'Failed to resolve link' }));
        }
      });

      // 2. Proxy Media Stream: /api/proxy-stream?url=...
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/proxy-stream')) {
          return next();
        }

        try {
          const parsedReq = new URL(req.url, 'http://localhost');
          const targetUrl = parsedReq.searchParams.get('url');

          if (!targetUrl) {
            res.statusCode = 400;
            res.end('Missing url parameter');
            return;
          }

          const parsed = new URL(targetUrl);
          const lib = parsed.protocol === 'https:' ? https : http;

          const remoteReq = lib.get(
            targetUrl,
            {
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                Range: req.headers.range || '',
              },
              rejectUnauthorized: false,
            },
            (remoteRes) => {
              // Set CORS headers
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
              res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
              res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');

              // Forward content headers
              if (remoteRes.headers['content-type']) {
                res.setHeader('Content-Type', remoteRes.headers['content-type']);
              }
              if (remoteRes.headers['content-length']) {
                res.setHeader('Content-Length', remoteRes.headers['content-length']);
              }
              if (remoteRes.headers['content-range']) {
                res.setHeader('Content-Range', remoteRes.headers['content-range']);
              }
              if (remoteRes.headers['accept-ranges']) {
                res.setHeader('Accept-Ranges', remoteRes.headers['accept-ranges']);
              }

              res.statusCode = remoteRes.statusCode || 200;
              remoteRes.pipe(res);
            }
          );

          remoteReq.on('error', (err) => {
            if (!res.headersSent) {
              res.statusCode = 502;
              res.end(`Proxy error: ${err.message}`);
            }
          });
        } catch (err: unknown) {
          const error = err as Error;
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end(`Internal proxy error: ${error.message}`);
          }
        }
      });

      // 3. Suno Rights Proxy: /api/suno-rights?contentId=...
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/suno-rights')) {
          return next();
        }

        try {
          const parsedReq = new URL(req.url, 'http://localhost');
          const contentId = parsedReq.searchParams.get('contentId');

          if (!contentId) {
            res.statusCode = 400;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Missing contentId parameter' }));
            return;
          }

          const rights = await postRemoteJson('https://studio-api.prod.suno.com/api/mango/rights', {
            content_params: { content_id: contentId, content_type: 'clip' },
          });

          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = rights.status;
          res.end(rights.text);
        } catch (err: unknown) {
          const error = err as Error;
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: error.message || 'Failed to fetch Suno rights' }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), linkProxyPlugin()],
  worker: {
    format: 'es',
  },
  server: {
    host: true, // Expose to local network (0.0.0.0)
    port: 3000,
    open: true,
  },
});
