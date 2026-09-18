/* DANSMUSIC — APLIKASI UTAMA DAN ORKESTRASI PEMUTAR */

import {
  $, $$, esc, icon, api, fmtTime, toast, applyTint, store, Library,
  Player, COVER_PH, safeCover, openNowPlaying, closeNowPlaying,
  focusedSong, isPreviewing, currentTheme, updateThemeIcon, toggleTheme
} from './state.js';
import {
  displayTitle, songFromItem, playSong, queueSong, removeQueued,
  clearUserQueue, moveQueued, persistQueue, restoreQueue, nextTrack,
  prevTrack, togglePlay, toggleNowPlayingPlay, cycleSpeed, toggleSB,
  toggleQuality, updateQualityButton, syncNpMore, loadLyrics,
  maybeRetryLyrics, updateLyricHighlight, syncFloatWidget, syncFloatProgress,
  openFloatWidget, closeFloatWidget, toggleFloatWidget, setUiHooks,
  drawPipFrame, startSystemPip, updateMediaSessionState,
  syncMediaSessionMetadata, fadeOutAndPause, renderEqualizerUI,
  syncAudioStream, pauseAudioStream, resumeAudioStream, seekAudioStream, syncAudioTime, setAudioStreamVolume,
  getPlaybackCurrentTime, getPlaybackDuration, eqAudioEl, eqAnalyserNode
} from './player.js';
import {
  go, cardHTML, trackRowHTML, likedCardHTML, setViewActionHooks,
  switchNPTab, loadRelated
} from './views.js';
import {
  viewHome, viewSearch, viewCharts, viewMoods, viewStats,
  viewLibrary, viewLocalPlaylist, viewBrowse
} from './pages.js';

/* ================= INISIALISASI YOUTUBE IFRAME API ================= */
window.onYouTubeIframeAPIReady = () => {
  Player.yt = new YT.Player('yt-player', {
    height: '100%',
    width: '100%',
    playerVars: {
      autoplay: 1, controls: 0, disablekb: 1, fs: 0,
      modestbranding: 1, rel: 0, iv_load_policy: 3, playsinline: 1, origin: location.origin,
    },
    events: {
      onReady: () => {
        Player.ready = true;
        Player.yt.setVolume(Number($('#mini-volume')?.value || 100));
        try { Player.yt.setPlaybackRate(Player.speed); } catch {}
        if (!restoreQueue()) {
          // TIDAK MEMUAT AWAL HINGGA PENGGUNA BERINTERAKSI
        }
      },
      onStateChange: (e) => {
        if (e.data === YT.PlayerState.ENDED) {
          nextTrack(true);
        }
        if (e.data === YT.PlayerState.PLAYING) {
          Player.cued = false;
          maybeRetryLyrics();
          document.body.classList.add('playing');
          document.body.classList.remove('paused');
        } else if (e.data === YT.PlayerState.PAUSED) {
          document.body.classList.add('paused');
          document.body.classList.remove('playing');
        }
        renderPlayButtons();
        syncFloatWidget();
      },
      onError: (e) => {
        console.warn('YT error:', e.data);
        toast('Lagu tidak dapat diputar, beralih ke lagu berikutnya…');
        setTimeout(() => nextTrack(true), 1200);
      },
    },
  });
};

const ytScript = document.createElement('script');
ytScript.src = 'https://www.youtube.com/iframe_api';
document.head.appendChild(ytScript);

/* ================= PENGATURAN NAVIGASI DAN MENU ================= */
const NAV_ITEMS = [
  ['#/home', 'i-home', 'Beranda'],
  ['#/search', 'i-search', 'Cari'],
  ['#/charts', 'i-chart', 'Tangga lagu'],
  ['#/moods', 'i-radio', 'Kategori'],
  ['#/library', 'i-library', 'Koleksi'],
  ['#/stats', 'i-clock', 'Statistik'],
];

function setupNav() {
  const desktopNav = $('#nav-desktop');
  if (desktopNav) {
    desktopNav.innerHTML = NAV_ITEMS.map(([h, ic, l]) =>
      `<a href="${h}" class="nav-item" data-hash="${h}">${icon(ic)}<span>${l}</span></a>`
    ).join('');
  }
  const mobileNav = $('#nav-mobile');
  if (mobileNav) {
    mobileNav.innerHTML = NAV_ITEMS.slice(0, 5).map(([h, ic, l]) =>
      `<a href="${h}" class="nav-m-item" data-hash="${h}">
        <span class="nav-m-icon">${icon(ic)}</span>
        <span class="nav-m-label">${l}</span>
      </a>`
    ).join('');
  }
}

function updateNavActive(h) {
  const base = (h || '#/home').split('/')[1] || 'home';
  $$('.nav-item, .nav-m-item').forEach((a) => {
    const ab = (a.dataset.hash || '').split('/')[1];
    a.classList.toggle('active', ab === base);
  });
}

function renderSidebarLibrary() {
  const lib = $('#lib-list');
  if (!lib) return;
  const pls = Library.playlists;
  const favCount = Library.favorites.length;
  const currentHash = location.hash || '#/home';
  let html = '';

  // LAGU FAVORIT ROW DI SIDEBAR KOLEKSI
  const firstFav = Library.favorites[0];
  const favThumb = firstFav ? (firstFav.hdThumbnail || firstFav.thumbnail || (firstFav.videoId ? `https://i.ytimg.com/vi/${firstFav.videoId}/hqdefault.jpg` : '')) : '';
  const isFavActive = currentHash === '#/library/favorites';

  html += `<a href="#/library/favorites" class="side-lib-item${isFavActive ? ' active' : ''}" data-hash="#/library/favorites">
    <div class="side-fav-icon">${favThumb ? `<img src="${esc(favThumb)}" alt="" onerror="this.style.display='none';">` : ''}<div class="side-fav-badge">${icon('i-heart-f')}</div></div>
    <div class="side-lib-meta"><div class="side-lib-title">Lagu Favorit</div><div class="side-lib-sub">${favCount} lagu</div></div>
  </a>`;

  // DAFTAR PLAYLIST LOKAL DI SIDEBAR KOLEKSI
  html += pls.map((p) => {
    const isPlActive = currentHash === `#/localpl/${p.id}`;
    const firstTrk = p.tracks[0];
    const plThumb = firstTrk ? (firstTrk.hdThumbnail || firstTrk.thumbnail || (firstTrk.videoId ? `https://i.ytimg.com/vi/${firstTrk.videoId}/hqdefault.jpg` : '')) : '';
    return `<a href="#/localpl/${p.id}" class="side-lib-item${isPlActive ? ' active' : ''}" data-hash="#/localpl/${p.id}">
      <div class="side-pl-art">${plThumb ? `<img src="${esc(plThumb)}" alt="" onerror="this.onerror=null;this.style.display='none';this.parentElement.innerHTML='<svg class=\\'ic\\'><use href=\\'#i-note\\'/></svg>';">` : icon('i-note')}</div>
      <div class="side-lib-meta"><div class="side-lib-title">${esc(p.name)}</div><div class="side-lib-sub">${p.tracks.length} lagu</div></div>
    </a>`;
  }).join('');

  lib.innerHTML = html;
}

