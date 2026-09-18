/* DANSMUSIC — TAMPILAN DAN RENDERER ANTARMUKA */

import {
  $, $$, esc, icon, api, fmtTime, toast, applyTint, store, Library,
  Player, COVER_PH, safeCover, openNowPlaying, closeNowPlaying,
  focusedSong, isPreviewing
} from './state.js';
import {
  displayTitle, normalizeSong, songFromItem, playSong, queueSong,
  renderQueue, renderNowPlaying, updateLikeButtons, renderPlayButtons,
  renderEqualizerUI
} from './player.js';

export const MOOD_COLORS = ['#00b4d8','#0077b6','#023e8a','#03045e','#0096c7','#48cae4','#00509d','#003f88','#00296b','#001233','#006494','#0582ca','#00a6fb','#007200','#7209b7','#3a0ca3'];

export const go = (hash) => { location.hash = hash; };

export function coverHTML(src, kind = '', videoId = '') {
  let u = safeCover(src);
  if (!u && videoId) {
    u = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  }
  if (!u) return `<div class="art-ph${kind ? ' art-ph-' + kind : ''}">${icon('i-note')}</div>`;
  const ph = `<div class="art-ph${kind ? ' art-ph-' + kind : ''}" style="display:none">${icon('i-note')}</div>`;
  const fallback = videoId
    ? ` onerror="if(!this.dataset.fb){this.dataset.fb='1';this.src='https://i.ytimg.com/vi/${videoId}/mqdefault.jpg';}else{this.onerror=null;this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';}"`
    : ` onerror="this.onerror=null;this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';"`;
  return `<img loading="lazy" decoding="async" src="${esc(u)}"${fallback} alt="">${ph}`;
}

export function cardHTML(it) {
  const cls = it.type === 'artist' ? 'card artist' : 'card';
  const thumb = it.thumbnail || (it.videoId ? `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg` : '');
  return `<div class="${cls}" data-item='${esc(JSON.stringify({ ...it, thumbnail: thumb }))}'>
    <div class="art">${coverHTML(thumb, '', it.videoId)}<div class="play-ov">${icon('i-play')}</div></div>
    <div class="t">${esc(it.title)}</div><div class="s">${esc(it.subtitle || '')}</div>
  </div>`;
}

export function trackRowHTML(it, playing = false, extraBtn = '') {
  const qi = it.qi != null ? ` data-qi="${it.qi}"` : '';
  const pl = it.plId ? ` data-pl="${esc(it.plId)}" data-pi="${it.plIndex}"` : '';
  const qn = it.qn ? `<span class="q-num">${it.qn}</span>` : '';
  const tn = it.tn != null ? `<span class="t-num">${it.tn}</span>` : '';
  const cls = `track${playing ? ' playing' : ''}${it.qRadio ? ' q-radio' : ''}${it.qn ? ' q-user' : ''}${it.plId ? ' pl-track' : ''}`;
  const thumb = it.thumbnail || (it.videoId ? `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg` : '');
  const cleanDur = it.duration ? esc(String(it.duration).replace('.', ':')) : '';
  return `<div class="${cls}"${qi}${pl} data-item='${esc(JSON.stringify({ ...it, thumbnail: thumb }))}'>
    <span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>
    ${tn}${qn}
    ${coverHTML(thumb, 'track', it.videoId)}
    <div class="tmeta"><div class="tt">${esc(displayTitle(it.title))}</div><div class="ts">${esc(it.artist || it.subtitle || '')}</div></div>
    ${cleanDur ? `<span class="tdur">${cleanDur}</span>` : ''}
    <div class="track-actions">
      <button class="tbtn btn-fav" title="Favorit">${icon(Library.isFav(it.videoId) ? 'i-heart-f' : 'i-heart-o')}</button>
      <button class="tbtn btn-queue" title="Antrean">${icon('i-queue')}</button>
      <button class="tbtn btn-addpl" title="Tambah ke playlist">${icon('i-plus')}</button>
      <button class="tbtn btn-dl" title="Unduh">${icon('i-download')}</button>
      <button class="tbtn btn-more" title="Opsi">${icon('i-more')}</button>
      ${extraBtn}
    </div>
  </div>`;
}

