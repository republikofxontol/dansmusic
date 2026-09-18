/* DANSMUSIC — TAMPILAN HALAMAN DAN NAVIGASI */

import {
  $, $$, esc, icon, api, fmtTime, toast, applyTint, store, Library,
  Player, COVER_PH, safeCover, openNowPlaying, closeNowPlaying
} from './state.js';
import {
  displayTitle, songFromItem, playSong, queueSong, renderNowPlaying,
  updateLikeButtons, renderPlayButtons
} from './player.js';
import {
  go, coverHTML, cardHTML, trackRowHTML, trackHeadHTML, quickCardHTML,
  carouselHTML, emptyHTML, likedCardHTML, shelfHTML, bindItems,
  bindCarousels, bindEmptyCtas, MOOD_COLORS, openItem,
  onOpenAddToPlaylist, onDownloadSong, onOpenSongMenu
} from './views.js';

export const skeletonHTML = `<div class="page-title">&nbsp;</div>` + Array(3).fill(`
  <div class="shelf"><div class="skeleton" style="width:180px;height:22px;margin-bottom:12px"></div>
  <div class="carousel">${Array(6).fill('<div><div class="skeleton" style="width:160px;height:160px"></div></div>').join('')}</div></div>`).join('');

export function moodCardHTML(c, i) {
  const raw = String(c.color || '').trim();
  const color = /^#?[0-9a-fA-F]{3,8}$/.test(raw) ? (raw[0] === '#' ? raw : '#' + raw) : MOOD_COLORS[i % MOOD_COLORS.length];
  return `<button type="button" class="mood-card" style="--mc:${esc(color)}" data-b="${esc(c.browseId)}" data-p="${esc(c.params || '')}">${esc(c.title)}</button>`;
}

export function bindMoods(root) {
  $$('.mood-card', root).forEach((el) => el.addEventListener('click', () => {
    go(`#/browse/${el.dataset.b}${el.dataset.p ? '?params=' + encodeURIComponent(el.dataset.p) : ''}`);
  }));
}

export async function viewHome(view) {
  view.innerHTML = skeletonHTML;
  const now = new Date();
  const h = now.getHours();
  const greet = h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam';
  applyTint(greet);
  const d = await api('/api/home');
  const recent20 = Library.getRecent(20);
  const favs = Library.favorites.slice(0, 12);
  const pls = Library.playlists.filter((p) => p.tracks && p.tracks.length);
  const saved = Library.saved.slice(0, 12);
  const dateLine = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

  let html = `<div class="hello-row"><div><div class="greeting">${esc(dateLine)}</div><h1 class="page-title">${greet}</h1></div></div>`;
  if (recent20.length) {
    html += `
      <div class="shelf" style="margin-bottom:20px">
        <div class="recent-shelf-header">
          <div class="shelf-title" style="margin-bottom:0">Terakhir Diputar (${recent20.length} lagu)</div>
          <button type="button" class="recent-playall-btn" id="home-play-recent">${icon('i-play')}<span>Putar Ulang Semua</span></button>
        </div>
        <div class="quick-grid">${recent20.slice(0, 8).map((s) => quickCardHTML({ ...s, type: 'song', subtitle: s.artist })).join('')}</div>
        ${recent20.length > 8 ? `<div style="margin-top:10px">${carouselHTML(recent20.slice(8).map((s) => cardHTML({ ...s, type: 'song', subtitle: s.artist })).join(''))}</div>` : ''}
      </div>`;
  }
  html += `<div id="mix-slot"></div>`;
  if (favs.length) {
    html += `<div class="shelf"><div class="shelf-title">Lagu favorit</div>
      ${carouselHTML(favs.map((s) => cardHTML({ ...s, type: 'song', subtitle: s.artist })).join(''))}</div>`;
  }
  if (pls.length) {
    html += `<div class="shelf"><div class="shelf-title">Playlist kamu</div>
      ${carouselHTML(pls.map((p) => `<div class="card" data-pl="${esc(p.id)}">
        <div class="art">${coverHTML(p.tracks[0] && p.tracks[0].thumbnail)}<div class="play-ov">${icon('i-play')}</div></div>
        <div class="t">${esc(p.name)}</div><div class="s">${p.tracks.length} lagu</div>
      </div>`).join(''))}</div>`;
  }
  if (saved.length) {
    html += `<div class="shelf"><div class="shelf-title">Tersimpan</div>
      ${carouselHTML(saved.map(cardHTML).join(''))}</div>`;
  }
  html += (d.sections || []).map(shelfHTML).join('');
  view.innerHTML = html;
  bindItems(view);
  $('#home-play-recent')?.addEventListener('click', () => {
    if (recent20.length) playSong(recent20[0], recent20, 0);
  });
  $$('[data-pl]', view).forEach((el) => el.addEventListener('click', () => go(`#/localpl/${el.dataset.pl}`)));
  loadMixForYou();
}

