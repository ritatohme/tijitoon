// player.js — ArtPlayer machinery for direct-video sources (mp4 / m3u8 / multi-quality mp4).
// Must load after the hls.js + artplayer CDN scripts and before show.js. show.js drives it
// via playM3u8 / playMp4 / playQualityMp4 / destroyArt, and reads the live media element
// via mediaEl() for the global keyboard shortcuts.

const video        = document.getElementById('player-video');
const artContainer = document.getElementById('art-player');

// On mobile ArtPlayer defaults to tap = show/hide controls, double-tap = play/pause.
// Flip its static flags so a single tap toggles play/pause like a desktop click (the
// big center play icon then shows while paused). Double-tap-play is turned off since
// the second tap would instantly undo the first one. Trade-off: tapping just to peek
// at the control bar also pauses — same as desktop. Must be set before any instance.
// if (typeof Artplayer === 'function') {
//   Artplayer.MOBILE_CLICK_PLAY = true;
//   Artplayer.MOBILE_DBCLICK_PLAY = false;
// }

let activeHls = null;   // hls.js instance owned by the current ArtPlayer (via art.hls)
let activeArt = null;   // ArtPlayer instance for the current direct-video source

// Read the live --lime CSS variable so the player accent tracks the theme
// (light: #c6ff3a, dark: #6b8a1e) instead of a hardcoded hex. Mid-video light/dark
// toggles are handled purely in CSS — see the --art-theme override in show.css.
function limeColor() {
  return getComputedStyle(document.documentElement)
    .getPropertyValue('--lime').trim() || '#c6ff3a';
}

function destroyArt() {
  // destroy(true) also removes the player DOM from the container and resets the
  // <video> src, so the old stream stops downloading immediately.
  if (activeArt) { activeArt.destroy(true); activeArt = null; }
  // hls is destroyed by ArtPlayer's 'destroy' hook; in the native-fallback path we
  // own it here. Tear it down either way, then clear the legacy <video>.
  if (activeHls) { try { activeHls.destroy(); } catch (_) {} activeHls = null; }
  video.src = '';
  video.style.display = 'none';
  artContainer.style.display = 'none';
}

// Force the French audio track once hls.js reports the track list, and keep it
// (some streams reset audioTrack shortly after parsing, hence the delayed re-apply —
// guarded so it can't poke an hls instance destroyed by a quick episode switch).
// The gear ▸ Audio submenu (hls-control plugin) lets the user override afterwards.
function preferFrenchAudio(hls) {
  hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
    const frTrack = hls.audioTracks.findIndex(t =>
      t.lang === 'fr' || /^fr/i.test(t.lang) || /vf|fra$|français|french/i.test(t.name)
    );
    if (frTrack !== -1) {
      hls.audioTrack = frTrack;
      setTimeout(() => { if (hls.media) hls.audioTrack = frTrack; }, 300);
    }
  });
}

