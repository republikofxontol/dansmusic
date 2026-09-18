/* DANSMUSIC — MESIN PEMUTAR AUDIO DAN SINKRONISASI LIRIK */

import {
  $, $$, esc, icon, api, fmtTime, toast, applyTint, store, Library,
  Player, COVER_PH, safeCover, openNowPlaying, closeNowPlaying,
  focusedSong, isPreviewing, currentTheme, EQ_PRESETS
} from './state.js';

export const QUALITY_RANK = ['highres', 'hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny'];
export const qualityRank = (q) => { const i = QUALITY_RANK.indexOf(q); return i < 0 ? 99 : i; };

export function bestQuality() {
  if (!Player.yt || !Player.ready || !Player.yt.getAvailableQualityLevels) return 'highres';
  const levels = Player.yt.getAvailableQualityLevels() || [];
  return QUALITY_RANK.find((q) => levels.includes(q)) || levels[0] || 'highres';
}

export function suggestedQuality() { return Player.hq ? 'highres' : 'hd720'; }

// AUDIO KEEPALIVE & MEDIA SESSION STATE SYNCHRONIZATION
let silentAudioEl = null;
export function ensureAudioKeepAlive(play = true) {
  try {
    if (!silentAudioEl) {
      silentAudioEl = document.createElement('audio');
      silentAudioEl.id = 'dansmusic-keepalive';
      silentAudioEl.setAttribute('playsinline', '');
      silentAudioEl.setAttribute('webkit-playsinline', '');
      silentAudioEl.loop = true;
      silentAudioEl.volume = 0.001;
      silentAudioEl.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
      document.body.appendChild(silentAudioEl);
    }
    if (play) {
      if (silentAudioEl.paused) silentAudioEl.play().catch(() => {});
    } else {
      if (!silentAudioEl.paused) silentAudioEl.pause();
    }
  } catch {}
}

export function updateMediaSessionState(state) {
  if ('mediaSession' in navigator) {
    try {
      const isPlaying = state === 'playing' || (document.body.classList.contains('playing') && !document.body.classList.contains('paused'));
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
      const cur = getPlaybackCurrentTime();
      const dur = getPlaybackDuration();
      if (dur > 0 && cur >= 0 && typeof navigator.mediaSession.setPositionState === 'function') {
        navigator.mediaSession.setPositionState({
          duration: Math.max(1, dur),
          playbackRate: Player.speed || 1,
          position: Math.min(cur, dur),
        });
      }
    } catch {}
  }
}

export function syncMediaSessionMetadata(s) {
  if (!s || !('mediaSession' in navigator)) return;
  try {
    const artSrc = s.hdThumbnail || s.thumbnail || (s.videoId ? `https://i.ytimg.com/vi/${s.videoId}/hqdefault.jpg` : '');
    const artwork = artSrc ? [
      { src: artSrc, sizes: '512x512', type: 'image/jpeg' },
      { src: s.thumbnail || artSrc, sizes: '256x256', type: 'image/jpeg' },
      { src: s.thumbnail || artSrc, sizes: '96x96', type: 'image/jpeg' },
    ] : [];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: s.title || 'Dansmusic',
      artist: s.artist || 'Dansmusic',
      album: 'Dansmusic',
      artwork,
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      prevTrack();
    });
    navigator.mediaSession.setActionHandler('nexttrack', () => {
      nextTrack(false);
    });
    navigator.mediaSession.setActionHandler('play', () => {
      smoothPlay();
    });
    navigator.mediaSession.setActionHandler('pause', () => {
      smoothPause();
    });
    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime != null) {
        seekAudioStream(details.seekTime);
        updateMediaSessionState(document.body.classList.contains('playing') ? 'playing' : 'paused');
      }
    });
    navigator.mediaSession.setActionHandler('seekforward', () => {
      const cur = getPlaybackCurrentTime();
      seekAudioStream(cur + 10);
    });
    navigator.mediaSession.setActionHandler('seekbackward', () => {
      const cur = getPlaybackCurrentTime();
      seekAudioStream(Math.max(0, cur - 10));
    });
    navigator.mediaSession.setActionHandler('stop', () => {
      smoothPause();
    });
  } catch (err) {
    console.warn('mediaSession setup error:', err);
  }
}

export function applyPlaybackQuality() {
  if (!Player.yt || !Player.ready) return;
  if (Player.hq) {
    const best = bestQuality();
    Player.quality = best;
    try { Player.yt.setSize(1920, 1080); } catch {}
    try { Player.yt.setPlaybackQuality(best); } catch {}
    try { Player.yt.setPlaybackQualityRange(best, best); } catch {}
  } else {
    Player.quality = 'hd720';
    try { Player.yt.setSize(720, 720); } catch {}
    try { Player.yt.setPlaybackQuality('hd720'); } catch {}
    try { Player.yt.setPlaybackQualityRange('hd720', 'hd720'); } catch {}
  }
}

export function updateQualityButton() {
  const btn = $('#np-quality');
  if (!btn) return;
  btn.classList.toggle('on', !!Player.hq);
  const span = btn.querySelector('span');
  if (span) span.textContent = Player.hq ? 'Max' : 'Normal';
  btn.title = Player.hq
    ? 'Kualitas audio: max'
    : 'Kualitas audio: normal';
  document.body.classList.toggle('hq-audio', !!Player.hq);
  syncNpMore();
}

export function toggleQuality() {
  Player.hq = !Player.hq;
  store.set('yt_hq', Player.hq);
  updateQualityButton();
  toast(Player.hq ? 'Kualitas audio: max' : 'Kualitas audio: normal');
  if (Player.cued || !Player.yt || !Player.ready || !Player.current) {
    applyPlaybackQuality();
    return;
  }
  const t = (Player.yt.getCurrentTime && Player.yt.getCurrentTime()) || 0;
  Player.yt.loadVideoById({
    videoId: Player.current.videoId,
    startSeconds: t,
    suggestedQuality: suggestedQuality(),
  });
  applyPlaybackQuality();
  setTimeout(applyPlaybackQuality, 400);
  setTimeout(applyPlaybackQuality, 1600);
}

