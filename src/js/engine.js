/* ============================================================
 * Engine: Vorschau (Audio-Uhr als Master), Standbild,
 * Split-Screens, exakter Offline-Export (WebCodecs), Echtzeit-Rückfall
 * ============================================================ */

const COLOR_MODE = { drop: 1, steps: 1, strobe: 1, pulse: 1, bloom: 2, sweep: 3, pop: 4 };

function srcTimeOf(c, t) {
  const tt = c.freezeAt != null ? Math.min(t, c.freezeAt) : t;
  if (c.rp) return (c.srcOffset || 0) + rampIntegral(c.rp, Math.max(c.visStart, tt)) - rampIntegral(c.rp, c.visStart);
  return (c.srcOffset || 0) + Math.max(0, tt - c.visStart) * (c.rate || 1);
}
function panelTime(c, k, t) {
  const it = c.split.items[k];
  const tt = c.freezeAt != null ? Math.min(t, c.freezeAt) : t;
  return (it.srcOffset || 0) + Math.max(0, tt - c.split.reveal[k]) * (it.rate || 1);
}

const H264_CANDIDATES = (fps, w, h) => {
  if (w * h > 2200000) return fps > 30 ? ['avc1.640034', 'avc1.4D4034'] : ['avc1.640033', 'avc1.4D4033', 'avc1.640034'];
  const big = w * h > 1280 * 720;
  const list = [];
  if (fps > 30 && big) list.push('avc1.64002A', 'avc1.4D402A', 'avc1.42E02A');
  list.push('avc1.640028', 'avc1.4D4028', 'avc1.42E028', 'avc1.640033');
  return list;
};