// Captions are embedded in the HLS playlist (hls.js turns them on automatically),
// not attached as external files — so the hls-control plugin can't manage them.
// When a stream carries subtitle tracks, add a gear ▸ Sous-titres selector listing
// every embedded language plus "Off", mirroring the plugin's Qualité/Audio rows.
// Setting subtitleTrack and subtitleDisplay together is required — subtitleDisplay
// alone doesn't reliably toggle visibility in hls.js (video-dev/hls.js#4530).
const OFF_LABEL = 'Off';
function subtitleTrackName(t, i) {
  return (t.name || t.lang || `Piste ${i + 1}`).toUpperCase();
}
function setupSubtitleToggle(art, hls) {
  let added = false;
  const SETTING_NAME = 'hls-subtitle';

  const applyTrack = (index) => {
    // index -1 = off; otherwise select and show that language track.
    hls.subtitleTrack = index;
    hls.subtitleDisplay = index >= 0;
  };

  // Build the selector marking `activeIndex` (-1 = off) as the current/default option.
  const buildSelector = (tracks, activeIndex) => [
    { html: OFF_LABEL, value: -1, default: activeIndex < 0 },
    ...tracks.map((t, i) => ({
      html: subtitleTrackName(t, i),
      value: i,
      default: i === activeIndex,
    })),
  ];

  hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (_evt, data) => {
    const tracks = data?.subtitleTracks || hls.subtitleTracks || [];
    if (added || !tracks.length) return;
    added = true;

    // hls has *found* the tracks but may not have *activated* one yet (subtitleTrack
    // still -1). Reflect the real intended state, not a guess: if hls already picked a
    // track use it; else use the manifest's default track; else Off (-1). The
    // SUBTITLE_TRACK_SWITCH handler below then corrects the row once hls activates one.
    let initial = hls.subtitleTrack;
    if (initial < 0) {
      initial = tracks.findIndex(t => t.default || t.autoselect); // -1 if none
    }

    const selector = buildSelector(tracks, initial);
    const defaultItem = selector.find(s => s.default) || selector[0];

    art.setting.add({
      name: SETTING_NAME,
      width: 200, // match the plugin's Qualité/Audio rows so the menu aligns
      html: 'Sous-titres',
      icon: '<i class="fa-solid fa-closed-captioning"></i>',
      tooltip: defaultItem.html, // right-side value, like "FRA"/"OFF"
      selector,
      onSelect(item) {
        applyTrack(item.value);
        return item.html; // updates the row's right-side value text
      },
    });
  });

  // Keep the row's displayed value in sync with hls's actual active track — fixes the
  // row showing "Off" when hls auto-activated a track after the menu was built.
  hls.on(Hls.Events.SUBTITLE_TRACK_SWITCH, (_evt, data) => {
    if (!added) return;
    const tracks = hls.subtitleTracks || [];
    const activeIndex = typeof data?.id === 'number' ? data.id : hls.subtitleTrack;
    const selector = buildSelector(tracks, activeIndex);
    const activeItem = selector.find(s => s.default) || selector[0];
    art.setting.update({ name: SETTING_NAME, tooltip: activeItem.html, selector });
  });
}

// Multi-quality MP4 (URL-per-quality, e.g. dessinanime): add a gear ▸ Qualité selector
// that matches the HLS quality row, instead of ArtPlayer's native quality control
// (which sits in the bottom bar). switchQuality() swaps the source and carries over the
// current playback position. `quality` is [{ html, url, default }], highest-first.
function setupQualityMenu(art, quality) {
  const current = quality.find(q => q.default) || quality[0];

  art.setting.add({
    name: 'mp4-quality',
    width: 200, // match the plugin's Audio/Sous-titres rows so the menu aligns
    html: 'Qualité',
    icon: '<i class="fa-solid fa-clapperboard"></i>',
    tooltip: current.html, // right-side value, like "1080P"
    selector: quality.map(q => ({
      html: q.html,
      url: q.url,
      default: q === current,
    })),
    onSelect(item) {
      art.switchQuality(item.url);
      return item.html; // updates the row's right-side value text
    },
  });
}

// If the ArtPlayer CDN script didn't load, fall back to the legacy native <video>
// (no gear/quality menu, but the episode still plays). hls.js drives m3u8 there,
// keeping the auto-French audio preference.
function playNative(url, type) {
  artContainer.style.display = 'none';
  video.style.display = 'block';
  bindMediaSessionPosition(video);
  if (type === 'm3u8') {
    if (Hls.isSupported()) {
      const hls = new Hls();
      activeHls = hls;
      hls.loadSource(url);
      hls.attachMedia(video);
      preferFrenchAudio(hls);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    }
  } else {
    video.src = url;
  }
}

// Font Awesome icons for the built-in gear rows (Play Speed) and the hls-control
// plugin rows (Qualité/Audio), so the whole menu shares one icon family. My own rows
// (Sous-titres, MP4 Qualité) already set these directly.
const FA_GEAR_ICONS = {
  'playback-rate': 'fa-gauge-high',
  'hls-quality': 'fa-clapperboard', // same as the MP4 Qualité row, so both match
  'hls-audio': 'fa-headphones',
};