export function displayTitle(t) {
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

export function normalizeSong(s) {
  if (!s) return s;
  return { ...s, title: displayTitle(s.title) };
}

export function songFromItem(it) {
  const artists = it.artists || [];
  const artistBrowseId = it.artistBrowseId || (artists[0] && artists[0].browseId) || '';
  const fromArr = artists.map((a) => a.name).filter(Boolean).join(', ');
  const artist = fromArr || it.artist || (/pemutaran|plays|ditonton|views/i.test(it.subtitle) ? '' : (it.subtitle || ''));
  return normalizeSong({
    videoId: it.videoId,
    title: it.title,
    artist,
    artistBrowseId,
    thumbnail: it.thumbnail,
    duration: String(it.duration || '').trim(),
    playlistId: it.playlistId,
  });
}

export function userQueueCount() {
  return Player.queue.filter((q, i) => i > Player.index && q._user).length;
}

export function alreadyQueued(videoId) {
  return Player.queue.some((q, i) => i > Player.index && q._user && q.videoId === videoId);
}

export function queueSong(song, playNext = false) {
  if (!song || !song.videoId) return;
  const s = { ...normalizeSong(song), _user: true };
  if (!Player.current) { playSong(s); return; }
  if (!playNext && alreadyQueued(song.videoId)) {
    toast('Already in your queue');
    renderQueue();
    return;
  }
  if (playNext) {
    Player.queue.splice(Player.index + 1, 0, s);
    toast('Playing next');
  } else {
    let i = Player.index + 1;
    while (i < Player.queue.length && Player.queue[i]._user) i++;
    Player.queue.splice(i, 0, s);
    toast('Added to your queue');
  }
  renderQueue();
}

export function removeQueued(i) {
  if (i === Player.index || i < 0 || i >= Player.queue.length) return;
  if (i < Player.index) Player.index--;
  Player.queue.splice(i, 1);
  renderQueue();
}

export function clearUserQueue() {
  Player.queue = Player.queue.filter((q, i) => i <= Player.index || !q._user);
  renderQueue();
  toast('Queue cleared');
}

export function moveQueued(i, dir) {
  const to = i + dir;
  if (!Number.isFinite(i) || i <= Player.index || to <= Player.index) return;
  if (to >= Player.queue.length) return;
  if (!Player.queue[i] || !Player.queue[i]._user) return;
  if (!Player.queue[to] || !Player.queue[to]._user) return;
  const [item] = Player.queue.splice(i, 1);
  Player.queue.splice(to, 0, item);
  renderQueue();
}

export function persistQueue() {
  try {
    if (!Player.queue.length) {
      localStorage.removeItem('smw_qstate');
      return;
    }
    const q = Player.queue.map((s) => ({
      videoId: s.videoId,
      title: s.title || '',
      artist: s.artist || s.subtitle || '',
      thumbnail: s.thumbnail || '',
      duration: s.duration || '',
      playlistId: s.playlistId || '',
      _user: !!s._user,
    })).filter((x) => x.videoId).slice(0, 80);
    store.set('qstate', {
      queue: q,
      index: Math.min(Math.max(0, Player.index), q.length - 1),
      shuffle: !!Player.shuffle,
      repeat: Player.repeat || 0,
      speed: Player.speed || 1,
    });
  } catch {}
}

export function restoreQueue() {
  const st = store.get('qstate', null);
  if (!st || !Array.isArray(st.queue) || !st.queue.length) return false;
  Player.queue = st.queue.map((s) => ({ ...normalizeSong(s), _user: !!s._user }));
  Player.index = Math.min(Math.max(0, Number(st.index) || 0), Player.queue.length - 1);
  Player.shuffle = !!st.shuffle;
  Player.repeat = (st.repeat === 1 || st.repeat === 2) ? st.repeat : 0;
  if (typeof st.speed === 'number' && st.speed > 0) Player.speed = st.speed;
  Player.cued = true;
  Player.pending = null;
  const s = Player.current;
  if (!s) return false;
  const loadId = ++Player.loadId;
  const tryCue = () => {
    if (loadId !== Player.loadId) return;
    if (!Player.ready) return setTimeout(tryCue, 300);
    try {
      Player.yt.cueVideoById({ videoId: s.videoId, suggestedQuality: suggestedQuality() });
      Player.yt.setPlaybackRate(Player.speed);
    } catch {}
  };
  tryCue();
  renderNowPlaying();
  renderQueue();
  updateLikeButtons();
  renderPlayButtons();
  $('#miniplayer').classList.remove('hidden');
  document.body.classList.add('has-player', 'paused');
  document.title = `${s.title} • Dansmusic`;
  applyTint(s.videoId || s.title);
  return true;
}

export function playSong(song, queue = null, index = null) {
  if (!song || !song.videoId) return;
  song = normalizeSong(song);
  Player.cued = false;
  Player.pending = null;
  if (queue) {
    Player.queue = queue.map((q) => ({ ...normalizeSong(q), _user: false }));
    let idx = index ?? queue.findIndex((q) => q.videoId === song.videoId);
    if (!Number.isFinite(idx) || idx < 0) idx = 0;
    Player.index = idx;
  } else { Player.queue = [{ ...song, _user: false }]; Player.index = 0; }
  startCurrent();
  if (!queue || queue.length <= 1) fetchQueue(song);
}

export function startCurrent() {
  Player.cued = false;
  Player.pending = null;
  const s = Player.current;
  if (!s) return;
  const loadId = ++Player.loadId;
  const tryPlay = () => {
    if (loadId !== Player.loadId) return;
    if (!Player.ready) return setTimeout(tryPlay, 300);
    try {
      Player.yt.unMute();
      Player.yt.setVolume(Player.volume ?? 100);
    } catch {}
    Player.yt.loadVideoById({ videoId: s.videoId, suggestedQuality: suggestedQuality() });
    Player.yt.setPlaybackRate(Player.speed);
    Player.yt.playVideo();
    applyPlaybackQuality();
    setTimeout(applyPlaybackQuality, 400);
    setTimeout(applyPlaybackQuality, 1600);
  };
  tryPlay();
  ensureAudioKeepAlive(true);
  updateMediaSessionState('playing');
  Library.pushHistory(s);
  Player.lyrics = { synced: null, plain: null, source: null, lines: [] };
  Player._lyricsRetried = false;
  Player._lyricsDur = 0;
  lastLyricIdx = -1;
  syncFloatLyric('');
  renderNowPlaying();
  renderQueue();
  updateLikeButtons();
  $('#miniplayer').classList.remove('hidden');
  document.body.classList.add('has-player', 'playing');
  document.body.classList.remove('paused');
  document.title = `${s.title} • Dansmusic`;
  applyTint(s.videoId || s.title);

  // AMBIL COVER ALBUM RESOLUSI TINGGI HD DARI SPOTIFY DAN ITUNES
  if (s && s.title) {
    fetch(`/api/hd-cover?title=${encodeURIComponent(s.title)}&artist=${encodeURIComponent(s.artist || '')}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.cover && Player.current && Player.current.videoId === s.videoId) {
          s.thumbnail = d.cover;
          s.hdThumbnail = d.cover;
          const npArt = $('#np-art'); if (npArt) npArt.src = d.cover;
          const miniArt = $('#mini-art'); if (miniArt) miniArt.src = d.cover;
          const fwArt = document.getElementById('fw-art'); if (fwArt) fwArt.src = d.cover;
          const npBg = $('#np-bg'); if (npBg) npBg.style.backgroundImage = `url("${d.cover}")`;
          loadPipArt(d.cover);
          syncMediaSessionMetadata(s);
        }
      })
      .catch(() => {});
  }

  syncMediaSessionMetadata(s);
  loadLyrics(s);
  loadSponsorBlock(s.videoId);
  Player.relatedBrowseId = null;
  Player.lyricsBrowseId = null;
  const relList = $('#related-list');
  if (relList) relList.innerHTML = '<div class="loading-note">Loading…</div>';
  Player._relatedLoaded = false;
}

export async function fetchQueue(song) {
  const vid = song && song.videoId;
  const loadId = Player.loadId;
  Player._queueFetching = true;
  try {
    const d = await api(`/api/next?videoId=${encodeURIComponent(song.videoId)}${song.playlistId ? `&playlistId=${encodeURIComponent(song.playlistId)}` : ''}`);
    if (Player.cued || loadId !== Player.loadId) return;
    if (!vid || !Player.current || Player.current.videoId !== vid) return;
    Player.lyricsBrowseId = d.lyricsBrowseId;
    Player.relatedBrowseId = d.relatedBrowseId;
    if (d.queue && d.queue.length > 1) {
      const current = Player.current;
      const userUpcoming = Player.queue.filter((q, i) => i > Player.index && q._user);
      const radio = d.queue
        .filter((q) => q.videoId && q.videoId !== (current && current.videoId))
        .filter((q) => !userUpcoming.some((u) => u.videoId === q.videoId))
        .map((q) => ({ ...normalizeSong(q), artist: q.artist, _user: false }));
      Player.queue = [current, ...userUpcoming, ...radio].filter(Boolean);
      Player.index = 0;
      renderQueue();
    }
    if (!Player.lyrics.synced && !Player.lyrics.plain) loadLyrics(Player.current, { silent: true });
  } catch (e) { console.warn('queue fail', e); }
  finally {
    if (loadId === Player.loadId) Player._queueFetching = false;
  }
}

export function nextTrack(auto) {
  if (Player.cued) {
    if (auto) return;
    togglePlay();
    return;
  }
  if (Player.repeat === 2 && auto) { Player.yt.seekTo(0); Player.yt.playVideo(); return; }
  if (!Player.queue.length) return;
  let ni;
  if (Player.shuffle) {
    const userNext = Player.queue.findIndex((q, i) => i > Player.index && q._user);
    if (userNext >= 0) ni = userNext;
    else {
      const others = Player.queue.map((_, i) => i).filter((i) => i !== Player.index);
      if (!others.length) {
        if (Player.repeat === 1) ni = Player.index;
        else return;
      } else ni = others[Math.floor(Math.random() * others.length)];
    }
  } else ni = Player.index + 1;
  if (ni >= Player.queue.length) {
    if (Player.repeat === 1) ni = 0;
    else return;
  }
  Player.index = ni;
  startCurrent();
}

export function prevTrack() {
  if (Player.cued) { togglePlay(); return; }
  if (Player.yt && Player.yt.getCurrentTime && Player.yt.getCurrentTime() > 4) { Player.yt.seekTo(0); return; }
  if (Player.index > 0) { Player.index--; startCurrent(); }
  else if (Player.yt) Player.yt.seekTo(0);
}

export function togglePlay() {
  if (!Player.current) return;
  if (Player.cued) {
    const s = Player.current;
    const hasRadio = Player.queue.some((q, i) => i > Player.index && !q._user);
    startCurrent();
    if (!hasRadio) fetchQueue(s);
    return;
  }
  const isAudioPlaying = eqAudioEl && !eqAudioEl.paused && !eqAudioEl.ended;
  const isYtPlaying = Player.yt && Player.ready && Player.yt.getPlayerState && Player.yt.getPlayerState() === YT.PlayerState.PLAYING;
  const isPlaying = isAudioPlaying || isYtPlaying || document.body.classList.contains('playing');

  if (isPlaying && !document.body.classList.contains('paused')) {
    smoothPause();
  } else {
    smoothPlay();
  }
}

export function playPendingSong() {
  const s = Player.pending;
  if (!s || !s.videoId) return togglePlay();
  Player.pending = null;
  const userUpcoming = Player.queue.filter((q, i) => i > Player.index && q._user);
  Player.queue = [{ ...normalizeSong(s), _user: false }, ...userUpcoming];
  Player.index = 0;
  startCurrent();
  fetchQueue(s);
}

export function toggleNowPlayingPlay() {
  if (isPreviewing()) {
    playPendingSong();
    return;
  }
  togglePlay();
}

/* ================= FUNGSI FADE OUT DAN FADE IN DI MUSIK SECARA HALUS ================= */
let fadeInterval = null;

export function smoothPause(durationMs = 260) {
  if (Player.fadeOutActive) return;
  document.body.classList.remove('playing');
  document.body.classList.add('paused');
  ensureAudioKeepAlive(false);
  updateMediaSessionState('paused');

  if (Player.yt && Player.ready) {
    try { Player.yt.pauseVideo(); } catch {}
  }
  renderPlayButtons();
  syncFloatWidget();
}

export function smoothPlay(durationMs = 200) {
  document.body.classList.add('playing');
  document.body.classList.remove('paused');
  ensureAudioKeepAlive(true);
  updateMediaSessionState('playing');

  if (Player.yt && Player.ready) {
    try {
      Player.yt.unMute();
      Player.yt.setVolume(Player.volume ?? 100);
      Player.yt.playVideo();
    } catch {}
  }

  renderPlayButtons();
  syncFloatWidget();
}

export function fadeOut(durationMs = 1500, onDone = null) {
  if (!Player.yt || !Player.ready) {
    if (onDone) onDone(100);
    return;
  }
  clearInterval(fadeInterval);
  Player.fadeOutActive = true;
  let startVol = 100;
  try { startVol = Player.yt.getVolume() || 100; } catch {}
  const steps = 16;
  const stepTime = Math.max(25, Math.floor(durationMs / steps));
  let step = 0;

  fadeInterval = setInterval(() => {
    step++;
    const fraction = Math.max(0, 1 - (step / steps));
    const newVol = Math.max(0, Math.round(startVol * fraction));
    try {
      Player.yt.setVolume(newVol);
      const miniVol = $('#mini-volume'); if (miniVol) miniVol.value = newVol;
      const npVol = $('#np-volume'); if (npVol) npVol.value = newVol;
    } catch {}

    if (step >= steps || newVol <= 0) {
      clearInterval(fadeInterval);
      Player.fadeOutActive = false;
      try { Player.yt.setVolume(0); } catch {}
      if (onDone) onDone(startVol);
    }
  }, stepTime);
}

export function fadeIn(targetVol = 100, durationMs = 1200, onDone = null) {
  if (!Player.yt || !Player.ready) {
    if (onDone) onDone();
    return;
  }
  clearInterval(fadeInterval);
  Player.fadeOutActive = true;
  try {
    Player.yt.setVolume(0);
    const miniVol = $('#mini-volume'); if (miniVol) miniVol.value = 0;
  } catch {}
  const steps = 16;
  const stepTime = Math.max(25, Math.floor(durationMs / steps));
  let step = 0;

  fadeInterval = setInterval(() => {
    step++;
    const fraction = Math.min(1, step / steps);
    const newVol = Math.min(targetVol, Math.round(targetVol * fraction));
    try {
      Player.yt.setVolume(newVol);
      const miniVol = $('#mini-volume'); if (miniVol) miniVol.value = newVol;
      const npVol = $('#np-volume'); if (npVol) npVol.value = newVol;
    } catch {}

    if (step >= steps || newVol >= targetVol) {
      clearInterval(fadeInterval);
      Player.fadeOutActive = false;
      try { Player.yt.setVolume(targetVol); } catch {}
      if (onDone) onDone();
    }
  }, stepTime);
}

export function fadeOutAndPause(durationMs = 1800) {
  if (!Player.yt || !Player.ready) return;
  const origVol = Player.yt.getVolume ? (Player.yt.getVolume() || 100) : 100;
  toast('Memudarkan volume (Fade Out)…');
  fadeOut(durationMs, () => {
    try {
      Player.yt.pauseVideo();
      Player.yt.setVolume(origVol);
      const miniVol = $('#mini-volume'); if (miniVol) miniVol.value = origVol;
      const npVol = $('#np-volume'); if (npVol) npVol.value = origVol;
    } catch {}
    toast('Musik dijeda halus');
  });
}

/* ================= WEB AUDIO API EQUALIZER ENGINE & PRESET ================= */
export let audioCtx = null;
export let eqFilters = [];
export let eqGainNode = null;
export let eqAnalyserNode = null;
export let eqAudioEl = null;
export let eqSourceNode = null;

export function initWebAudioEqualizer() {
  if (!eqAudioEl) {
    eqAudioEl = document.getElementById('dans-audio');
    if (!eqAudioEl) {
      eqAudioEl = document.createElement('audio');
      eqAudioEl.id = 'dans-audio';
      eqAudioEl.crossOrigin = 'anonymous';
      eqAudioEl.preload = 'auto';
      document.body.appendChild(eqAudioEl);
    }
  }

  if (audioCtx) {
    if (!eqSourceNode && eqAudioEl) {
      try {
        eqSourceNode = audioCtx.createMediaElementSource(eqAudioEl);
        eqSourceNode.connect(eqFilters[0]);
      } catch (err) {
        console.warn('createMediaElementSource retry:', err);
      }
    }
    return audioCtx;
  }

  try {
    const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtxClass) return null;
    audioCtx = new AudioCtxClass();

    const bandFreqs = [60, 230, 910, 3600, 14000];
    const bandTypes = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

    eqFilters = bandFreqs.map((freq, i) => {
      const f = audioCtx.createBiquadFilter();
      f.type = bandTypes[i];
      f.frequency.value = freq;
      f.Q.value = 1.0;
      f.gain.value = (Player.eqGains && Player.eqGains[i]) || 0;
      return f;
    });

    eqGainNode = audioCtx.createGain();
    const currentVol = Number($('#mini-volume')?.value || 100);
    eqGainNode.gain.value = currentVol / 100;

    eqAnalyserNode = audioCtx.createAnalyser();
    eqAnalyserNode.fftSize = 64;

    for (let i = 0; i < eqFilters.length - 1; i++) {
      eqFilters[i].connect(eqFilters[i + 1]);
    }
    eqFilters[eqFilters.length - 1].connect(eqGainNode);
    eqGainNode.connect(eqAnalyserNode);
    eqGainNode.connect(audioCtx.destination);

    if (eqAudioEl && !eqSourceNode) {
      try {
        eqSourceNode = audioCtx.createMediaElementSource(eqAudioEl);
        eqSourceNode.connect(eqFilters[0]);
      } catch (err) {
        console.warn('createMediaElementSource error:', err);
      }
    }

    return audioCtx;
  } catch (err) {
    console.warn('Web Audio API init error:', err);
    return null;
  }
}

export function getPlaybackCurrentTime() {
  if (eqAudioEl && !isNaN(eqAudioEl.currentTime) && eqAudioEl.currentTime > 0) {
    return eqAudioEl.currentTime;
  }
  if (Player.yt && Player.ready && Player.yt.getCurrentTime) {
    try {
      return Player.yt.getCurrentTime() || 0;
    } catch {}
  }
  return 0;
}

export function getPlaybackDuration() {
  if (eqAudioEl && !isNaN(eqAudioEl.duration) && eqAudioEl.duration > 0) {
    return eqAudioEl.duration;
  }
  if (Player.yt && Player.ready && Player.yt.getDuration) {
    try {
      return Player.yt.getDuration() || 0;
    } catch {}
  }
  return 0;
}

export function syncAudioStream(song) {
  if (!song || !song.videoId) return;
  initWebAudioEqualizer();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (!eqAudioEl) return;

  const streamUrl = `/api/stream?videoId=${encodeURIComponent(song.videoId)}`;
  if (eqAudioEl.dataset.videoId !== song.videoId) {
    eqAudioEl.dataset.videoId = song.videoId;
    eqAudioEl.src = streamUrl;
    eqAudioEl.currentTime = 0;
    try {
      eqAudioEl.playbackRate = Player.speed || 1;
    } catch {}
    eqAudioEl.load();

    eqAudioEl.onplaying = () => {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      applyAudioFilters();

      // BISUKAN SUARA YOUTUBE AGAR AUDIO MURNI DARI EQUALIZER WEB AUDIO API
      if (Player.yt && Player.yt.setVolume) {
        try {
          Player.yt.mute();
          Player.yt.setVolume(0);
        } catch {}
      }

      document.body.classList.add('playing');
      document.body.classList.remove('paused');
      updateMediaSessionState('playing');
      renderPlayButtons();
      syncFloatWidget();
    };

    eqAudioEl.onpause = () => {
      document.body.classList.remove('playing');
      document.body.classList.add('paused');
      updateMediaSessionState('paused');
      renderPlayButtons();
      syncFloatWidget();
    };

    eqAudioEl.onerror = () => {
      console.warn('Equalizer stream fallback to YouTube Audio');
      if (Player.yt) {
        try {
          Player.yt.unMute();
          Player.yt.setVolume(Player.volume ?? 100);
        } catch {}
      }
    };

    eqAudioEl.onended = () => {
      nextTrack(true);
    };
  }

  if (document.body.classList.contains('playing')) {
    eqAudioEl.play().catch(() => {
      if (Player.yt) {
        try {
          Player.yt.unMute();
          Player.yt.setVolume(Player.volume ?? 100);
        } catch {}
      }
    });
  }
}

export function setAudioStreamVolume(volPercent) {
  const v = Math.max(0, Math.min(1, volPercent / 100));
  if (eqAudioEl) {
    try {
      eqAudioEl.volume = v;
    } catch {}
  }
  if (Player.yt && Player.ready && Player.yt.setVolume) {
    try {
      Player.yt.setVolume(volPercent);
    } catch {}
  }
  if (eqGainNode && audioCtx) {
    try {
      eqGainNode.gain.setTargetAtTime(v, audioCtx.currentTime, 0.02);
    } catch {}
  }
}

export function pauseAudioStream() {
  if (eqAudioEl) {
    try { eqAudioEl.pause(); } catch {}
  }
}

export function resumeAudioStream() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  if (eqAudioEl) {
    try { eqAudioEl.play().catch(() => {}); } catch {}
  }
}

export function seekAudioStream(seconds) {
  if (eqAudioEl && !isNaN(eqAudioEl.duration)) {
    try {
      eqAudioEl.currentTime = seconds;
    } catch {}
  }
  if (Player.yt && Player.ready && Player.yt.seekTo) {
    try {
      Player.yt.seekTo(seconds, true);
    } catch {}
  }
}

export function syncAudioTime(currentSeconds) {
  if (eqAudioEl && !eqAudioEl.paused && Math.abs(eqAudioEl.currentTime - currentSeconds) > 1.2) {
    if (Player.yt && Player.ready && Player.yt.seekTo) {
      try {
        Player.yt.seekTo(eqAudioEl.currentTime, true);
      } catch {}
    }
  }
}

export function applyAudioFilters() {
  if (!audioCtx) initWebAudioEqualizer();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  const gains = Player.eqGains || [0, 0, 0, 0, 0];
  if (eqFilters && eqFilters.length === 5 && audioCtx) {
    gains.forEach((g, i) => {
      try {
        eqFilters[i].gain.setTargetAtTime(g, audioCtx.currentTime, 0.03);
      } catch {}
    });
  }
}

export function applyEqPreset(presetId) {
  const preset = EQ_PRESETS.find((p) => p.id === presetId) || EQ_PRESETS[0];
  Player.eqPreset = preset.id;
  Player.eqGains = [...preset.gains];
  store.set('eq_preset', preset.id);
  store.set('eq_gains', Player.eqGains);
  applyAudioFilters();
  renderEqualizerUI();
  toast(`Equalizer: ${preset.name}`);
}

let eqEventsBound = false;
export function renderEqualizerUI() {
  const grid = $('#eq-presets-grid');
  const activePill = $('#eq-active-pill');
  const soundLabel = $('#eq-sound-label');
  const desc = $('#eq-desc');

  const current = EQ_PRESETS.find((p) => p.id === Player.eqPreset) || {
    id: 'custom',
    name: 'Custom',
    desc: 'Pengaturan frekuensi manual sesuai seleramu',
  };

  if (activePill) activePill.textContent = current.name;
  if (soundLabel) soundLabel.textContent = `Profil: ${current.name}`;
  if (desc) desc.textContent = current.desc || 'Kustomisasi kurva frekuensi suara';

  // SINKRONISASI STATUS AKTIF TOMBOL PRESET TANPA MERUSAK DOM
  if (grid) {
    $$('.eq-preset-card', grid).forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.eq === Player.eqPreset);
    });
  }

  // UPDATE SLIDER NILAI
  const gains = Player.eqGains || [0, 0, 0, 0, 0];
  gains.forEach((g, idx) => {
    const slider = $(`input.eq-slider[data-band="${idx}"]`);
    const valText = $(`#eq-val-${idx}`);
    if (slider && document.activeElement !== slider) slider.value = g;
    if (valText) valText.textContent = `${g > 0 ? '+' : ''}${g}dB`;
  });

  if (!eqEventsBound) {
    eqEventsBound = true;
    if (grid) {
      $$('.eq-preset-card', grid).forEach((btn) => {
        btn.addEventListener('click', () => {
          initWebAudioEqualizer();
          applyEqPreset(btn.dataset.eq);
        });
      });
    }

    $$('input.eq-slider').forEach((sl) => {
      sl.addEventListener('input', () => {
        initWebAudioEqualizer();
        const band = Number(sl.dataset.band);
        const val = Number(sl.value);
        if (!Player.eqGains) Player.eqGains = [0, 0, 0, 0, 0];
        Player.eqGains[band] = val;
        Player.eqPreset = 'custom';
        store.set('eq_preset', 'custom');
        store.set('eq_gains', Player.eqGains);
        const valText = $(`#eq-val-${band}`);
        if (valText) valText.textContent = `${val > 0 ? '+' : ''}${val}dB`;
        if (activePill) activePill.textContent = 'Custom';
        if (soundLabel) soundLabel.textContent = 'Profil: Custom';
        if (desc) desc.textContent = 'Pengaturan frekuensi manual kustom';
        if (grid) {
          $$('.eq-preset-card', grid).forEach((b) => b.classList.remove('active'));
        }
        applyAudioFilters();
      });
    });

    $('#eq-btn-reset')?.addEventListener('click', () => {
      applyEqPreset('flat');
    });
  }
}

export async function loadSponsorBlock(videoId) {
  Player.sbSegments = [];
  try {
    const d = await api(`/api/sponsorblock?videoId=${encodeURIComponent(videoId)}`);
    Player.sbSegments = d.segments || [];
    if (Player.sbSegments.length && Player.sbEnabled) toast(`SponsorBlock: ${Player.sbSegments.length} segmen dilewati otomatis`);
  } catch {}
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
export function cycleSpeed() {
  const i = SPEEDS.indexOf(Player.speed);
  Player.speed = SPEEDS[(i + 1) % SPEEDS.length];
  if (Player.yt && Player.ready) Player.yt.setPlaybackRate(Player.speed);
  const sp = $('#np-speed span');
  if (sp) sp.textContent = Player.speed + '×';
  persistQueue();
  toast(`Kecepatan: ${Player.speed}×`);
}

export function toggleSB() {
  Player.sbEnabled = !Player.sbEnabled;
  store.set('sb_on', Player.sbEnabled);
  const sbBtn = $('#np-sb');
  if (sbBtn) sbBtn.classList.toggle('on', Player.sbEnabled);
  syncNpMore();
  toast(Player.sbEnabled ? 'SponsorBlock aktif' : 'SponsorBlock nonaktif');
}

export function syncNpMore() {
  const btn = $('#np-more');
  if (btn) btn.classList.toggle('has-on', !!(Player.floatOn || Player.sbEnabled || Player.hq));
}

/* ================= LIRIK LAGU DAN SINKRONISASI ================= */
let lyricsReqId = 0;
export async function loadLyrics(song, { silent = false } = {}) {
  if (!song) return;
  const myReq = ++lyricsReqId;
  const durationSec = (() => {
    if (Player.yt && Player.ready && Player.yt.getDuration) return Math.round(Player.yt.getDuration() || 0);
    return 0;
  })();
  Player._lyricsDur = durationSec;
  const artist = [song.artist, song.artists && song.artists[0] && song.artists[0].name, song.subtitle]
    .map((x) => String(x || '').split('•')[0].replace(/\s*-\s*topic$/i, '').trim())
    .find((x) => x && !/pemutaran|plays|ditonton|views/i.test(x)) || '';
  const title = displayTitle(song.title) || song.title;
  if (!silent && !Player.lyrics.synced && !Player.lyrics.plain) {
    const cont = $('#lyrics-container');
    if (cont) cont.innerHTML = '<div class="lyrics-empty">Looking for lyrics…</div>';
  }
  try {
    const d = await api(`/api/lyrics?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&duration=${durationSec}&browseId=${encodeURIComponent(Player.lyricsBrowseId || '')}`);
    if (myReq !== lyricsReqId) return;
    if (Player.lyrics.synced && !d.synced) return;
    Player.lyrics = { ...d, lines: d.synced ? parseLRC(d.synced) : [] };
  } catch {
    if (myReq !== lyricsReqId) return;
    if (!Player.lyrics.synced && !Player.lyrics.plain) Player.lyrics = { synced: null, plain: null, source: null, lines: [] };
  }
  renderLyrics();
}

export function maybeRetryLyrics() {
  const s = Player.current;
  if (!s || !Player.yt || !Player.ready || !Player.yt.getDuration) return;
  const dur = Math.round(Player.yt.getDuration() || 0);
  if (!dur) return;
  const noLyrics = !Player.lyrics.synced && !Player.lyrics.plain;
  const durChanged = Math.abs(dur - (Player._lyricsDur || 0)) > 2;
  if ((noLyrics || (durChanged && !Player.lyrics.synced)) && !Player._lyricsRetried) {
    Player._lyricsRetried = true;
    loadLyrics(s, { silent: true });
  }
}

export function parseLRC(lrc) {
  const lines = [];
  for (const raw of String(lrc || '').split('\n')) {
    const m = raw.match(/\[(\d+):(\d+)(?:[.:](\d+))?\](.*)/);
    if (!m) continue;
    const frac = m[3] ? Number(`0.${m[3]}`) : 0;
    lines.push({ t: parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + frac, text: (m[4] || '').trim() });
  }
  return lines.sort((a, b) => a.t - b.t);
}

export function renderLyrics() {
  const c = $('#lyrics-container');
  const src = $('#lyrics-source');
  const L = Player.lyrics;
  if (!c) return;
  if (L.lines.length) {
    c.innerHTML = L.lines.map((l, i) => `<div class="lyric-line" data-i="${i}" data-t="${l.t}">${esc(l.text) || '♪'}</div>`).join('');
    $$('.lyric-line', c).forEach((el) => el.addEventListener('click', () => { Player.yt.seekTo(parseFloat(el.dataset.t)); Player.yt.playVideo(); }));
  } else if (L.plain) {
    c.innerHTML = `<div class="lyric-plain">${esc(L.plain)}</div>`;
  } else {
    c.innerHTML = `<div class="lyrics-empty">No lyrics found for this track<br><br>
      <button class="pill-btn" id="lyrics-retry">${icon('i-repeat')}<span>Try again</span></button></div>`;
    const rb = $('#lyrics-retry', c);
    if (rb) rb.addEventListener('click', () => {
      Player._lyricsRetried = false;
      loadLyrics(Player.current);
    });
  }
  if (src) src.textContent = L.source ? `Lyrics provided by ${L.source}` : '';
  lastLyricIdx = -1;
  const npPrev = $('#np-lyric-preview');
  if (L.lines.length) {
    if (npPrev) npPrev.textContent = '';
    syncFloatLyric('');
  } else if (L.plain) {
    const first = String(L.plain).split('\n').map((x) => x.trim()).find(Boolean) || '';
    if (npPrev) npPrev.textContent = first;
    syncFloatLyric(first);
  } else {
    if (npPrev) npPrev.textContent = '';
    syncFloatLyric('');
  }
}

export let lastLyricIdx = -1;
export function updateLyricHighlight(cur) {
  const L = Player.lyrics;
  if (!L.lines.length) return;
  let idx = -1;
  for (let i = 0; i < L.lines.length; i++) { if (cur >= L.lines[i].t - 0.2) idx = i; else break; }
  if (idx === lastLyricIdx) return;
  lastLyricIdx = idx;
  const c = $('#lyrics-container');
  if (!c) return;
  $$('.lyric-line', c).forEach((el, i) => {
    el.classList.toggle('active', i === idx);
    el.classList.toggle('past', i < idx);
  });
  const active = c.querySelector('.lyric-line.active');
  const lyricsPane = $('#np-lyrics');
  if (active && lyricsPane && lyricsPane.classList.contains('active')) active.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const line = idx >= 0 ? L.lines[idx].text : '';
  const npPrev = $('#np-lyric-preview');
  if (npPrev) npPrev.textContent = line;
  syncFloatLyric(line);
}

/* ================= KAITAN PEMBARUAN TAMPILAN ANTARMUKA PENGGUNA ================= */
export let onRenderNowPlaying = () => {};
export let onRenderQueue = () => {};
export let onUpdateLikeButtons = () => {};
export let onRenderPlayButtons = () => {};

export function setUiHooks(hooks) {
  if (hooks.renderNowPlaying) onRenderNowPlaying = hooks.renderNowPlaying;
  if (hooks.renderQueue) onRenderQueue = hooks.renderQueue;
  if (hooks.updateLikeButtons) onUpdateLikeButtons = hooks.updateLikeButtons;
  if (hooks.renderPlayButtons) onRenderPlayButtons = hooks.renderPlayButtons;
}

export function renderNowPlaying() {
  onRenderNowPlaying();
}
export function renderQueue() { onRenderQueue(); }
export function updateLikeButtons() { onUpdateLikeButtons(); }
export function renderPlayButtons() { onRenderPlayButtons(); }

/* ================= SINKRONISASI ELEMEN WIDGET DAN DOKUMEN PIP ================= */
function widgetDocs() {
  const docs = [document];
  if (Player.pipWin && !Player.pipWin.closed) docs.push(Player.pipWin.document);
  return docs;
}

export function syncFloatWidget() {
  const s = Player.current;
  const playing = Player.yt && Player.ready && Player.yt.getPlayerState && Player.yt.getPlayerState() === YT.PlayerState.PLAYING;
  const ic = icon(playing ? 'i-pause' : 'i-play');
  for (const doc of widgetDocs()) {
    const art = doc.getElementById('fw-art');
    const title = doc.getElementById('fw-title');
    const artist = doc.getElementById('fw-artist');
    const play = doc.querySelector('[data-fw="play"]');
    if (art && s) art.src = safeCover(s.thumbnail) || COVER_PH;
    if (title) title.textContent = s ? s.title : '—';
    if (artist) artist.textContent = s ? (s.artist || s.subtitle || '') : '—';
    if (play) play.innerHTML = ic;
  }
  const mf = $('#mini-float'); if (mf) mf.classList.toggle('on', Player.floatOn);
  const nf = $('#np-float'); if (nf) nf.classList.toggle('on', Player.floatOn);
  syncNpMore();
  if (s && s.thumbnail) loadPipArt(s.thumbnail);
}

export function syncFloatLyric(text) {
  const t = text || '';
  for (const doc of widgetDocs()) {
    const el = doc.getElementById('fw-lyric');
    if (el) el.textContent = t;
  }
}

export function syncFloatProgress(pct) {
  for (const doc of widgetDocs()) {
    const fill = doc.getElementById('fw-fill');
    if (fill) fill.style.width = (pct || 0) + '%';
  }
}

/* ================= WIDGET MENGAMBANG DAN MODE PICTURE-IN-PICTURE ================= */
export function bindFloatWidget(rootDoc) {
  const root = rootDoc.getElementById('float-widget');
  if (!root || root._fwBound) return;
  root._fwBound = true;
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fw]');
    if (!btn) return;
    e.stopPropagation();
    const act = btn.dataset.fw;
    if (act === 'play') togglePlay();
    else if (act === 'prev') prevTrack();
    else if (act === 'next') nextTrack(false);
    else if (act === 'expand') openNowPlaying();
    else if (act === 'pip') startSystemPip();
    else if (act === 'close') closeFloatWidget();
  });
  root.querySelector('#fw-bar')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!Player.yt || !Player.ready) return;
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    const dur = Player.yt.getDuration() || 0;
    if (dur) Player.yt.seekTo(frac * dur, true);
  });
  root.querySelector('#fw-art')?.addEventListener('click', () => {
    openNowPlaying();
  });
  root.querySelector('.fw-meta')?.addEventListener('click', () => {
    openNowPlaying();
  });
  root.querySelector('#fw-lyric')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openNowPlaying();
  });
}

