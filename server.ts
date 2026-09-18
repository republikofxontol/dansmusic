import express, { Request, Response } from 'express';
import path from 'path';
import { Readable } from 'stream';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const app = express();
const PORT = 3000;

app.use(express.json());

const YTM = 'https://music.youtube.com/youtubei/v1';
const CONTEXT = {
  client: {
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240101.00.00',
    hl: 'id',
    gl: 'ID',
  },
};
const HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  Origin: 'https://music.youtube.com',
  Referer: 'https://music.youtube.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

async function yt(endpoint: string, body: any = {}, query = '') {
  const res = await fetch(`${YTM}/${endpoint}?prettyPrint=false${query}`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ context: CONTEXT, ...body }),
  });
  if (!res.ok) throw new Error(`YTM ${endpoint} -> ${res.status}`);
  return res.json();
}

/* ---------------- PEMBANTU PENGAMBILAN DATA STRUKTUR MENDALAM ---------------- */
function findAll(obj: any, key: string, out: any[] = []): any[] {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) findAll(v, key, out);
    return out;
  }
  for (const k of Object.keys(obj)) {
    if (k === key) out.push(obj[k]);
    findAll(obj[k], key, out);
  }
  return out;
}
const findFirst = (obj: any, key: string) => findAll(obj, key)[0];

const text = (o: any): string =>
  o && o.runs ? o.runs.map((r: any) => r.text).join('') : (o && o.simpleText) || '';

function normalizeDuration(s: any): string {
  const t = String(s || '').trim();
  if (/^\d{1,2}(\.\d{2}){1,2}$/.test(t)) return t.replace(/\./g, ':');
  return t;
}

function runsInfo(o: any) {
  const out: { name: string; browseId: string }[] = [];
  if (!o || !o.runs) return out;
  for (const r of o.runs) {
    const be = r.navigationEndpoint && r.navigationEndpoint.browseEndpoint;
    if (be) out.push({ name: r.text, browseId: be.browseId });
  }
  return out;
}

function thumbs(o: any) {
  const t = findAll(o, 'thumbnails')
    .flat()
    .filter((x) => x && x.url);
  if (!t.length) {
    const directUrl = findFirst(o, 'url');
    if (typeof directUrl === 'string' && directUrl.startsWith('http')) {
      return upscale(directUrl);
    }
    return null;
  }
  const best = t.reduce((a, b) => ((b.width || 0) >= (a.width || 0) ? b : a));
  return upscale(best.url);
}
function upscale(url: string) {
  if (!url) return url;
  if (url.includes('googleusercontent.com')) return url.replace(/=w\d+-h\d+.*$/, '=w1000-h1000-l90-rj');
  if (url.includes('ytimg.com/vi/')) return url.replace(/\/(default|mqdefault|sddefault|maxresdefault|hqdefault)\.jpg/, '/hqdefault.jpg');
  return url;
}

// PENYIMPAN CACHE COVER ALBUM RESOLUSI TINGGI SPOTIFY, ITUNES, DAN DEEZER
const hdCoverCache = new Map<string, string>();

async function fetchHdCover(title: string, artist: string): Promise<string | null> {
  const t = String(title || '').trim();
  const a = String(artist || '').trim();
  if (!t) return null;
  const cacheKey = `${t.toLowerCase()}:::${a.toLowerCase()}`;
  if (hdCoverCache.has(cacheKey)) return hdCoverCache.get(cacheKey) || null;

  try {
    const cleanTitle = t
      .replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')
      .replace(/\s*-\s*.*$/, '')
      .trim();
    const cleanArtist = a
      .replace(/\s*(feat\.|ft\.|,|&)\s*.*$/i, '')
      .trim();
    const query = `${cleanTitle} ${cleanArtist}`.trim();
    if (!query) return null;

    // 1. ITUNES HD 1000X1000
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
    const res = await fetchTimeout(itunesUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 3500);
    if (res && res.results && res.results[0] && res.results[0].artworkUrl100) {
      const hdUrl = res.results[0].artworkUrl100.replace('100x100bb', '1000x1000bb');
      hdCoverCache.set(cacheKey, hdUrl);
      return hdUrl;
    }

    // 2. DEEZER HD 1000X1000 FALLBACK
    const dzRes = await fetchTimeout(`https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`, { headers: { 'User-Agent': 'Mozilla/5.0' } }, 3000);
    if (dzRes && dzRes.data && dzRes.data[0] && dzRes.data[0].album) {
      const album = dzRes.data[0].album;
      const dzCover = album.cover_xl || album.cover_big || album.cover_medium;
      if (dzCover) {
        hdCoverCache.set(cacheKey, dzCover);
        return dzCover;
      }
    }
  } catch {}
  return null;
}

function endpointInfo(nav: any) {
  if (!nav) return {};
  const we = nav.watchEndpoint;
  const be = nav.browseEndpoint;
  const wpe = nav.watchPlaylistEndpoint;
  if (we) return { videoId: we.videoId, playlistId: we.playlistId };
  if (wpe) return { playlistId: wpe.playlistId, watchPlaylist: true };
  if (be) {
    const id = be.browseId;
    let type = 'browse';
    if (id.startsWith('MPRE')) type = 'album';
    else if (id.startsWith('UC') || id.startsWith('MPLA')) type = 'artist';
    else if (id.startsWith('VL') || id.startsWith('PL') || id.startsWith('RDCLAK')) type = 'playlist';
    return { browseId: id, browseType: type };
  }
  return {};
}