class Engine {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new Renderer(canvas);
    // Grafikkarte kam zurück (iOS unter Speicherdruck): alle Texturen neu aufbauen
    this.r.onRestore = () => { this.releaseAll(); if (this.plan && !this.exporting) this.renderStill(this.t); };
    this.painter = new OverlayPainter();
    this.slots = new Map();
    this.videos = [];
    this.demuxCache = new Map();
    this.imgCache = new Map();
    this.playing = false;
    this.t = 0;
    this.plan = null;
    this.media = [];
    this.audioBuffer = null;
    this.ac = null;
    this.src = null;
    this.exporting = false;
    this.selectedOverlay = null;
    this.onTime = null;
    this.onEnded = null;
    this.onState = null;
    this._raf = 0;
    this._token = 0;
    this._loop = this._loop.bind(this);
    this.size = { w: canvas.width, h: canvas.height };
  }

  /** Muss synchron in einer Nutzeraktion aufgerufen werden (iOS). */
  ensureAudio() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ac = new AC({ latencyHint: 'playback' });
      this.master = this.ac.createGain();
      this.master.connect(this.ac.destination);
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* optional */ }
    }
    if (this.ac.state !== 'running') this.ac.resume().catch(() => {});
    return this.ac;
  }

  setProject({ plan, media, audioBuffer, size }) {
    const wasPlaying = this.playing;
    const t = this.t;
    if (wasPlaying) this._stopPlayback();
    this.plan = plan;
    this.media = media;
    this.audioBuffer = audioBuffer;
    this.size = size;
    this.scale = 1;
    this._dts = [];
    this.r.resize(size.w, size.h);
    this.painter.resize(size.w, size.h);
    this.releaseAll();
    this.t = Math.min(t, Math.max(0, plan.duration - 0.05));
    return wasPlaying;
  }

  setOverlays(overlays) {
    if (this.plan) this.plan = { ...this.plan, overlays };
  }

  get bandPx() {
    const b = this.plan ? this.plan.band : [0, 1];
    return { w: this.size.w, h: Math.max(2, Math.round(this.size.h * b[1])) };
  }

  /* ---------- Ressourcen ---------- */
  /**
   * Nötige Auflösung eines Fotos: Der Bildausschnitt (Cover-Zuschnitt) muss mindestens so groß sein
   * wie das Ausgabebild, plus Reserve für Kamerafahrten und Zooms. Sonst würde hochskaliert.
   */
  imageDim(m) {
    const bp = this.bandPx;
    const sw = m.w || 0, sh = m.h || 0;
    const cap = 4096; // Grenze für Canvas- und Texturgröße auf iPhones
    if (!sw || !sh) return Math.min(cap, Math.round(Math.max(bp.w, bp.h) * 1.6));
    const cover = Math.max(bp.w / sw, bp.h / sh);
    return Math.min(cap, Math.max(sw, sh), Math.round(Math.max(sw, sh) * cover * 1.35));
  }

  async getImage(m, maxDimOverride) {
    const maxDim = maxDimOverride || this.imageDim(m);
    const key = m.id + '@' + maxDim;
    if (this.imgCache.has(key)) {
      const v = this.imgCache.get(key);
      this.imgCache.delete(key);
      this.imgCache.set(key, v);
      return v;
    }
    // Vorschau: direkt verkleinert dekodieren (spart Speicher); Export: volle Qualität
    const p = decodeImage(m, maxDim, !this.exporting);
    this.imgCache.set(key, p);
    try {
      const c = await p;
      if (this.imgCache.get(key) === p) this.imgCache.set(key, c);
      // Zwischenspeicher nach Speicherbedarf begrenzen (etwa 160 MB dekodierte Bilder)
      let px = 0;
      for (const v of this.imgCache.values()) if (v && v.width) px += v.width * v.height;
      // Vorschau: etwa 50 MB dekodierte Bilder, Export (größere Bilder): etwa 110 MB
      const budget = this.exporting ? 28e6 : 12e6;
      while (px > budget && this.imgCache.size > 2) {
        const k0 = this.imgCache.keys().next().value, v0 = this.imgCache.get(k0);
        if (v0 && v0.width) px -= v0.width * v0.height;
        this.imgCache.delete(k0);
        // nur freigeben, wenn kein Raster/Filmstreifen es gerade zeichnet
        if (v0 && v0.close && ![...this.slots.values()].some((sl) => (sl.grid || sl.strip || []).includes(v0))) { try { v0.close(); } catch (e) { /* ignore */ } }
      }
      return c;
    } catch (e) {
      this.imgCache.delete(key);
      throw e;
    }
  }

  acquireVideo(url) {
    let v = this.videos.find((x) => !x._busy && x._url === url) || this.videos.find((x) => !x._busy);
    if (!v) { v = makeVideoEl(); this.videos.push(v); }
    v._busy = true;
    return v;
  }

  releaseVideo(v) {
    if (!v) return;
    try { v.pause(); } catch (e) { /* ignore */ }
    v._busy = false;
    const free = this.videos.filter((x) => !x._busy);
    if (free.length > 2) {
      const drop = free[0];
      drop.removeAttribute('src');
      drop._url = null;
      try { drop.load(); } catch (e) { /* ignore */ }
      drop.remove();
      this.videos.splice(this.videos.indexOf(drop), 1);
    }
  }

  releaseSlot(k) {
    const s = this.slots.get(k);
    if (!s) return;
    s.dead = true;
    this.r.deleteTexture(s.tex);
    this.releaseVideo(s.video);
    if (s.fr) { s.fr.close(); s.fr = null; }
    if (s.panels) for (const p of s.panels) this.releaseVideo(p.video);
    // eigene Leinwände sofort freigeben (Safari gibt Leinwand-Speicher sonst erst spät frei und hat dafür ein Limit)
    for (const cv of [s.canvas, s.pv, s.stackBg]) if (cv) { cv.width = 0; cv.height = 0; }
    s.canvas = s.pv = s.stackBg = null;
    this.slots.delete(k);
  }

  releaseAll() {
    for (const k of Array.from(this.slots.keys())) this.releaseSlot(k);
  }

  /** Im Hintergrund Speicher abgeben (Texturen, Videos, Bildcache), damit iOS die App nicht verwirft. */
  trim() {
    this.pause();
    this.releaseAll();
    for (const v of this.imgCache.values()) if (v && v.close) { try { v.close(); } catch (e) { /* ignore */ } }
    this.imgCache.clear();
  }

  prepareSlot(clip, t) {
    let s = this.slots.get(clip.i);
    if (s) return s;
    s = { clip, tex: null, video: null, ready: false, dead: false, failed: false, lastUpload: -1, frozen: false };
    this.slots.set(clip.i, s);
    s.promise = (clip.grid ? this._prepareGrid(s) : clip.strip ? this._prepareStrip(s) : clip.stack ? this._prepareStack(s) : clip.split ? this._prepareSplit(s, t) : this._prepare(s, t)).catch((e) => {
      s.failed = true;
      s.ready = true;
      if (!s.dead) console.warn(e);
    });
    return s;
  }

  async _prepare(s, t) {
    const clip = s.clip;
    const m = this.media[clip.mediaIndex];
    if (!m) { s.ready = true; return; }
    if (m.kind === 'image') {
      const img = await this.getImage(m);
      if (s.dead) return;
      s.tex = this.r.createTexture();
      if (!this.r.upload(s.tex, img)) throw new Error('Upload fehlgeschlagen');
      s.srcW = img.width; s.srcH = img.height;
      s.ready = true;
      return;
    }
    if (this.offline && m.file && await this._openReader(s, m)) return;
    if (s.dead) return;
    const v = this.acquireVideo(m.url);
    s.video = v;
    const ok = await loadVideoSrc(v, m.url);
    if (s.dead) return;
    s.tex = this.r.createTexture();
    if (m.poster) this.r.upload(s.tex, m.poster);
    s.srcW = m.w; s.srcH = m.h;
    // nicht aufgeben: ohne Daten zeigt der Platz kurz das Vorschaubild, beim Abspielen lädt das Video nach
    if (!ok) { s.ready = true; if (v.error) s.failed = true; return; }
    await seekVideo(v, srcTimeOf(clip, Math.max(t, clip.visStart)));
    if (s.dead) return;
    s.srcW = v.videoWidth || m.w; s.srcH = v.videoHeight || m.h;
    if (v.readyState >= 2) this.r.upload(s.tex, v);
    s.ready = true;
  }

  /** Export: Bilder direkt aus der Datei dekodieren (WebCodecs) statt das Video-Element zu spulen. */
  async _openReader(s, m) {
    if (typeof VideoDecoder === 'undefined' || m.fastBad) return false;
    try {
      if (!this.demuxCache.has(m.id)) this.demuxCache.set(m.id, demuxVideo(m.file).catch(() => null));
      const track = await this.demuxCache.get(m.id);
      if (!track || s.dead) return false;
      const fr = await FrameReader.open(track);
      if (!fr) return false;
      if (s.dead) { fr.close(); return false; }
      const cv = await fr.canvasAt(srcTimeOf(s.clip, s.clip.visStart));
      if (!cv || s.dead) { fr.close(); return false; }
      s.fr = fr;
      s.tex = this.r.createTexture();
      this.r.upload(s.tex, cv);
      s.srcW = cv.width; s.srcH = cv.height;
      s.ready = true;
      return true;
    } catch (e) {
      console.warn('Schneller Export nicht möglich, nutze Video-Element', e);
      m.fastBad = true;
      if (s.fr) { s.fr.close(); s.fr = null; }
      return false;
    }
  }

  /* ---------- 9er-Raster ---------- */
  async _prepareGrid(s) {
    const g = s.clip.grid;
    const bp = this.bandPx;
    s.canvas = document.createElement('canvas');
    s.canvas.width = bp.w; s.canvas.height = bp.h;
    s.srcW = bp.w; s.srcH = bp.h;
    s.grid = new Array(g.items.length);
    const small = Math.min(1400, Math.round(Math.max(bp.w, bp.h) * 0.7));
    await Promise.all(g.items.map(async (it, k) => {
      const m = this.media[it.mediaIndex];
      if (!m) return;
      // Zielbild in voller Auflösung: es füllt am Ende des Zooms das ganze Bild
      if (m.kind === 'image') s.grid[k] = await this.getImage(m, k === g.target ? undefined : small);
      else s.grid[k] = m.poster || null;
    }));
    if (s.dead) return;
    s.tex = this.r.createTexture();
    this.composeGrid(s, 0);
    s.ready = true;
  }

  composeGrid(s, t) {
    const c = s.clip, g = c.grid, cv = s.canvas;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, n = g.n;
    // Loop-Ende: zurück ins schwarzweiße Raster
    const tt = c.loop ? -1 : t;
    const gx = W * 0.007, gy = H * 0.007;
    const cw = (W - gx * (n + 1)) / n, ch = (H - gy * (n + 1)) / n;
    const cellX = (k) => gx + (k % n) * (cw + gx), cellY = (k) => gy + Math.floor(k / n) * (ch + gy);
    // Zoom: Zielzelle wächst geometrisch auf Vollbild
    const zp = clamp01((tt - g.zoomStart) / Math.max(0.05, g.zoomEnd - g.zoomStart));
    const ez = zp < 0.5 ? 4 * zp * zp * zp : 1 - Math.pow(-2 * zp + 2, 3) / 2;
    const Sfin = W / cw;
    const breathe = 1 + 0.025 * clamp01(tt / Math.max(0.1, g.zoomStart));
    const S = breathe * Math.pow(Sfin / breathe, ez);
    const tx0 = cellX(g.target), ty0 = cellY(g.target);
    // Punkt der Zielzelle, der fix bleibt, so gewählt, dass die Zelle am Ende exakt das Bild füllt
    const f = (S - breathe) / Math.max(1e-6, Sfin - breathe);
    const ax = lerp(W / 2, tx0 + (tx0 * cw) / Math.max(1e-6, W - cw), f), ay = lerp(H / 2, ty0 + (ty0 * ch) / Math.max(1e-6, H - ch), f);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    ctx.setTransform(S, 0, 0, S, ax - ax * S, ay - ay * S);
    for (let k = 0; k < g.items.length; k++) {
      const src = s.grid[k];
      const x = cellX(k), y = cellY(k);
      // unsichtbare Zellen während des Zooms überspringen
      const X0 = x * S + ax - ax * S, Y0 = y * S + ay - ay * S;
      if (X0 > W || Y0 > H || X0 + cw * S < 0 || Y0 + ch * S < 0) continue;
      if (!src) { ctx.fillStyle = '#10151e'; ctx.fillRect(x, y, cw, ch); continue; }
      const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
      if (!sw || !sh) continue;
      const cp = easeOutCubic(clamp01((tt - g.colorAt[k]) / 0.4));
      const bump = k === g.target ? 1 : 1 + 0.035 * Math.sin(Math.PI * clamp01((tt - g.colorAt[k]) / 0.45));
      const sc = Math.max(cw / sw, ch / sh) * 1.0;
      const vw = cw / sc / bump, vh = ch / sc / bump;
      const fo = k === g.target ? [0.5, 0.5] : g.items[k].focus || [0.5, 0.45];
      const sx = Math.max(0, Math.min(sw - vw, fo[0] * sw - vw / 2));
      const sy = Math.max(0, Math.min(sh - vh, fo[1] * sh - vh / 2));
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, cw, ch);
      ctx.clip();
      ctx.drawImage(src, sx, sy, vw, vh, x, y, cw, ch);
      if (cp < 1) {
        // Schwarzweiß über Mischmodus „Sättigung“: kein Zusatzspeicher, stufenlos
        ctx.globalCompositeOperation = 'saturation';
        ctx.globalAlpha = 1 - cp;
        ctx.fillStyle = '#808080';
        ctx.fillRect(x, y, cw, ch);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = (1 - cp) * 0.12;
        ctx.fillStyle = '#000';
        ctx.fillRect(x, y, cw, ch);
      }
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    this.r.upload(s.tex, cv);
  }

  /* ---------- Film-Strip-Ende ---------- */
  async _prepareStrip(s) {
    const st = s.clip.strip;
    const bp = this.bandPx;
    s.canvas = document.createElement('canvas');
    s.canvas.width = bp.w; s.canvas.height = bp.h;
    s.srcW = bp.w; s.srcH = bp.h;
    s.strip = new Array(st.items.length);
    const small = Math.min(1600, Math.round(Math.max(bp.w, bp.h) * 0.8));
    await Promise.all(st.items.map(async (it, k) => {
      const m = this.media[it.mediaIndex];
      if (!m) return;
      if (m.kind === 'image') s.strip[k] = await this.getImage(m, k === 0 ? undefined : small);
      else s.strip[k] = m.poster || null;
    }));
    if (s.dead) return;
    s.tex = this.r.createTexture();
    this.composeStrip(s, s.clip.visStart);
    s.ready = true;
  }

  composeStrip(s, t) {
    const c = s.clip, st = c.strip, cv = s.canvas;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const vert = H >= W;
    const u = clamp01((t - c.start) / Math.max(0.1, c.end - c.start));
    // 0 … 0,22: aus dem Vollbild herauszoomen; danach läuft der Streifen gebremst weiter
    const zu = clamp01(u / 0.22), ez = zu * zu * (3 - 2 * zu);
    const k = 0.58;
    const fw = W * k, fh = H * k;
    const gap = (vert ? fh : fw) * 0.06;
    const side = (vert ? fw : fh) * 0.16;
    const pitch = (vert ? fh : fw) + gap;
    const n = st.items.length;
    const su = clamp01((u - 0.12) / 0.88);
    const scroll = (1 - Math.pow(1 - su, 2.2)) * pitch * Math.min(n - 1, 3.2);
    const S = lerp(1 / k, 1, ez);
    const rot = lerp(0, vert ? -0.07 : -0.05, ez);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const bg = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2);
    bg.addColorStop(0, '#1a1712'); bg.addColorStop(1, '#07090d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.rotate(rot);
    ctx.scale(S, S);
    // Streifen: Bild 0 in der Mitte, frühere Bilder folgen (vertikal nach oben, quer nach links)
    const len = pitch * (n + 2);
    const base = '#15120e';
    ctx.fillStyle = base;
    if (vert) ctx.fillRect(-fw / 2 - side, -len + fh / 2 + scroll + pitch, fw + side * 2, len + pitch * 2);
    else ctx.fillRect(-len + fw / 2 + scroll + pitch, -fh / 2 - side, len + pitch * 2, fh + side * 2);
    // Perforation
    const hole = side * 0.42, hr = hole * 0.22;
    ctx.fillStyle = 'rgba(236,228,212,0.9)';
    const holes = Math.ceil(len / (hole * 1.9));
    for (let i = -2; i < holes; i++) {
      const p = -i * hole * 1.9 + (scroll % (hole * 1.9)) + pitch;
      for (const sd of [-1, 1]) {
        const a = sd * (vert ? fw / 2 + side / 2 : fh / 2 + side / 2);
        ctx.beginPath();
        const rr = (ctx.roundRect || ctx.rect).bind(ctx);
        if (vert) rr(a - hole * 0.35, p - hole / 2, hole * 0.7, hole, hr);
        else rr(p - hole / 2, a - hole * 0.35, hole, hole * 0.7, hr);
        ctx.fill();
      }
    }
    // Einzelbilder mit Randbeschriftung
    ctx.imageSmoothingQuality = 'high';
    ctx.font = `600 ${side * 0.26}px ${OV_FONTS.mono}`;
    ctx.textBaseline = 'middle';
    for (let i = 0; i < n; i++) {
      const off = -i * pitch + scroll;
      const x = vert ? -fw / 2 : -fw / 2 + off, y = vert ? -fh / 2 + off : -fh / 2;
      if (vert ? y > H / S + fh || y + fh < -H / S - fh : x > W / S + fw || x + fw < -W / S - fw) continue;
      const src = s.strip[i];
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, fw, fh); ctx.clip();
      if (src) {
        const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
        const sc = Math.max(fw / sw, fh / sh);
        const vw = fw / sc, vh = fh / sc;
        const fo = st.items[i].focus || [0.5, 0.45];
        const sx = Math.max(0, Math.min(sw - vw, fo[0] * sw - vw / 2)), sy = Math.max(0, Math.min(sh - vh, fo[1] * sh - vh / 2));
        ctx.drawImage(src, sx, sy, vw, vh, x, y, fw, fh);
      } else { ctx.fillStyle = '#10151e'; ctx.fillRect(x, y, fw, fh); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,150,60,0.85)';
      const label = `${String(n - i).padStart(2, '0')}A  ▸`;
      if (vert) { ctx.save(); ctx.translate(x - side * 0.12, y + fh * 0.12); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'right'; ctx.fillText(label, 0, 0); ctx.restore(); }
      else { ctx.textAlign = 'left'; ctx.fillText(label, x + fw * 0.04, y - side * 0.12); }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.r.upload(s.tex, cv);
  }

  /* ---------- Polaroid-Stapel ---------- */
  async _prepareStack(s) {
    const st = s.clip.stack;
    const bp = this.bandPx;
    s.canvas = document.createElement('canvas');
    s.canvas.width = bp.w; s.canvas.height = bp.h;
    s.srcW = bp.w; s.srcH = bp.h;
    s.stack = new Array(st.items.length);
    const small = Math.min(1400, Math.round(Math.max(bp.w, bp.h) * 0.75));
    await Promise.all(st.items.map(async (it, k) => {
      const m = this.media[it.mediaIndex];
      if (!m) return;
      s.stack[k] = m.kind === 'image' ? await this.getImage(m, small) : m.poster || null;
    }));
    if (s.dead) return;
    // Hintergrund einmal vorbereiten: erstes Bild stark verkleinert (= weich), abgedunkelt
    const src0 = s.stack.find(Boolean);
    const bg = document.createElement('canvas');
    bg.width = Math.max(8, Math.round(bp.w / 24)); bg.height = Math.max(8, Math.round(bp.h / 24));
    const bx = bg.getContext('2d');
    bx.fillStyle = '#0b0d11'; bx.fillRect(0, 0, bg.width, bg.height);
    if (src0) {
      const sw = src0.videoWidth || src0.width, sh = src0.videoHeight || src0.height;
      const sc = Math.max(bg.width / sw, bg.height / sh);
      bx.drawImage(src0, (bg.width - sw * sc) / 2, (bg.height - sh * sc) / 2, sw * sc, sh * sc);
    }
    bx.fillStyle = 'rgba(9,11,15,0.58)'; bx.fillRect(0, 0, bg.width, bg.height);
    s.stackBg = bg;
    s.tex = this.r.createTexture();
    this.composeStack(s, s.clip.visStart);
    s.ready = true;
  }

  composeStack(s, t) {
    const c = s.clip, st = c.stack, cv = s.canvas;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const u = clamp01((t - c.start) / Math.max(0.1, c.end - c.start));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s.stackBg, 0, 0, W, H);
    // der ganze Stapel wächst ruhig, die Abzüge landen jeweils genau auf dem Beat
    const Z = 1 + 0.04 * smooth(u);
    ctx.translate(W / 2, H / 2);
    ctx.scale(Z, Z);
    const short = Math.min(W, H);
    const pw = H >= W ? W * 0.6 : short * 0.62 * 0.86;
    const iw = pw * 0.91, ih = iw / 0.86;
    const side = (pw - iw) / 2, ph = ih + side + pw * 0.14;
    const fall = st.fall || 0.3;
    const n = st.items.length;
    for (let k = 0; k < n; k++) {
      const land = st.times[k];
      const pr = clamp01((t - (land - fall)) / fall);
      if (pr <= 0) continue;
      const e = 1 - Math.pow(1 - pr, 3);
      const later = st.times.filter((x, j) => j > k && t >= x).length;
      ctx.save();
      const [ox, oy] = st.offs[k];
      ctx.translate(ox * W * 0.5, oy * H * 0.5 - (1 - e) * H * 0.34);
      ctx.rotate(st.rots[k] + (1 - e) * 0.14 * (k % 2 ? -1 : 1));
      const sc = 1 + 0.16 * (1 - e);
      ctx.scale(sc, sc);
      ctx.globalAlpha = clamp01(pr / 0.3);
      ctx.shadowColor = 'rgba(0,0,0,0.42)';
      ctx.shadowBlur = short * (0.018 + 0.03 * (1 - e));
      ctx.shadowOffsetY = short * (0.008 + 0.03 * (1 - e));
      ctx.fillStyle = '#f3f1ec';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.shadowColor = 'transparent';
      const src = s.stack[k];
      const x = -iw / 2, y = -ph / 2 + side;
      if (src) {
        const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
        const f = Math.max(iw / sw, ih / sh);
        const vw = iw / f, vh = ih / f;
        const fo = st.items[k].focus || [0.5, 0.45];
        const sx = Math.max(0, Math.min(sw - vw, fo[0] * sw - vw / 2)), sy = Math.max(0, Math.min(sh - vh, fo[1] * sh - vh / 2));
        ctx.drawImage(src, sx, sy, vw, vh, x, y, iw, ih);
      } else { ctx.fillStyle = '#1a1f28'; ctx.fillRect(x, y, iw, ih); }
      // darunterliegende Abzüge treten leicht zurück
      if (later) { ctx.globalAlpha = Math.min(0.28, later * 0.12); ctx.fillStyle = '#05070a'; ctx.fillRect(-pw / 2, -ph / 2, pw, ph); }
      ctx.restore();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.r.upload(s.tex, cv);
  }

  /* ---------- Split-Screen ---------- */
  async _prepareSplit(s, t) {
    const c = s.clip;
    const bp = this.bandPx;
    s.canvas = document.createElement('canvas');
    s.canvas.width = bp.w; s.canvas.height = bp.h;
    s.srcW = bp.w; s.srcH = bp.h;
    s.panels = [];
    const maxDim = Math.min(1600, Math.round(Math.max(bp.w, bp.h) * 0.9));
    await Promise.all(c.split.items.map(async (it, k) => {
      const m = this.media[it.mediaIndex];
      const p = { m, item: it, img: null, video: null, lastUpload: -1 };
      s.panels[k] = p;
      if (!m) return;
      if (m.kind === 'image') { p.img = await this.getImage(m, maxDim); return; }
      p.video = this.acquireVideo(m.url);
      const ok = await loadVideoSrc(p.video, m.url);
      if (!ok) { p.img = m.poster || null; this.releaseVideo(p.video); p.video = null; return; }
      await seekVideo(p.video, panelTime(c, k, Math.max(t, c.split.reveal[k])));
    }));
    if (s.dead) return;
    s.tex = this.r.createTexture();
    this.composeSplit(s, t);
    s.ready = true;
  }

  composeSplit(s, t) {
    const c = s.clip, cv = s.canvas;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height;
    const n = s.panels.length;
    const gap = Math.max(2, Math.round(Math.min(W, H) * 0.012));
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingQuality = 'high';
    const stack = c.split.orient === 'stack';
    const pw = stack ? W : (W - gap * (n - 1)) / n;
    const ph = stack ? (H - gap * (n - 1)) / n : H;
    for (let k = 0; k < n; k++) {
      const p = s.panels[k];
      if (!p || !p.m) continue;
      const r = c.split.reveal[k];
      const q = (t - r) / 0.5;
      const e = q <= 0 ? 0 : 1 - Math.pow(1 - Math.min(1, q), 3);
      const x = stack ? 0 : k * (pw + gap), y = stack ? k * (ph + gap) : 0;
      const src = p.video && p.video.readyState >= 2 ? p.video : p.img || p.m.poster;
      if (!src) continue;
      const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
      if (!sw || !sh) continue;
      // Noch nicht aufgedeckte Felder zeigen ihr Bild gedämpft vorab: nie ein schwarzes Feld
      if (e < 1) {
        const sc0 = Math.max(pw / sw, ph / sh) * 1.12;
        ctx.globalAlpha = 0.22;
        ctx.drawImage(src, (sw - pw / sc0) / 2, (sh - ph / sc0) / 2, pw / sc0, ph / sc0, x, y, pw, ph);
        ctx.globalAlpha = 1;
      }
      if (e <= 0) continue;
      // Aufdecken von der Mitte aus
      ctx.save();
      ctx.beginPath();
      if (stack) ctx.rect(x, y + (ph * (1 - e)) / 2, pw, ph * e);
      else ctx.rect(x + (pw * (1 - e)) / 2, y, pw * e, ph);
      ctx.clip();
      const life = Math.min(1, Math.max(0, (t - r) / Math.max(0.5, c.visEnd - r)));
      const zoom = 1.12 - 0.07 * life - 0.05 * (1 - e);
      const scale = Math.max(pw / sw, ph / sh) * zoom;
      const vw = pw / scale, vh = ph / scale;
      const f = p.item.focus || [0.5, 0.45];
      const sx = Math.max(0, Math.min(sw - vw, f[0] * sw - vw / 2));
      const sy = Math.max(0, Math.min(sh - vh, f[1] * sh - vh / 2));
      ctx.drawImage(src, sx, sy, vw, vh, x, y, pw, ph);
      ctx.restore();
    }
    this.r.upload(s.tex, cv);
  }

  ensureWindow(t, lookahead) {
    const clips = this.plan.clips;
    const needed = new Set();
    let i = Math.max(0, clipIndexAt(clips, t) - 1);
    for (; i < clips.length; i++) {
      const c = clips[i];
      if (c.visStart > t + lookahead) break;
      if (c.visEnd > t - 0.02 && c.visStart <= t + lookahead) needed.add(i);
    }
    const last = clips[clips.length - 1];
    if (last && last.loop && last.visStart <= t + lookahead) needed.add(clips.length - 1);
    // Echo braucht das vorige Bild noch kurz nach dem Schnitt
    for (const k of Array.from(needed)) {
      const c = clips[k];
      if (c.echo && t < c.start + c.echo.dur && c.start <= t + lookahead) needed.add(clips.findIndex((x) => x.i === c.echo.from));
      // Mehrfachbelichtung: das darübergelegte (nächste) Bild muss schon geladen sein
      if (c.layer) needed.add(clips.findIndex((x) => x.i === c.layer.from));
    }
    needed.delete(-1);
    for (const k of Array.from(this.slots.keys())) if (!needed.has(k)) this.releaseSlot(k);
    for (const k of needed) this.prepareSlot(clips[k], t);
    return needed;
  }

  /* ---------- Bildaufbau ---------- */
  fxState(t) {
    const st = { zoom: 1, soft: 0, flash: 0, black: 0, dim: 0, desat: 0 };
    for (const f of this.plan.fx) {
      if (t < f.start || t >= f.end) continue;
      const p = clamp01((t - f.start) / Math.max(0.001, f.end - f.start));
      let a = f.amp || 1;
      if (f.fadeIn) a *= smooth(clamp01((t - f.start) / f.fadeIn));
      if (f.fadeOut) a *= smooth(clamp01((f.end - t) / f.fadeOut));
      if (f.type === 'focus') st.soft += 4.5 * a * (1 - smooth(p));
      else if (f.type === 'blur') st.soft += 3.2 * a;
      else if (f.type === 'punch') st.zoom *= 1 + 0.05 * a * Math.pow(1 - p, 3);
      else if (f.type === 'flash') st.flash = Math.max(st.flash, a * (1 - p) * (1 - p));
      else if (f.type === 'black') st.black = Math.max(st.black, a);
      else if (f.type === 'dim') st.dim = Math.max(st.dim, a);
      else if (f.type === 'desat') st.desat = Math.max(st.desat, a);
      else if (f.type === 'mirror') st.mirror = Math.max(st.mirror || 0, a * smooth(clamp01((t - f.start) / 0.06)) * smooth(clamp01((f.end - t) / 0.06)));
    }
    return st;
  }

  layerParams(slot, t, fx, extra) {
    const c = slot.clip;
    if (!slot.ready || !slot.tex) return null;
    const bp = this.bandPx;
    const outA = bp.w / bp.h;
    const sw = slot.srcW || bp.w, sh = slot.srcH || bp.h;
    const srcA = sw / sh;
    const tt = c.freezeAt != null ? Math.min(t, c.freezeAt) : t;
    const u = clamp01((tt - c.visStart) / Math.max(0.001, c.visEnd - c.visStart));
    // weiche Tempo-Rampe: vor dem Drop beschleunigt die Fahrt, auf dem Einsatz setzt sie schwungvoll ein und läuft aus
    const e = c.ease === 'in' ? 0.45 * u + 0.55 * u * u * u : c.ease === 'out' ? 1 - Math.pow(1 - u, 2.6) : easeMotion(u);
    const mo = c.motion || { from: { s: 1, x: 0, y: 0 }, to: { s: 1, x: 0, y: 0 } };
    const s = lerp(mo.from.s, mo.to.s, e) * extra.zoom * fx.zoom;
    const x = lerp(mo.from.x, mo.to.x, e), y = lerp(mo.from.y, mo.to.y, e);
    let fw, fh;
    if (srcA > outA) { fw = outA / srcA; fh = 1; } else { fw = 1; fh = srcA / outA; }
    const geo = [0, fx.soft + (extra.soft || 0), 0, 0];
    const blur = extra.blur || [0, 0, 0];
    const corr = c.split ? [1, 1, 1] : c.corr || [1, 1, 1];
    if (c.contain) {
      const bw = srcA > outA ? 1 : srcA / outA;
      const bh = srcA > outA ? outA / srcA : 1;
      return { tex: slot.tex, xf: [fw / 1.15, fh / 1.15, 0.5, 0.5], box: [1, bw * s, bh * s], blur, geo, corr };
    }
    fw /= s; fh /= s;
    let cx = 0.5 + (x * (1 - fw)) / 2 + (extra.shiftX || 0) * fw;
    let cy = 0.5 + (y * (1 - fh)) / 2 + (extra.shiftY || 0) * fh;
    const m = this.media[c.mediaIndex];
    const mf = (m && m.focus) || [0.5, 0.45];
    if (extra.pull) {
      // Bild-aus-Bild: Ausschnitt wandert zum Motiv, bleibt aber im Bild
      cx = Math.max(fw / 2, Math.min(1 - fw / 2, lerp(cx, mf[0], extra.pull)));
      cy = Math.max(fh / 2, Math.min(1 - fh / 2, lerp(cy, mf[1], extra.pull)));
    }
    const foc = [Math.max(0.1, Math.min(0.9, (mf[0] - cx) / fw + 0.5)), Math.max(0.1, Math.min(0.9, (mf[1] - cy) / fh + 0.5))];
    geo[0] = (extra.rot || 0) + lerp(mo.from.r || 0, mo.to.r || 0, e);
    // Parallax: nahe Bildteile (unten, am Motiv) folgen der Kamerafahrt etwas weiter als ferne – Tiefe ohne Effekthascherei
    let par = [0, 0];
    if (this.plan.parallax && !extra.flat) {
      const k = this.plan.parallax;
      par = [k * 0.06 * (x - (mo.from.x + mo.to.x) / 2), k * (0.06 * (y - (mo.from.y + mo.to.y) / 2) - 0.25 * (s / Math.max(1e-6, extra.zoom * fx.zoom) - (mo.from.s + mo.to.s) / 2))];
    }
    // Horizont im Ausgabebild (für die Tiefe: oberhalb fern, darunter nah)
    const hor = m && m.horizon != null ? (m.horizon - cy) / fh + 0.5 : null;
    return { tex: slot.tex, xf: [fw, fh, cx, cy], box: [0, 1, 1], blur, geo, corr, foc, par, hor };
  }

  /**
   * Bewegung im Takt: Pendeln (links/rechts, Wendepunkt genau auf dem Beat),
   * Puls (kurzer Zoom je Beat) oder Handkamera (ruhiges, organisches Schweben).
   */
  motionFx(t) {
    const plan = this.plan;
    const mode = plan.motion;
    if (!mode || mode === 'ken') return null;
    const k = { soft: 0.55, medium: 1, strong: 1.6 }[plan.motionAmt] || 1;
    const b = plan.beats;
    const bp = this.beatPulse(t);
    const energy = Math.min(1.3, 0.55 + 0.5 * (bp.energy || 0.5));
    if (mode === 'sway') {
      if (!b.length || t < b[0]) return { zoom: 1 + 0.05 * k, dx: 0, dy: 0, rot: 0 };
      const i = bp.index, next = b[i + 1] != null ? b[i + 1] : b[i] + plan.beatDur;
      const u = clamp01((t - b[i]) / Math.max(0.05, next - b[i]));
      const e = u * u * (3 - 2 * u);
      const side = i % 2 === 0 ? 1 : -1;
      const pos = side * (1 - 2 * e); // +1 auf dem Beat, gleitet zur Gegenseite
      const a = 0.016 * k * energy;
      return { zoom: 1 + 0.05 * k, dx: pos * a, dy: -Math.abs(pos) * a * 0.18, rot: pos * 0.011 * k * energy };
    }
    if (mode === 'pulse') return { zoom: 1 + 0.02 + 0.03 * k * bp.env * energy, dx: 0, dy: 0, rot: 0 };
    if (mode === 'float') {
      // Schweben: weiche Acht über zwei Takte, dazu ein Atmen im Taktmaß – keine Kante, kein Ruck
      const bar = plan.beatDur * 4, w = (2 * Math.PI) / (bar * 2);
      const a = 0.011 * k;
      return { zoom: 1 + 0.045 * k + 0.012 * k * Math.sin(w * 2 * t), dx: Math.sin(w * t) * a, dy: Math.sin(w * 2 * t + 0.6) * a * 0.55, rot: Math.sin(w * t + 1.1) * 0.004 * k };
    }
    if (mode === 'tilt') {
      // Neigen im Takt: auf jeder Eins kippt das Bild weich zur anderen Seite
      const downs = plan.downs || [];
      let i = bp.index || 0;
      while (i > 0 && !downs[i]) i--;
      let n = (bp.index || 0) + 1;
      while (n < b.length && !downs[n]) n++;
      const t0 = b[i] != null ? b[i] : 0, t1 = b[n] != null ? b[n] : t0 + plan.beatDur * 4;
      const u = clamp01((t - t0) / Math.max(0.1, t1 - t0));
      // Anzahl der Einsen bis hier (einmal je Plan vorberechnet statt in jedem Bild zu zählen)
      if (!plan._downCount) { let n = 0; plan._downCount = downs.map((d) => (d ? ++n : n)); }
      const side = (plan._downCount[i] || 0) % 2 ? 1 : -1;
      const e = 1 - Math.pow(1 - clamp01(u / 0.35), 3);
      const ang = 0.021 * k * energy * side * (2 * e - 1);
      return { zoom: 1 + 0.06 * k, dx: 0, dy: 0, rot: ang };
    }
    if (mode === 'handheld') {
      const a = 0.008 * k;
      const nx = Math.sin(t * 1.31) + 0.5 * Math.sin(t * 2.87 + 1.3) + 0.25 * Math.sin(t * 5.1 + 0.4);
      const ny = Math.sin(t * 1.07 + 2.1) + 0.5 * Math.sin(t * 3.3 + 0.2);
      return { zoom: 1 + 0.045 * k, dx: nx * a, dy: ny * a * 0.8, rot: Math.sin(t * 0.9 + 0.7) * 0.006 * k };
    }
    return null;
  }

  /**
   * Schlagzeug-Akzente: kurzer Zoom-Impuls nur auf der Bassdrum, ein kaum spürbares Rütteln auf der Snare.
   * Wirkt nur in den Zonen, die die Regie freigibt (z. B. Drop und Refrain).
   */
  drumFx(t) {
    const a = this.plan.accent;
    if (!a || !a.zones.some((z) => t >= z[0] && t < z[1])) return null;
    const last = (arr) => {
      let lo = 0, hi = arr.length - 1, r = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] <= t) { r = mid; lo = mid + 1; } else hi = mid - 1; }
      return r >= 0 ? t - arr[r] : Infinity;
    };
    const k = a.amt || 1;
    const dk = last(a.kicks);
    const out = { zoom: 1 + 0.022 * k * Math.exp(-dk / 0.085), dx: 0, dy: 0, rot: 0 };
    if (a.snare) {
      const ds = last(a.snares);
      if (ds < 0.2) {
        const env = Math.exp(-ds / 0.055);
        out.dx = Math.sin(ds * 2 * Math.PI * 17) * 0.0045 * k * env;
        out.dy = Math.sin(ds * 2 * Math.PI * 13 + 1.3) * 0.003 * k * env;
        out.rot = Math.sin(ds * 2 * Math.PI * 11 + 0.4) * 0.0025 * k * env;
      }
    }
    return out;
  }

  /** Schwarzweiß → Farbe: Zustand des aktiven Farbmoments (Modus, Farbanteil). */
  colorState(t, foc) {
    for (const f of this.plan.colorFx || []) {
      if (t < f.start || t >= f.end) continue;
      const fade = clamp01((t - f.start) / 0.35);
      let p;
      if (t < f.hit) {
        p = 0;
        if (f.mode === 'steps') { const n = (f.steps || []).filter((x) => x <= t + 1e-3).length; p = n / ((f.steps || []).length + 1); }
        else if (f.mode === 'strobe') {
          // Stroboskop: Farbe und Schwarzweiß wechseln auf den Schlägen, immer schneller; 30 ms weiche Kante statt Flackern
          const fl = f.steps || [];
          let n = 0; while (n < fl.length && fl[n] <= t + 1e-4) n++;
          const on = n % 2 === 1 ? 1 : 0, d = n ? t - fl[n - 1] : 1;
          p = n ? (1 - on) + (2 * on - 1) * clamp01(d / 0.03) : 0;
        } else if (f.mode === 'pulse') {
          // Farbe auf dem Schlag: jede Bassdrum bringt die Farbe zurück, sie verblasst bis zum nächsten Schlag
          const hs = f.steps || [];
          let n = -1; for (let k = 0; k < hs.length && hs[k] <= t + 1e-4; k++) n = k;
          if (n >= 0) { const d = t - hs[n], att = clamp01(d / 0.025); p = 0.9 * att * Math.exp(-Math.max(0, d - 0.025) / (f.decay || 0.18)); }
        }
      } else p = f.mode === 'bloom' || f.mode === 'sweep' ? smooth(clamp01((t - f.hit) / Math.max(0.1, f.dur))) : 1;
      p = 1 - fade * (1 - p);
      if (p >= 0.999) return null;
      const fo = f.mode === 'bloom' ? foc || [0.5, 0.45] : [0.5, 0.5];
      return [COLOR_MODE[f.mode] || 1, p, fo[0], fo[1]];
    }
    return null;
  }

  /** Farbschub nach der Rückkehr der Farbe: kräftiger auf dem Schlag, klingt über gut einen Beat aus. */
  colorPop(t) {
    for (const f of this.plan.colorFx || []) {
      const st = f.hit + (f.dur || 0) * 0.5, pd = f.popDur || 0.6;
      if (t < f.hit || t > st + pd) continue;
      const ramp = clamp01((t - f.hit) / Math.max(0.02, (f.dur || 0) * 0.5));
      return (f.popAmp != null ? f.popAmp : 0.35) * Math.pow(1 - clamp01((t - st) / pd), 2) * ramp;
    }
    return 0;
  }

  beatPulse(t) {
    const b = this.plan.beats;
    if (!b.length || t < b[0]) return { env: 0, down: false, energy: 0 };
    let lo = 0, hi = b.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (b[mid] <= t) lo = mid; else hi = mid - 1; }
    return { env: Math.exp(-(t - b[lo]) / 0.11), down: this.plan.downs[lo], energy: this.plan.beatEnergy[lo] || 0, index: lo };
  }

  _driveVideo(v, active, frozen, playing, rate, expected, freezeT, state) {
    if (playing && active && !frozen) {
      if (v.playbackRate !== rate) v.playbackRate = rate;
      if (v.paused && !v.ended) {
        if (Math.abs(v.currentTime - expected) > 0.25 && expected < v.duration - 0.1) v.currentTime = expected;
        const p = v.play();
        if (p && p.catch) p.catch(() => {});
      } else if (!v.paused && !v.seeking && Math.abs(v.currentTime - expected) > 0.45 && expected < v.duration - 0.2) {
        v.currentTime = expected;
      }
    } else {
      if (!v.paused) v.pause();
      if (frozen && !state.frozen && playing) {
        state.frozen = true;
        if (Math.abs(v.currentTime - freezeT) > 0.05) v.currentTime = freezeT;
      }
    }
    if (!frozen) state.frozen = false;
  }

  updateVideos(t, playing) {
    for (const s of this.slots.values()) {
      if (!s.ready || s.failed) continue;
      const c = s.clip;
      const active = t >= c.visStart - 0.04 && t < c.visEnd;
      const frozen = c.freezeAt != null && t >= c.freezeAt;
      if (s.grid) { if (active) this.composeGrid(s, t); continue; }
      if (s.strip) { if (active) this.composeStrip(s, t); continue; }
      if (s.stack) { if (active) this.composeStack(s, t); continue; }
      if (s.panels) {
        let dirty = !playing;
        s.panels.forEach((p, k) => {
          if (!p || !p.video) return;
          const on = active && t >= c.split.reveal[k] - 0.04;
          this._driveVideo(p.video, on, frozen, playing, p.item.rate || 1, panelTime(c, k, t), panelTime(c, k, c.freezeAt || 0), p);
          if (on && p.video.currentTime !== p.lastUpload) { dirty = true; p.lastUpload = p.video.currentTime; }
        });
        if (active && (dirty || playing)) this.composeSplit(s, t);
        continue;
      }
      const v = s.video;
      if (!v) continue;
      // Browser erlauben 0,0625–16; bei Tempo-Kurven folgt die Wiedergabe dem aktuellen Tempo
      const rate = c.rp ? Math.round(rampRate(c.rp, t) * 20) / 20 : c.rate;
      this._driveVideo(v, active, frozen, playing, rate, srcTimeOf(c, t), srcTimeOf(c, c.freezeAt || 0), s);
      if (active && v.readyState >= 2 && (v.currentTime !== s.lastUpload || !playing)) {
        // beim Abspielen verkleinert und ohne Mipmaps: spart pro Bild GPU-Arbeit, das Standbild ist wieder voll
        if (this.r.upload(s.tex, playing ? this._previewFrame(s, v) : v, !playing)) s.lastUpload = v.currentTime;
      }
    }
  }

  drawAt(t, mode) {
    const plan = this.plan;
    if (!plan) return;
    const look = LOOKS[plan.look] || LOOKS.natur;
    const L = layersAt(plan.clips, t);
    if (mode === 'play') this.updateVideos(t, true);
    else if (mode === 'still') this.updateVideos(t, false);
    else if (mode === 'offline') for (const s of this.slots.values()) if (s.ready && !s.failed) { if (s.panels) this.composeSplit(s, t); else if (s.grid) this.composeGrid(s, t); else if (s.strip) this.composeStrip(s, t); else if (s.stack) this.composeStack(s, t); }
    const fx = this.fxState(t);
    let A = null, B = null, mix = 0, trans = 0, dir = 1;
    if (L) {
      const p = clamp01(L.p);
      const w = 1 - Math.abs(p - 0.5) * 2;
      const ea = { zoom: 1 }, eb = { zoom: 1 };
      if (L.b) {
        trans = L.type; mix = p; dir = L.dirSign || 1;
        if (L.type === TR.ZOOM) {
          const pa = clamp01(p / 0.5), pb = clamp01((p - 0.5) / 0.5);
          ea.zoom *= 1 + 0.3 * pa * pa;
          eb.zoom *= 1 + 0.3 * (1 - pb) * (1 - pb);
          ea.blur = [2, 0.25 * w, 0]; eb.blur = [2, 0.25 * w, 0];
        } else if (L.type === TR.WHIP) {
          const pa = clamp01(p / 0.5), pb = clamp01((p - 0.5) / 0.5);
          ea.shiftX = 0.3 * pa * pa * dir;
          eb.shiftX = -0.3 * (1 - pb) * (1 - pb) * dir;
          ea.blur = [1, 0.2 * w * dir, 0]; eb.blur = [1, 0.2 * w * dir, 0];
        } else if (L.type === TR.PUSH) {
          ea.blur = [1, 0.08 * w, 0]; eb.blur = [1, 0.08 * w, 0];
        } else if (L.type === TR.MORPH) {
          // altes Bild fährt ins Motiv, das neue löst sich aus ihm heraus und kommt zur Ruhe
          const e = p * p * (3 - 2 * p);
          ea.zoom *= 1 + 0.22 * e; ea.pull = 0.6 * e;
          eb.zoom *= 1 + 0.16 * (1 - e); eb.pull = 0.5 * (1 - e);
        } else if (L.type === TR.INK || L.type === TR.DOUBLE) {
          ea.zoom *= 1 + 0.06 * p; eb.zoom *= 1 + 0.06 * (1 - p);
        } else if (L.type === TR.DRIFT) {
          // Drift: die Kamera gleitet ohne Halt weiter, das neue Bild zieht aus derselben Richtung nach
          const e = p * p * p * (p * (6 * p - 15) + 10);
          ea.shiftX = 0.11 * e * dir; eb.shiftX = -0.11 * (1 - e) * dir;
          ea.zoom *= 1 + 0.025 * e; eb.zoom *= 1 + 0.025 * (1 - e);
          ea.blur = [1, 0.035 * w * dir, 0]; eb.blur = [1, 0.035 * w * dir, 0];
        }
      }
      // Impact-Zoom: jede Einstellung setzt leicht vergrößert ein und gleitet in 0,4 s zurück (auf dem Schnitt = auf dem Beat)
      if (plan.motion === 'snap') {
        const k = { soft: 0.6, medium: 1, strong: 1.5 }[plan.motionAmt] || 1;
        for (const [ex, c] of [[ea, L.a], [eb, L.b]]) {
          if (!c || c.grid || c.split || c.flightAnim || c.strip) continue;
          const since = Math.max(0, t - c.start);
          ex.zoom *= 1 + 0.075 * k * Math.exp(-since / 0.14);
        }
      }
      const mv = this.motionFx(t);
      if (mv) {
        for (const [ex, c] of [[ea, L.a], [eb, L.b]]) {
          if (!c || c.grid || c.split || c.flightAnim || c.strip) continue;
          ex.zoom *= mv.zoom;
          ex.shiftX = (ex.shiftX || 0) + mv.dx;
          ex.shiftY = mv.dy;
          ex.rot = mv.rot;
        }
      }
      const df = this.drumFx(t);
      if (df) {
        for (const [ex, c] of [[ea, L.a], [eb, L.b]]) {
          if (!c || c.grid || c.split || c.flightAnim || c.strip || c.stack) continue;
          ex.zoom *= df.zoom;
          ex.shiftX = (ex.shiftX || 0) + df.dx;
          ex.shiftY = (ex.shiftY || 0) + df.dy;
          ex.rot = (ex.rot || 0) + df.rot;
        }
      }
      // Mini-Rewind: die Bilder rauschen mit Bewegungsunschärfe gegen die Laufrichtung zurück
      for (const [ex, c] of [[ea, L.a], [eb, L.b]]) if (c && c.miniRew && !ex.blur) ex.blur = [1, 0.05 * (c.i % 2 ? 1 : -1), 0];
      for (const [ex, c] of [[ea, L.a], [eb, L.b]]) if (c && (c.grid || c.split || c.strip || c.stack || c.flightAnim)) ex.flat = true;
      const sa = this.slots.get(L.a.i);
      if (sa) A = this.layerParams(sa, t, fx, ea);
      if (L.b) {
        const sb = this.slots.get(L.b.i);
        if (sb) B = this.layerParams(sb, t, fx, eb);
        if (!B) { mix = 0; trans = 0; }
        if (!A && B) { A = B; B = null; mix = 0; trans = 0; }
      }
      // Echo: auf einem starken Schlag blitzt das vorige Bild kurz halbtransparent über dem neuen auf
      const ec = L.a && L.a.echo;
      if (A && !B && ec && t >= L.a.start && t < L.a.start + ec.dur) {
        const src = this.slots.get(ec.from);
        const u = (t - L.a.start) / ec.dur;
        const ghost = src ? this.layerParams(src, src.clip.visEnd - 0.01, fx, { zoom: 1.03 + 0.05 * u, flat: true }) : null;
        if (ghost) { B = ghost; trans = 20; mix = 0.55 * Math.pow(1 - u, 2); }
      }
    }
    // Mehrfachbelichtung: das nächste Bild liegt über dem aktuellen, im Refrain hell und pulsierend im Takt
    const ly = L && L.a && L.a.layer;
    if (A && !B && ly) {
      const src = this.slots.get(ly.from);
      if (src && src.ready && src.clip) {
        const c0 = L.a, u = clamp01((t - c0.start) / Math.max(0.1, c0.end - c0.start));
        const g = this.layerParams(src, t, fx, { zoom: (ly.mode === 'luma' ? 1.06 : 1.12) + 0.05 * u, shiftX: 0.035 * (0.5 - u) * (ly.dir || 1), flat: true });
        if (g) {
          const edge = Math.min(1, (t - c0.start - (c0.echo ? c0.echo.dur : 0)) / 0.14, (c0.end - t) / 0.14);
          let a = ly.amp * smooth(clamp01(edge));
          if (ly.pulse) a *= 0.5 + 0.5 * this.beatPulse(t).env;
          B = g; trans = ly.mode === 'luma' ? 22 : 21; mix = a;
        }
      }
    }
    // Farbversatz auf den Kicks (Musikvideo): ein Hauch, der sofort wieder verschwindet
    let chroma = 0;
    const ch = plan.chroma;
    if (ch && ch.zones.some((z) => t >= z[0] && t < z[1])) {
      let lo = 0, hi = ch.kicks.length - 1, r = -1;
      while (lo <= hi) { const mid = (lo + hi) >> 1; if (ch.kicks[mid] <= t) { r = mid; lo = mid + 1; } else hi = mid - 1; }
      if (r >= 0) chroma = 0.0045 * Math.exp(-(t - ch.kicks[r]) / 0.07);
    }
    const col = this.colorState(t, A && A.foc);
    const pop = this.colorPop(t);
    const ov = this.painter.paint(plan, t, this.selectedOverlay);
    if (ov.topDirty) this.r.uploadOverlay('top', this.painter.top);
    this.r.draw({
      A, B, mix, trans, dir, grade: look.grade, time: t, band: plan.band,
      flash: fx.flash, black: fx.black, dim: fx.dim, desat: fx.desat, bars: 0, ovTop: ov.top, col, pop, chroma, mirror: fx.mirror || 0,
    });
  }

  /* ---------- Standbild ---------- */
  async renderStill(t) {
    if (!this.plan) return;
    const token = ++this._token;
    this.t = Math.max(0, Math.min(t, this.plan.duration));
    const tt = this.t;
    const needed = this.ensureWindow(tt, 0.01);
    const waits = [];
    for (const k of needed) {
      const s = this.slots.get(k);
      waits.push(s.promise.then(() => this._seekSlot(s, tt)));
    }
    await Promise.all(waits);
    if (token !== this._token || this.playing) return;
    this.drawAt(tt, 'still');
  }

  async _seekSlot(s, t, fps) {
    if (s.dead || s.failed) return;
    const tol = fps ? 0.45 / fps : 0.015;
    if (s.panels) {
      await Promise.all(s.panels.map(async (p, k) => {
        if (!p || !p.video) return;
        const target = panelTime(s.clip, k, t);
        if (Math.abs(p.video.currentTime - target) > tol || p.video.readyState < 2) await seekVideo(p.video, target);
      }));
      return;
    }
    if (!s.video) return;
    const target = srcTimeOf(s.clip, t);
    if (Math.abs(s.video.currentTime - target) > tol || s.video.readyState < 2) await seekVideo(s.video, target);
  }

  /* ---------- Wiedergabe ---------- */
  async play(from) {
    if (!this.plan || !this.audioBuffer) return;
    this.ensureAudio();
    this._stopPlayback();
    const token = ++this._token;
    const t0 = Math.max(0, Math.min(from, this.plan.duration - 0.05));
    this.t = t0;
    const needed = this.ensureWindow(t0, 0.3);
    await Promise.race([
      Promise.all(Array.from(needed, (k) => this.slots.get(k).promise)),
      new Promise((r) => setTimeout(r, 4000)),
    ]);
    if (token !== this._token) return;
    if (this.ac.state !== 'running') { try { await this.ac.resume(); } catch (e) { /* ignore */ } }
    if (!this.exporting && this.scale > this.playMax) this._setScale(this.playMax);
    this._lastDraw = 0;
    clearTimeout(this._acSleep);
    this._startAudio(t0, this.master);
    this._t0 = t0;
    this.playing = true;
    this.onState && this.onState(true);
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(this._loop);
  }

  _gainCurve(g, when, offset) {
    const w = this.plan.win, D = this.plan.duration;
    const fi = Math.max(0.005, w.fadeIn || 0.02);
    const fo = Math.max(0.05, Math.min(w.fadeOut || 1, D * 0.3));
    // Ausblenden nach dem Gehör: erst sanft, dann weich ins Leise (Kosinus statt gerader Linie, kein hörbares Abreißen)
    const out = (u) => Math.pow(Math.cos(clamp01(u) * Math.PI / 2), 1.6);
    const gAt = (x) => Math.min(clamp01(x / fi), x > D - fo ? out((x - (D - fo)) / fo) : 1);
    g.gain.setValueAtTime(gAt(offset), when);
    if (offset < fi) g.gain.linearRampToValueAtTime(1, when + Math.min(fi - offset, Math.max(0, D - fo - offset - 0.02)));
    const foStart = Math.max(offset + 0.01, D - fo);
    const n = 48, curve = new Float32Array(n);
    for (let k = 0; k < n; k++) curve[k] = gAt(foStart + ((D - foStart) * k) / (n - 1));
    curve[n - 1] = 0;
    if (D - foStart > 0.02) g.gain.setValueCurveAtTime(curve, when + (foStart - offset), D - foStart);
  }

  _startAudio(offset, out, extraOut, withSong = true) {
    const ac = this.ac;
    const D = this.plan.duration;
    const src = ac.createBufferSource();
    src.buffer = this.audioBuffer;
    const g = ac.createGain();
    const duck = ac.createGain();
    src.connect(g).connect(duck);
    const when = ac.currentTime + 0.08;
    if (withSong) {
      duck.connect(out);
      if (extraOut) duck.connect(extraOut);
    }
    this._gainCurve(g, when, offset);
    this._duckCurve(duck.gain, when, offset);
    src.start(when, this.plan.win.start + offset, Math.max(0.05, D - offset + 0.05));
    this.src = src;
    this.srcGain = g;
    this.voiceSrcs = this._scheduleVoices(ac, [out, extraOut].filter(Boolean), when, offset);
    this.clockBase = when - offset;
  }

  /** Originalton-Abschnitte zusammengefasst (für das Absenken der Musik). */
  _voiceSpans() {
    const vs = (this.plan.voice || []).slice().sort((a, b) => a.t0 - b.t0);
    const spans = [];
    for (const v of vs) {
      const last = spans[spans.length - 1];
      if (last && v.t0 < last.b + 0.6) { last.b = Math.max(last.b, v.t1); last.g = Math.max(last.g, v.gain); } else spans.push({ a: v.t0, b: v.t1, g: v.gain });
    }
    return spans;
  }

  /** Musik unter dem Originalton absenken (weiche Rampen). */
  _duckCurve(param, when, offset) {
    const pts = [];
    for (const sp of this._voiceSpans()) {
      const low = 1 - 0.72 * Math.min(1, sp.g);
      pts.push([sp.a - 0.25, 1], [sp.a, low], [sp.b, low], [sp.b + 0.35, 1]);
    }
    const valAt = (x) => {
      if (!pts.length || x <= pts[0][0]) return 1;
      for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1; }
      return 1;
    };
    param.setValueAtTime(valAt(offset), when);
    for (const [x, y] of pts) if (x > offset) param.linearRampToValueAtTime(y, when + (x - offset));
  }

  /** Originalton der Videos exakt zu ihren Einstellungen einplanen. */
  _scheduleVoices(ac, outs, when, offset) {
    const list = [];
    for (const v of this.plan.voice || []) {
      const m = this.media[v.mediaIndex];
      if (!m || !m.audio || v.t1 <= offset + 0.02) continue;
      const st = Math.max(v.t0, offset);
      const bufOff = v.src + (st - v.t0);
      if (bufOff >= m.audio.duration) continue;
      const src = ac.createBufferSource();
      src.buffer = m.audio;
      const g = ac.createGain();
      src.connect(g);
      for (const o of outs) g.connect(o);
      const fade = Math.min(0.12, (v.t1 - v.t0) / 4);
      const at = (x) => when + (x - offset);
      const gainAt = (x) => v.gain * Math.min(1, Math.max(0, (x - v.t0) / fade), Math.max(0, (v.t1 - x) / fade));
      g.gain.setValueAtTime(gainAt(st), at(st));
      if (st < v.t0 + fade) g.gain.linearRampToValueAtTime(v.gain, at(v.t0 + fade));
      g.gain.setValueAtTime(v.gain, at(Math.max(st, v.t1 - fade)));
      g.gain.linearRampToValueAtTime(0, at(v.t1));
      src.start(at(st), bufOff, v.t1 - st + 0.02);
      list.push(src);
    }
    return list;
  }

  clock() {
    const ac = this.ac;
    let t = ac.currentTime - this.clockBase;
    if (!this.exportMode) t -= (ac.outputLatency || 0) + (ac.baseLatency || 0);
    return t;
  }

  /** Videobild für die laufende Vorschau: auf die Größe verkleinert, die der Ausschnitt gerade braucht. */
  _previewFrame(s, v) {
    const vw = v.videoWidth, vh = v.videoHeight, bp = this.bandPx;
    if (!vw || !vh) return v;
    const k = Math.min(1, Math.max((bp.w * this.scale) / vw, (bp.h * this.scale) / vh) * 1.2);
    if (k > 0.75) return v;
    const w = Math.max(2, Math.round(vw * k)), h = Math.max(2, Math.round(vh * k));
    if (!s.pv) s.pv = document.createElement('canvas');
    if (s.pv.width !== w || s.pv.height !== h) { s.pv.width = w; s.pv.height = h; }
    s.pv.getContext('2d').drawImage(v, 0, 0, w, h);
    return s.pv;
  }

  /** Höchste Vorschau-Auflösung beim Abspielen: etwa 1100 px auf der langen Seite reichen für ein flüssiges Bild. */
  get playMax() { return Math.min(1, 1100 / Math.max(this.size.w, this.size.h)); }

  /** Vorschau-Auflösung (Anteil der vollen Größe); Export und Standbild immer voll. */
  _setScale(sc) {
    if (sc === this.scale) return;
    this.scale = sc;
    const w = Math.max(2, Math.round(this.size.w * sc / 2) * 2), h = Math.max(2, Math.round(this.size.h * sc / 2) * 2);
    this.r.resize(w, h);
    this.painter.resize(w, h);
  }

  /**
   * Passt die Vorschau an das Gerät an: Ruckelt es (Bilder fallen aus), wird die Auflösung
   * stufenweise gesenkt, läuft es wieder flüssig, steigt sie. Spart Akku; der Export ist davon unberührt.
   */
  _adapt() {
    if (this.exporting || this.exportMode) return;
    const now = performance.now();
    const last = this._lastFrame;
    this._lastFrame = now;
    if (!last) return;
    const d = this._dts;
    d.push(Math.min(250, now - last));
    const sum = d.reduce((a, b) => a + b, 0);
    // etwa jede Sekunde auswerten (bei sehr langsamen Geräten nach wenigen Bildern)
    if (d.length < 45 && !(sum > 900 && d.length >= 6)) return;
    // Bildwiederholrate des Displays (60, 120 oder im Stromsparmodus 30 Hz); gleichmäßig langsam zählt auch als Ruckeln
    const base = Math.min(34, Math.max(7, Math.min(...d)));
    const avg = sum / d.length;
    this._dts = [];
    const floor = this.playMax * 0.6;
    if (avg > base * 1.45 && this.scale > floor) { this._setScale(Math.max(floor, +(this.scale * 0.8).toFixed(2))); this._calm = 0; }
    else if (avg < base * 1.12 && this.scale < this.playMax && ++this._calm >= 3) { this._setScale(Math.min(this.playMax, +(this.scale * 1.15).toFixed(2))); this._calm = 0; }
  }

  _loop(now) {
    if (!this.playing) return;
    // Vorschau mit höchstens 30 Bildern pro Sekunde: Videos haben selten mehr, und bei 60/120-Hz-Displays
    // halbiert bzw. viertelt das die Arbeit von Grafikkarte und Prozessor (Wärme, Akku). Der Ton läuft unabhängig.
    if (!this.exportMode && now && this._lastDraw && now - this._lastDraw < 1000 / 30 - 3) { this._raf = requestAnimationFrame(this._loop); return; }
    this._lastDraw = now || performance.now();
    this._adapt();
    const D = this.plan.duration;
    const t = Math.max(this._t0 || 0, this.clock());
    if (t >= D) {
      this.t = D;
      this.drawAt(D - 0.001, 'play');
      this._stopPlayback();
      this.onTime && this.onTime(D);
      this.onEnded && this.onEnded();
      return;
    }
    this.t = t;
    this.ensureWindow(t, 2.0);
    this.drawAt(t, 'play');
    this.onTime && this.onTime(t);
    this._raf = requestAnimationFrame(this._loop);
  }

  _stopPlayback() {
    const was = this.playing;
    this.playing = false;
    cancelAnimationFrame(this._raf);
    if (this.src) {
      try { this.src.stop(); } catch (e) { /* ignore */ }
      try { this.src.disconnect(); this.srcGain.disconnect(); } catch (e) { /* ignore */ }
      this.src = null;
    }
    for (const v of this.voiceSrcs || []) { try { v.stop(); v.disconnect(); } catch (e) { /* ignore */ } }
    this.voiceSrcs = [];
    for (const s of this.slots.values()) {
      if (s.video) { try { s.video.pause(); } catch (e) { /* ignore */ } }
      if (s.panels) for (const p of s.panels) if (p && p.video) { try { p.video.pause(); } catch (e) { /* ignore */ } }
    }
    if (was) this.onState && this.onState(false);
  }

  pause() {
    this._token++;
    this._stopPlayback();
    // Audio-Hardware schlafen legen, solange nichts läuft (spart Akku, das iPhone bleibt kühler)
    clearTimeout(this._acSleep);
    this._acSleep = setTimeout(() => { if (this.ac && !this.playing && !this.exporting && this.ac.state === 'running') this.ac.suspend().catch(() => {}); }, 2000);
    this._lastFrame = 0;
    // angehaltenes Bild in voller Schärfe
    if (this.scale < 1 && this.plan && !this.exporting) { this._setScale(1); this.renderStill(this.t); }
  }

  /**
   * Titelbild (Reel-Cover) in voller Exportgröße: stärkstes Bild des Films, Titel groß in der Mitte
   * (im Bereich, den das Instagram-Raster zeigt). Liefert eine Leinwand.
   */
  async renderCover(size, cover) {
    this.pause();
    const plan = this.plan, prevSize = this.size, prevT = this.t;
    const hook = plan.clips.find((c) => c.role === 'hook' && !c.grid && !c.split) || plan.clips.find((c) => !c.pre && !c.grid && !c.split && c.mediaIndex >= 0) || plan.clips[0];
    const t = hook ? Math.min(hook.end - 0.05, hook.start + (hook.end - hook.start) * 0.6) : 0;
    this.plan = { ...plan, fx: [], overlays: cover && cover.text ? [{ type: 'city', text: cover.text, sub: cover.sub || '', geo: null, start: t - 3, end: t + 60 }] : [] };
    this.exporting = true;
    try {
      this.r.resize(size.w, size.h); this.painter.resize(size.w, size.h); this.size = size;
      this.releaseAll();
      await this.renderStill(t);
      // direkt vor dem Auslesen zeichnen (die Leinwand behält ihr Bild nicht über ein Bildschirmupdate hinaus)
      this.drawAt(t, 'still');
      const out = document.createElement('canvas');
      out.width = size.w; out.height = size.h;
      out.getContext('2d').drawImage(this.canvas, 0, 0);
      return out;
    } finally {
      this.plan = plan;
      this.exporting = false;
      this.size = prevSize;
      this.r.resize(prevSize.w, prevSize.h); this.painter.resize(prevSize.w, prevSize.h);
      this.releaseAll();
      this.renderStill(prevT);
    }
  }

  /* ---------- Offline-Export (Bild für Bild) ---------- */
  async _prepareExact(t, fps) {
    const needed = this.ensureWindow(t, 1.5);
    const vis = [];
    for (const k of needed) {
      const s = this.slots.get(k);
      if (s.clip.visStart <= t + 1e-6 && s.clip.visEnd > t) vis.push(s);
    }
    await Promise.all(vis.map((s) => s.promise));
    await Promise.all(vis.map((s) => (s.fr ? this._readSlot(s, t) : this._seekSlot(s, t, fps))));
    for (const s of vis) {
      if (s.panels || !s.video || s.failed || s.dead) continue;
      if (s.video.readyState >= 2) this.r.upload(s.tex, s.video);
    }
  }

  async _readSlot(s, t) {
    if (s.dead || s.failed) return;
    try {
      const cv = await s.fr.canvasAt(srcTimeOf(s.clip, t));
      if (cv && cv._up !== s.fr.drawnTs) { this.r.upload(s.tex, cv); cv._up = s.fr.drawnTs; }
    } catch (e) {
      // Dekoder gescheitert: diesen Clip ab hier über das Video-Element weiterführen
      console.warn(e);
      const m = this.media[s.clip.mediaIndex];
      m.fastBad = true;
      s.fr.close(); s.fr = null;
      const v = this.acquireVideo(m.url);
      s.video = v;
      if (!(await loadVideoSrc(v, m.url))) { s.failed = true; return; }
      await this._seekSlot(s, t);
    }
  }

  /** bpp: Bits pro Pixel und Bild (0.22 ≈ 14 Mbit/s bei 1080 × 1920 und 30 fps) */
  static async exportSupport(size, fps, withAudio, bpp = 0.22) {
    const res = { video: null, audio: null };
    if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return res;
    const bitrate = Math.min(80e6, Math.round(size.w * size.h * fps * bpp));
    for (const codec of H264_CANDIDATES(fps, size.w, size.h)) {
      try {
        const cfg = { codec, width: size.w, height: size.h, bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'quality' };
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) { res.video = { cfg, kind: 'avc' }; break; }
      } catch (e) { /* nächster */ }
    }
    if (!res.video) {
      try {
        const cfg = { codec: size.w * size.h > 2200000 ? 'vp09.00.51.08' : 'vp09.00.40.08', width: size.w, height: size.h, bitrate, framerate: fps, latencyMode: 'quality' };
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) res.video = { cfg, kind: 'vp9' };
      } catch (e) { /* keiner */ }
    }
    if (withAudio && typeof AudioEncoder !== 'undefined') {
      for (const [codec, kind, sr] of [['mp4a.40.2', 'aac', 48000], ['mp4a.40.2', 'aac', 44100], ['opus', 'opus', 48000]]) {
        try {
          const cfg = { codec, sampleRate: sr, numberOfChannels: 2, bitrate: 192000 };
          const r = await AudioEncoder.isConfigSupported(cfg);
          if (r.supported) { res.audio = { cfg, kind, sampleRate: sr }; break; }
        } catch (e) { /* nächster */ }
      }
    }
    return res;
  }

  async _renderAudio(sampleRate, withSong = true) {
    const D = this.plan.duration;
    const len = Math.ceil(D * sampleRate);
    const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new OAC(2, len, sampleRate);
    if (withSong) {
      const src = ctx.createBufferSource();
      src.buffer = this.audioBuffer;
      const g = ctx.createGain();
      const duck = ctx.createGain();
      src.connect(g).connect(duck).connect(ctx.destination);
      this._gainCurve(g, 0, 0);
      this._duckCurve(duck.gain, 0, 0);
      src.start(0, this.plan.win.start, D + 0.05);
    }
    this._scheduleVoices(ctx, [ctx.destination], 0, 0);
    return ctx.startRendering();
  }

  /** Hat der Film hörbaren Originalton? */
  get hasVoice() {
    return !!(this.plan && (this.plan.voice || []).some((v) => this.media[v.mediaIndex] && this.media[v.mediaIndex].audio));
  }

  async exportOffline(opts) {
    this.offline = true;
    try { return await this._exportOffline(opts); } finally {
      this.offline = false;
      this.exporting = false;
      // Export-Slots (eigene Dekoder) nicht in die Vorschau übernehmen
      this.releaseAll();
      this.demuxCache.clear();
    }
  }

  async _exportOffline({ size, fps, withAudio, withSong = true, support, onProgress, isCancelled, onState }) {
    this.exporting = true;
    this.pause();
    this.scale = 1;
    const plan = this.plan;
    const D = plan.duration;
    this.r.resize(size.w, size.h);
    this.painter.resize(size.w, size.h);
    this.size = size;
    this.releaseAll();
    const vs = support.video;
    const as = withAudio ? support.audio : null;
    const mux = new Mp4Muxer({
      video: { codec: vs.kind, width: size.w, height: size.h, fps },
      audio: as ? { codec: as.kind, sampleRate: as.sampleRate, channels: 2, bitrate: 192000 } : null,
    });
    let failed = null;
    const N = Math.max(1, Math.round(D * fps));
    const frameUs = 1e6 / fps;
    // Fortsetzen nach App-Wechsel: iOS hält die Seite an und beendet dabei oft den Encoder oder nimmt die Grafik weg.
    // Dann geht es ab dem letzten fertig kodierten Schlüsselbild mit einem neuen Encoder weiter.
    let safeKey = 0, forceKey = false, resumes = 0;
    const makeEnc = () => {
      const e = new VideoEncoder({
        output: (c, m) => { if (c.type === 'key') safeKey = Math.round(c.timestamp / frameUs); mux.addVideoChunk(c, m); },
        error: (err) => { failed = err; },
      });
      e.configure(vs.cfg);
      return e;
    };
    let enc = makeEnc();
    const visible = () => new Promise((res) => {
      if (typeof document === 'undefined' || !document.hidden) { res(); return; }
      const on = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', on); res(); } };
      document.addEventListener('visibilitychange', on);
    });
    const restored = async () => { for (let k = 0; k < 100 && (this.r.lost || this.r.gl.isContextLost()); k++) await new Promise((r) => setTimeout(r, 50)); return !this.r.lost; };
    // neuer Encoder ab dem letzten sicheren Schlüsselbild; liefert das Bild, mit dem es weitergeht
    const resume = async () => {
      if (resumes >= 4 || !(await restored())) throw failed || new Error('Export unterbrochen');
      resumes++;
      try { enc.close(); } catch (e) { /* ignore */ }
      failed = null;
      mux.rollbackVideo(Math.round(safeKey * frameUs));
      forceKey = true;
      this.releaseAll();
      this.r.resize(size.w, size.h);
      enc = makeEnc();
      onState && onState('resumed', safeKey / N);
      return safeKey;
    };
    let cancelled = false;
    try {
      let n = 0;
      for (;;) {
        for (; n < N; n++) {
          if (typeof document !== 'undefined' && document.hidden) {
            onState && onState('paused');
            await visible();
            onState && onState('running');
            // kurz warten, ob der Encoder den Wechsel überlebt hat
            await new Promise((r) => setTimeout(r, 60));
          }
          if (failed || enc.state === 'closed' || this.r.lost) n = await resume();
          if (isCancelled && isCancelled()) { cancelled = true; break; }
          // Bildmitte: Bild n ist von n/fps bis (n+1)/fps zu sehen; es zeigt den Moment in der Mitte.
          // So liegt jeder Schnitt höchstens ein halbes Bild neben dem Beat (statt bis zu einem ganzen zu spät).
          const t = Math.min(D - 1e-3, (n + 0.5) / fps);
          await this._prepareExact(t, fps);
          this.drawAt(t, 'offline');
          const frame = new VideoFrame(this.canvas, { timestamp: Math.round(n * frameUs), duration: Math.round(frameUs) });
          try { enc.encode(frame, { keyFrame: forceKey || n % (fps * 2) === 0 }); } catch (e) { failed = failed || e; }
          frame.close();
          if (failed) { n--; continue; }
          forceKey = false;
          while (enc.encodeQueueSize > 4 && !failed && enc.state !== 'closed') await new Promise((r) => setTimeout(r, 2));
          if (onProgress && n % 3 === 0) onProgress((n / N) * (as ? 0.93 : 1), t);
        }
        if (cancelled) break;
        try { await enc.flush(); } catch (e) { failed = failed || e; }
        if (!failed) break;
        await visible();
        n = await resume();
      }
    } finally {
      try { enc.close(); } catch (e) { /* ignore */ }
    }
    if (cancelled) { this.exporting = false; return null; }
    if (failed) { this.exporting = false; throw failed; }
    if (as) {
      const buf = await this._renderAudio(as.sampleRate, withSong);
      // auch der Ton übersteht einen App-Wechsel: bei einem Fehler einfach neu kodieren (dauert nur Sekunden)
      for (let attempt = 0; ; attempt++) {
        failed = null;
        mux.aSamples = [];
        mux.aDesc = null;
        const aenc = new AudioEncoder({ output: (c, m) => mux.addAudioChunk(c, m), error: (e) => { failed = e; } });
        aenc.configure(as.cfg);
        try {
          const chunk = 1024;
          const L = buf.getChannelData(0), R = buf.getChannelData(1);
          for (let o = 0; o < buf.length; o += chunk) {
            const nFr = Math.min(chunk, buf.length - o);
            const data = new Float32Array(nFr * 2);
            data.set(L.subarray(o, o + nFr), 0);
            data.set(R.subarray(o, o + nFr), nFr);
            const ad = new AudioData({ format: 'f32-planar', sampleRate: as.sampleRate, numberOfFrames: nFr, numberOfChannels: 2, timestamp: Math.round((o * 1e6) / as.sampleRate), data });
            aenc.encode(ad);
            ad.close();
            if (aenc.encodeQueueSize > 20) await new Promise((r) => setTimeout(r, 1));
          }
          await aenc.flush();
        } catch (e) { failed = failed || e; }
        try { aenc.close(); } catch (e) { /* ignore */ }
        if (!failed) break;
        if (attempt >= 2) break;
        await visible();
      }
      if (failed) { this.exporting = false; throw failed; }
    }
    onProgress && onProgress(1, D);
    const blob = mux.finalize();
    this.exporting = false;
    return { blob, type: 'video/mp4', ext: 'mp4', codec: vs.kind, audio: as ? as.kind : null };
  }

  /* ---------- Echtzeit-Export (Rückfall für ältere Browser) ---------- */
  async exportRealtime({ size, withAudio, withSong = true, onProgress, isCancelled, fps = 30, bpp = 0.22 }) {
    const mime = pickRecorderMime();
    if (mime === null || !this.canvas.captureStream) throw new Error('Dieser Browser kann keine Videos erzeugen. Bitte iOS 16.4+ oder aktuelles Chrome verwenden.');
    this.ensureAudio();
    this.exporting = true;
    this.pause();
    this.scale = 1;
    this.r.resize(size.w, size.h);
    this.painter.resize(size.w, size.h);
    this.size = size;
    this.releaseAll();
    const stream = this.canvas.captureStream(fps);
    const tracks = [...stream.getVideoTracks()];
    let dest = null, keep = null, keepGain = null;
    if (withAudio) {
      dest = this.ac.createMediaStreamDestination();
      keep = this.ac.createConstantSource ? this.ac.createConstantSource() : this.ac.createOscillator();
      keepGain = this.ac.createGain();
      keepGain.gain.value = 0;
      keep.connect(keepGain); keepGain.connect(dest); keep.start();
      tracks.push(...dest.stream.getAudioTracks());
    }
    const ms = new MediaStream(tracks);
    const vbr = Math.min(40e6, Math.round(size.w * size.h * fps * bpp));
    let rec;
    try { rec = new MediaRecorder(ms, mime ? { mimeType: mime, videoBitsPerSecond: vbr, audioBitsPerSecond: 192000 } : { videoBitsPerSecond: vbr }); } catch (e) { rec = new MediaRecorder(ms); }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    this.exporting = true;
    let cancelled = false;
    const D = this.plan.duration;
    try {
      await this.renderStill(0);
      rec.start(1000);
      await new Promise((r) => setTimeout(r, 200));
      this.exportMode = true;
      // Wiedergabe mit Tonausgang in die Aufnahme
      const token = ++this._token;
      const needed = this.ensureWindow(0, 0.3);
      await Promise.all(Array.from(needed, (k) => this.slots.get(k).promise));
      if (token !== this._token) throw new Error('abgebrochen');
      if (this.ac.state !== 'running') { try { await this.ac.resume(); } catch (e) { /* ignore */ } }
      const silent = this.ac.createGain();
      silent.gain.value = 0;
      silent.connect(this.ac.destination);
      this._startAudio(0, silent, dest, withSong);
      this._t0 = 0;
      this.playing = true;
      const prevEnded = this.onEnded;
      await new Promise((resolve) => {
        this.onEnded = resolve;
        this._raf = requestAnimationFrame(this._loop);
        const tick = () => {
          if (!this.playing) return resolve();
          if (isCancelled && isCancelled()) { cancelled = true; return resolve(); }
          onProgress && onProgress(clamp01(this.t / D), this.t);
          setTimeout(tick, 200);
        };
        tick();
      });
      this.onEnded = prevEnded;
      this.pause();
      try { silent.disconnect(); } catch (e) { /* ignore */ }
      if (!cancelled) { this.drawAt(D - 0.001, 'still'); await new Promise((r) => setTimeout(r, 300)); }
      if (rec.state !== 'inactive') rec.stop();
      await stopped;
    } finally {
      this.exporting = false;
      this.exportMode = false;
      if (keep) { try { keep.stop(); keep.disconnect(); keepGain.disconnect(); dest.disconnect(); } catch (e) { /* ignore */ } }
      for (const tr of ms.getTracks()) tr.stop();
    }
    if (cancelled) return null;
    const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
    let blob = new Blob(chunks, { type });
    if (type === 'video/webm') blob = await fixWebmDuration(blob, D * 1000 + 300);
    return { blob, type, ext: type === 'video/mp4' ? 'mp4' : 'webm', codec: 'realtime', audio: withAudio ? 'yes' : null };
  }
}