export function enableDrag(el) {
  if (el._fwDrag) return;
  el._fwDrag = true;
  const saved = store.get('fw_pos', null);
  if (saved && Number.isFinite(saved.l) && Number.isFinite(saved.t)) {
    el.style.left = saved.l + 'px';
    el.style.top = saved.t + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
  } else {
    el.style.right = '20px';
    el.style.bottom = '100px';
    el.style.left = 'auto';
    el.style.top = 'auto';
  }
  let drag = null;
  const down = (e) => {
    if (e.target.closest('button, .fw-bar')) return;
    const r = el.getBoundingClientRect();
    const pt = e.touches ? e.touches[0] : e;
    drag = { dx: pt.clientX - r.left, dy: pt.clientY - r.top };
    el.classList.add('dragging');
  };
  const move = (e) => {
    if (!drag) return;
    const pt = e.touches ? e.touches[0] : e;
    const x = Math.max(8, Math.min(window.innerWidth - el.offsetWidth - 8, pt.clientX - drag.dx));
    const y = Math.max(8, Math.min(window.innerHeight - el.offsetHeight - 8, pt.clientY - drag.dy));
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    if (e.cancelable) e.preventDefault();
  };
  const up = () => {
    if (!drag) return;
    drag = null;
    el.classList.remove('dragging');
    const r = el.getBoundingClientRect();
    store.set('fw_pos', { l: r.left, t: r.top });
  };
  el.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  el.addEventListener('touchstart', down, { passive: true });
  window.addEventListener('touchmove', move, { passive: false });
  window.addEventListener('touchend', up);
}