export function trackHeadHTML(labels = { n: '#', t: 'Judul', d: 'Durasi' }) {
  return `<div class="track-head" aria-hidden="true"><span class="th-n">${esc(labels.n)}</span><span class="th-spacer"></span><span class="th-t">${esc(labels.t)}</span><span class="th-d">${esc(labels.d)}</span><span class="th-actions"></span></div>`;
}

export function quickCardHTML(it) {
  const thumb = it.thumbnail || (it.videoId ? `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg` : '');
  return `<button class="quick-card" data-item='${esc(JSON.stringify({ ...it, thumbnail: thumb }))}'>
    ${coverHTML(thumb, 'quick', it.videoId)}
    <span class="qc-t">${esc(it.title)}</span>
    <span class="play-ov">${icon('i-play')}</span>
  </button>`;
}

export function carouselHTML(inner) {
  return `<div class="carousel-wrap">
    <button type="button" class="car-btn car-prev" aria-label="Scroll left">${icon('i-back')}</button>
    <div class="carousel">${inner}</div>
    <button type="button" class="car-btn car-next" aria-label="Scroll right">${icon('i-fwd')}</button>
  </div>`;
}

export function emptyHTML(title, sub, opts = {}) {
  const ic = opts.ic || 'i-note';
  const cta = opts.label
    ? `<button type="button" class="pill-btn primary empty-cta"${opts.go ? ` data-go="${esc(opts.go)}"` : ''}${opts.act ? ` data-act="${esc(opts.act)}"` : ''}>${opts.label}</button>`
    : '';
  return `<div class="empty-block">
    <div class="empty-ic">${icon(ic)}</div>
    <div class="empty-title">${title}</div>
    <div class="empty-s">${sub}</div>
    ${cta}
  </div>`;
}

export function likedCardHTML() {
  const n = Library.favorites.length;
  const firstSong = Library.favorites[0];
  const thumb = firstSong ? (firstSong.hdThumbnail || firstSong.thumbnail || (firstSong.videoId ? `https://i.ytimg.com/vi/${firstSong.videoId}/hqdefault.jpg` : '')) : '';
  const artContent = thumb
    ? `<div class="liked-cover-wrap">${coverHTML(thumb, 'liked', firstSong && firstSong.videoId)}<div class="liked-heart-overlay"><div class="liked-heart-badge">${icon('i-heart-f')}</div></div></div>`
    : `<div class="liked-cover-empty"><div class="liked-heart-badge-lg">${icon('i-heart-f')}</div></div>`;
  return `<div class="card liked-card" data-nav="#/library/favorites">
    <div class="art liked-cover">${artContent}<div class="play-ov">${icon('i-play')}</div></div>
    <div class="t">Lagu Favorit</div>
    <div class="s">${n} lagu</div>
  </div>`;
}

export function shelfHTML(sec) {
  if (sec.list) {
    return `<div class="shelf"><div class="shelf-title">${esc(sec.title)}</div>
      <div class="track-list">${sec.items.map((i) => (i.videoId ? trackRowHTML(i) : cardHTML(i))).join('')}</div></div>`;
  }
  return `<div class="shelf"><div class="shelf-title">${esc(sec.title)}</div>
    ${carouselHTML(sec.items.map(cardHTML).join(''))}</div>`;
}

export function bindCarousels(root) {
  $$('.carousel-wrap', root).forEach((wrap) => {
    const sc = $('.carousel', wrap);
    const prev = $('.car-prev', wrap);
    const next = $('.car-next', wrap);
    if (!sc || !prev || !next) return;
    const step = () => Math.max(200, Math.floor(sc.clientWidth * 0.82));
    const sync = () => {
      const max = sc.scrollWidth - sc.clientWidth - 6;
      prev.classList.toggle('off', sc.scrollLeft <= 6);
      next.classList.toggle('off', sc.scrollLeft >= max);
    };
    prev.addEventListener('click', (e) => { e.stopPropagation(); sc.scrollBy({ left: -step(), behavior: 'smooth' }); });
    next.addEventListener('click', (e) => { e.stopPropagation(); sc.scrollBy({ left: step(), behavior: 'smooth' }); });
    sc.addEventListener('scroll', sync, { passive: true });
    requestAnimationFrame(sync);
  });
}