// Override an existing setting row's icon with a FA icon. Guarded by find() because
// setting.update() would otherwise ADD a phantom row if the name doesn't exist yet.
function applyFaIcon(art, name) {
  const fa = FA_GEAR_ICONS[name];
  if (!fa || !art.setting.find(name)) return;
  art.setting.update({ name, icon: `<i class="fa-solid ${fa}"></i>` });
}
function refreshBuiltinGearIcons(art) {
  Object.keys(FA_GEAR_ICONS).forEach(name => applyFaIcon(art, name));
}

// Single ArtPlayer factory for every direct-video source. `quality` (optional) is
// an array of { html, url, default } for URL-per-quality sources (dessinanime);
// `hlsControl` toggles the hls.js quality/audio gear plugin for .m3u8 streams.
function playArt({ url, type, quality, hlsControl }) {
  destroyArt();
  if (typeof Artplayer !== 'function') { playNative(url, type); return; }
  artContainer.style.display = 'block';

  const opts = {
    container: artContainer,
    url,
    type,
    setting: true,
    volume: 1, // always start at 100% (overrides ArtPlayer's 0.7 default / last-saved value)
    playbackRate: true, // play-speed control in the gear settings menu
    pip: true, // Picture-in-Picture toggle, next to the fullscreen button
    fullscreen: true,
    fullscreenWeb: false,
    playsInline: true,
    // ArtPlayer's own hotkeys only fire after the player has been clicked (art.isFocus),
    // which left Space/arrows dead — and Space scrolling the page — until then. Disabled;
    // the global keydown handler in show.js owns all shortcuts instead.
    hotkey: false,
    theme: limeColor(),
    autoSize: false,
    autoplay: false,
    plugins: [],
  };

  // Note: we deliberately do NOT use ArtPlayer's native `quality` option — it renders
  // as a separate button in the bottom bar. For a gear ▸ Qualité row that matches the
  // HLS quality menu, we build a custom setting via setupQualityMenu() after init.

  if (hlsControl && typeof artplayerPluginHlsControl === 'function') {
    opts.plugins.push(artplayerPluginHlsControl({
      quality: {
        control: false,          // keep the bottom bar clean; expose via gear only
        setting: true,
        getName: level => (level.height ? `${level.height}P` : 'Auto'),
        title: 'Qualité',
        auto: 'Auto',
      },
      audio: {
        control: false,
        setting: true,
        getName: track => track.name || track.lang || 'Audio',
        title: 'Audio',
        auto: 'Auto',
      },
    }));
  }

  opts.customType = {
    m3u8: (videoEl, src, art) => {
      if (Hls.isSupported()) {
        const hls = new Hls();
        hls.loadSource(src);
        hls.attachMedia(videoEl);
        art.hls = hls;
        activeHls = hls;
        preferFrenchAudio(hls);
        setupSubtitleToggle(art, hls);
        // The hls-control plugin builds its Qualité/Audio rows on these events; swap
        // their icons to FA just after (setTimeout lets the plugin's row-add run first).
        const faSoon = () => setTimeout(() => refreshBuiltinGearIcons(art), 0);
        hls.on(Hls.Events.MANIFEST_PARSED, faSoon);
        hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, faSoon);
        art.on('destroy', () => hls.destroy());
      } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.src = src; // Safari native HLS (no level API → no quality gear)
      }
    },
  };

  try {
    const art = new Artplayer(opts);
    activeArt = art;
    bindMediaSessionPosition(art.video);
    // When the gear panel closes, reset it to the top-level menu so reopening
    // never lands inside whatever submenu was last drilled into.
    art.on('setting', (open) => {
      if (!open) art.setting.render();
    });
    if (quality) setupQualityMenu(art, quality);
    // Play Speed exists once ready; the plugin's Qualité/Audio rows are added later
    // (on manifest parse), so re-apply then too — see the m3u8 handler.
    art.on('ready', () => refreshBuiltinGearIcons(art));
  } catch (err) {
    console.error('ArtPlayer init failed, falling back to native player', err);
    activeArt = null;
    destroyArt(); // tear down any hls the customType handler already attached
    playNative(url, type);
  }
}

