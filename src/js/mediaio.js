/* ============================================================
 * Medien-Ein-/Ausgabe: Bilder dekodieren, Video-Elemente, WebM-Fix
 * ============================================================ */
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeMotion = (t) => lerp(t, smooth(t), 0.6);

function waitEvent(target, okEvents, failEvents, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      for (const e of okEvents) target.removeEventListener(e, onOk);
      for (const e of failEvents) target.removeEventListener(e, onFail);
      resolve(res);
    };
    const onOk = () => finish(true);
    const onFail = () => finish(false);
    for (const e of okEvents) target.addEventListener(e, onOk);
    for (const e of failEvents) target.addEventListener(e, onFail);
    const timer = setTimeout(() => finish(false), timeoutMs);
  });
}

/**
 * Bild dekodieren und verkleinern (EXIF-Ausrichtung übernimmt der Browser).
 * fast: für die Vorschau direkt in Zielgröße dekodieren (createImageBitmap mit Größe): kein Umweg über das
 * volle Kamerabild (48 MP ≈ 190 MB), läuft außerhalb des Hauptthreads. Der Export nutzt immer den
 * hochwertigen Weg mit schrittweiser Verkleinerung.
 */
async function decodeImage(item, maxDim, fast) {
  if (item.canvas) return item.canvas;
  if (fast && item.file && item.w && item.h && typeof createImageBitmap === 'function' && !decodeImage.noResize) {
    const sc = Math.min(1, maxDim / Math.max(item.w, item.h));
    const bw = Math.max(1, Math.round(item.w * sc)), bh = Math.max(1, Math.round(item.h * sc));
    try {
      // nur die Breite vorgeben: die Höhe ergibt sich aus dem Bild und verrät, ob die EXIF-Drehung angewandt wurde
      let bmp;
      try { bmp = await createImageBitmap(item.file, { resizeWidth: bw, resizeQuality: 'high', imageOrientation: 'from-image' }); } catch (e) {
        if (!(e && e.name === 'TypeError')) throw e;
        bmp = await createImageBitmap(item.file, { resizeWidth: bw, resizeQuality: 'high' });
      }
      if (Math.abs(bmp.height - bh) <= Math.max(2, bh * 0.01)) return bmp;
      bmp.close();
      decodeImage.noResize = true; // dieser Browser dreht hier nicht: künftig direkt den sicheren Weg
    } catch (e) {
      if (e && e.name === 'TypeError') decodeImage.noResize = true;
    }
  }
  const img = new Image();
  img.decoding = 'async';
  img.src = item.url;
  try {
    await img.decode();
  } catch (e) {
    const ok = img.complete && img.naturalWidth > 0 ? true : await waitEvent(img, ['load'], ['error'], 15000);
    if (!ok || !img.naturalWidth) throw new Error('Bild konnte nicht gelesen werden: ' + item.name);
  }
  const w = img.naturalWidth, h = img.naturalHeight;
  const sc = Math.min(1, maxDim / Math.max(w, h));
  const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
  // Starke Verkleinerung in Halbierungsschritten: sauberer als ein einzelner großer Sprung
  let src = img, sw = w, sh = h;
  const temps = [];
  while (sw / 2 >= cw * 1.05 && sh / 2 >= ch * 1.05) {
    const t = document.createElement('canvas');
    t.width = Math.round(sw / 2); t.height = Math.round(sh / 2);
    const tx = t.getContext('2d');
    tx.imageSmoothingQuality = 'high';
    tx.drawImage(src, 0, 0, t.width, t.height);
    temps.push(t);
    src = t; sw = t.width; sh = t.height;
  }
  const c = document.createElement('canvas');
  c.width = cw; c.height = ch;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, cw, ch);
  // Zwischenstufen und das volle Bild sofort freigeben (Safari hält Leinwand-Speicher sonst lange fest)
  for (const t of temps) { t.width = 0; t.height = 0; }
  img.src = '';
  return c;
}

let hiddenBox = null;
function videoBox() {
  if (!hiddenBox) {
    hiddenBox = document.createElement('div');
    hiddenBox.setAttribute('aria-hidden', 'true');
    hiddenBox.style.cssText = 'position:fixed;left:0;bottom:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1';
    document.body.appendChild(hiddenBox);
  }
  return hiddenBox;
}

function makeVideoEl() {
  const v = document.createElement('video');
  v.muted = true;
  v.defaultMuted = true;
  v.playsInline = true;
  v.setAttribute('playsinline', '');
  v.setAttribute('webkit-playsinline', '');
  v.setAttribute('muted', '');
  v.preload = 'auto';
  v.width = 2; v.height = 2;
  videoBox().appendChild(v);
  return v;
}

async function loadVideoSrc(v, url) {
  if (v._url !== url) {
    v._url = url;
    v.src = url;
    try { v.load(); } catch (e) { /* ignore */ }
  }
  if (v.readyState >= 2) return true;
  return waitEvent(v, ['loadeddata'], ['error'], 8000);
}