/* ================= RENDER TAMPILAN PEMUTAR MUSIK ================= */
function renderPlayButtons() {
  const isAudioPlaying = eqAudioEl && !eqAudioEl.paused && !eqAudioEl.ended;
  const isBodyPlaying = document.body.classList.contains('playing') && !document.body.classList.contains('paused');
  
  const playing = isAudioPlaying || isBodyPlaying;
  const preview = isPreviewing();
  const showPause = playing && !preview;
  const ic = icon(showPause ? 'i-pause' : 'i-play');
  const miniPlay = $('#mini-play'); if (miniPlay) miniPlay.innerHTML = ic;
  const npPlay = $('#np-play'); if (npPlay) npPlay.innerHTML = ic;
  const fwPlay = document.querySelector('[data-fw="play"]'); if (fwPlay) fwPlay.innerHTML = ic;

  document.body.classList.toggle('playing', !!showPause);
  document.body.classList.toggle('paused', !showPause);
  updateMediaSessionState(showPause ? 'playing' : 'paused');

  const playNextBtn = $('#np-playnext');
  if (playNextBtn) playNextBtn.classList.toggle('hidden', !preview);
  const queueAddBtn = $('#np-queueadd');
  if (queueAddBtn) queueAddBtn.classList.toggle('hidden', !preview);
}

function updateLikeButtons() {
  const s = focusedSong();
  const isFav = s && Library.isFav(s.videoId);
  const ic = icon(isFav ? 'i-heart-f' : 'i-heart-o');
  const miniLike = $('#mini-like'); if (miniLike) miniLike.innerHTML = ic;
  const npLike = $('#np-like');
  if (npLike) {
    npLike.innerHTML = `${ic}<span>${isFav ? 'Favorit' : 'Sukai'}</span>`;
    npLike.classList.toggle('active', !!isFav);
  }
}

function renderNowPlaying() {
  const s = focusedSong();
  const isCur = !isPreviewing();
  const miniArt = $('#mini-art');
  const miniTitle = $('#mini-title');
  const miniArtist = $('#mini-artist');
  const npArt = $('#np-art');
  const npTitle = $('#np-title');
  const npArtist = $('#np-artist');
  const npBg = $('#np-bg');

  const title = s ? s.title : '—';
  const artist = s ? (s.artist || s.subtitle || '') : '—';
  const art = s && safeCover(s.thumbnail) ? s.thumbnail : COVER_PH;

  if (miniArt) miniArt.src = art;
  if (miniTitle) miniTitle.textContent = title;
  if (miniArtist) miniArtist.textContent = artist;
  if (npArt) npArt.src = art;
  if (npTitle) npTitle.textContent = title;
  if (npArtist) npArtist.textContent = artist;
  if (npBg) npBg.style.backgroundImage = s && s.thumbnail ? `url("${s.thumbnail}")` : 'none';

  const sh = $('#mini-shuffle'); if (sh) sh.classList.toggle('active', Player.shuffle);
  const nsh = $('#np-shuffle'); if (nsh) nsh.classList.toggle('active', Player.shuffle);

  const repIcs = ['i-repeat', 'i-repeat', 'i-repeat-1'];
  const rep = $('#mini-repeat');
  if (rep) {
    rep.innerHTML = icon(repIcs[Player.repeat]);
    rep.classList.toggle('active', Player.repeat > 0);
  }
  const nrep = $('#np-repeat');
  if (nrep) {
    nrep.innerHTML = icon(repIcs[Player.repeat]);
    nrep.classList.toggle('active', Player.repeat > 0);
  }

  const speedSp = $('#np-speed span');
  if (speedSp) speedSp.textContent = Player.speed + '×';
  const sbBtn = $('#np-sb');
  if (sbBtn) sbBtn.classList.toggle('on', Player.sbEnabled);
  updateQualityButton();
  syncFloatWidget();
}

function renderQueue() {
  const cur = Player.current;
  const userUpcoming = Player.queue.filter((q, i) => i > Player.index && q._user);
  const radioUpcoming = Player.queue.filter((q, i) => i > Player.index && !q._user);
  const hasUser = userUpcoming.length > 0;
  const totalUpcoming = userUpcoming.length + radioUpcoming.length;

  const badge = $('#side-q-badge');
  if (badge) {
    badge.textContent = totalUpcoming;
    badge.classList.toggle('hidden', totalUpcoming <= 0);
  }

  const sideClear = $('#side-q-clear');
  if (sideClear) {
    const isQueueActive = $('#tab-btn-queue')?.classList.contains('active');
    sideClear.classList.toggle('hidden', !hasUser || !isQueueActive);
  }

  const formatItem = (q, qi, isNow, uIdx, totalU) => {
    let extra = '';
    if (q._user) {
      const up = uIdx === 0 ? ' disabled' : '';
      const dn = uIdx === totalU - 1 ? ' disabled' : '';
      extra = `<button class="tbtn btn-qup" data-qi="${qi}" title="Naik"${up}>${icon('i-chev-up')}</button>` +
              `<button class="tbtn btn-qdn" data-qi="${qi}" title="Turun"${dn}>${icon('i-chev-down')}</button>` +
              `<button class="tbtn btn-rmq" data-qi="${qi}" title="Hapus">${icon('i-x')}</button>`;
    }
    return trackRowHTML({ ...q, qi, subtitle: q.artist, qRadio: !q._user && !isNow, qn: q._user ? uIdx + 1 : undefined }, isNow, extra);
  };

  let qHtml = '';
  if (cur) {
    qHtml += `<div class="q-section-title">Sedang diputar</div>${formatItem(cur, Player.index, true, 0, 0)}`;
  }
  if (userUpcoming.length) {
    qHtml += `<div class="q-section-title">Antrean kamu (${userUpcoming.length})</div>`;
    let uIdx = 0;
    Player.queue.forEach((q, i) => {
      if (i > Player.index && q._user) {
        qHtml += formatItem(q, i, false, uIdx, userUpcoming.length);
        uIdx++;
      }
    });
  }
  if (radioUpcoming.length) {
    qHtml += `<div class="q-section-title">Berikutnya dari radio</div>`;
    Player.queue.forEach((q, i) => {
      if (i > Player.index && !q._user) {
        qHtml += formatItem(q, i, false, 0, 0);
      }
    });
  }
  if (!qHtml) qHtml = '<div class="lyrics-empty">Antrean kosong</div>';

  const sideQ = $('#side-queue');
  if (sideQ) {
    sideQ.innerHTML = qHtml;
    bindQueueActions(sideQ);
  }
  const npQ = $('#queue-list');
  if (npQ) {
    npQ.innerHTML = qHtml;
    bindQueueActions(npQ);
  }
  persistQueue();
}

function bindQueueActions(root) {
  $$('.track', root).forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.tbtn')) return;
      const qi = Number(tr.dataset.qi);
      if (Number.isFinite(qi) && qi >= 0 && qi < Player.queue.length) {
        Player.index = qi;
        Player.cued = false;
        playSong(Player.queue[qi], Player.queue, qi);
      }
    });
  });
  $$('.btn-rmq', root).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    removeQueued(Number(b.dataset.qi));
  }));
  $$('.btn-qup', root).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    moveQueued(Number(b.dataset.qi), -1);
  }));
  $$('.btn-qdn', root).forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    moveQueued(Number(b.dataset.qi), 1);
  }));
}

/* ================= OPERASI JENDELA MODAL ================= */
function openModal(title, bodyHTML) {
  const m = $('#modal');
  if (!m) return;
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHTML;
  m.classList.remove('hidden');
}

function closeModal() {
  $('#modal')?.classList.add('hidden');
}