function playM3u8(src) {
  playArt({ url: src, type: 'm3u8', hlsControl: true });
}

function playMp4(src) {
  playArt({ url: src, type: 'mp4' });
}

// Multi-quality MP4 (dessinanime): floralstar returns sources[] sorted highest-first.
// Rendered as a gear ▸ Qualité row (setupQualityMenu); switching swaps the source while
// ArtPlayer carries over the playback position. Defaults to the highest quality.
function playQualityMp4(sources) {
  playArt({
    url: sources[0].source,
    type: 'mp4',
    quality: sources.map((s, i) => ({
      html: (s.label || `Source ${i + 1}`).toUpperCase(),
      url: s.source,
      default: i === 0,
    })),
  });
}

// The live media element: ArtPlayer's own <video> when ArtPlayer is active, else the
// legacy <video> (native fallback path). null while an iframe embed or placeholder
// shows — keyboard shortcuts are inactive then.
function mediaEl() {
  return activeArt ? activeArt.video : (video.style.display === 'block' ? video : null);
}

// ── MEDIA SESSION (lock screen / Control Center) ────────────────────────────
// show.js announces the episode context via setMediaSessionInfo() on every
// selection; iOS/Android then show the episode + artwork with working
// play/pause/±10s/scrubber on the lock screen and in Control Center instead of
// a generic Safari entry. Metadata only — the OS never renders video there.
const MS_ARTWORK = [
  { src: 'icons/tijitoon-icon-512.png', sizes: '512x512', type: 'image/png' },
  { src: 'icons/tijitoon-icon-192.png', sizes: '192x192', type: 'image/png' },
];

function setMediaSessionInfo(title, artist) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist, artwork: MS_ARTWORK });
}

// Register the transport actions once; each handler acts on whichever media
// element is live at press time (ArtPlayer's or the native fallback's).
if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession;
  ms.setActionHandler('play',  () => mediaEl()?.play());
  ms.setActionHandler('pause', () => mediaEl()?.pause());
  ms.setActionHandler('seekbackward', (d) => {
    const m = mediaEl();
    if (m) m.currentTime = Math.max(0, m.currentTime - (d.seekOffset || 10));
  });
  ms.setActionHandler('seekforward', (d) => {
    const m = mediaEl();
    if (m) m.currentTime = Math.min(m.duration || Infinity, m.currentTime + (d.seekOffset || 10));
  });
  ms.setActionHandler('seekto', (d) => {
    const m = mediaEl();
    if (!m || d.seekTime == null) return;
    if (d.fastSeek && m.fastSeek) m.fastSeek(d.seekTime); else m.currentTime = d.seekTime;
  });
}

// Keep the lock-screen scrubber honest. The OS interpolates position while
// playing, so only discontinuities need reporting — not every timeupdate.
// WeakSet-guarded because the native-fallback <video> is reused across episodes.
const msBound = new WeakSet();
function bindMediaSessionPosition(m) {
  if (!('mediaSession' in navigator) || !navigator.mediaSession.setPositionState || msBound.has(m)) return;
  msBound.add(m);
  const update = () => {
    if (!isFinite(m.duration) || m.duration <= 0) return;
    navigator.mediaSession.setPositionState({
      duration: m.duration,
      playbackRate: m.playbackRate,
      position: Math.min(m.currentTime, m.duration),
    });
  };
  ['durationchange', 'seeked', 'ratechange', 'play', 'pause'].forEach(ev => m.addEventListener(ev, update));
}

function toggleFullscreen() {
  if (activeArt) { activeArt.fullscreen = !activeArt.fullscreen; return; }
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else if (video.requestFullscreen) {
    video.requestFullscreen();
  } else if (video.webkitEnterFullscreen) {
    video.webkitEnterFullscreen(); // iOS Safari
  }
}