export function bindEmptyCtas(root, openCreatePlaylist) {
  $$('.empty-cta', root).forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.act === 'newpl' && openCreatePlaylist) openCreatePlaylist();
      else if (b.dataset.act === 'reload') location.reload();
      else if (b.dataset.go) go(b.dataset.go);
    });
  });
}

export let onOpenSongMenu = () => {};
export let onOpenAddToPlaylist = () => {};
export let onDownloadSong = () => {};

export function setViewActionHooks(hooks) {
  if (hooks.openSongMenu) onOpenSongMenu = hooks.openSongMenu;
  if (hooks.openAddToPlaylist) onOpenAddToPlaylist = hooks.openAddToPlaylist;
  if (hooks.downloadSong) onDownloadSong = hooks.downloadSong;
}

export function bindItems(root) {
  $$('.card, .quick-card, .sr-top', root).forEach((el) => {
    el.addEventListener('click', () => {
      try { openItem(JSON.parse(el.dataset.item)); } catch {}
    });
  });
  $$('.track', root).forEach((el) => {
    let it;
    try { it = JSON.parse(el.dataset.item); } catch { return; }
    el.addEventListener('click', (e) => {
      if (e.target.closest('.tbtn')) return;
      if (it.browseId && (it.type === 'album' || it.type === 'playlist' || it.type === 'artist')) openItem(it);
      else if (it.videoId) openSongNowPlaying(songFromItem(it));
      else openItem(it);
    });
    const favBtn = $('.btn-fav', el);
    if (favBtn) favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      Library.toggleFav(songFromItem(it), () => {
        favBtn.innerHTML = icon(Library.isFav(it.videoId) ? 'i-heart-f' : 'i-heart-o');
        updateLikeButtons();
      });
    });
    const addBtn = $('.btn-addpl', el);
    if (addBtn) addBtn.addEventListener('click', (e) => { e.stopPropagation(); onOpenAddToPlaylist(songFromItem(it)); });
    const qBtn = $('.btn-queue', el);
    if (qBtn) qBtn.addEventListener('click', (e) => { e.stopPropagation(); queueSong(songFromItem(it)); });
    const dlBtn = $('.btn-dl', el);
    if (dlBtn) dlBtn.addEventListener('click', (e) => { e.stopPropagation(); onDownloadSong(songFromItem(it)); });
    const moreBtn = $('.btn-more', el);
    if (moreBtn) moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onOpenSongMenu(songFromItem(it), {
        plId: it.plId || el.dataset.pl,
        plIndex: it.plIndex != null ? it.plIndex : (el.dataset.pi !== undefined && el.dataset.pi !== '' ? Number(el.dataset.pi) : undefined),
      });
    });
  });
  bindCarousels(root);
}

export function openItem(it) {
  if (!it) return;
  const kind = it.browseType || it.type;
  const isPage = it.browseId && (kind === 'album' || kind === 'playlist' || kind === 'artist' || kind === 'browse');
  if (isPage) {
    closeNowPlaying(renderNowPlaying, renderPlayButtons, updateLikeButtons);
    if (kind === 'artist') return go(`#/artist/${it.browseId}`);
    if (kind === 'album') return go(`#/album/${it.browseId}`);
    return go(`#/playlist/${it.browseId}${it.params ? '?params=' + encodeURIComponent(it.params) : ''}`);
  }
  if (it.watchPlaylist && it.playlistId) {
    closeNowPlaying(renderNowPlaying, renderPlayButtons, updateLikeButtons);
    return go(`#/playlist/${String(it.playlistId).startsWith('VL') ? it.playlistId : 'VL' + it.playlistId}`);
  }
  if (it.videoId) return openSongNowPlaying(songFromItem(it));
  if (it.playlistId) {
    closeNowPlaying(renderNowPlaying, renderPlayButtons, updateLikeButtons);
    return go(`#/playlist/${String(it.playlistId).startsWith('VL') ? it.playlistId : 'VL' + it.playlistId}`);
  }
}