function openAddToPlaylist(song) {
  if (!song) return;
  const pls = Library.playlists;
  const body = `
    <div class="modal-list">
      <button class="lib-action-btn primary" style="width:100%;margin-bottom:8px" id="m-newpl">${icon('i-plus')}<span>Buat playlist baru</span></button>
      ${pls.map((p) => `
        <button class="modal-item" data-pid="${p.id}">
          <span class="m-item-t">${esc(p.name)}</span>
          <span class="m-item-s">${p.tracks.length} lagu</span>
        </button>
      `).join('')}
    </div>
  `;
  openModal('Tambahkan ke playlist', body);
  $('#m-newpl')?.addEventListener('click', () => {
    closeModal();
    openCreatePlaylist(song);
  });
  $$('.modal-item', $('#modal-body')).forEach((b) => {
    b.addEventListener('click', () => {
      Library.addToPlaylist(b.dataset.pid, song);
      closeModal();
      renderSidebarLibrary();
      toast('Ditambahkan ke ' + b.querySelector('.m-item-t')?.textContent);
    });
  });
}

function openCreatePlaylist(initialSong = null) {
  const body = `
    <input type="text" id="newpl-input" class="modal-input" placeholder="Nama playlist baru" autocomplete="off" autofocus />
    <button class="pill-btn primary full" style="margin-top:12px" id="newpl-submit">Buat playlist</button>
  `;
  openModal('Buat playlist baru', body);
  const input = $('#newpl-input');
  const submit = () => {
    const name = input?.value.trim();
    if (!name) return;
    const pl = Library.createPlaylist(name, renderSidebarLibrary);
    if (initialSong) Library.addToPlaylist(pl.id, initialSong);
    closeModal();
    toast('Playlist dibuat: ' + name);
    go('#/localpl/' + pl.id);
  };
  $('#newpl-submit')?.addEventListener('click', submit);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function openRenamePlaylist(pid) {
  const pl = Library.playlists.find((p) => p.id === pid);
  if (!pl) return;
  const body = `
    <input type="text" id="rename-input" class="modal-input" value="${esc(pl.name)}" autofocus />
    <button class="pill-btn primary full" style="margin-top:12px" id="rename-submit">Simpan perubahan</button>
  `;
  openModal('Ubah nama playlist', body);
  const input = $('#rename-input');
  const submit = () => {
    const name = input?.value.trim();
    if (!name) return;
    Library.renamePlaylist(pid, name, renderSidebarLibrary);
    closeModal();
    toast('Nama diubah');
    go('#/localpl/' + pid);
  };
  $('#rename-submit')?.addEventListener('click', submit);
  input?.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
}

function openDeletePlaylist(pid) {
  const pl = Library.playlists.find((p) => p.id === pid);
  if (!pl) return;
  const body = `
    <p style="margin-bottom:16px;color:var(--sub)">Yakin ingin menghapus playlist <strong>${esc(pl.name)}</strong>? Tindakan ini tidak dapat dibatalkan.</p>
    <button class="pill-btn primary full" style="background:#e63946;color:#fff" id="delpl-confirm">Hapus playlist</button>
  `;
  openModal('Hapus playlist', body);
  $('#delpl-confirm')?.addEventListener('click', () => {
    Library.deletePlaylist(pid, renderSidebarLibrary);
    closeModal();
    toast('Playlist dihapus');
    go('#/library');
  });
}

function openImportForm() {
  const body = `
    <p style="font-size:13px;color:var(--sub);margin-bottom:12px">Tempel tautan atau id playlist YouTube Music untuk mengimpor lagu ke playlist lokal kamu.</p>
    <input type="text" id="import-input" class="modal-input" placeholder="https://music.youtube.com/playlist?list=..." autofocus />
    <button class="pill-btn primary full import-btn-submit" style="margin-top:14px" id="import-submit">Mulai impor</button>
  `;
  openModal('Impor playlist YouTube music', body);
  $('#import-submit')?.addEventListener('click', async () => {
    const raw = $('#import-input')?.value.trim();
    if (!raw) return;
    let pid = raw;
    const m = raw.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (m) pid = m[1];
    if (!pid.startsWith('VL') && !pid.startsWith('PL')) pid = 'VL' + pid;
    toast('Mengimpor playlist…');
    try {
      const d = await api(`/api/browse?id=${encodeURIComponent(pid)}`);
      const title = (d.header && d.header.title) || 'Playlist impor';
      const pl = Library.createPlaylist(title, renderSidebarLibrary);
      (d.tracks || []).forEach((t) => Library.addToPlaylist(pl.id, songFromItem(t)));
      closeModal();
      toast(`Berhasil mengimpor ${d.tracks.length} lagu!`);
      go('#/localpl/' + pl.id);
    } catch {
      toast('Gagal mengimpor playlist. Pastikan tautan publik.');
    }
  });
}

function openBackupForm() {
  const data = {
    favorites: Library.favorites,
    playlists: Library.playlists,
    saved: Library.saved,
    stats: Library.stats,
    exportedAt: new Date().toISOString(),
  };
  const str = JSON.stringify(data, null, 2);
  const blob = new Blob([str], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `dansmusic-backup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Cadangan musik berhasil diunduh!');
}

function openRestoreForm() {
  const body = `
    <p style="font-size:13px;color:var(--sub);margin-bottom:12px">Pilih file cadangan json dari perangkat kamu untuk memulihkan playlist dan favorit.</p>
    <input type="file" id="restore-file" accept=".json" class="modal-input" />
  `;
  openModal('Pulihkan cadangan', body);
  $('#restore-file')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const obj = JSON.parse(ev.target?.result);
        if (Array.isArray(obj.favorites)) store.set('fav', obj.favorites);
        if (Array.isArray(obj.playlists)) store.set('pls', obj.playlists);
        if (Array.isArray(obj.saved)) store.set('sav', obj.saved);
        if (obj.stats) store.set('stats', obj.stats);
        closeModal();
        renderSidebarLibrary();
        toast('Cadangan berhasil dipulihkan!');
        location.reload();
      } catch {
        toast('File cadangan tidak valid.');
      }
    };
    reader.readAsText(file);
  });
}

function openSongMenu(song, ctx = {}) {
  if (!song) return;
  const isFav = Library.isFav(song.videoId);
  const coverUrl = song.thumbnail || (song.videoId ? `https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg` : '');
  const body = `
    <div class="sm-song-header">
      ${coverUrl ? `<img src="${esc(coverUrl)}" class="sm-song-art" alt="" />` : `<div class="sm-song-art-ph">${icon('i-note')}</div>`}
      <div class="sm-song-meta">
        <div class="sm-song-title">${esc(song.title)}</div>
        <div class="sm-song-artist">${esc(song.artist || song.subtitle || '')}</div>
      </div>
    </div>
    <div class="modal-list">
      <button class="modal-item" id="sm-dl">${icon('i-download')}<span class="m-item-t">Unduh Mp3 320kbps</span></button>
      <button class="modal-item" id="sm-speed">${icon('i-clock')}<span class="m-item-t">Kecepatan putar (${Player.speed}x)</span></button>
      <button class="modal-item" id="sm-quality">${icon('i-equalizer')}<span class="m-item-t">Kualitas audio: ${Player.hq ? 'max' : 'normal'}</span></button>
      <button class="modal-item" id="sm-pip">${icon('i-pip')}<span class="m-item-t">Picture</span></button>
      <button class="modal-item" id="sm-sleep">${icon('i-moon')}<span class="m-item-t">Pengatur waktu tidur</span></button>
      <button class="modal-item" id="sm-next">${icon('i-next')}<span class="m-item-t">Putar berikutnya</span></button>
      <button class="modal-item" id="sm-queue">${icon('i-queue')}<span class="m-item-t">Tambahkan ke antrean</span></button>
      <button class="modal-item" id="sm-fav">${icon(isFav ? 'i-heart-f' : 'i-heart-o')}<span class="m-item-t">${isFav ? 'Hapus dari favorit' : 'Tambahkan ke favorit'}</span></button>
      <button class="modal-item" id="sm-addpl">${icon('i-plus')}<span class="m-item-t">Tambahkan ke playlist</span></button>
      <button class="modal-item" id="sm-share">${icon('i-share')}<span class="m-item-t">Salin tautan lagu</span></button>
      ${song.artistBrowseId ? `<button class="modal-item" id="sm-artist">${icon('i-artist')}<span class="m-item-t">Buka halaman artis</span></button>` : ''}
    </div>
  `;
  openModal('Opsi lagu', body);
  $('#sm-dl')?.addEventListener('click', () => { closeModal(); downloadSong(song); });
  $('#sm-speed')?.addEventListener('click', () => { cycleSpeed(); closeModal(); });
  $('#sm-quality')?.addEventListener('click', () => { toggleQuality(); closeModal(); });
  $('#sm-pip')?.addEventListener('click', () => { closeModal(); startSystemPip(); });
  $('#sm-sleep')?.addEventListener('click', () => { closeModal(); openSleepTimerDialog(); });
  $('#sm-next')?.addEventListener('click', () => { queueSong(song, true); closeModal(); });
  $('#sm-queue')?.addEventListener('click', () => { queueSong(song, false); closeModal(); });
  $('#sm-fav')?.addEventListener('click', () => {
    Library.toggleFav(song, () => {
      updateLikeButtons();
      renderSidebarLibrary();
    });
    closeModal();
  });
  $('#sm-addpl')?.addEventListener('click', () => { closeModal(); openAddToPlaylist(song); });
  $('#sm-share')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(`https://music.youtube.com/watch?v=${song.videoId}`);
    toast('Tautan lagu disalin ke papan klip!');
    closeModal();
  });
  $('#sm-artist')?.addEventListener('click', () => {
    closeModal();
    go('#/artist/' + song.artistBrowseId);
  });
}