export async function loadMixForYou() {
  const hist = Library.history;
  const seeds = [...Library.favorites, ...hist].filter((s) => s.videoId);
  if (!seeds.length) return;
  const slot = $('#mix-slot');
  if (!slot) return;
  try {
    const seed = seeds[Math.floor(Math.random() * Math.min(5, seeds.length))];
    const d = await api(`/api/next?videoId=${encodeURIComponent(seed.videoId)}`);
    const items = (d.queue || []).slice(1, 13).map((q) => ({
      type: 'song', videoId: q.videoId, title: q.title, subtitle: q.artist, thumbnail: q.thumbnail,
    }));
    if (!items.length) return;
    slot.innerHTML = shelfHTML({ title: `Mix untuk kamu · berdasarkan “${seed.title}”`, items });
    bindItems(slot);
  } catch {}
}

export function pushRecentSearch(q) {
  q = String(q || '').trim();
  if (!q) return;
  const list = [q, ...store.get('srec', []).filter((x) => String(x).toLowerCase() !== q.toLowerCase())].slice(0, 8);
  store.set('srec', list);
}

export function removeRecentSearch(q) {
  store.set('srec', store.get('srec', []).filter((x) => x !== q));
}

export async function viewSearch(view, q = '', filter = null) {
  const filters = ['all', 'songs', 'videos', 'albums', 'artists', 'playlists'];
  const hist = !q ? Library.history.slice(0, 6) : [];
  const rec = store.get('srec', []).filter(Boolean).slice(0, 8);
  const recentHTML = rec.length ? `<div class="shelf-title recent-head"><span>Pencarian terakhir</span>
    <button type="button" class="q-clear" id="srec-clear">Hapus</button></div>
    <div class="recent-row">${rec.map((qq) => `<span class="recent-chip">
      <button type="button" class="recent-go" data-q="${esc(qq)}">${icon('i-clock')}<span>${esc(qq)}</span></button>
      <button type="button" class="recent-x" data-rm="${esc(qq)}" title="Hapus">${icon('i-x')}</button>
    </span>`).join('')}</div>` : '';

  view.innerHTML = `
    ${q ? '' : '<div class="page-title">Cari</div>'}
    <div class="search-bar${q ? ' has-q' : ''}">${icon('i-search', 'ic search-ic')}<input id="search-input" placeholder="Lagu, artis, atau album apa yang ingin kamu dengar?" value="${esc(q)}" autocomplete="off" spellcheck="false"><button type="button" class="search-clear" id="search-clear" title="Clear">${icon('i-x')}</button></div>
    <div class="suggest" id="suggest"></div>
    ${q ? `<div class="search-chips">${filters.map((f) => `<button type="button" class="chip ${((filter || 'all') === f) ? 'active' : ''}" data-f="${f}">${f[0].toUpperCase() + f.slice(1)}</button>`).join('')}</div>` : recentHTML}
    <div id="search-results">${q
      ? '<div class="loading-note">Mencari…</div>'
      : `${hist.length ? `<div class="shelf"><div class="shelf-title">Baru diputar</div><div class="track-list">${hist.map((s) => trackRowHTML({ ...s, subtitle: s.artist })).join('')}</div></div>` : ''}<div id="browse-all"><div class="shelf-title">Jelajahi semua</div><div class="mood-grid" id="browse-grid"><div class="loading-note">Memuat kategori…</div></div></div>`}</div>`;

  const input = $('#search-input');
  const clearBtn = $('#search-clear');
  if (clearBtn) clearBtn.addEventListener('click', () => go('#/search'));

  let sugT;
  if (input) {
    input.addEventListener('input', () => {
      clearTimeout(sugT);
      const v = input.value.trim();
      if (!v) { $('#suggest').innerHTML = ''; return; }
      sugT = setTimeout(async () => {
        try {
          const d = await api(`/api/suggest?q=${encodeURIComponent(v)}`);
          $('#suggest').innerHTML = (d.suggestions || []).slice(0, 6).map((s) => `<button type="button">${icon('i-search')}<span>${esc(s)}</span></button>`).join('');
          $$('#suggest button').forEach((b) => b.addEventListener('click', () => {
            const term = b.querySelector('span')?.textContent || b.textContent;
            pushRecentSearch(term);
            go(`#/search/${encodeURIComponent(term)}`);
          }));
        } catch {}
      }, 220);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        pushRecentSearch(input.value.trim());
        go(`#/search/${encodeURIComponent(input.value.trim())}${filter && filter !== 'all' ? '?filter=' + filter : ''}`);
      }
    });
  }

  $$('.search-chips .chip', view).forEach((c) => c.addEventListener('click', () => {
    const f = c.dataset.f;
    const term = input?.value.trim() || q;
    if (!term) return;
    go(`#/search/${encodeURIComponent(term)}${f !== 'all' ? '?filter=' + f : ''}`);
  }));

  $$('.recent-go', view).forEach((b) => b.addEventListener('click', () => go(`#/search/${encodeURIComponent(b.dataset.q)}`)));
  $$('.recent-x', view).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    removeRecentSearch(b.dataset.rm);
    b.closest('.recent-chip')?.remove();
  }));
  $('#srec-clear')?.addEventListener('click', () => { store.set('srec', []); viewSearch(view, '', filter); });

  if (!q) {
    bindItems($('#search-results'));
    try {
      const d = await api('/api/moods');
      const grid = $('#browse-grid');
      if (grid) {
        grid.innerHTML = (d.categories || []).map(moodCardHTML).join('');
        bindMoods(grid);
      }
    } catch {
      const grid = $('#browse-grid');
      if (grid) grid.innerHTML = emptyHTML('Gagal memuat kategori', 'Periksa koneksi internet kamu.', { label: 'Coba lagi', go: '#/search', ic: 'i-search' });
    }
    return;
  }

  try {
    const d = await api(`/api/search?q=${encodeURIComponent(q)}${filter && filter !== 'all' ? '&filter=' + filter : ''}`);
    pushRecentSearch(q);
    $('#suggest').innerHTML = '';
    const res = $('#search-results');
    const secs = d.sections || [];
    if (!secs.length) {
      res.innerHTML = emptyHTML('Hasil tidak ditemukan', 'Coba kata kunci atau nama artis lain.', { ic: 'i-search' });
      return;
    }
    res.innerHTML = secs.map((s) => shelfHTML(s)).join('');
    bindItems(res);
  } catch (e) {
    $('#search-results').innerHTML = emptyHTML('Pencarian gagal', esc(e.message), { label: 'Coba lagi', go: `#/search/${encodeURIComponent(q)}`, ic: 'i-search' });
  }
}