let pipArtImg = null;
let pipArtSrc = '';
function loadPipArt(url) {
  if (!url || url === pipArtSrc) return;
  pipArtSrc = url;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { pipArtImg = img; drawPipFrame(); };
  img.onerror = () => { pipArtImg = null; drawPipFrame(); };
  img.src = '/api/thumb?url=' + encodeURIComponent(url);
}

export function drawPipFrame(pct = 0) {
  const canvas = $('#pip-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const s = Player.current;
  if (s && s.thumbnail) loadPipArt(s.thumbnail);

  // LATAR BELAKANG GRADASI SPOTIFY GELAP
  const grad = ctx.createLinearGradient(0, 0, w, h);
  grad.addColorStop(0, '#020b12');
  grad.addColorStop(1, '#081d2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // LATAR BELAKANG BLUR COVER
  if (pipArtImg) {
    ctx.save();
    ctx.globalAlpha = 0.22;
    const scale = Math.max(w / pipArtImg.width, h / pipArtImg.height);
    const dw = pipArtImg.width * scale, dh = pipArtImg.height * scale;
    ctx.drawImage(pipArtImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
    ctx.restore();
    ctx.fillStyle = 'rgba(2, 11, 18, 0.72)';
    ctx.fillRect(0, 0, w, h);
  }

  // TAMPILKAN LOGO DANSMUSIC
  ctx.fillStyle = '#00f5ff';
  ctx.font = 'bold 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillText('Dansmusic', 36, 44);

  // GAMBAR COVER DENGAN RADIUS MELENGKUNG
  const artSize = 220;
  const artX = 36, artY = 64;
  if (pipArtImg) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(artX, artY, artSize, artSize, 12) : ctx.rect(artX, artY, artSize, artSize);
    ctx.clip();
    ctx.drawImage(pipArtImg, artX, artY, artSize, artSize);
    ctx.restore();
  } else {
    ctx.fillStyle = '#0d2538';
    ctx.fillRect(artX, artY, artSize, artSize);
  }

  // TEKS JUDUL LAGU DAN ARTIS
  const textX = 280;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const titleText = s ? (s.title.length > 28 ? s.title.slice(0, 26) + '…' : s.title) : 'Dansmusic';
  ctx.fillText(titleText, textX, 110);

  ctx.fillStyle = '#94a3b8';
  ctx.font = '18px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const artistText = s ? (s.artist || s.subtitle || 'Streaming lagu') : 'Musik berkualitas tinggi';
  ctx.fillText(artistText, textX, 148);

  // TAMPILKAN PREVIEW LIRIK JIKA TERSEDIA
  const curLyric = $('#fw-lyric')?.textContent || '';
  if (curLyric) {
    ctx.fillStyle = 'rgba(0, 245, 255, 0.15)';
    const lyricBoxW = w - textX - 36;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(textX, 180, lyricBoxW, 44, 8);
      ctx.fill();
    } else {
      ctx.fillRect(textX, 180, lyricBoxW, 44);
    }
    ctx.fillStyle = '#00f5ff';
    ctx.font = '500 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    const cleanLyric = curLyric.length > 36 ? curLyric.slice(0, 34) + '…' : curLyric;
    ctx.fillText('♪ ' + cleanLyric, textX + 16, 208);
  }

  // BILAH KEMAJUAN (PROGRESS BAR)
  const barY = h - 28;
  const barW = w - 72;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(36, barY, barW, 6, 3);
    ctx.fill();
  } else {
    ctx.fillRect(36, barY, barW, 6);
  }

  const fillW = Math.max(6, Math.min(barW, (pct / 100) * barW));
  ctx.fillStyle = '#00f5ff';
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(36, barY, fillW, 6, 3);
    ctx.fill();
  } else {
    ctx.fillRect(36, barY, fillW, 6);
  }
}