function openSleepTimerDialog() {
  const currentTimer = Player.sleepTimer;
  const body = `
    <div class="modal-list">
      ${currentTimer ? `<button class="modal-item" id="st-cancel" style="color:#ff4d6d"><div class="m-item-t">Batalkan pengatur waktu tidur</div></button>` : ''}
      <button class="modal-item" data-min="15"><div class="m-item-t">15 menit</div></button>
      <button class="modal-item" data-min="30"><div class="m-item-t">30 menit</div></button>
      <button class="modal-item" data-min="end"><div class="m-item-t">Sampai akhir lagu ini</div></button>
    </div>
    <div class="timer-custom-wrap">
      <div class="timer-custom-title">Atur Waktu Kustom</div>
      <div class="timer-input-group">
        <div class="timer-input-col">
          <label for="timer-hours">Jam</label>
          <input type="number" id="timer-hours" min="0" max="24" value="0" placeholder="0" class="timer-num-input" />
        </div>
        <div class="timer-input-col">
          <label for="timer-minutes">Menit</label>
          <input type="number" id="timer-minutes" min="0" max="59" value="0" placeholder="0" class="timer-num-input" />
        </div>
        <div class="timer-input-col">
          <label for="timer-seconds">Detik</label>
          <input type="number" id="timer-seconds" min="0" max="59" value="0" placeholder="0" class="timer-num-input" />
        </div>
      </div>
      <button type="button" class="pill-btn primary timer-custom-submit" id="timer-custom-btn">Mulai Waktu Kustom</button>
    </div>
  `;
  openModal('Pengatur waktu tidur', body);
  $('#st-cancel')?.addEventListener('click', () => {
    if (typeof Player.sleepTimer === 'number') {
      clearTimeout(Player.sleepTimer);
    }
    Player.sleepTimer = null;
    closeModal();
    toast('Pengatur waktu tidur dibatalkan');
  });
  $$('[data-min]', $('#modal-body')).forEach((b) => {
    b.addEventListener('click', () => {
      if (typeof Player.sleepTimer === 'number') {
        clearTimeout(Player.sleepTimer);
      }
      const min = b.dataset.min;
      if (min === 'end') {
        Player.sleepTimer = 'end';
        toast('Musik akan berhenti saat lagu selesai');
      } else {
        const ms = Number(min) * 60 * 1000;
        Player.sleepTimer = setTimeout(() => {
          fadeOutAndPause(2500);
          Player.sleepTimer = null;
          toast('Pengatur waktu tidur: Musik dijeda lembut.');
        }, ms);
        toast(`Musik akan dijeda dalam ${min} menit`);
      }
      closeModal();
    });
  });
  $('#timer-custom-btn')?.addEventListener('click', () => {
    const h = Math.max(0, parseInt($('#timer-hours')?.value, 10) || 0);
    const m = Math.max(0, parseInt($('#timer-minutes')?.value, 10) || 0);
    const s = Math.max(0, parseInt($('#timer-seconds')?.value, 10) || 0);
    const totalSec = (h * 3600) + (m * 60) + s;
    if (totalSec <= 0) {
      toast('Masukkan durasi waktu yang valid');
      return;
    }
    if (typeof Player.sleepTimer === 'number') {
      clearTimeout(Player.sleepTimer);
    }
    const ms = totalSec * 1000;
    Player.sleepTimer = setTimeout(() => {
      fadeOutAndPause(2500);
      Player.sleepTimer = null;
      toast('Pengatur waktu tidur: Musik dijeda lembut.');
    }, ms);
    const parts = [];
    if (h > 0) parts.push(`${h} jam`);
    if (m > 0) parts.push(`${m} menit`);
    if (s > 0) parts.push(`${s} detik`);
    toast(`Musik akan dijeda dalam ${parts.join(' ')}`);
    closeModal();
  });
}

function openKeyboardShortcutsModal() {
  const body = `
    <table class="kbd-table">
      <tbody>
        <tr>
          <td><kbd class="kbd-badge">Spasi</kbd> / <kbd class="kbd-badge">K</kbd></td>
          <td>Putar atau jeda lagu</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">→</kbd> / <kbd class="kbd-badge">L</kbd></td>
          <td>Lewati 5 detik ke depan</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">←</kbd> / <kbd class="kbd-badge">J</kbd></td>
          <td>Putar ulang 5 detik ke belakang</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">↑</kbd> / <kbd class="kbd-badge">↓</kbd></td>
          <td>Naikkan / turunkan volume suara (±5%)</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">N</kbd></td>
          <td>Lagu berikutnya</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">P</kbd></td>
          <td>Lagu sebelumnya</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">M</kbd></td>
          <td>Bisukan / aktifkan suara (Mute)</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">F</kbd></td>
          <td>Fade out volume dan jeda lembut</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">E</kbd></td>
          <td>Buka Preset Audio Equalizer</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">O</kbd></td>
          <td>Buka / tutup layar Sedang Diputar</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">S</kbd></td>
          <td>Nyalakan / matikan acak lagu (Shuffle)</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">R</kbd></td>
          <td>Ganti mode pengulangan (Repeat)</td>
        </tr>
        <tr>
          <td><kbd class="kbd-badge">?</kbd></td>
          <td>Tampilkan jendela pintasan ini</td>
        </tr>
      </tbody>
    </table>
    <div class="modal-actions" style="margin-top:16px">
      <button class="pill-btn primary" id="kbd-modal-close">Tutup</button>
    </div>
  `;
  openModal('Pintasan Papan Ketik', body);
  $('#kbd-modal-close')?.addEventListener('click', closeModal);
}