export async function viewCharts(view) {
  view.innerHTML = skeletonHTML;
  const d = await api('/api/charts');
  const dateLine = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });
  const secs = d.sections || [];
  let body = '';
  secs.forEach((sec, i) => {
    const items = sec.items || [];
    if (i === 0 && items.length && items.length <= 6) {
      body += `<div class="shelf"><div class="shelf-title">${esc(sec.title)}</div><div class="chart-grid">${items.map(cardHTML).join('')}</div></div>`;
    } else {
      body += shelfHTML(sec);
    }
  });
  view.innerHTML = `<div class="hello-row"><div><div class="greeting">${esc(dateLine)}</div><h1 class="page-title">Tangga Lagu Populer</h1></div></div>`
    + (body || emptyHTML('Tidak ada tangga lagu saat ini', 'Coba lagi sebentar lagi.', { label: 'Muat ulang', go: '#/charts', ic: 'i-chart' }));
  bindItems(view);
}

export async function viewMoods(view) {
  view.innerHTML = `<div class="page-title">Kategori & Suasana</div><div class="loading-note">Memuat…</div>`;
  const d = await api('/api/moods');
  view.innerHTML = `<div class="page-title">Kategori & Suasana</div>
    <div class="mood-grid">${(d.categories || []).map(moodCardHTML).join('')}</div>`;
  bindMoods(view);
}