export function previewSong(song) {
  if (!song || !song.videoId) return;
  Player.pending = song;
  renderNowPlaying();
  updateLikeButtons();
  renderPlayButtons();
  const range = $('#np-range'); if (range) range.value = 0;
  const nc = $('#np-cur'); if (nc) nc.textContent = '0:00';
  const nd = $('#np-dur'); if (nd) nd.textContent = song.duration || '0:00';
  const lp = $('#np-lyric-preview'); if (lp) lp.textContent = '';
}

export function openSongNowPlaying(song) {
  if (!song || !song.videoId) return;
  const same = Player.current && Player.current.videoId === song.videoId;
  if (!Player.current) {
    playSong(song);
  } else if (!same) {
    previewSong(song);
  } else {
    Player.pending = null;
    renderNowPlaying();
    updateLikeButtons();
    renderPlayButtons();
  }
  openNowPlaying();
  switchNPTab('player');
}

export function switchNPTab(name) {
  $$('.np-tab').forEach((t) => {
    const isActive = t.dataset.nptab === name;
    t.classList.toggle('active', isActive);
    if (isActive) {
      try {
        t.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      } catch (_) {}
    }
  });
  $$('.np-pane').forEach((p) => p.classList.toggle('active', p.id === 'np-' + name));
  if (name === 'related') loadRelated();
  if (name === 'queue') renderQueue();
  if (name === 'eq') renderEqualizerUI();
}

export async function loadRelated(force = false) {
  const el = $('#related-list');
  if (!el) return;
  const song = Player.current;
  if (!song) { el.innerHTML = '<div class="loading-note">Putar lagu terlebih dahulu</div>'; return; }
  if (Player._relatedLoaded && !force) return;
  Player._relatedLoaded = true;
  el.innerHTML = '<div class="loading-note">Memuat…</div>';

  const vid = song.videoId;
  const sameSong = () => Player.current && Player.current.videoId === vid;

  for (let i = 0; i < 16 && !Player.relatedBrowseId && sameSong(); i++) {
    await new Promise((r) => setTimeout(r, 300));
    if (!Player._queueFetching && i >= 3 && !Player.relatedBrowseId) break;
  }
  if (!sameSong()) { Player._relatedLoaded = false; return; }

  if (Player.relatedBrowseId) {
    try {
      const d = await api(`/api/related?browseId=${encodeURIComponent(Player.relatedBrowseId)}`);
      if (d.sections && d.sections.length && sameSong()) {
        el.innerHTML = d.sections.map((sec) => {
          const items = sec.items || [];
          if (!items.length) return '';
          const allSongs = items.every((i) => i.videoId);
          if (allSongs) {
            return `<div class="shelf"><div class="shelf-title">${esc(sec.title || 'Lagu')}</div>
              <div class="track-list">${items.slice(0, 16).map((i) => trackRowHTML(i)).join('')}</div></div>`;
          }
          return `<div class="shelf"><div class="shelf-title">${esc(sec.title || 'Lainnya')}</div>${carouselHTML(items.map(cardHTML).join(''))}</div>`;
        }).join('');
        bindItems(el);
        return;
      }
    } catch {}
  }
  if (!sameSong()) { Player._relatedLoaded = false; return; }

  try {
    const d = await api(`/api/next?videoId=${encodeURIComponent(vid)}`);
    if (!sameSong()) { Player._relatedLoaded = false; return; }
    const items = (d.queue || [])
      .filter((q) => q.videoId && q.videoId !== vid)
      .slice(0, 20)
      .map((q) => ({ type: 'song', videoId: q.videoId, title: q.title, subtitle: q.artist, thumbnail: q.thumbnail }));
    if (items.length) {
      el.innerHTML = shelfHTML({ title: 'Lagu serupa', items, list: true });
      bindItems(el);
      return;
    }
  } catch {}

  if (sameSong()) {
    Player._relatedLoaded = false;
    el.innerHTML = `<div class="loading-note">Tidak dapat memuat konten terkait<br><br>
      <button class="pill-btn" id="related-retry">${icon('i-repeat')}<span>Coba lagi</span></button></div>`;
    $('#related-retry', el)?.addEventListener('click', () => loadRelated(true));
  }
}