async function triggerAudioBlobDownload(url, filename, btnEl) {
  const origHtml = btnEl ? btnEl.innerHTML : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = `<svg class="ic spin"><use href="#i-refresh"/></svg><span>Mengunduh Mp3…</span>`;
  }
  toast(`Mengunduh: ${filename}`);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const audioBlob = blob.type.includes('audio') ? blob : new Blob([blob], { type: 'audio/mpeg' });
    const blobUrl = URL.createObjectURL(audioBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = filename.endsWith('.mp3') ? filename : `${filename}.mp3`;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(blobUrl);
    }, 10000);
    toast(`Unduhan tersimpan: ${filename}`);
  } catch (err) {
    console.warn('Blob download fallback:', err);
    // FALLBACK ANCHOR DIRECT LINK
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => link.remove(), 2000);
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = origHtml;
    }
  }
}

function openDownloadModal(song, data) {
  const cleanTitle = (song.title || 'musik').replace(/[^\w\s.-]/gi, '_').trim();
  const filename = data.filename || `${cleanTitle} (320kbps).mp3`;
  const dlUrl = data.downloadUrl || `/api/download?videoId=${encodeURIComponent(song.videoId)}&title=${encodeURIComponent(song.title || '')}`;
  const directUrl = data.directUrl || '';

  const body = `
    <div style="text-align:center; padding:10px 4px;">
      <div style="font-size:16px; font-weight:800; color:#fff; line-height:1.3; margin-bottom:4px;">${esc(song.title || 'Lagu')}</div>
      <div style="font-size:13px; color:var(--muted); margin-bottom:18px;">${esc(song.artist || '')} • <strong style="color:var(--accent-bright)">Mp3 320kbps</strong></div>
      
      <div style="display:flex; flex-direction:column; gap:10px; max-width:320px; margin:0 auto;">
        <button type="button" class="pill-btn primary" id="dl-native-btn" style="width:100%; height:44px; justify-content:center; font-size:14px; font-weight:800; cursor:pointer;">
          ${icon('i-download')}
          <span>Unduh Mp3 320kbps</span>
        </button>
        ${directUrl ? `
        <a href="${esc(directUrl)}" target="_blank" rel="noopener noreferrer" download="${esc(filename)}" class="pill-btn" style="width:100%; height:40px; justify-content:center; text-decoration:none; font-size:13px;">
          ${icon('i-play')}
          <span>Server Cadangan Langsung</span>
        </a>` : ''}
      </div>
      <div style="font-size:12px; color:rgba(255,255,255,0.6); margin-top:16px;">
        File audio murni di simpan langsung ke penyimpanan perangkat.
      </div>
    </div>
  `;
  openModal('Unduh Mp3 320kbps', body);
  $('#dl-native-btn')?.addEventListener('click', (e) => {
    triggerAudioBlobDownload(dlUrl, filename, e.currentTarget);
  });
}

async function downloadSong(song) {
  if (!song || !song.videoId) {
    toast('Pilih lagu terlebih dahulu');
    return;
  }
  const cleanTitle = (song.title || 'musik').replace(/[^\w\s.-]/gi, '_').trim();
  const fallbackFilename = `${cleanTitle} (320kbps).mp3`;
  const dlBtn = $('#np-download');
  if (dlBtn) dlBtn.classList.add('loading');

  try {
    const res = await fetch(
      `/api/download-info?videoId=${encodeURIComponent(song.videoId)}&title=${encodeURIComponent(song.title || '')}&artist=${encodeURIComponent(song.artist || '')}`
    );
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error || 'Server unduhan sedang memproses audio');
    }
    const data = await res.json();
    if (!data || !data.downloadUrl) {
      throw new Error('Tautan audio belum siap dari server');
    }

    // BUKA MODAL PILIHAN UNDUH SECARA INTERAKTIF TANPA AUTO DOWNLOAD
    openDownloadModal(song, data);
  } catch (err) {
    console.warn('Download error:', err);
    // BUKA MODAL DENGAN FALLBACK DIRECT API ENDPOINT
    openDownloadModal(song, {
      filename: fallbackFilename,
      downloadUrl: `/api/download?videoId=${encodeURIComponent(song.videoId)}&title=${encodeURIComponent(song.title || '')}`,
    });
  } finally {
    if (dlBtn) dlBtn.classList.remove('loading');
  }
}

/* ================= PENGATURAN KAITAN TAMPILAN ================= */
setUiHooks({
  renderNowPlaying,
  renderQueue,
  updateLikeButtons,
  renderPlayButtons,
});

setViewActionHooks({
  openSongMenu,
  openAddToPlaylist,
  downloadSong,
});