async function seekVideo(v, time) {
  const dur = isFinite(v.duration) ? v.duration : time + 1;
  const tt = Math.max(0, Math.min(time, Math.max(0, dur - 0.06)));
  if (Math.abs(v.currentTime - tt) < 0.015 && v.readyState >= 2) return true;
  v.currentTime = tt;
  const ok = await waitEvent(v, ['seeked'], ['error'], 4000);
  if (v.readyState < 2) await waitEvent(v, ['loadeddata', 'canplay'], ['error'], 1500);
  return ok;
}

/* ---------- WebM-Dauer nachtragen (Chrome schreibt keine) ---------- */
async function fixWebmDuration(blob, durationMs) {
  try {
    const headLen = Math.min(blob.size, 256 * 1024);
    const buf = new Uint8Array(await blob.slice(0, headLen).arrayBuffer());
    let pos = 0;
    const readId = () => {
      const b = buf[pos];
      let len = 1;
      while (len <= 4 && !(b & (0x80 >> (len - 1)))) len++;
      if (len > 4) throw new Error('id');
      let v = 0;
      for (let i = 0; i < len; i++) v = v * 256 + buf[pos + i];
      pos += len;
      return v;
    };
    const readSize = () => {
      const b = buf[pos];
      let len = 1;
      while (len <= 8 && !(b & (0x80 >> (len - 1)))) len++;
      if (len > 8) throw new Error('size');
      let v = b & (0xff >> len);
      let allOnes = v === (0xff >> len);
      for (let i = 1; i < len; i++) { v = v * 256 + buf[pos + i]; if (buf[pos + i] !== 0xff) allOnes = false; }
      const r = { value: allOnes ? -1 : v, len, at: pos };
      pos += len;
      return r;
    };
    if (readId() !== 0x1a45dfa3) return blob;
    const hs = readSize();
    pos += hs.value;
    if (readId() !== 0x18538067) return blob;
    const segSize = readSize();
    let info = null;
    while (pos < buf.length - 12) {
      const idAt = pos;
      const id = readId();
      const sz = readSize();
      if (id === 0x114d9b74) return blob; // SeekHead: Offsets würden sich verschieben
      if (id === 0x1f43b675) break;
      if (id === 0x1549a966) { info = { idAt, size: sz, dataAt: pos, end: pos + sz.value }; break; }
      if (sz.value < 0) break;
      pos += sz.value;
    }
    if (!info || info.end > buf.length) return blob;
    // Kinder von Info lesen
    pos = info.dataAt;
    let scale = 1e6, durAt = -1, durLen = 0;
    while (pos < info.end) {
      const id = readId();
      const sz = readSize();
      if (id === 0x2ad7b1) { let v = 0; for (let i = 0; i < sz.value; i++) v = v * 256 + buf[pos + i]; scale = v || 1e6; }
      if (id === 0x4489) { durAt = pos; durLen = sz.value; }
      pos += sz.value;
    }
    const durVal = (durationMs * 1e6) / scale;
    if (durAt >= 0) {
      const dv = new DataView(buf.buffer);
      if (durLen === 8) dv.setFloat64(durAt, durVal);
      else if (durLen === 4) dv.setFloat32(durAt, durVal);
      else return blob;
      return new Blob([buf, blob.slice(headLen)], { type: blob.type });
    }
    const durEl = new Uint8Array(11);
    durEl[0] = 0x44; durEl[1] = 0x89; durEl[2] = 0x88;
    new DataView(durEl.buffer).setFloat64(3, durVal);
    const newInfoSize = info.size.value + 11;
    const sizeBytes = new Uint8Array(8);
    sizeBytes[0] = 0x01;
    let v = newInfoSize;
    for (let i = 7; i >= 1; i--) { sizeBytes[i] = v % 256; v = Math.floor(v / 256); }
    const before = buf.slice(0, info.size.at);
    if (segSize.value >= 0) {
      // bekannte Segmentgröße anpassen (gleiche Länge beibehalten)
      const delta = 11 + (8 - info.size.len);
      let s = segSize.value + delta;
      const maxV = Math.pow(2, 7 * segSize.len) - 2;
      if (s > maxV) return blob;
      for (let i = segSize.len - 1; i >= 1; i--) { before[segSize.at + i] = s % 256; s = Math.floor(s / 256); }
      before[segSize.at] = (0x80 >> (segSize.len - 1)) | s;
    }
    const infoData = buf.slice(info.dataAt, info.end);
    const rest = buf.slice(info.end);
    return new Blob([before, sizeBytes, infoData, durEl, rest, blob.slice(headLen)], { type: blob.type });
  } catch (e) {
    return blob;
  }
}

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  const list = [
    'video/mp4;codecs=avc1.640028,mp4a.40.2',
    'video/mp4;codecs=avc1.4d002a,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
    'video/mp4;codecs=avc1,mp4a',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const m of list) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* weiter */ }
  }
  return '';
}