export function viewStats(view) {
  const st = Library.stats;
  const rows = Object.entries(st).map(([videoId, v]) => ({ videoId, ...v }));
  const totalPlays = rows.reduce((a, r) => a + r.plays, 0);
  const totalMin = Math.round(rows.reduce((a, r) => a + r.secs, 0) / 60);
  const byArtist = {};
  rows.forEach((r) => {
    const a = (r.artist || 'Unknown').split(',')[0].trim() || 'Unknown';
    byArtist[a] = (byArtist[a] || 0) + r.plays;
  });
  const topArtists = Object.entries(byArtist).sort((x, y) => y[1] - x[1]).slice(0, 10);
  const topSongs = [...rows].sort((x, y) => y.plays - x.plays).slice(0, 20);
  const maxA = topArtists[0] ? topArtists[0][1] : 1;

  view.innerHTML = `<div class="hello-row"><div>
      <div class="greeting">Tersimpan di perangkat ini</div>
      <h1 class="page-title">Statistik Mendengarkan</h1>
    </div></div>
    <div class="stats-cards">
      <div class="stat-card"><div class="stat-num">${totalPlays}</div><div class="stat-lbl">Total pemutaran</div></div>
      <div class="stat-card"><div class="stat-num">${totalMin}</div><div class="stat-lbl">Menit didengarkan</div></div>
      <div class="stat-card"><div class="stat-num">${rows.length}</div><div class="stat-lbl">Lagu berbeda</div></div>
      <div class="stat-card"><div class="stat-num">${Object.keys(byArtist).length}</div><div class="stat-lbl">Artis</div></div>
    </div>
    ${topArtists.length ? `<div class="shelf"><div class="shelf-title">Artis teratas</div>
      ${topArtists.map(([a, n], i) => `<div class="stat-bar-row"><span class="sb-rank">${i + 1}</span><span class="sb-name">${esc(a)}</span><div class="sb-bar"><div style="width:${(n / maxA) * 100}%"></div></div><span class="sb-n">${n}</span></div>`).join('')}</div>` : ''}
    ${topSongs.length ? `<div class="shelf"><div class="shelf-title">Paling sering diputar</div>${trackHeadHTML({ n: '#', t: 'Judul & Artis', d: 'Diputar' })}<div class="track-list">
      ${topSongs.map((r, i) => trackRowHTML({ videoId: r.videoId, title: r.title, subtitle: `${r.artist} · ${Math.round(r.secs / 60)} mnt total`, duration: `${r.plays}×`, thumbnail: r.thumbnail, tn: i + 1 })).join('')}</div></div>` : ''}
    ${!rows.length ? emptyHTML('Belum ada statistik', 'Dengarkan lagu favoritmu untuk membangun data statistik.', { label: 'Jelajahi beranda', go: '#/home', ic: 'i-chart' }) : ''}`;
  bindItems(view);
}