/* ================= PENANGAN PERISTIWA DAN KONTROL ================= */
function bindPlayerControls() {
  $('#mini-play')?.addEventListener('click', togglePlay);
  $('#mini-prev')?.addEventListener('click', prevTrack);
  $('#mini-next')?.addEventListener('click', () => nextTrack(false));
  $('#mini-shuffle')?.addEventListener('click', () => {
    Player.shuffle = !Player.shuffle;
    renderNowPlaying();
    toast(Player.shuffle ? 'Acak aktif' : 'Acak nonaktif');
  });
  $('#mini-repeat')?.addEventListener('click', () => {
    Player.repeat = (Player.repeat + 1) % 3;
    renderNowPlaying();
    const msgs = ['Ulangi nonaktif', 'Ulangi antrean', 'Ulangi satu lagu'];
    toast(msgs[Player.repeat]);
  });
  $('#mini-like')?.addEventListener('click', () => {
    const s = focusedSong();
    if (s) Library.toggleFav(s, () => { updateLikeButtons(); renderSidebarLibrary(); });
  });
  $('#mini-pip')?.addEventListener('click', startSystemPip);
  $('#mini-eq')?.addEventListener('click', () => {
    openNowPlaying();
    switchNPTab('eq');
  });
  $('#mini-queue')?.addEventListener('click', () => {
    switchSideTab('queue');
  });
  $('#mini-open')?.addEventListener('click', openNowPlaying);
  $('#mini-art')?.addEventListener('click', openNowPlaying);
  $('.mini-meta')?.addEventListener('click', openNowPlaying);

  // BILAH PENCARIAN WAKTU PUTAR
  const miniBar = $('#mini-bar');
  if (miniBar) {
    miniBar.addEventListener('click', (e) => {
      if (!Player.yt || !Player.ready) return;
      const rect = miniBar.getBoundingClientRect();
      const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const dur = Player.yt.getDuration() || 0;
      if (dur) {
        const targetSec = frac * dur;
        Player.yt.seekTo(targetSec, true);
        seekAudioStream(targetSec);
      }
    });
  }

  // KONTROL VOLUME SUARA
  const vol = $('#mini-volume');
  if (vol) {
    vol.addEventListener('input', () => {
      const v = Number(vol.value);
      if (Player.yt && Player.ready) Player.yt.setVolume(v);
      setAudioStreamVolume(v);
      const npVol = $('#np-volume'); if (npVol) npVol.value = v;
    });
  }

  // KONTROL PANEL SEDANG DIPUTAR
  $('#np-close')?.addEventListener('click', () => closeNowPlaying(renderNowPlaying, renderPlayButtons, updateLikeButtons));
  $('#np-play')?.addEventListener('click', toggleNowPlayingPlay);
  $('#np-prev')?.addEventListener('click', prevTrack);
  $('#np-next')?.addEventListener('click', () => nextTrack(false));
  $('#np-shuffle')?.addEventListener('click', () => {
    Player.shuffle = !Player.shuffle;
    renderNowPlaying();
    toast(Player.shuffle ? 'Acak aktif' : 'Acak nonaktif');
  });
  $('#np-repeat')?.addEventListener('click', () => {
    Player.repeat = (Player.repeat + 1) % 3;
    renderNowPlaying();
    const msgs = ['Ulangi nonaktif', 'Ulangi antrean', 'Ulangi satu lagu'];
    toast(msgs[Player.repeat]);
  });
  $('#np-like')?.addEventListener('click', () => {
    const s = focusedSong();
    if (s) Library.toggleFav(s, () => { updateLikeButtons(); renderSidebarLibrary(); });
  });
  $('#np-addpl')?.addEventListener('click', () => openAddToPlaylist(focusedSong()));
  $('#np-playnext')?.addEventListener('click', () => {
    const s = Player.pending;
    if (s) { queueSong(s, true); toast('Akan diputar berikutnya'); }
  });
  $('#np-queueadd')?.addEventListener('click', () => {
    const s = Player.pending;
    if (s) { queueSong(s, false); toast('Ditambahkan ke antrean'); }
  });
  $('#np-more')?.addEventListener('click', () => openSongMenu(focusedSong()));
  $('#np-download')?.addEventListener('click', () => downloadSong(focusedSong()));
  $('#np-share')?.addEventListener('click', () => {
    const s = focusedSong();
    if (s) {
      navigator.clipboard?.writeText(`https://music.youtube.com/watch?v=${s.videoId}`);
      toast('Tautan lagu disalin!');
    }
  });
  $('#np-speed')?.addEventListener('click', cycleSpeed);
  $('#np-float')?.addEventListener('click', toggleFloatWidget);
  $('#np-pip')?.addEventListener('click', startSystemPip);
  $('#np-quality')?.addEventListener('click', toggleQuality);
  $('#np-sb')?.addEventListener('click', toggleSB);
  $('#np-sleep')?.addEventListener('click', openSleepTimerDialog);

  const npRange = $('#np-range');
  if (npRange) {
    npRange.addEventListener('input', () => {
      if (!Player.yt || !Player.ready) return;
      const frac = Number(npRange.value) / 1000;
      const dur = Player.yt.getDuration() || 0;
      if (dur) {
        const targetSec = frac * dur;
        Player.yt.seekTo(targetSec, true);
        seekAudioStream(targetSec);
      }
    });
  }

  const npVol = $('#np-volume');
  if (npVol) {
    npVol.addEventListener('input', () => {
      const v = Number(npVol.value);
      if (Player.yt && Player.ready) Player.yt.setVolume(v);
      setAudioStreamVolume(v);
      const mVol = $('#mini-volume'); if (mVol) mVol.value = v;
    });
  }

  // TAB PANEL SEDANG DIPUTAR
  $$('.np-tab').forEach((tab) => {
    tab.addEventListener('click', () => switchNPTab(tab.dataset.nptab));
  });
  $('#np-lyric-preview')?.addEventListener('click', () => switchNPTab('lyrics'));

  // DUKUNGAN GESER/DRAG TAB PEMUTAR UTAMA DENGAN MOUSE DAN SENTUHAN LAYAR
  const npTabsEl = $('.np-tabs');
  if (npTabsEl) {
    let isDown = false;
    let startX = 0;
    let scrollLeft = 0;
    npTabsEl.addEventListener('mousedown', (e) => {
      isDown = true;
      startX = e.pageX - npTabsEl.offsetLeft;
      scrollLeft = npTabsEl.scrollLeft;
    });
    npTabsEl.addEventListener('mouseleave', () => { isDown = false; });
    npTabsEl.addEventListener('mouseup', () => { isDown = false; });
    npTabsEl.addEventListener('mousemove', (e) => {
      if (!isDown) return;
      e.preventDefault();
      const x = e.pageX - npTabsEl.offsetLeft;
      const walk = (x - startX) * 1.5;
      npTabsEl.scrollLeft = scrollLeft - walk;
    });
  }

  // KONTROL BILAH ATAS DAN NAVIGASI UTAMA
  $('#sidebar-toggle')?.addEventListener('click', () => {
    $('#sidebar')?.classList.toggle('open');
  });
  $('#side-brand-btn')?.addEventListener('click', () => go('#/home'));
  $('#tb-brand')?.addEventListener('click', () => go('#/home'));
  $('#tb-kbd-btn')?.addEventListener('click', openKeyboardShortcutsModal);
  $('#tb-search')?.addEventListener('click', () => go('#/search'));
  $('#tb-filter-btn')?.addEventListener('click', () => go('#/moods'));
  $('#tb-lib-btn')?.addEventListener('click', () => go('#/library'));

  const tbInput = $('#tb-search-input');
  if (tbInput) {
    tbInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = tbInput.value.trim();
        if (q) go('#/search/' + encodeURIComponent(q));
      }
    });
  }

  $('#theme-toggle')?.addEventListener('click', toggleTheme);
  $('#lib-new')?.addEventListener('click', () => openCreatePlaylist());
  $('#side-q-clear')?.addEventListener('click', clearUserQueue);

  // TAB BILAH SISI (KOLEKSI & ANTREAN)
  const tabLib = $('#tab-btn-lib');
  const tabQueue = $('#tab-btn-queue');
  const paneLib = $('#side-tab-lib');
  const paneQueue = $('#side-tab-queue');
  const sideQClear = $('#side-q-clear');
  const libNew = $('#lib-new');

  function switchSideTab(tab) {
    if (tab === 'queue') {
      tabQueue?.classList.add('active');
      tabLib?.classList.remove('active');
      paneQueue?.classList.remove('hidden');
      paneLib?.classList.add('hidden');
      libNew?.classList.add('hidden');
      const hasUser = Player.queue.some((q, i) => i > Player.index && q._user);
      sideQClear?.classList.toggle('hidden', !hasUser);
    } else {
      tabLib?.classList.add('active');
      tabQueue?.classList.remove('active');
      paneLib?.classList.remove('hidden');
      paneQueue?.classList.add('hidden');
      libNew?.classList.remove('hidden');
      sideQClear?.classList.add('hidden');
    }
  }

  tabLib?.addEventListener('click', () => switchSideTab('lib'));
  tabQueue?.addEventListener('click', () => switchSideTab('queue'));

  // PENUTUP JENDELA MODAL
  $('#modal-cancel')?.addEventListener('click', closeModal);
  $('#modal')?.addEventListener('click', (e) => {
    if (e.target === $('#modal')) closeModal();
  });

  // PINTASAN PAPAN KETIK GLOBAL
  window.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
    if (e.code === 'Space' || e.key === 'k') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'ArrowRight' || e.key === 'l') {
      e.preventDefault();
      if (Player.yt && Player.ready) Player.yt.seekTo((Player.yt.getCurrentTime() || 0) + 5);
    } else if (e.key === 'ArrowLeft' || e.key === 'j') {
      e.preventDefault();
      if (Player.yt && Player.ready) Player.yt.seekTo((Player.yt.getCurrentTime() || 0) - 5);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (Player.yt && Player.ready) {
        const v = Math.min(100, (Player.yt.getVolume() || 0) + 5);
        Player.yt.setVolume(v);
        const miniVol = $('#mini-volume'); if (miniVol) miniVol.value = v;
        const npVol = $('#np-volume'); if (npVol) npVol.value = v;
        toast(`Volume: ${v}%`);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (Player.yt && Player.ready) {
        const v = Math.max(0, (Player.yt.getVolume() || 0) - 5);
        Player.yt.setVolume(v);
        const miniVol = $('#mini-volume'); if (miniVol) miniVol.value = v;
        const npVol = $('#np-volume'); if (npVol) npVol.value = v;
        toast(`Volume: ${v}%`);
      }
    } else if (e.key === 'n') {
      e.preventDefault();
      nextTrack(false);
    } else if (e.key === 'p') {
      e.preventDefault();
      prevTrack();
    } else if (e.key === 'm') {
      e.preventDefault();
      if (Player.yt && Player.ready) {
        if (Player.yt.isMuted()) { Player.yt.unMute(); toast('Suara dinyalakan'); }
        else { Player.yt.mute(); toast('Suara dibisukan'); }
      }
    } else if (e.key === 'f') {
      e.preventDefault();
      fadeOutAndPause();
    } else if (e.key === 'e') {
      e.preventDefault();
      openNowPlaying();
      switchNPTab('eq');
    } else if (e.key === 'o') {
      e.preventDefault();
      const np = $('#nowplaying');
      if (np && !np.classList.contains('hidden')) closeNowPlaying(renderNowPlaying, renderPlayButtons, updateLikeButtons);
      else openNowPlaying();
    } else if (e.key === 's') {
      e.preventDefault();
      Player.shuffle = !Player.shuffle;
      renderNowPlaying();
      toast(Player.shuffle ? 'Acak aktif' : 'Acak nonaktif');
    } else if (e.key === 'r') {
      e.preventDefault();
      Player.repeat = (Player.repeat + 1) % 3;
      renderNowPlaying();
      const msgs = ['Ulangi nonaktif', 'Ulangi antrean', 'Ulangi satu lagu'];
      toast(msgs[Player.repeat]);
    } else if (e.key === '?') {
      e.preventDefault();
      openKeyboardShortcutsModal();
    }
  });
}