function displayTitle(t: string): string {
  const raw = String(t || '').trim();
  if (!raw) return '';
  const cleaned = raw
    .replace(/\s*[\(\[]\s*official\s*(hd\s*)?(4k\s*)?(music\s*)?(lyric(s)?\s*)?(audio|video|visualizer|mv)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*(official\s*)?(hd\s*)?(music\s*)?(lyric(s)?\s*)?(audio|video|visualizer|mv)[^\)\]]*[\)\]]/gi, '')
    .replace(/\s*[\(\[]\s*(official\s*)?(4k|hd|hq|8d(?:\s*audio)?|1080p|720p)\s*[\)\]]/gi, '')
    .replace(/\s*-\s*(official|lyric(s)?|audio|video|visualizer|topic).*$/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || raw;
}

/* ---------------- PENGURAI ITEM LAGU, ALBUM, DAN ARTIS ---------------- */
function parseTwoRow(r: any) {
  const nav = r.navigationEndpoint || {};
  let info: any = endpointInfo(nav);
  if (!info.browseId && r.title && r.title.runs) {
    const tNav = r.title.runs[0] && r.title.runs[0].navigationEndpoint;
    const extra = endpointInfo(tNav || {});
    if (extra.browseId) info = { ...info, ...extra };
  }
  let type = 'song';
  if (info.browseType === 'album' || info.browseType === 'playlist' || info.browseType === 'artist') type = info.browseType;
  else if (info.videoId) type = 'song';
  else if (info.playlistId || info.watchPlaylist) type = 'playlist';
  const item: any = {
    type,
    title: text(r.title),
    subtitle: text(r.subtitle),
    thumbnail: thumbs(r.thumbnailRenderer),
    artists: runsInfo(r.subtitle),
    ...info,
  };
  if (r.thumbnailRenderer && findFirst(r, 'musicThumbnailRenderer')) {
    const style = findFirst(r, 'musicThumbnailRenderer').thumbnailCrop;
    if (style === 'MUSIC_THUMBNAIL_CROP_CIRCLE') item.type = 'artist';
  }
  return item;
}

function parseListItem(r: any) {
  const cols = (r.flexColumns || []).map((c: any) =>
    c.musicResponsiveListItemFlexColumnRenderer ? c.musicResponsiveListItemFlexColumnRenderer.text : null
  );
  const title = cols[0] ? text(cols[0]) : '';
  const subtitle = cols
    .slice(1)
    .map((c: any) => text(c))
    .filter(Boolean)
    .join(' • ');
  let videoId: string | null = null;
  if (r.playlistItemData) videoId = r.playlistItemData.videoId;
  if (!videoId && cols[0] && cols[0].runs) {
    const we = cols[0].runs[0] && cols[0].runs[0].navigationEndpoint && cols[0].runs[0].navigationEndpoint.watchEndpoint;
    if (we) videoId = we.videoId;
  }
  if (!videoId) {
    const we = findFirst(r.overlay || {}, 'watchEndpoint');
    if (we) videoId = we.videoId;
  }
  const navInfo = endpointInfo(r.navigationEndpoint);
  const artists: any[] = [];
  const albums: any[] = [];
  for (const c of cols.slice(1)) {
    for (const e of runsInfo(c)) {
      if (e.browseId.startsWith('MPRE')) albums.push(e);
      else artists.push(e);
    }
  }
  const type = videoId ? 'song' : navInfo.browseType || 'song';
  const thumb = thumbs(r.thumbnail) || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
  const item: any = {
    type,
    title,
    subtitle,
    videoId,
    thumbnail: thumb,
    artists,
    album: albums[0] || null,
    ...navInfo,
  };
  const fixed = findFirst(r, 'musicResponsiveListItemFixedColumnRenderer');
  if (fixed) item.duration = normalizeDuration(text(fixed.text));
  return item;
}

function parseSections(contents: any[]) {
  const sections: any[] = [];
  for (const s of contents || []) {
    const car = s.musicCarouselShelfRenderer;
    const shelf = s.musicShelfRenderer;
    if (car) {
      const header = findFirst(car.header || {}, 'title');
      const items = (car.contents || [])
        .map((c: any) =>
          c.musicTwoRowItemRenderer
            ? parseTwoRow(c.musicTwoRowItemRenderer)
            : c.musicResponsiveListItemRenderer
            ? parseListItem(c.musicResponsiveListItemRenderer)
            : null
        )
        .filter((x: any) => x && x.title);
      if (items.length) sections.push({ title: text(header), items });
    } else if (shelf) {
      const items = (shelf.contents || [])
        .map((c: any) => (c.musicResponsiveListItemRenderer ? parseListItem(c.musicResponsiveListItemRenderer) : null))
        .filter((x: any) => x && x.title);
      if (items.length) sections.push({ title: text(shelf.title), items, list: true });
    }
  }
  return sections;
}

/* ---------------- PENYIMPAN DATA CACHE MEMORI ---------------- */
const cache = new Map<string, { v: any; t: number }>();
function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return Promise.resolve(hit.v);
  return fn().then((v) => {
    cache.set(key, { v, t: Date.now() });
    return v;
  });
}