export function viewLibrary(view, tab, modalCallbacks) {
  const tabs = [['playlists', 'Playlist'], ['favorites', 'Favorit'], ['recently', 'Terakhir Diputar'], ['saved', 'Tersimpan'], ['history', 'Riwayat'], ['stats', 'Statistik']];
  if (tab === 'stats') { go('#/stats'); return; }
  let body = '';
  if (tab === 'favorites') {
    const f = Library.favorites;
    body = f.length
      ? `<div class="detail-actions" style="margin-bottom:16px"><button class="pill-btn primary" id="fav-play">${icon('i-play')}<span>Putar</span></button><button class="pill-btn" id="fav-shuffle">${icon('i-shuffle')}<span>Acak</span></button></div>
         ${trackHeadHTML()}<div class="track-list">${f.map((s, i) => trackRowHTML({ ...s, subtitle: s.artist, tn: i + 1 })).join('')}</div>`
      : emptyHTML('Belum ada lagu favorit', 'Tekan ikon hati pada lagu untuk menyimpannya di sini.', { label: 'Cari lagu', go: '#/search', ic: 'i-heart-o' });
  } else if (tab === 'recently') {
    const r20 = Library.getRecent(20);
    body = r20.length
      ? `<div class="detail-actions" style="margin-bottom:16px"><button class="pill-btn primary" id="recent-play">${icon('i-play')}<span>Putar 20 Lagu</span></button><button class="pill-btn" id="recent-shuffle">${icon('i-shuffle')}<span>Acak</span></button></div>
         ${trackHeadHTML()}<div class="track-list">${r20.map((s, i) => trackRowHTML({ ...s, subtitle: s.artist, tn: i + 1 })).join('')}</div>`
      : emptyHTML('Belum ada riwayat terakhir diputar', 'Dengarkan lagu untuk mencatat 20 lagu yang baru saja selesai didengarkan.', { label: 'Ke beranda', go: '#/home', ic: 'i-clock' });
  } else if (tab === 'history') {
    const h = Library.history;
    body = h.length
      ? `<div class="detail-actions" style="margin-bottom:16px"><button class="pill-btn primary" id="hist-play">${icon('i-play')}<span>Putar</span></button><button class="pill-btn" id="hist-shuffle">${icon('i-shuffle')}<span>Acak</span></button></div>
         ${trackHeadHTML()}<div class="track-list">${h.map((s, i) => trackRowHTML({ ...s, subtitle: s.artist, tn: i + 1 })).join('')}</div>`
      : emptyHTML('Belum ada lagu yang diputar', 'Lagu yang kamu dengarkan akan muncul di sini.', { label: 'Ke beranda', go: '#/home', ic: 'i-clock' });
  } else if (tab === 'saved') {
    const sv = Library.saved;
    body = sv.length
      ? `<div class="lib-grid">${sv.map(cardHTML).join('')}</div>`
      : emptyHTML('Belum ada koleksi tersimpan', 'Buka album, playlist, atau artis lalu tekan Simpan.', { label: 'Jelajahi suasana', go: '#/moods', ic: 'i-save' });
  } else {
    const pls = Library.playlists;
    body = `<div class="detail-actions" style="margin-bottom:18px">
        <button class="pill-btn primary" id="btn-newpl">${icon('i-plus')}<span>Playlist baru</span></button>
        <button class="pill-btn" id="btn-import">${icon('i-download')}<span>Impor YouTube</span></button>
        <button class="pill-btn" id="btn-backup">${icon('i-download')}<span>Cadangkan</span></button>
        <button class="pill-btn" id="btn-restore">${icon('i-upload')}<span>Pulihkan</span></button>
      </div>`;
    const cards = (Library.favorites.length ? likedCardHTML() : '') + pls.map((p) => {
      const f = p.tracks[0];
      const thumb = f ? (f.hdThumbnail || f.thumbnail || (f.videoId ? `https://i.ytimg.com/vi/${f.videoId}/hqdefault.jpg` : '')) : '';
      return `<div class="card" data-pl="${p.id}"><div class="art">${coverHTML(thumb, '', f && f.videoId)}<div class="play-ov">${icon('i-play')}</div></div><div class="t">${esc(p.name)}</div><div class="s">${p.tracks.length} lagu</div></div>`;
    }).join('');
    body += cards
      ? `<div class="lib-grid">${cards}</div>`
      : emptyHTML('Belum ada playlist', 'Buat playlist baru atau impor dari tautan YouTube Music.', { ic: 'i-note' });
  }

  view.innerHTML = `<div class="page-title">Koleksi musik</div>
    <div class="chip-row">${tabs.map(([id, l]) => `<button class="chip ${tab === id ? 'active' : ''}" onclick="location.hash='#/library/${id}'">${l}</button>`).join('')}</div>${body}`;
  bindItems(view);

  $('#btn-newpl')?.addEventListener('click', modalCallbacks?.openCreatePlaylist);
  $('#btn-import')?.addEventListener('click', modalCallbacks?.openImportForm);
  $('#btn-backup')?.addEventListener('click', modalCallbacks?.openBackupForm);
  $('#btn-restore')?.addEventListener('click', modalCallbacks?.openRestoreForm);

  $('#fav-play')?.addEventListener('click', () => { const q = [...Library.favorites]; if (q.length) playSong(q[0], q, 0); });
  $('#fav-shuffle')?.addEventListener('click', () => { const q = [...Library.favorites].sort(() => Math.random() - 0.5); if (q.length) playSong(q[0], q, 0); });
  $('#recent-play')?.addEventListener('click', () => { const q = Library.getRecent(20); if (q.length) playSong(q[0], q, 0); });
  $('#recent-shuffle')?.addEventListener('click', () => { const q = [...Library.getRecent(20)].sort(() => Math.random() - 0.5); if (q.length) playSong(q[0], q, 0); });
  $('#hist-play')?.addEventListener('click', () => { const q = [...Library.history]; if (q.length) playSong(q[0], q, 0); });
  $('#hist-shuffle')?.addEventListener('click', () => { const q = [...Library.history].sort(() => Math.random() - 0.5); if (q.length) playSong(q[0], q, 0); });
  $$('[data-pl]', view).forEach((el) => el.addEventListener('click', () => go(`#/localpl/${el.dataset.pl}`)));
  $$('[data-nav]', view).forEach((el) => el.addEventListener('click', () => go(el.dataset.nav)));
}