export async function startSystemPip() {
  const video = $('#pip-video');
  const canvas = $('#pip-canvas');
  if (!video || !canvas) return false;
  if (!document.pictureInPictureEnabled && !video.webkitSetPresentationMode) {
    toast('Browser tidak mendukung Picture-in-Picture native');
    return false;
  }
  try {
    drawPipFrame();
    if (!video.srcObject) video.srcObject = canvas.captureStream(15);
    video.muted = true;
    video.playsInline = true;
    await video.play();
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    if (video.requestPictureInPicture) await video.requestPictureInPicture();
    else if (video.webkitSetPresentationMode) video.webkitSetPresentationMode('picture-in-picture');
    else return false;
    toast('Mode Picture-in-Picture sistem aktif');
    return true;
  } catch {
    toast('Picture-in-Picture dibuka di widget layar');
    openFloatWidget();
    return false;
  }
}

export function openFloatWidget() {
  if (!Player.current) { toast('Putar lagu terlebih dahulu'); return; }
  Player.floatOn = true;
  $('#nowplaying')?.classList.add('hidden');
  document.body.classList.remove('np-open');
  document.body.classList.add('float-mode');
  const el = $('#float-widget');
  el?.classList.remove('hidden');
  enableDrag(el);
  bindFloatWidget(document);
  syncFloatWidget();
  drawPipFrame();
  toast('Widget mengambang aktif — geser untuk memindahkan');
}

export function closeFloatWidget() {
  Player.floatOn = false;
  document.body.classList.remove('float-mode');
  $('#float-widget')?.classList.add('hidden');
  if (document.pictureInPictureElement) {
    document.exitPictureInPicture().catch(() => {});
  }
  const video = $('#pip-video');
  if (video && video.webkitSetPresentationMode && video.webkitPresentationMode === 'picture-in-picture') {
    try { video.webkitSetPresentationMode('inline'); } catch {}
  }
  syncFloatWidget();
}

export function toggleFloatWidget() {
  if (Player.floatOn) closeFloatWidget();
  else openFloatWidget();
}
