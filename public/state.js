/* DANSMUSIC — MANAJEMEN KEADAAN DAN PENYIMPANAN LOKAL */

export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const icon = (id, cls = 'ic') => `<svg class="${cls}"><use href="#${id}"/></svg>`;

export const api = async (path) => {
  try {
    const r = await fetch(path);
    if (!r.ok) {
      console.warn(`API ${path} responded with status:`, r.status);
      return {};
    }
    return await r.json();
  } catch (err) {
    console.warn(`API network error on ${path}:`, err);
    return {};
  }
};

export const fmtTime = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export function toast(msg) {
  // SEMUA POP-UP PEMBERITAHUAN DINONAKTIFKAN SESUAI PERMINTAAN PENGGUNA
}

export function hueFrom(str) {
  let h = 0;
  const s = String(str || 'home');
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export function applyTint(key) {
  // RENTANG WARNA DASAR AKSEN CYAN SPOTIFY ELEKTRIK (195 - 215)
  const baseHue = 205;
  const variance = (hueFrom(key) % 24) - 12;
  const tint = (baseHue + variance + 360) % 360;
  document.documentElement.style.setProperty('--tint', String(tint));
  const main = $('#main');
  if (main) main.style.setProperty('--tint', String(tint));
}

export function currentTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

export function updateThemeIcon() {
  const use = $('#theme-ic use');
  if (use) use.setAttribute('href', currentTheme() === 'light' ? '#i-moon' : '#i-sun');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', currentTheme() === 'light' ? '#edf4f8' : '#030e17');
}

export function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  store.set('theme', next);
  updateThemeIcon();
}

export const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem('smw_' + k)) ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem('smw_' + k, JSON.stringify(v)); },
};

export const Library = {
  get favorites() { return store.get('fav', []); },
  isFav(id) { return this.favorites.some((s) => s.videoId === id); },
  toggleFav(song, onUpdate) {
    let f = this.favorites;
    if (this.isFav(song.videoId)) { f = f.filter((s) => s.videoId !== song.videoId); }
    else { f.unshift(song); }
    store.set('fav', f);
    if (onUpdate) onUpdate();
  },
  get playlists() { return store.get('pls', []); },
  createPlaylist(name, onUpdate) {
    const pls = this.playlists;
    const pl = { id: 'local_' + Date.now(), name, tracks: [] };
    pls.unshift(pl); store.set('pls', pls);
    if (onUpdate) onUpdate();
    return pl;
  },
  addToPlaylist(pid, song) {
    const pls = this.playlists;
    const pl = pls.find((p) => p.id === pid);
    if (!pl) return;
    if (!pl.tracks.some((t) => t.videoId === song.videoId)) pl.tracks.push(song);
    store.set('pls', pls);
  },
  removeFromPlaylist(pid, vid) {
    const pls = this.playlists;
    const pl = pls.find((p) => p.id === pid);
    if (!pl) return;
    pl.tracks = pl.tracks.filter((t) => t.videoId !== vid);
    store.set('pls', pls);
  },
  deletePlaylist(pid, onUpdate) {
    store.set('pls', this.playlists.filter((p) => p.id !== pid));
    if (onUpdate) onUpdate();
  },
  renamePlaylist(pid, name, onUpdate) {
    const n = String(name || '').trim();
    if (!n) return;
    const pls = this.playlists;
    const pl = pls.find((p) => p.id === pid);
    if (!pl) return;
    pl.name = n;
    store.set('pls', pls);
    if (onUpdate) onUpdate();
  },
  moveInPlaylist(pid, from, dir) {
    const pls = this.playlists;
    const pl = pls.find((p) => p.id === pid);
    if (!pl) return false;
    const to = from + dir;
    if (to < 0 || to >= pl.tracks.length) return false;
    const [item] = pl.tracks.splice(from, 1);
    pl.tracks.splice(to, 0, item);
    store.set('pls', pls);
    return true;
  },
  get saved() { return store.get('sav', []); },
  isSaved(browseId) { return this.saved.some((s) => s.browseId === browseId); },
  toggleSaved(item, onUpdate) {
    let sv = this.saved;
    if (this.isSaved(item.browseId)) { sv = sv.filter((s) => s.browseId !== item.browseId); }
    else { sv.unshift(item); }
    store.set('sav', sv);
    if (onUpdate) onUpdate();
  },
  get history() { return store.get('hist', []); },
  getRecent(limit = 20) {
    return this.history.slice(0, limit);
  },
  pushHistory(song) {
    let h = this.history.filter((s) => s.videoId !== song.videoId);
    h.unshift({ ...song, playedAt: Date.now() });
    store.set('hist', h.slice(0, 100));
    const st = store.get('stats', {});
    const k = song.videoId;
    if (!st[k]) st[k] = { title: song.title, artist: song.artist || '', thumbnail: song.thumbnail, plays: 0, secs: 0, last: 0 };
    st[k].plays++; st[k].last = Date.now();
    st[k].title = song.title; st[k].thumbnail = song.thumbnail;
    store.set('stats', st);
  },
  get stats() { return store.get('stats', {}); },
  addListenTime(videoId, secs) {
    const st = store.get('stats', {});
    if (st[videoId]) { st[videoId].secs += secs; store.set('stats', st); }
  },
};