export function viewLocalPlaylist(view, pid, modalCallbacks) {
  const pl = Library.playlists.find((p) => p.id === pid);
  if (!pl) {
    view.innerHTML = emptyHTML('Playlist tidak ditemukan', 'Mungkin telah dihapus.', { label: 'Kembali ke koleksi', go: '#/library', ic: 'i-library' });
    bindEmptyCtas(view);
    return;
  }
  const rows = pl.tracks.map((s, i) => {
    const up = i === 0 ? ' disabled' : '';
    const dn = i === pl.tracks.length - 1 ? ' disabled' : '';
    return trackRowHTML({ ...s, subtitle: s.artist, plId: pid, plIndex: i, tn: i + 1 }, false,
      `<button class="tbtn btn-qup" data-i="${i}" title="Pindah ke atas"${up}>${icon('i-chev-up')}</button>` +
      `<button class="tbtn btn-qdn" data-i="${i}" title="Pindah ke bawah"${dn}>${icon('i-chev-down')}</button>` +
      `<button class="tbtn btn-rm" data-vid="${esc(s.videoId)}" title="Hapus">${icon('i-x')}</button>`);
  }).join('');

  const firstTrack = pl.tracks[0];
  const thumb = firstTrack ? (firstTrack.hdThumbnail || firstTrack.thumbnail || (firstTrack.videoId ? `https://i.ytimg.com/vi/${firstTrack.videoId}/hqdefault.jpg` : '')) : '';
  const cover = thumb
    ? `<img src="${esc(thumb)}" alt="" onerror="this.onerror=null;this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';"><div class="detail-ph" style="display:none">${icon('i-note')}</div>`
    : `<div class="detail-ph">${icon('i-note')}</div>`;

  view.innerHTML = `
    <div class="detail-head">
      ${cover}
      <div class="detail-info"><div class="detail-kicker">Playlist lokal</div><h1>${esc(pl.name)}</h1><div class="sub">${pl.tracks.length} lagu</div>
      <div class="detail-actions">
        <button class="pill-btn primary" id="pl-play">${icon('i-play')}<span>Putar</span></button>
        <button class="pill-btn" id="pl-shuffle">${icon('i-shuffle')}<span>Acak</span></button>
        <button class="pill-btn" id="pl-rename">${icon('i-note')}<span>Ubah nama</span></button>
        <button class="pill-btn" id="pl-del">${icon('i-trash')}<span>Hapus</span></button>
      </div></div></div>
    ${rows ? trackHeadHTML() + `<div class="track-list">${rows}</div>` : emptyHTML('Playlist ini masih kosong', 'Cari lagu lalu tekan Tambah ke playlist.', { label: 'Cari lagu', go: '#/search', ic: 'i-note' })}`;
  bindItems(view);

  $$('.btn-rm', view).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    Library.removeFromPlaylist(pid, b.dataset.vid);
    viewLocalPlaylist(view, pid, modalCallbacks);
  }));
  $$('.btn-qup', view).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (Library.moveInPlaylist(pid, Number(b.dataset.i), -1)) viewLocalPlaylist(view, pid, modalCallbacks);
  }));
  $$('.btn-qdn', view).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (Library.moveInPlaylist(pid, Number(b.dataset.i), 1)) viewLocalPlaylist(view, pid, modalCallbacks);
  }));

  $('#pl-play')?.addEventListener('click', () => pl.tracks.length && playSong(pl.tracks[0], [...pl.tracks], 0));
  $('#pl-shuffle')?.addEventListener('click', () => {
    if (!pl.tracks.length) return;
    const q = [...pl.tracks].sort(() => Math.random() - 0.5);
    playSong(q[0], q, 0);
  });
  $('#pl-rename')?.addEventListener('click', () => modalCallbacks?.openRenamePlaylist(pid));
  $('#pl-del')?.addEventListener('click', () => modalCallbacks?.openDeletePlaylist(pid));
}