/* ================= LINGKARAN PEMANTAUAN PEMUTARAN ================= */
function startPlaybackLoop() {
  let fillEl = null;
  let mcEl = null;
  let mdEl = null;
  let npCurEl = null;
  let npDurEl = null;
  let rangeEl = null;
  let lastCurSec = -1;
  let lastSyncTick = 0;

  setInterval(() => {
    try {
      const cur = getPlaybackCurrentTime();
      const dur = getPlaybackDuration();
      const isPlaying = document.body.classList.contains('playing') || (Player.yt && Player.ready && Player.yt.getPlayerState && Player.yt.getPlayerState() === YT.PlayerState.PLAYING);

      if (isPlaying && dur > 0) {
        const curSec = Math.floor(cur);
        const curChanged = curSec !== lastCurSec;
        if (curChanged) {
          lastCurSec = curSec;
          // AKUMULASI STATISTIK DENGAR TIAP DETIK BERGANTI
          const currentSong = Player.current;
          if (currentSong) Library.addListenTime(currentSong.videoId, 1);
          updateMediaSessionState(isPlaying ? 'playing' : 'paused');
        }

        const pct = Math.min(100, Math.max(0, (cur / dur) * 100));
        
        if (!fillEl || !fillEl.isConnected) fillEl = $('#mini-progress-fill');
        if (fillEl) fillEl.style.width = pct + '%';

        if (curChanged) {
          const curText = fmtTime(cur);
          const durText = fmtTime(dur);

          if (!mcEl || !mcEl.isConnected) mcEl = $('#mini-cur');
          if (mcEl) mcEl.textContent = curText;
          if (!mdEl || !mdEl.isConnected) mdEl = $('#mini-dur');
          if (mdEl) mdEl.textContent = durText;

          if (!isPreviewing()) {
            if (!npCurEl || !npCurEl.isConnected) npCurEl = $('#np-cur');
            if (npCurEl) npCurEl.textContent = curText;
            if (!npDurEl || !npDurEl.isConnected) npDurEl = $('#np-dur');
            if (npDurEl) npDurEl.textContent = durText;
            if (!rangeEl || !rangeEl.isConnected) rangeEl = $('#np-range');
            if (rangeEl && document.activeElement !== rangeEl) rangeEl.value = Math.round((cur / dur) * 1000);
          }
        }

        syncFloatProgress(pct);
        updateLyricHighlight(cur);

        // SINKRONKAN DRIFT AUDIO VS VISUAL SETIAP ~500MS
        const now = Date.now();
        if (now - lastSyncTick > 500) {
          lastSyncTick = now;
          syncAudioTime(cur);
        }

        // PEMERIKSAAN SEGMEN SPONSORBLOCK
        if (Player.sbEnabled && Player.sbSegments.length) {
          for (const seg of Player.sbSegments) {
            if (cur >= seg.start && cur < seg.end - 0.2) {
              seekAudioStream(seg.end);
              toast('SponsorBlock: Bagian sponsor dilewati');
              break;
            }
          }
        }
      }
    } catch {}
  }, 100);
}

/* ================= SISTEM RUTE DAN NAVIGASI ================= */
async function router() {
  const hash = location.hash || '#/home';
  updateNavActive(hash);
  const view = $('#view');
  if (!view) return;
  const [path, queryString] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(queryString || '');
  const parts = path.split('/').filter(Boolean);
  const root = parts[0] || 'home';

  const modalCallbacks = {
    openCreatePlaylist,
    openRenamePlaylist,
    openDeletePlaylist,
    openImportForm,
    openBackupForm,
    openRestoreForm,
  };

  if (root === 'home') await viewHome(view);
  else if (root === 'search') await viewSearch(view, decodeURIComponent(parts[1] || ''), params.get('filter'));
  else if (root === 'charts') await viewCharts(view);
  else if (root === 'moods') await viewMoods(view);
  else if (root === 'stats') viewStats(view);
  else if (root === 'library') viewLibrary(view, parts[1] || 'playlists', modalCallbacks);
  else if (root === 'localpl') viewLocalPlaylist(view, parts[1], modalCallbacks);
  else if (root === 'album') await viewBrowse(view, parts[1], 'album');
  else if (root === 'playlist') await viewBrowse(view, parts[1], 'playlist', params.get('params'));
  else if (root === 'artist') await viewBrowse(view, parts[1], 'artist');
  else if (root === 'browse') await viewBrowse(view, parts[1], 'browse', params.get('params'));
  else await viewHome(view);

  window.scrollTo({ top: 0, behavior: 'instant' });
}