export const EQ_PRESETS = [
  { id: 'flat', name: 'Flat', desc: 'Respon datar seimbang asli', gains: [0, 0, 0, 0, 0] },
  { id: 'bass', name: 'Bass Boost', desc: 'Dentuman bass dalam & bertenaga', gains: [7, 5, 1, -1, -2] },
  { id: 'vocal', name: 'Vocal Clear', desc: 'Vokal jernih dan lebih maju', gains: [-3, 1, 6, 4, 2] },
  { id: 'acoustic', name: 'Acoustic', desc: 'Instrumen petik hangat natural', gains: [3, 3, 1, 2, 4] },
  { id: 'electronic', name: 'Electronic', desc: 'Sub-bass menghentak & treble renyah', gains: [6, 4, -1, 3, 6] },
  { id: 'rock', name: 'Rock & Pop', desc: 'Distorsi gitar & ritme tegas', gains: [5, 3, -1, 2, 4] },
  { id: 'night', name: 'Night Mode', desc: 'Lembut & nyaman di telinga malam hari', gains: [-4, -2, 0, -2, -5] },
];

export const Player = {
  yt: null,
  ready: false,
  queue: [],
  index: -1,
  shuffle: false,
  repeat: 0,
  lyrics: { synced: null, plain: null, source: null, lines: [] },
  lyricsBrowseId: null,
  relatedBrowseId: null,
  sleepTimer: null,
  speed: 1,
  sbSegments: [],
  sbEnabled: store.get('sb_on', true),
  hq: store.get('yt_hq', false),
  quality: 'hd720',
  cued: false,
  pending: null,
  loadId: 0,
  floatOn: false,
  pipWin: null,
  eqPreset: store.get('eq_preset', 'flat'),
  eqGains: store.get('eq_gains', [0, 0, 0, 0, 0]),
  fadeOutActive: false,
  _lyricsRetried: false,
  _lyricsDur: 0,
  _relatedLoaded: false,
  _queueFetching: false,
  get current() { return this.queue[this.index] || null; },
};

export const COVER_PH = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="#0c2135"/><path fill="#00b5ff" d="M32 24v26.6a7 7 0 1 0 4 6.4V32h14V24H32z"/></svg>'
);

export function safeCover(src) {
  let u = String(src || '').trim();
  if (!u || u === 'undefined' || u === 'null' || u === 'about:blank') return '';
  if (u.includes('googleusercontent.com') && u.includes('=w1080-h1080')) {
    u = u.replace(/=w\d+-h\d+.*$/, '=w544-h544-l90-rj');
  }
  if (u.includes('ytimg.com/vi/') && u.includes('/maxresdefault.jpg')) {
    u = u.replace('/maxresdefault.jpg', '/hqdefault.jpg');
  }
  return u;
}

export function openNowPlaying() {
  $('#nowplaying').classList.remove('hidden');
  document.body.classList.add('np-open');
}

export function closeNowPlaying(renderNowPlaying, renderPlayButtons, updateLikeButtons) {
  Player.pending = null;
  $('#nowplaying').classList.add('hidden');
  document.body.classList.remove('np-open');
  if (renderNowPlaying) renderNowPlaying();
  if (renderPlayButtons) renderPlayButtons();
  if (updateLikeButtons) updateLikeButtons();
}

export function focusedSong() { return Player.pending || Player.current; }

export function isPreviewing() {
  return !!(Player.pending && (!Player.current || Player.pending.videoId !== Player.current.videoId));
}