export async function viewBrowse(view, id, kind, extraParams) {
  view.innerHTML = skeletonHTML;
  const d = await api(`/api/browse?id=${encodeURIComponent(id)}${extraParams ? '&params=' + encodeURIComponent(extraParams) : ''}`);
  applyTint(id || kind);
  const h = d.header || { title: '', subtitle: '' };
  const kick = kind === 'artist' ? 'Artis' : kind === 'album' ? 'Album' : kind === 'playlist' ? 'Playlist' : 'Koleksi';
  let html = '';
  const f = d.tracks && d.tracks[0];
  const headThumb = h.thumbnail || (f && (f.hdThumbnail || f.thumbnail || (f.videoId ? `https://i.ytimg.com/vi/${f.videoId}/hqdefault.jpg` : ''))) || '';
  const coverImg = headThumb
    ? `<img src="${esc(headThumb)}" alt="" onerror="this.onerror=null;this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='flex';"><div class="detail-ph" style="display:none">${icon('i-note')}</div>`
    : `<div class="detail-ph">${icon('i-note')}</div>`;

  if (h.title) {
    html += `
      <div class="detail-head ${kind === 'artist' ? 'artist' : ''}">
      ${coverImg}
      <div class="detail-info"><div class="detail-kicker">${kick}</div><h1>${esc(h.title)}</h1>
        <div class="sub">${esc([h.strapline, h.subtitle].filter(Boolean).join(' • '))}${h.description ? `<br><span style="font-size:12.5px">${esc(h.description.slice(0, 260))}${h.description.length > 260 ? '…' : ''}</span>` : ''}</div>
        <div class="detail-actions">
          ${d.tracks.length ? `<button class="pill-btn primary" id="br-play">${icon('i-play')}<span>Putar</span></button><button class="pill-btn" id="br-shuffle">${icon('i-shuffle')}<span>Acak</span></button>` : ''}
          <button class="pill-btn" id="br-save">${icon(Library.isSaved(id) ? 'i-save-f' : 'i-save')}<span>${Library.isSaved(id) ? 'Tersimpan' : 'Simpan'}</span></button>
        </div>
      </div></div>`;
  }
  if (d.tracks.length) {
    const headerArtist = (h.artists && h.artists[0] && h.artists[0].name) || h.strapline || '';
    const headerArtistId = (h.artists && h.artists[0] && h.artists[0].browseId) || '';
    html += `${trackHeadHTML()}<div class="track-list">${d.tracks.map((t, i) => {
      const fromArr = (t.artists || []).map((a) => a.name).filter(Boolean).join(', ');
      const artist = t.artist || fromArr || headerArtist;
      const thumb = t.thumbnail || h.thumbnail || (t.videoId ? `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg` : '');
      return trackRowHTML({
        ...t,
        tn: i + 1,
        artist,
        subtitle: artist || t.subtitle,
        artistBrowseId: t.artistBrowseId || (t.artists && t.artists[0] && t.artists[0].browseId) || headerArtistId,
        duration: String(t.duration || '').trim(),
        thumbnail: thumb,
      });
    }).join('')}</div>`;
  }
  html += (d.sections || []).map(shelfHTML).join('');
  view.innerHTML = html || emptyHTML('Tidak ada konten', 'Halaman ini belum memiliki lagu atau rilis terkait.', { label: 'Ke beranda', go: '#/home', ic: 'i-note' });
  bindItems(view);

  const toSongs = () => d.tracks.map((t) => ({ ...songFromItem(t), thumbnail: t.thumbnail || h.thumbnail }));
  $('#br-play')?.addEventListener('click', () => { const q = toSongs(); if (q.length) playSong(q[0], q, 0); });
  $('#br-shuffle')?.addEventListener('click', () => { const q = toSongs().sort(() => Math.random() - 0.5); if (q.length) playSong(q[0], q, 0); });
  $('#br-save')?.addEventListener('click', () => {
    Library.toggleSaved({
      type: kind === 'artist' ? 'artist' : kind === 'album' ? 'album' : 'playlist',
      browseType: kind, browseId: id,
      title: h.title, subtitle: h.subtitle || '', thumbnail: h.thumbnail,
    }, () => {
      const bsv = $('#br-save');
      if (bsv) bsv.innerHTML = icon(Library.isSaved(id) ? 'i-save-f' : 'i-save') + `<span>${Library.isSaved(id) ? 'Tersimpan' : 'Simpan'}</span>`;
    });
  });
}