/* ================= VISUALIZER SPEKTRUM AUDIO DINAMIS REAL-TIME ================= */
function startSpectrumAnimation() {
  const miniSpectrum = $('#mini-spectrum');
  const eqSpectrumLg = $('#eq-spectrum-lg');
  const miniBars = miniSpectrum ? miniSpectrum.querySelectorAll('.bar') : [];
  const lgBars = eqSpectrumLg ? eqSpectrumLg.querySelectorAll('.bar') : [];
  const dataArray = new Uint8Array(32);
  let tick = 0;

  function animate() {
    requestAnimationFrame(animate);
    tick += 0.08;
    const isPlaying = document.body.classList.contains('playing') && !document.body.classList.contains('paused');
    const eqGains = (window.Player && window.Player.eqGains) || [0, 0, 0, 0, 0];

    if (isPlaying) {
      let hasRealAudio = false;
      if (eqAnalyserNode) {
        try {
          eqAnalyserNode.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          if (sum > 10) hasRealAudio = true;
        } catch {}
      }

      // MINI BARS (4 BARS)
      if (miniBars.length > 0) {
        miniBars.forEach((bar, idx) => {
          let heightPct;
          if (hasRealAudio) {
            const val = dataArray[idx * 4] || 0;
            heightPct = Math.max(18, Math.min(100, Math.round((val / 255) * 100)));
          } else {
            // DYNAMIC RHYTHMIC PULSE
            const gainBoost = (eqGains[idx] || 0) * 2;
            const wave = Math.sin(tick * 2 + idx * 1.2) * 28 + Math.cos(tick * 3.5 + idx * 0.8) * 16;
            heightPct = Math.max(18, Math.min(100, Math.round(50 + wave + gainBoost)));
          }
          bar.style.height = `${heightPct}%`;
        });
      }

      // LARGE BARS (7 BARS)
      if (lgBars.length > 0) {
        lgBars.forEach((bar, idx) => {
          let heightPct;
          if (hasRealAudio) {
            const val = dataArray[idx * 3] || 0;
            heightPct = Math.max(15, Math.min(100, Math.round((val / 255) * 100)));
          } else {
            const mappedGain = (eqGains[Math.min(idx, eqGains.length - 1)] || 0) * 2.2;
            const wave = Math.sin(tick * 2.4 + idx * 0.9) * 32 + Math.cos(tick * 4 + idx * 1.3) * 18;
            heightPct = Math.max(14, Math.min(100, Math.round(52 + wave + mappedGain)));
          }
          bar.style.height = `${heightPct}%`;
        });
      }
    } else {
      miniBars.forEach((bar) => { bar.style.height = '15%'; });
      lgBars.forEach((bar) => { bar.style.height = '12%'; });
    }
  }
  requestAnimationFrame(animate);
}

/* ================= GESTUR TIRAI TARIK KE BAWAH (CURTAIN PULL-DOWN DRAWER) ================= */
function initNowPlayingCurtainGesture() {
  const np = $('#nowplaying');
  const handle = $('.np-handle');
  const topbar = $('.np-topbar');
  if (!np) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  let startTime = 0;

  const onTouchStart = (e) => {
    if (np.classList.contains('hidden')) return;
    const touch = e.touches ? e.touches[0] : e;
    const target = e.target;
    
    // HANYA IZINKAN DRAG-TO-CLOSE JIKA PENGGUNA MENYENTUH AREA TOPBAR / HANDLE
    if (!target.closest('.np-handle, .np-topbar')) return;

    startY = touch.clientY;
    currentY = startY;
    startTime = Date.now();
    isDragging = true;
    np.classList.add('dragging-curtain');
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    currentY = touch.clientY;
    const deltaY = currentY - startY;

    if (deltaY > 0) {
      if (e.cancelable) e.preventDefault();
      const translateY = deltaY;
      const opacity = Math.max(0.2, 1 - deltaY / (window.innerHeight * 0.8));
      np.style.transform = `translateY(${translateY}px)`;
      np.style.opacity = `${opacity}`;
    } else {
      np.style.transform = '';
      np.style.opacity = '';
    }
  };

  const onTouchEnd = () => {
    if (!isDragging) return;
    isDragging = false;
    np.classList.remove('dragging-curtain');

    const deltaY = currentY - startY;
    const duration = Date.now() - startTime;
    const velocity = deltaY / Math.max(1, duration);

    if (deltaY > 80 || (deltaY > 30 && velocity > 0.35)) {
      np.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.25s ease';
      np.style.transform = 'translateY(100%)';
      np.style.opacity = '0';
      setTimeout(() => {
        closeNowPlaying(renderNowPlaying, renderPlayButtons, updateLikeButtons);
        np.style.transform = '';
        np.style.opacity = '';
        np.style.transition = '';
      }, 280);
    } else {
      np.style.transition = 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.2s ease';
      np.style.transform = 'translateY(0)';
      np.style.opacity = '1';
      setTimeout(() => {
        np.style.transform = '';
        np.style.opacity = '';
        np.style.transition = '';
      }, 260);
    }
  };

  handle?.addEventListener('touchstart', onTouchStart, { passive: true });
  topbar?.addEventListener('touchstart', onTouchStart, { passive: true });
  np.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });

  handle?.addEventListener('mousedown', (e) => {
    if (np.classList.contains('hidden')) return;
    startY = e.clientY;
    currentY = startY;
    startTime = Date.now();
    isDragging = true;
    np.classList.add('dragging-curtain');
    const onMouseMove = (ev) => {
      if (!isDragging) return;
      currentY = ev.clientY;
      const deltaY = currentY - startY;
      if (deltaY > 0) {
        np.style.transform = `translateY(${deltaY}px)`;
        np.style.opacity = `${Math.max(0.2, 1 - deltaY / 700)}`;
      }
    };
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      onTouchEnd();
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  });
}

/* ================= INISIALISASI APLIKASI ================= */
function initMiniplayerSwipeUpGesture() {
  const miniplayer = $('#miniplayer');
  if (!miniplayer) return;

  let startY = 0;
  let currentY = 0;
  let isDragging = false;
  let hasTriggered = false;

  const onTouchStart = (e) => {
    // ONLY PROCESS IF MINIPLAYER IS VISIBLE AND NOWPLAYING IS NOT OPEN
    if (miniplayer.classList.contains('hidden') || document.body.classList.contains('np-open')) return;
    
    // IGNORE CLICKS ON BUTTONS/INTERACTIVE ELEMENTS TO NOT BREAK PLAY/PAUSE/NEXT
    const target = e.target;
    if (target.closest('button') || target.closest('input')) return;

    const touch = e.touches ? e.touches[0] : e;
    startY = touch.clientY;
    currentY = startY;
    isDragging = true;
    hasTriggered = false;
  };

  const onTouchMove = (e) => {
    if (!isDragging) return;
    const touch = e.touches ? e.touches[0] : e;
    currentY = touch.clientY;
    const deltaY = currentY - startY;

    // IF SWIPED UP BY MORE THAN 30PX
    if (deltaY < -30 && !hasTriggered) {
      hasTriggered = true;
      openNowPlaying();
      isDragging = false;
    }
  };

  const onTouchEnd = () => {
    isDragging = false;
  };

  miniplayer.addEventListener('touchstart', onTouchStart, { passive: true });
  miniplayer.addEventListener('touchmove', onTouchMove, { passive: true });
  miniplayer.addEventListener('touchend', onTouchEnd);
  miniplayer.addEventListener('touchcancel', onTouchEnd);
}
window.addEventListener('DOMContentLoaded', () => {
  updateThemeIcon();
  setupNav();
  renderSidebarLibrary();
  bindPlayerControls();
  initNowPlayingCurtainGesture();
  initMiniplayerSwipeUpGesture();
  startPlaybackLoop();
  startSpectrumAnimation();
  window.addEventListener('hashchange', router);
  router();

  // HILANGKAN LAYAR SPLASH SECARA MULUS DAN CEPAT
  setTimeout(() => {
    const splash = $('#splash');
    if (splash) {
      splash.style.opacity = '0';
      splash.style.transition = 'opacity 0.3s ease';
      setTimeout(() => splash.remove(), 300);
    }
  }, 350);
});