/* ---------------- RUTE ENDPOINT API UTAMA ---------------- */
app.get('/api/home', async (_req: Request, res: Response) => {
  try {
    const data = await cached('home_ID', 10 * 60 * 1000, async () => {
      const d = await yt('browse', { browseId: 'FEmusic_home' });
      let sections: any[] = [];
      const sl = findFirst(d, 'sectionListRenderer');
      if (sl) sections = parseSections(sl.contents);
      let cont = sl && sl.continuations && sl.continuations[0] && sl.continuations[0].nextContinuationData;
      let n = 0;
      while (cont && n < 3) {
        const d2 = await yt('browse', {}, `&ctoken=${cont.continuation}&continuation=${cont.continuation}&type=next`);
        const slc = findFirst(d2, 'sectionListContinuation');
        if (!slc) break;
        sections = sections.concat(parseSections(slc.contents));
        cont = slc.continuations && slc.continuations[0] && slc.continuations[0].nextContinuationData;
        n++;
      }
      return { sections };
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/charts', async (_req: Request, res: Response) => {
  try {
    const data = await cached('charts', 30 * 60 * 1000, async () => {
      const d = await yt('browse', { browseId: 'FEmusic_charts' });
      const sl = findFirst(d, 'sectionListRenderer');
      return { sections: sl ? parseSections(sl.contents) : [] };
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/sponsorblock', async (req: Request, res: Response) => {
  try {
    const vid = String(req.query.videoId || '');
    const cats = encodeURIComponent(JSON.stringify(['sponsor', 'selfpromo', 'interaction', 'intro', 'outro', 'music_offtopic']));
    const r = await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(vid)}&categories=${cats}`);
    if (r.status === 404) return res.json({ segments: [] });
    if (!r.ok) return res.json({ segments: [] });
    const arr: any = await r.json();
    res.json({
      segments: arr
        .filter((s: any) => s.actionType === 'skip')
        .map((s: any) => ({ category: s.category, start: s.segment[0], end: s.segment[1] })),
    });
  } catch {
    res.json({ segments: [] });
  }
});

app.get('/api/moods', async (_req: Request, res: Response) => {
  try {
    const data = await cached('moods', 60 * 60 * 1000, async () => {
      const d = await yt('browse', { browseId: 'FEmusic_moods_and_genres' });
      const cats = findAll(d, 'musicNavigationButtonRenderer').map((b) => ({
        title: text(b.buttonText),
        color: b.solid ? '#' + (b.solid.leftStripeColor >>> 0).toString(16).padStart(8, '0').slice(2) : null,
        browseId: b.clickCommand && b.clickCommand.browseEndpoint && b.clickCommand.browseEndpoint.browseId,
        params: b.clickCommand && b.clickCommand.browseEndpoint && b.clickCommand.browseEndpoint.params,
      }));
      return { categories: cats.filter((c) => c.browseId) };
    });
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const SEARCH_PARAMS: Record<string, string> = {
  songs: 'EgWKAQIIAWoMEA4QChADEAQQCRAF',
  videos: 'EgWKAQIQAWoMEA4QChADEAQQCRAF',
  albums: 'EgWKAQIYAWoMEA4QChADEAQQCRAF',
  artists: 'EgWKAQIgAWoMEA4QChADEAQQCRAF',
  playlists: 'EgeKAQQoAEABagwQDhAKEAMQBBAJEAU=',
};

app.get('/api/search', async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ sections: [] });
    const filter = String(req.query.filter || '');
    const body: any = { query: q };
    if (filter && SEARCH_PARAMS[filter]) body.params = SEARCH_PARAMS[filter];
    const d = await yt('search', body);
    const sections: any[] = [];
    const shelves = findAll(d, 'musicShelfRenderer');
    for (const shelf of shelves) {
      const items = (shelf.contents || [])
        .map((c: any) => (c.musicResponsiveListItemRenderer ? parseListItem(c.musicResponsiveListItemRenderer) : null))
        .filter((x: any) => x && x.title);
      if (items.length) sections.push({ title: text(shelf.title), items });
    }
    if (!sections.length) {
      const flat: any[] = [];
      const seen = new Set<string>();
      for (const sec of findAll(d, 'itemSectionRenderer')) {
        for (const c of sec.contents || []) {
          if (!c.musicResponsiveListItemRenderer) continue;
          const it = parseListItem(c.musicResponsiveListItemRenderer);
          const key = it.videoId || it.browseId || it.title;
          if (it.title && !seen.has(key)) { seen.add(key); flat.push(it); }
        }
      }
      if (flat.length) sections.push({ title: 'Results', items: flat });
    }
    const top = findFirst(d, 'musicCardShelfRenderer');
    if (top) {
      const info = endpointInfo(findFirst(top.title || {}, 'navigationEndpoint') || (top.title.runs && top.title.runs[0].navigationEndpoint));
      sections.unshift({
        title: 'Top result',
        items: [
          {
            type: info.videoId ? 'song' : info.browseType || 'song',
            title: text(top.title),
            subtitle: text(top.subtitle),
            thumbnail: thumbs(top.thumbnail),
            ...info,
          },
        ],
      });
    }
    res.json({ sections });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/suggest', async (req: Request, res: Response) => {
  try {
    const d = await yt('music/get_search_suggestions', { input: String(req.query.q || '') });
    const sugg = findAll(d, 'searchSuggestionRenderer').map((s) => text(s.suggestion));
    res.json({ suggestions: sugg });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* PENGAMBIL ANTREAN DAN RADIO UNTUK LAGU */
app.get('/api/next', async (req: Request, res: Response) => {
  try {
    const body: any = { isAudioOnly: true, tunerSettingValue: 'AUTOMIX_SETTING_NORMAL' };
    if (req.query.videoId) {
      body.videoId = String(req.query.videoId);
      body.playlistId = String(req.query.playlistId || `RDAMVM${req.query.videoId}`);
      body.watchEndpointMusicSupportedConfigs = {
        watchEndpointMusicConfig: { musicVideoType: 'MUSIC_VIDEO_TYPE_ATV' },
      };
    } else if (req.query.playlistId) {
      body.playlistId = String(req.query.playlistId);
    }
    if (req.query.params) body.params = String(req.query.params);
    const d = await yt('next', body);
    const panels = findAll(d, 'playlistPanelVideoRenderer');
    const queue = panels.map((p) => ({
      videoId: p.videoId,
      title: displayTitle(text(p.title)),
      artist: text(p.shortBylineText || p.longBylineText),
      artists: runsInfo(p.longBylineText),
      duration: text(p.lengthText),
      thumbnail: thumbs(p.thumbnail),
      selected: !!p.selected,
    }));
    let lyricsBrowseId: string | null = null;
    let relatedBrowseId: string | null = null;
    for (const tab of findAll(d, 'tabRenderer')) {
      const id = tab.endpoint && tab.endpoint.browseEndpoint && tab.endpoint.browseEndpoint.browseId;
      if (!id) continue;
      if (id.startsWith('MPLYt')) lyricsBrowseId = id;
      if (id.startsWith('MPTRt')) relatedBrowseId = id;
    }
    res.json({ queue, lyricsBrowseId, relatedBrowseId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/related', async (req: Request, res: Response) => {
  try {
    const d = await yt('browse', { browseId: String(req.query.browseId) });
    const sl = findFirst(d, 'sectionListRenderer');
    let sections = sl ? parseSections(sl.contents) : [];
    for (const g of findAll(d, 'gridRenderer')) {
      const items = (g.items || [])
        .map((c: any) => {
          if (c.musicTwoRowItemRenderer) return parseTwoRow(c.musicTwoRowItemRenderer);
          if (c.musicResponsiveListItemRenderer) return parseListItem(c.musicResponsiveListItemRenderer);
          return null;
        })
        .filter((x: any) => x && x.title);
      if (items.length) sections.push({ title: text(findFirst(g.header || {}, 'title') || {}), items });
    }
    sections = sections.filter((x) => x.items && x.items.length);
    res.json({ sections });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* PENGURAI HALAMAN ALBUM, PLAYLIST, ARTIS, DAN MOOD */
async function browsePage(rawId: string | undefined, params: string | undefined) {
  let id = rawId || '';
  if (/^(PL|RDCLAK|VLPL|OLAK)/.test(id) && !id.startsWith('VL')) id = 'VL' + id;
  const body: any = { browseId: id };
  if (params) body.params = params;
  const d = await yt('browse', body);

  let header: any = null;
  const hResp =
    findFirst(d, 'musicResponsiveHeaderRenderer') ||
    findFirst(d, 'musicDetailHeaderRenderer') ||
    findFirst(d, 'musicImmersiveHeaderRenderer') ||
    findFirst(d, 'musicVisualHeaderRenderer') ||
    findFirst(d, 'musicEditablePlaylistDetailHeaderRenderer');
  if (hResp) {
    header = {
      title: text(hResp.title),
      subtitle: [text(hResp.subtitle), text(hResp.secondSubtitle)].filter(Boolean).join(' • '),
      description: text(hResp.description) || text(findFirst(hResp, 'description') || {}),
      thumbnail: thumbs(hResp.thumbnail || hResp.foregroundThumbnail || {}),
      artists: runsInfo(hResp.subtitle).concat(runsInfo(hResp.straplineTextOne)),
      strapline: text(hResp.straplineTextOne),
    };
    if (!header.thumbnail) header.thumbnail = thumbs(hResp);
  }

  let playlistId: string | null = null;
  const wpe = findFirst(d, 'watchPlaylistEndpoint');
  if (wpe) playlistId = wpe.playlistId;

  let tracks: any[] = [];
  const shelves = findAll(d, 'musicShelfRenderer').concat(findAll(d, 'musicPlaylistShelfRenderer'));
  for (const shelf of shelves) {
    const items = (shelf.contents || [])
      .map((c: any) => (c.musicResponsiveListItemRenderer ? parseListItem(c.musicResponsiveListItemRenderer) : null))
      .filter((x: any) => x && x.title);
    if (items.length && items.filter((i: any) => i.videoId).length >= items.length / 2 && !tracks.length) {
      tracks = items;
    }
  }

  let sections: any[] = [];
  const sl = findFirst(d, 'sectionListRenderer');
  if (sl) sections = parseSections(sl.contents).filter((s) => !s.list || !tracks.length);
  if (tracks.length) sections = sections.filter((s) => !(s.list && s.items[0] && s.items[0].videoId === tracks[0].videoId));

  const grids = findAll(d, 'gridRenderer');
  for (const g of grids) {
    const items = (g.items || [])
      .map((c: any) => (c.musicTwoRowItemRenderer ? parseTwoRow(c.musicTwoRowItemRenderer) : null))
      .filter(Boolean);
    if (items.length) sections.push({ title: text(findFirst(g.header || {}, 'title') || {}), items });
  }

  if (header && !header.thumbnail && tracks[0]) header.thumbnail = tracks[0].thumbnail;
  if (header && tracks.length) {
    const ha = (header.artists && header.artists[0]) || (header.strapline ? { name: header.strapline } : null);
    tracks = tracks.map((t) => {
      const thumb = t.thumbnail || header.thumbnail || (t.videoId ? `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg` : '');
      const item = { ...t, thumbnail: thumb };
      if (ha && ha.name && (!t.artist || !t.artist.trim()) && (!t.artists || !t.artists.length)) {
        item.artist = ha.name;
        item.artists = [ha];
        item.artistBrowseId = ha.browseId || t.artistBrowseId;
      }
      return item;
    });
  }

  return { header, tracks, sections, playlistId };
}

app.get('/api/browse', async (req: Request, res: Response) => {
  try {
    res.json(await browsePage(req.query.id as string, req.query.params as string));
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- PENGUNDUH & STREAM AUDIO MUSIK ---------------- */
function extractVideoId(urlOrId: string): string | null {
  if (!urlOrId) return null;
  if (/^[\w-]{11}$/.test(urlOrId)) return urlOrId;
  let match = null;
  if (urlOrId.includes('youtube.com/shorts/') || urlOrId.includes('youtu.be/')) {
    match = /\/([a-zA-Z0-9\-_]{11})/.exec(urlOrId);
  } else if (urlOrId.includes('youtube.com')) {
    match = /v=([a-zA-Z0-9\-_]{11})/.exec(urlOrId);
  } else {
    match = /[a-zA-Z0-9\-_]{11}/.exec(urlOrId);
  }
  return match ? match[1] : null;
}

// SCRAPER YTMOBI (YMCDN API) YANG DISEDIAKAN PENGGUNA - KHUSUS YOUTUBE MP3 KUALITAS TINGGI
async function scrapeYtmp3(videoIdOrUrl: string): Promise<{ downloadUrl: string; title: string } | null> {
  const videoId = extractVideoId(videoIdOrUrl);
  if (!videoId) return null;

  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://id.ytmp3.mobi',
    Referer: 'https://id.ytmp3.mobi/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'cross-site',
  };

  try {
    const initUrl = `https://a.ymcdn.org/api/v1/init?p=y&23=1llum1n471&_=${Math.random()}`;
    const initRes = await fetch(initUrl, { headers });
    if (!initRes.ok) return null;
    const initJson: any = await initRes.json();
    if (initJson.error > 0 || !initJson.convertURL) return null;

    let convertUrl = initJson.convertURL;
    let convertRequestUrl = `${convertUrl}&v=${videoId}&f=mp3&_=${Math.random()}`;
    let convertJson: any = null;

    for (let r = 0; r < 3; r++) {
      const convertRes = await fetch(convertRequestUrl, { headers });
      if (!convertRes.ok) return null;
      convertJson = await convertRes.json();
      if (convertJson.error > 0) return null;

      if (convertJson.redirect > 0 && convertJson.redirectURL) {
        convertRequestUrl = `${convertJson.redirectURL}&v=${videoId}&f=mp3&_=${Math.random()}`;
        continue;
      }
      break;
    }

    if (!convertJson || !convertJson.downloadURL) return null;

    const progressUrl = convertJson.progressURL;
    const downloadUrl = convertJson.downloadURL;
    let title = convertJson.title || '';

    if (progressUrl) {
      let progress = convertJson.progress || 0;
      let pollCount = 0;
      while (progress < 3 && pollCount < 20) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        pollCount++;
        const progressRes = await fetch(progressUrl, { headers });
        if (!progressRes.ok) break;
        const progressJson: any = await progressRes.json();
        if (progressJson.error > 0) break;
        progress = progressJson.progress || 0;
        if (progressJson.title) title = progressJson.title;
      }
    }

    // VERIFIKASI KETERSEDIAAN DAN FORMAT STREAM AUDIO
    const headRes = await fetch(downloadUrl, { headers, method: 'HEAD' });
    const ctype = headRes.headers.get('content-type') || '';
    if (headRes.ok || headRes.status === 206 || ctype.includes('audio')) {
      return { downloadUrl, title };
    }
  } catch (err: any) {
    console.warn('scrapeYtmp3 warning:', err.message);
  }
  return null;
}

let vredenScraper: any = null;
async function getVreden() {
  if (!vredenScraper) {
    try {
      vredenScraper = await import('@vreden/youtube_scraper');
    } catch (err: any) {
      console.warn('Failed to load @vreden/youtube_scraper:', err.message);
    }
  }
  return vredenScraper;
}

const audioCache = new Map<string, { url: string; title: string; filename: string; timestamp: number }>();

async function resolveAudioUrl(videoId: string, titleHint = '', artistHint = '') {
  const cached = audioCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 30) {
    return cached;
  }

  // 1. EKSTRAKSI LANGSUNG VIA SCRAPER YTMOBI / YMCDN (DARI YTMOBI.JS YANG DISEDIAKAN PENGGUNA)
  try {
    const ytmp3Res = await scrapeYtmp3(videoId);
    if (ytmp3Res && ytmp3Res.downloadUrl) {
      const title = ytmp3Res.title || titleHint || 'Dansmusic Track';
      const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').trim();
      const filename = `${cleanTitle} (320kbps).mp3`;
      const entry = { url: ytmp3Res.downloadUrl, title, filename, timestamp: Date.now() };
      audioCache.set(videoId, entry);
      return entry;
    }
  } catch (err: any) {
    console.warn('ytmobi scraper error:', err.message);
  }

  // 2. EKSTRAKSI VIA @VREDEN/YOUTUBE_SCRAPER DENGAN KUALITAS 320KBPS
  try {
    const vreden = await getVreden();
    if (vreden && vreden.ytmp3) {
      const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const res = await vreden.ytmp3(ytUrl, '320');
      if (res && res.status && res.download && res.download.url) {
        const title = res.metadata?.title || titleHint || 'Dansmusic Track';
        const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').trim();
        const filename = `${cleanTitle} (320kbps).mp3`;
        const entry = { url: res.download.url, title, filename, timestamp: Date.now() };
        audioCache.set(videoId, entry);
        return entry;
      }
    }
  } catch (err: any) {
    console.warn('vreden ytmp3 320 error:', err.message);
  }

  // 3. COBA FALLBACK PENCARIAN JUDUL JIKA VIDEO SPESIFIK TERHALANG
  try {
    const vreden = await getVreden();
    const query = [titleHint, artistHint].filter(Boolean).join(' ');
    if (vreden && vreden.search && query) {
      const searchRes = await vreden.search(query);
      const items = searchRes?.results || (Array.isArray(searchRes) ? searchRes : []);
      const topMatch = items.find((it: any) => it.videoId && it.videoId !== videoId) || items[0];
      if (topMatch && topMatch.videoId) {
        const altYt = await scrapeYtmp3(topMatch.videoId);
        if (altYt && altYt.downloadUrl) {
          const title = altYt.title || topMatch.title || titleHint || 'Dansmusic Track';
          const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').trim();
          const filename = `${cleanTitle} (320kbps).mp3`;
          const entry = { url: altYt.downloadUrl, title, filename, timestamp: Date.now() };
          audioCache.set(videoId, entry);
          return entry;
        }

        const altRes = await vreden.ytmp3(`https://www.youtube.com/watch?v=${topMatch.videoId}`, '320');
        if (altRes && altRes.status && altRes.download && altRes.download.url) {
          const title = altRes.metadata?.title || topMatch.title || titleHint || 'Music';
          const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').trim();
          const filename = `${cleanTitle} (320kbps).mp3`;
          const entry = { url: altRes.download.url, title, filename, timestamp: Date.now() };
          audioCache.set(videoId, entry);
          return entry;
        }
      }
    }
  } catch (err: any) {
    console.warn('fallback error:', err.message);
  }

  // 4. EKSTRAKSI AUDIO LANGSUNG VIA BINARY ./YT-DLP DI WORKSPACE
  try {
    const { stdout } = await execFileAsync('./yt-dlp', [
      '-f', 'ba/b',
      '-g',
      `https://www.youtube.com/watch?v=${videoId}`
    ], { timeout: 15000 });
    const directUrl = stdout.trim().split('\n')[0];
    if (directUrl && directUrl.startsWith('http')) {
      const title = titleHint || 'Dansmusic Track';
      const cleanTitle = title.replace(/[^\w\s.-]/gi, '_').trim();
      const filename = `${cleanTitle} (320kbps).mp3`;
      const entry = { url: directUrl, title, filename, timestamp: Date.now() };
      audioCache.set(videoId, entry);
      return entry;
    }
  } catch (err: any) {
    console.warn('yt-dlp direct audio extraction error:', err.message);
  }

  return null;
}

// ENDPOINT INFORMASI UNDUHAN LAGU (JSON)
app.get('/api/download-info', async (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  const videoId = String(req.query.videoId || '').trim();
  const titleHint = String(req.query.title || '').trim();
  const artistHint = String(req.query.artist || '').trim();

  if (!videoId || !/^[\w-]{6,25}$/.test(videoId)) {
    return res.status(400).json({ error: 'ID Video tidak valid' });
  }

  try {
    const audio = await resolveAudioUrl(videoId, titleHint, artistHint);
    if (!audio) {
      return res.status(404).json({ error: 'Tautan unduhan audio tidak ditemukan atau sedang diproses' });
    }
    res.json({
      status: true,
      title: audio.title,
      filename: audio.filename,
      quality: '320kbps',
      downloadUrl: `/api/download?videoId=${encodeURIComponent(videoId)}&title=${encodeURIComponent(audio.title)}`,
      directUrl: audio.url,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ENDPOINT UNDUH LANGSUNG FILE MP3 320KBPS DENGAN STREAM ATTACHMENT ASLI
app.get('/api/download', async (req: Request, res: Response) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type, Content-Length');

  const videoId = String(req.query.videoId || '').trim();
  const titleHint = String(req.query.title || '').trim();
  const artistHint = String(req.query.artist || '').trim();

  if (!videoId || !/^[\w-]{6,25}$/.test(videoId)) {
    return res.status(400).json({ error: 'ID Video tidak valid' });
  }

  try {
    const audio = await resolveAudioUrl(videoId, titleHint, artistHint);
    if (!audio || !audio.url) {
      return res.status(404).json({ error: 'Audio tidak tersedia untuk diunduh saat ini' });
    }

    const fetchHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    };
    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const upstream = await fetch(audio.url, { headers: fetchHeaders });
    const upstreamType = upstream.headers.get('content-type') || '';

    // CEGAH FILE HTML TERUNDUH SEBAGAI AUDIO
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(502).json({ error: 'Server audio upstream sedang sibuk. Silakan coba kembali.' });
    }
    if (upstreamType.includes('text/html')) {
      return res.status(502).json({ error: 'Upstream mengembalikan halaman web bukan audio MP3.' });
    }

    const safeBaseName = (audio.filename || `${audio.title || 'musik'} (320kbps).mp3`).replace(/\.html$/i, '');
    const cleanFilename = safeBaseName.endsWith('.mp3') ? safeBaseName : `${safeBaseName}.mp3`;

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${cleanFilename.replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(cleanFilename)}`
    );
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');

    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    const crange = upstream.headers.get('content-range');
    if (crange) {
      res.status(206);
      res.setHeader('Content-Range', crange);
    }

    if (upstream.body) {
      Readable.fromWeb(upstream.body as any).pipe(res);
    } else {
      res.redirect(audio.url);
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ENDPOINT STREAMING AUDIO UNTUK HTML5 AUDIO & WEB AUDIO API EQUALIZER
app.get('/api/stream', async (req: Request, res: Response) => {
  const videoId = String(req.query.videoId || '').trim();
  if (!videoId || !/^[\w-]{6,25}$/.test(videoId)) {
    return res.status(400).send('Bad id');
  }

  try {
    const audio = await resolveAudioUrl(videoId);
    if (!audio || !audio.url) {
      return res.status(404).send('Stream not found');
    }

    const fetchHeaders: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };
    if (req.headers.range) {
      fetchHeaders['Range'] = req.headers.range;
    }

    const upstream = await fetch(audio.url, { headers: fetchHeaders });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Accept-Ranges', 'bytes');

    const len = upstream.headers.get('content-length');
    if (len) res.setHeader('Content-Length', len);

    const crange = upstream.headers.get('content-range');
    if (crange) {
      res.status(206);
      res.setHeader('Content-Range', crange);
    }

    if (upstream.body) {
      const reader = upstream.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(value);
          }
          res.end();
        } catch (e) {
          res.end();
        }
      };
      pump();
    } else {
      res.redirect(audio.url);
    }
  } catch (err: any) {
    res.status(500).send(err.message);
  }
});

app.get('/api/resolve', async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.url || '').trim();
    let u: URL;
    try { u = new URL(raw.includes('://') ? raw : 'https://' + raw); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    const list = u.searchParams.get('list');
    const v = u.searchParams.get('v');
    const m = u.pathname.match(/\/(playlist|channel|browse|watch)\/?([^/]*)?/);
    if (list && !v) return res.json({ kind: 'playlist', id: list });
    if (v) return res.json({ kind: 'song', videoId: v, playlistId: list || null });
    if (m && m[1] === 'channel' && m[2]) return res.json({ kind: 'artist', id: m[2] });
    if (m && m[1] === 'browse' && m[2]) return res.json({ kind: m[2].startsWith('MPRE') ? 'album' : 'playlist', id: m[2] });
    return res.status(400).json({ error: 'Could not recognize this link. Paste a YouTube Music playlist/album/song link.' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PENGAMBIL COVER ALBUM HD SPOTIFY DAN ITUNES
app.get('/api/hd-cover', async (req: Request, res: Response) => {
  try {
    const title = String(req.query.title || '').trim();
    const artist = String(req.query.artist || '').trim();
    if (!title) return res.status(400).json({ error: 'Judul diperlukan' });
    const cover = await fetchHdCover(title, artist);
    res.json({ cover });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- PENGAMBIL LIRIK TERSINKRONISASI DARI BERBAGAI SUMBER ---------------- */
function cleanTitle(t: string): string {
  return String(t || '')
    .replace(/\((feat|ft|with|prod)[^)]*\)/gi, '')
    .replace(/\[(feat|ft|with|prod)[^\]]*\]/gi, '')
    .replace(/\((official|lyric|lyrics|audio|video|visualizer|music video|mv|hd|4k|remaster(ed)?( \d{4})?|live|acoustic|explicit|clean)[^)]*\)/gi, '')
    .replace(/\[[^\]]*(official|lyric|audio|video|remaster|visualizer|live|mv)[^\]]*\]/gi, '')
    .replace(/[\(\[]\s*(4k|hd|hq|8d( audio)?|1080p|720p)\s*[\)\]]/gi, '')
    .replace(/\s*-\s*(official|lyric|lyrics|audio|video|visualizer|topic).*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function primaryArtist(a: string): string {
  return String(a || '')
    .split(/\s*[,&•·]\s*|\s+(?:feat\.?|ft\.?|with|x|vs\.?)\s+/i)[0]
    .replace(/\s*-\s*topic$/i, '')
    .trim();
}
function norm(x: string): string {
  return String(x || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g, ' ').trim();
}
function simScore(a: string, b: string): number {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.85;
  const aw = new Set(a.split(' ')), bw = new Set(b.split(' '));
  let hit = 0;
  for (const w of aw) if (bw.has(w)) hit++;
  return hit / Math.max(aw.size, bw.size);
}
async function fetchTimeout(url: string, opts: any = {}, ms = 4500): Promise<any> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally { clearTimeout(t); }
}

async function lyricsOvh(title: string, artist: string) {
  if (!title || !artist) return null;
  try {
    const r = await fetchTimeout(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`);
    if (!r.ok) return null;
    const j: any = await r.json();
    const lyr = String(j.lyrics || '').replace(/\r\n/g, '\n').trim();
    return lyr.length > 24 ? lyr : null;
  } catch { return null; }
}

async function neteaseLyrics(title: string, artist: string) {
  try {
    const q = `${title} ${artist}`.trim();
    if (!q) return null;
    const r = await fetchTimeout(
      `https://music.163.com/api/search/get/web?s=${encodeURIComponent(q)}&type=1&limit=8`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } }
    );
    if (!r.ok) return null;
    const j: any = await r.json();
    const songs = (((j.result || {}).songs) || []);
    let best = null, bestScore = 0;
    for (const song of songs) {
      const an = (song.artists || []).map((a: any) => a.name).join(' ');
      const score = simScore(song.name, title) * 2 + simScore(an, artist);
      if (score > bestScore) { bestScore = score; best = song; }
    }
    if (!best || bestScore < 1.4) return null;
    const lr = await fetchTimeout(
      `https://music.163.com/api/song/lyric?id=${best.id}&lv=1&kv=1&tv=-1`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://music.163.com/' } }
    );
    if (!lr.ok) return null;
    const L: any = await lr.json();
    const synced = (L.lrc && L.lrc.lyric) || '';
    const hasTime = /\[[0-9]+:[0-9]/.test(synced);
    if (hasTime && synced.length > 40) {
      const plain = synced.replace(/\[[^\]]+\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
      return { synced, plain: plain || null };
    }
    const plain = synced.replace(/\[[^\]]+\]/g, '').trim();
    if (plain.length > 24) return { synced: null, plain };
    return null;
  } catch { return null; }
}

async function lrclibGet(title: string, artist: string, duration: number) {
  try {
    const u = `https://lrclib.net/api/get?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}${duration ? `&duration=${Math.round(duration)}` : ''}`;
    const r = await fetchTimeout(u, { headers: { 'User-Agent': 'dansmusic/1.0' } }, 4000);
    if (!r.ok) return null;
    const j: any = await r.json();
    if (j.instrumental) return null;
    return (j.syncedLyrics || j.plainLyrics) ? j : null;
  } catch { return null; }
}
async function lrclibSearch(params: Record<string, string>) {
  try {
    const qs = new URLSearchParams(params).toString();
    const r = await fetchTimeout(`https://lrclib.net/api/search?${qs}`, { headers: { 'User-Agent': 'dansmusic/1.0' } }, 4000);
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}
function pickBest(cands: any[], title: string, artist: string, duration: number) {
  const dur = Number(duration) || 0;
  let best = null, bestScore = 0;
  for (const c of cands) {
    if (!c || c.instrumental || (!c.syncedLyrics && !c.plainLyrics)) continue;
    const tScore = simScore(c.trackName || c.name, title);
    let score = tScore * 2 + simScore(c.artistName, artist);
    if (dur && c.duration) {
      const diff = Math.abs(c.duration - dur);
      if (diff <= 2) score += 1.2;
      else if (diff <= 5) score += 0.6;
      else if (diff > 20) score -= 1;
    }
    if (c.syncedLyrics) score += 0.8;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (!best) return null;
  if (bestScore >= 1.4) return best;
  if (simScore(best.trackName || best.name, title) >= 0.85 && bestScore >= 0.95) return best;
  return null;
}

async function textylLyrics(title: string, artist: string) {
  const q = `${artist || ''} ${title || ''}`.trim();
  if (!q) return null;
  try {
    const r = await fetchTimeout(`https://api.textyl.co/api/lyrics?q=${encodeURIComponent(q)}`);
    if (!r.ok) return null;
    const arr: any = await r.json();
    if (!Array.isArray(arr) || arr.length < 4) return null;
    const synced = arr.map((x: any) => {
      const sec = Number(x.seconds) || 0;
      const m = Math.floor(sec / 60);
      const s = (sec % 60).toFixed(2).padStart(5, '0');
      return `[${m}:${s}]${x.lyrics || ''}`;
    }).join('\n');
    return synced.length > 40 ? synced : null;
  } catch { return null; }
}

function extractYtmLyrics(d: any) {
  for (const shelf of findAll(d, 'musicDescriptionShelfRenderer')) {
    const lyr = text(shelf.description);
    if (lyr && lyr.length > 20) return lyr;
  }
  for (const block of findAll(d, 'formattedDescription')) {
    const lyr = text(block);
    if (lyr && lyr.length > 40 && lyr.split('\n').length > 4) return lyr;
  }
  return null;
}

app.get('/api/lyrics', async (req: Request, res: Response) => {
  const title = String(req.query.title || '');
  const artist = String(req.query.artist || '');
  const duration = Number(req.query.duration || 0);
  const browseId = String(req.query.browseId || '');
  try {
    const ct = cleanTitle(title);
    const pa = primaryArtist(artist);
    let tUse = ct || title;
    let aUse = pa || artist;
    const dash = String(tUse).match(/^(.{2,48}?)\s*[-–—]\s+(.+)$/);
    if (dash && (!aUse || simScore(dash[1], aUse) >= 0.45)) {
      aUse = aUse || dash[1];
      tUse = dash[2];
    }

    let synced: string | null = null, plain: string | null = null, source: string | null = null;

    if (browseId) {
      try {
        const body = {
          context: { client: { ...CONTEXT.client, hl: 'id', gl: 'ID' } },
          browseId,
        };
        const r = await fetchTimeout(`${YTM}/browse?prettyPrint=false`, {
          method: 'POST',
          headers: HEADERS,
          body: JSON.stringify(body),
        }, 4500);
        if (r.ok) {
          const d = await r.json();
          const lyr = extractYtmLyrics(d);
          if (lyr) { plain = lyr; source = 'YouTube Music'; }
        }
      } catch {}
    }

    const exactHits = await Promise.all([
      lrclibGet(tUse, aUse, duration),
      lrclibGet(tUse, aUse, 0),
      title && title !== tUse ? lrclibGet(cleanTitle(title), pa, 0) : null,
    ]);
    for (const hit of exactHits) {
      if (!hit) continue;
      synced = synced || hit.syncedLyrics || null;
      plain = plain || hit.plainLyrics || null;
      source = synced ? 'LRCLIB' : (source || 'LRCLIB');
      if (synced) break;
    }

    if (!synced) {
      const [s1, s2, s3, ne, ovh, tx] = await Promise.all([
        lrclibSearch({ track_name: tUse, artist_name: aUse }),
        lrclibSearch({ q: `${tUse} ${aUse}`.trim() }),
        lrclibSearch({ track_name: tUse }),
        neteaseLyrics(tUse, aUse),
        plain ? null : lyricsOvh(tUse, aUse),
        textylLyrics(tUse, aUse),
      ]);
      const best = pickBest([].concat(s1 || [], s2 || [], s3 || []), tUse, aUse, duration);
      if (best) {
        synced = best.syncedLyrics || synced;
        plain = plain || best.plainLyrics;
        source = best.syncedLyrics ? 'LRCLIB' : (source || 'LRCLIB');
      }
      if (!synced && ne && ne.synced) {
        synced = ne.synced;
        plain = plain || ne.plain;
        source = 'NetEase';
      } else if (!plain && ne && ne.plain) {
        plain = ne.plain;
        source = source || 'NetEase';
      }
      if (!synced && tx) {
        synced = tx;
        source = 'Textyl';
      }
      if (!synced && !plain && ovh) {
        plain = ovh;
        source = 'lyrics.ovh';
      }
    }

    res.json({ synced: synced || null, plain: plain || null, source });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/* PROKSI COVER ALBUM AGAR KANVAS PIP DAN WIDGET TIDAK TERKENDALA CORS */
app.get('/api/thumb', async (req: Request, res: Response) => {
  try {
    const raw = String(req.query.url || '');
    const u = new URL(raw);
    const host = u.hostname;
    const ok =
      host.endsWith('ytimg.com') ||
      host.endsWith('ggpht.com') ||
      host.endsWith('googleusercontent.com') ||
      host.endsWith('mzstatic.com') ||
      host.endsWith('scdn.co') ||
      host.endsWith('spotifycdn.com') ||
      host.endsWith('dzcdn.net') ||
      host.endsWith('deezer.com');
    if (!ok) return res.status(400).end();
    const r = await fetch(raw, {
      headers: { 'User-Agent': 'Mozilla/5.0 DansmusicThumb/1.0', Accept: 'image/*' },
    });
    if (!r.ok) return res.status(502).end();
    res.setHeader('Content-Type', r.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const ab = await r.arrayBuffer();
    res.send(Buffer.from(ab));
  } catch {
    res.status(500).end();
  }
});

/* ---------------- MIDDLEWARE VITE DAN PENYAJIAN BERKAS STATIS SERTA EKSPOR VERCEL ---------------- */
async function startServer() {
  if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`dansmusic server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  startServer();
}

export default app;
