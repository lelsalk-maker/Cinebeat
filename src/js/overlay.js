/* ============================================================
 * Einblendungen: Titelkarte, Bauchbinde, Wort-Titel, Kapitel,
 * Schlusstitel, eigene Texte und Sticker (nur Systemschriften)
 * ============================================================ */

const OV_FONTS = {
  serif: '"Didot", "Bodoni 72", "Bodoni MT", "Noto Serif Display", "Noto Serif", Georgia, "Times New Roman", serif',
  sans: '"Avenir Next", "Helvetica Neue", "SF Pro Display", system-ui, -apple-system, Roboto, Arial, sans-serif',
  cond: '"Avenir Next Condensed", "Helvetica Neue Condensed", "Roboto Condensed", "Arial Narrow", "Avenir Next", "Helvetica Neue", Roboto, Arial, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, "Roboto Mono", Consolas, monospace',
  book: '"Baskerville", "Hoefler Text", "Libre Baskerville", "Palatino", Georgia, serif',
  geo: '"Futura", "Avenir Next", "Century Gothic", "Trebuchet MS", system-ui, sans-serif',
  typewriter: '"American Typewriter", "Courier New", Courier, monospace',
};

/** Kartenstile für Flug und Strecke */
const MAP_THEMES = {
  nacht: { label: 'Nacht', dark: true, bg0: '#0d1829', bg1: '#04060a', body0: '#16263e', body1: '#0a1220', limb: 'rgba(159,184,220,0.35)', grid: 'rgba(159,184,220,0.13)', land: 'rgba(186,204,230,0.36)', city: 'rgba(239,230,210,0.34)', ink: '#efe6d2', text: '#efe6d2' },
  papier: { label: 'Papier', dark: false, bg0: '#f3ecdc', bg1: '#d9ccb0', body0: '#f1e9d8', body1: '#d6c8aa', limb: 'rgba(40,32,20,0.35)', grid: 'rgba(40,32,20,0.13)', land: 'rgba(40,32,20,0.42)', city: 'rgba(40,32,20,0.38)', ink: '#b04a2e', text: '#1d1914' },
  mono: { label: 'Schwarzweiß', dark: true, bg0: '#171717', bg1: '#000000', body0: '#1f1f1f', body1: '#0a0a0a', limb: 'rgba(255,255,255,0.35)', grid: 'rgba(255,255,255,0.1)', land: 'rgba(255,255,255,0.32)', city: 'rgba(255,255,255,0.4)', ink: '#ffffff', text: '#ffffff' },
  signal: { label: 'Signal', dark: true, bg0: '#131418', bg1: '#050506', body0: '#1a1b20', body1: '#0c0d10', limb: 'rgba(255,106,43,0.4)', grid: 'rgba(255,255,255,0.08)', land: 'rgba(255,255,255,0.24)', city: 'rgba(255,106,43,0.55)', ink: '#ff6a2b', text: '#f4f1ea' },
  eis: { label: 'Eis', dark: false, bg0: '#eef3f8', bg1: '#c5d3e3', body0: '#f5f8fb', body1: '#d0dbe8', limb: 'rgba(15,31,58,0.3)', grid: 'rgba(15,31,58,0.1)', land: 'rgba(28,53,96,0.38)', city: 'rgba(28,53,96,0.42)', ink: '#1f4ea3', text: '#0f1f3a' },
  salbei: { label: 'Salbei', dark: true, bg0: '#1d2621', bg1: '#0a0e0c', body0: '#25312b', body1: '#121814', limb: 'rgba(196,214,190,0.35)', grid: 'rgba(196,214,190,0.1)', land: 'rgba(196,214,190,0.34)', city: 'rgba(240,230,200,0.38)', ink: '#e6d7b3', text: '#efe6d2' },
};
const MAP_INKS = ['', '#efe6d2', '#ffffff', '#ff6a2b', '#e4c16b', '#7fb2ff', '#e8798f'];

/** Schrift für Filmtitel (Titelkarte, Ortsname, Route, Etappen, Abspann) */
const FONT_SETS = {
  // title: große Titel; small: kleine Zeilen (Untertitel, Datum, Kapitelnummer) passend zur Titelschrift
  klassisch: { label: 'Klassisch', css: OV_FONTS.serif, title: (s) => `400 ${s}px ${OV_FONTS.serif}`, small: (s) => `500 ${s}px ${OV_FONTS.sans}` },
  modern: { label: 'Modern', css: OV_FONTS.sans, weight: 500, title: (s) => `500 ${s * 0.72}px ${OV_FONTS.sans}`, upper: true, track: 0.16, small: (s) => `500 ${s}px ${OV_FONTS.sans}` },
  grotesk: { label: 'Grotesk', css: OV_FONTS.cond, weight: 800, title: (s) => `800 ${s * 0.95}px ${OV_FONTS.cond}`, upper: true, track: 0.01, small: (s) => `600 ${s * 1.08}px ${OV_FONTS.cond}` },
  editorial: { label: 'Editorial', css: OV_FONTS.book, italic: true, title: (s) => `italic 400 ${s * 1.02}px ${OV_FONTS.book}`, small: (s) => `500 ${s}px ${OV_FONTS.sans}` },
  geo: { label: 'Geometrisch', css: OV_FONTS.geo, weight: 500, title: (s) => `500 ${s * 0.74}px ${OV_FONTS.geo}`, upper: true, track: 0.2, small: (s) => `500 ${s}px ${OV_FONTS.geo}` },
  mono: { label: 'Mono', css: OV_FONTS.mono, weight: 500, title: (s) => `500 ${s * 0.56}px ${OV_FONTS.mono}`, upper: true, track: 0.12, small: (s) => `500 ${s * 0.92}px ${OV_FONTS.mono}` },
};
const easeInCubic = (x) => x * x * x;

const TEXT_STYLES = {
  modern: { label: 'Modern', css: OV_FONTS.sans, font: (s) => `600 ${s}px ${OV_FONTS.sans}`, upper: true, track: 0.16 },
  classic: { label: 'Klassisch', css: OV_FONTS.serif, font: (s) => `italic 400 ${s * 1.2}px ${OV_FONTS.serif}`, upper: false, track: 0.02 },
  editorial: { label: 'Editorial', css: OV_FONTS.book, font: (s) => `italic 400 ${s * 1.15}px ${OV_FONTS.book}`, upper: false, track: 0.01 },
  bold: { label: 'Groß', css: OV_FONTS.cond, font: (s) => `800 ${s * 1.35}px ${OV_FONTS.cond}`, upper: true, track: 0.02 },
  geo: { label: 'Geometrisch', css: OV_FONTS.geo, font: (s) => `500 ${s * 0.95}px ${OV_FONTS.geo}`, upper: true, track: 0.22 },
  mono: { label: 'Mono', css: OV_FONTS.mono, font: (s) => `500 ${s * 0.72}px ${OV_FONTS.mono}`, upper: true, track: 0.14 },
  typewriter: { label: 'Schreibmaschine', css: OV_FONTS.typewriter, font: (s) => `400 ${s * 0.85}px ${OV_FONTS.typewriter}`, upper: false, track: 0.02 },
  caption: { label: 'Untertitel', css: OV_FONTS.mono, font: (s) => `400 ${s * 0.72}px ${OV_FONTS.mono}`, upper: false, track: 0.04 },
};
const TEXT_ANIMS = { rise: 'Einschweben', fade: 'Einblenden', type: 'Tippen', words: 'Wort im Takt', track: 'Aufziehen', none: 'Ohne' };
const TEXT_BGS = { none: 'Ohne', bar: 'Balken', block: 'Block' };
const LEGACY_STYLE = { hand: 'classic', type: 'caption', pill: 'modern' };

const STICKERS = { pin: { label: 'Ort' }, date: { label: 'Datum' } };

const easeOutCubic = (x) => 1 - Math.pow(1 - x, 3);
const cl01 = (x) => Math.max(0, Math.min(1, x));
const easeInOut3 = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);


/** Zeichenbreite; Ziffern auf Wunsch gleich breit (Zahlen, die sich ändern, springen dann nicht). */
function charW(ctx, ch, tab) {
  return tab && ch >= '0' && ch <= '9' ? ctx.measureText('0').width : ctx.measureText(ch).width;
}

function trackedWidth(ctx, text, track, size, tab) {
  let w = 0;
  for (const ch of text) w += charW(ctx, ch, tab);
  return w + Math.max(0, Array.from(text).length - 1) * track * size;
}

function drawTracked(ctx, text, x, y, track, size, align, tab) {
  const w = trackedWidth(ctx, text, track, size, tab);
  let cx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const prev = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const ch of text) {
    const cw = charW(ctx, ch, tab);
    ctx.fillText(ch, cx + (cw - ctx.measureText(ch).width) / 2, y);
    cx += cw + track * size;
  }
  ctx.textAlign = prev;
  return w;
}

function fitSize(ctx, text, fontFn, size, maxW, track) {
  let s = size;
  for (let i = 0; i < 14; i++) {
    ctx.font = fontFn(s);
    if (trackedWidth(ctx, text, track || 0, s) <= maxW) break;
    s *= 0.9;
  }
  return s;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Flugbogen (für Flug-Etappen): gleichmäßig gewölbt, immer nach oben. */
function arcPath(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = Math.hypot(dx, dy) || 1;
  let nx = -dy / d, ny = dx / d;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const c = [(a[0] + b[0]) / 2 + nx * d * 0.28, (a[1] + b[1]) / 2 + ny * d * 0.28];
  const pts = [];
  for (let k = 0; k <= 28; k++) { const u = k / 28, v = 1 - u; pts.push([v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]]); }
  return pts;
}
class OverlayPainter {
  constructor() {
    this.top = document.createElement('canvas');
    this.w = 0; this.h = 0;
    this.lastKey = '';
  }

  resize(w, h) {
    if (this.w === w && this.h === h) return;
    this.w = w; this.h = h;
    this.top.width = w; this.top.height = h;
    this.lastKey = '';
  }

  get fontSet() { return FONT_SETS[this.fontKey] || FONT_SETS.klassisch; }
  font(role, size) { return this.fontSet.title(size); }
  /** kleine Zeilen: dieselbe Schriftfamilie im ganzen Film */
  small(size) { return this.fontSet.small(size); }
  /** Schriftfarbe des Looks mit Deckkraft */
  inkA(a) { const h = this.ink; return `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`; }
  toneA(a) { const c = this.pal.tone; return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

  /** Kleine Zeile in Versalien, gesperrt. */
  drawLabel(ctx, text, x, y, size, align, alpha = 1, track = 0.32) {
    if (!text) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    // kleine Zeilen etwas größer und mit weichem Schatten: auf dem Handy auch über hellen Bildern lesbar
    size = Math.max(size * 1.12, Math.min(this.w, this.h) * 0.024);
    ctx.font = this.small(size);
    ctx.fillStyle = this.ink;
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = size * 0.5;
    ctx.textBaseline = 'alphabetic';
    drawTracked(ctx, String(text).toLocaleUpperCase('de-DE'), x, y, track, size, align, true);
    ctx.restore();
  }

  /**
   * Zeitpunkte für Wörter: auf den Beats ab dem Start der Einblendung (bei schnellen Songs jeder zweite),
   * damit Titel im Takt erscheinen. Ohne Beats gleichmäßig.
   */
  beatTimes(o, n, from = o.start) {
    const b = (this.beats || []).filter((x) => x >= from - 0.03 && x < o.end - 0.3);
    const gap = b.length > 1 ? b[1] - b[0] : 0.5;
    const step = gap < 0.36 ? 2 : 1;
    const out = [];
    for (let i = 0; i < n; i++) out.push(b[i * step] != null ? b[i * step] : (out.length ? out[out.length - 1] + Math.max(0.2, gap * step) : from));
    return out;
  }
  /** Ausstieg auf dem letzten Beat vor dem Ende (sonst kurz davor). */
  beatExit(o) {
    const b = (this.beats || []).filter((x) => x > o.start + 0.8 && x <= o.end - 0.28);
    return b.length ? b[b.length - 1] : o.end - 0.4;
  }

  /**
   * Titel wortweise im Takt: jedes Wort gleitet aus einer Maske nach oben ins Bild,
   * beim Ausstieg (auf einem Beat) gleiten alle zusammen nach oben hinaus. Liefert die Breite.
   */
  maskTitle(ctx, text, x, y, size, track, align, times, exitT, t, fontFn) {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    if (!words.length) return 0;
    ctx.font = fontFn(size);
    const space = ctx.measureText(' ').width + track * size;
    const widths = words.map((w) => trackedWidth(ctx, w, track, size));
    const total = widths.reduce((a, w) => a + w, 0) + space * (words.length - 1);
    let wx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    const q = easeInCubic(cl01((t - exitT) / 0.32));
    const top = y - size * 1.05, h = size * 1.4;
    words.forEach((w, i) => {
      const p = easeOutCubic(cl01((t - times[Math.min(i, times.length - 1)]) / 0.42));
      if (p > 0 && q < 1) {
        ctx.save();
        ctx.beginPath(); ctx.rect(wx - size * 0.2, top, widths[i] + size * 0.4, h); ctx.clip();
        ctx.globalAlpha *= Math.min(1, p * 1.4) * (1 - q);
        drawTracked(ctx, w, wx, y + (1 - p) * size * 0.95 - q * size * 1.1, track, size, 'left');
        ctx.restore();
      }
      wx += widths[i] + space;
    });
    return total;
  }
  caseTitle(text) { return this.fontSet.upper ? String(text || '').toLocaleUpperCase('de-DE') : String(text || ''); }
  titleTrack(def) { return this.fontSet.track != null ? this.fontSet.track : def; }

  /** Steht die Bauchbinde/das Kapitel gerade still (alle Wörter, Unterzeile und Koordinaten fertig, Ausstieg noch nicht)? */
  quiet(o, t) {
    const k = this.fontKey + '|' + (this.beats.length ? this.beats[0] : 0);
    if (!o._q || o._q.k !== k) {
      const words = Math.max(1, this.caseTitle(o.text).split(/\s+/).filter(Boolean).length);
      const times = this.beatTimes(o, words + 1);
      let qa = times[words] + 0.6;
      const geo = o.geo;
      if (geo && geo.lat != null) qa = Math.max(qa, o.start + 1.2);
      if (geo && geo.km != null) qa = Math.max(qa, o.start + Math.max(1.3, (o.end - o.start) * 0.45) + 1.0);
      o._q = { k, a: qa, b: this.beatExit(o) - 0.01 };
    }
    return t >= o._q.a && t < o._q.b;
  }

  /** Zeichnet alle aktiven Einblendungen. Liefert {top, topDirty}. */
  paint(plan, t, selectedId) {
    const res = { top: false, topDirty: false };
    this.fontKey = plan.font;
    this.beats = plan.beats || [];
    this.pal = (LOOKS[plan.look] || LOOKS.natur).pal;
    this.ink = this.pal.ink;
    const active = plan.overlays.filter((o) => t >= o.start - 0.001 && t < o.end);
    if (!active.length) { this.lastKey = ''; return res; }
    // Titel und Kapitel stehen nach dem Einblenden still bis zum Ausstieg: dann nicht in jedem Bild neu zeichnen
    const anim = active.some((o) => (o.type === 'lower' || o.type === 'chapter' ? !this.quiet(o, t) : o.type === 'routemap' ? t - o.start < 2.6 || o.end - t < 0.5 : o.type !== 'usertext' && o.type !== 'sticker') || ((o.type === 'usertext' || o.type === 'sticker') && (t - o.start < (o.anim === 'type' || o.anim === 'words' ? 6 : 1) || o.end - t < 0.4)));
    const key = anim ? 't' + t.toFixed(4) : 's' + JSON.stringify(active.map((o) => [o.id, o.text, o.x, o.y, o.size, o.style, o.kind, o.color, o.rot, o.bg, o.anim])) + '|' + (selectedId || '') + '|' + plan.band.join(',') + '|' + plan.look + '|' + plan.font;
    if (key !== this.lastKey) {
      const ctx = this.top.getContext('2d');
      ctx.clearRect(0, 0, this.w, this.h);
      const geo = this.geometry(plan);
      for (const o of active) {
        ctx.save();
        if (o.type === 'titlecard') this.drawTitleCard(ctx, o, t, geo);
        else if (o.type === 'endcard') this.drawEndCard(ctx, o, t, geo);
        else if (o.type === 'lower') this.drawLower(ctx, o, t, geo);
        else if (o.type === 'type') this.drawType(ctx, o, t, geo);
        else if (o.type === 'chapter') this.drawChapter(ctx, o, t, geo);
        else if (o.type === 'city') this.drawCity(ctx, o, t, geo);
        else if (o.type === 'flight') this.drawFlight(ctx, o, t, geo);
        else if (o.type === 'routemap') this.drawRouteMap(ctx, o, t, geo);
        else if (o.type === 'knockout') this.drawKnockout(ctx, o, t, geo);
        else if (o.type === 'leader') this.drawLeader(ctx, o, t, geo);
        else if (o.type === 'rewind') this.drawRewind(ctx, o, t, geo);
        else if (o.type === 'reveal') this.drawReveal(ctx, o, t, geo);
        else if (o.type === 'countin') this.drawCountIn(ctx, o, t, geo);
        else if (o.type === 'datestamp') this.drawDateStamp(ctx, o, t, geo);
        else if (o.type === 'usertext') this.drawUserText(ctx, o, t, geo, o.id === selectedId);
        else if (o.type === 'sticker') this.drawSticker(ctx, o, t, geo, o.id === selectedId);
        ctx.restore();
      }
      this.lastKey = key;
      res.topDirty = true;
    }
    res.top = true;
    return res;
  }

  /** Bildbereich und Textzonen (berücksichtigt Kinoband und Instagram-Schutzzonen). */
  geometry(plan) {
    const W = this.w, H = this.h;
    const by = plan.band[0] * H, bh = plan.band[1] * H;
    const vertical = H > W;
    const base = Math.min(W, bh * (vertical && plan.band[1] < 1 ? 1.6 : 1));
    const below = H - (by + bh);
    // Bauchbinde: im Kinoband unterhalb des Bildes, sonst über der Instagram-Leiste
    let lowerY;
    if (plan.band[1] < 1 && below > H * 0.1) lowerY = by + bh + below * 0.34;
    else lowerY = vertical ? H * 0.74 : by + bh * 0.84;
    return { W, H, by, bh, base, vertical, lowerY, cx: W / 2, cy: by + bh / 2, margin: W * (vertical ? 0.08 : 0.06) };
  }

  shadow(ctx, size) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = size * 0.35;
  }

  drawTitleCard(ctx, o, t, g) {
    // Titelkarte: Titel wortweise im Takt, darüber das Datum, darunter eine feine Linie
    const title = this.caseTitle(o.text);
    const tr = this.titleTrack(0.04);
    const size = fitSize(ctx, title, (sz) => this.font('title', sz), g.base * 0.12, g.W * 0.82, tr);
    const times = this.beatTimes(o, Math.max(1, title.split(/\s+/).length));
    const exitT = this.beatExit(o);
    const out = cl01((t - exitT) / 0.32);
    ctx.fillStyle = this.ink;
    this.shadow(ctx, size * 0.5);
    ctx.textBaseline = 'alphabetic';
    const y = g.cy + size * 0.3;
    if (title) this.maskTitle(ctx, title, g.cx, y, size, tr, 'center', times, exitT, t, (sz) => this.font('title', sz));
    const last = times[times.length - 1];
    const lp = easeOutCubic(cl01((t - last) / 0.6)) * (1 - out);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = lp * 0.8;
    const rw = g.W * 0.1 * lp;
    ctx.fillRect(g.cx - rw / 2, y + size * 0.42, rw, Math.max(1, g.base * 0.002));
    ctx.globalAlpha = 1;
    this.drawLabel(ctx, o.sub, g.cx, y - size * 1.15, g.base * 0.022, 'center', lp);
    this.drawGeoLine(ctx, o, t, g.cx, y + size * 0.42 + g.base * 0.055, g.base * 0.021, 'center', lp);
  }


  drawEndCard(ctx, o, t, g) {
    if (!(o.text || o.sub)) return;
    const title = this.caseTitle(o.text);
    const tr = this.titleTrack(0.04);
    const size = fitSize(ctx, title, (sz) => this.font('title', sz), g.base * 0.09, g.W * 0.78, tr);
    const times = this.beatTimes(o, Math.max(1, title.split(/\s+/).length));
    ctx.fillStyle = this.ink;
    ctx.textBaseline = 'alphabetic';
    if (title) this.maskTitle(ctx, title, g.cx, g.cy, size, tr, 'center', times, Infinity, t, (sz) => this.font('title', sz));
    const lp = easeOutCubic(cl01((t - times[times.length - 1]) / 0.6));
    ctx.globalAlpha = lp * 0.8;
    const rw = g.W * 0.07 * lp;
    ctx.fillRect(g.cx - rw / 2, g.cy + size * 0.42, rw, Math.max(1, g.base * 0.002));
    ctx.globalAlpha = 1;
    const ss = g.base * 0.021;
    this.drawLabel(ctx, o.sub, g.cx, g.cy + size * 0.42 + ss * 2.5, ss, 'center', lp);
    if (o.stats) this.drawLabel(ctx, o.stats, g.cx, g.cy + size * 0.42 + ss * 5.2, ss * 0.92, 'center', 0.7 * cl01((t - o.start - 0.5) / 0.6), 0.26);
  }


  /** Ortsname groß im Bild: Stories starten nie auf Schwarz. */
  drawCity(ctx, o, t, g) {
    // Ortsname groß im Bild, wortweise im Takt; Datum und Koordinaten folgen auf dem nächsten Beat
    const title = this.caseTitle(o.text);
    const tr = this.titleTrack(0.02);
    const size = fitSize(ctx, title, (sz) => this.font('title', sz), g.base * 0.19, g.W * 0.86, tr + 0.03);
    const words = Math.max(1, title.split(/\s+/).length);
    const times = this.beatTimes(o, words + 1);
    const exitT = this.beatExit(o);
    const out = cl01((t - exitT) / 0.32);
    ctx.fillStyle = this.ink;
    this.shadow(ctx, size * 0.6);
    ctx.textBaseline = 'alphabetic';
    const y = g.cy + size * 0.3;
    const track = tr + 0.03 * easeOutCubic(cl01((t - o.start) / 3));
    this.maskTitle(ctx, title, g.cx, y, size, track, 'center', times, exitT, t, (sz) => this.font('title', sz));
    const sp = easeOutCubic(cl01((t - times[words]) / 0.5)) * (1 - out);
    const ss = g.base * 0.024;
    this.drawLabel(ctx, o.sub, g.cx, y + ss * 2.8 - (1 - sp) * ss * 0.8, ss, 'center', sp, 0.4);
    this.drawGeoLine(ctx, o, t, g.cx, y + ss * (o.sub ? 5 : 2.8), g.base * 0.022, 'center', sp);
  }


  /**
   * Aufblende: schlichter, weit gesperrter Titel, eine feine Linie wächst aus der Mitte.
   * Die Sperrung zieht langsam zusammen, kurz vor dem Höhepunkt löst sich alles nach oben auf.
   */
  drawReveal(ctx, o, t, g) {
    // Aufblende: kleiner, weit gesperrter Titel; Wörter kommen auf den Beats, die Linie wächst mit,
    // kurz vor dem Höhepunkt gleitet alles auf einem Beat nach oben hinaus
    const title = this.caseTitle(o.text);
    const u = cl01((t - o.start) / Math.max(0.5, o.end - o.start));
    const track = 0.42 - 0.18 * easeOutCubic(u);
    const size = fitSize(ctx, title, (sz) => this.font('title', sz), g.base * 0.075, g.W * 0.8, track);
    const words = Math.max(1, title.split(/\s+/).length);
    const times = this.beatTimes(o, words + 1);
    const exitT = this.beatExit(o);
    const out = cl01((t - exitT) / 0.32);
    ctx.fillStyle = this.ink;
    this.shadow(ctx, size * 0.8);
    ctx.textBaseline = 'alphabetic';
    const y = g.cy + size * 0.3;
    this.maskTitle(ctx, title, g.cx, y, size, track, 'center', times, exitT, t, (sz) => this.font('title', sz));
    const lp = easeOutCubic(cl01((t - times[0]) / 1.6)) * (1 - out);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = lp * 0.75;
    const lw = g.W * 0.16 * lp;
    ctx.fillRect(g.cx - lw / 2, y + size * 0.55, lw, Math.max(1, g.base * 0.0016));
    ctx.globalAlpha = 1;
    const ss = g.base * 0.022;
    this.drawLabel(ctx, o.sub, g.cx, y + size * 0.55 + ss * 2.6, ss, 'center', 0.85 * easeOutCubic(cl01((t - times[words]) / 0.5)) * (1 - out), 0.45);
  }


  /** Flug: Globus oder flache Karte mit Kontinenten, Großkreis, Flugzeug, Zeiten. Deckt das Bild ab. */
  drawFlight(ctx, o, t, g) {
    const f = o.flight;
    const local = t - o.start, dur = o.end - o.start, left = o.end - t;
    const fade = smooth(cl01(local / 0.45)) * smooth(cl01(left / 0.45));
    if (fade <= 0 || !f) return;
    const th = MAP_THEMES[o.theme] || MAP_THEMES.nacht;
    const ink = o.ink || th.ink, text = th.text;
    const W = g.W, H = g.H;
    ctx.globalAlpha = fade;
    const bgG = ctx.createRadialGradient(W / 2, g.cy, 0, W / 2, g.cy, Math.hypot(W, H) * 0.6);
    bgG.addColorStop(0, th.bg0); bgG.addColorStop(1, th.bg1);
    ctx.fillStyle = bgG;
    ctx.fillRect(0, 0, W, H);
    const rad = Math.PI / 180;
    const vec = (p) => [Math.cos(p[0] * rad) * Math.cos(p[1] * rad), Math.cos(p[0] * rad) * Math.sin(p[1] * rad), Math.sin(p[0] * rad)];
    const toLL = (v) => [Math.asin(Math.max(-1, Math.min(1, v[2]))) / rad, Math.atan2(v[1], v[0]) / rad];
    const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
    const A = f.from && f.from.pos ? vec(f.from.pos) : null, B = f.to && f.to.pos ? vec(f.to.pos) : null;
    const draw = easeInOut3(cl01((local - dur * 0.14) / (dur * 0.66)));
    const lw = Math.max(1.4, g.base * 0.0036);
    const short = Math.min(W, g.bh);
    const X0 = W / 2;
    let Y0 = g.cy - g.bh * (g.vertical ? 0.06 : 0.1);
    let path = [];
    const flat = o.view === 'flat';
    if (A && B) {
      const dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
      const delta = Math.max(1e-4, Math.acos(dot));
      const slerp = (u) => { const s1 = Math.sin((1 - u) * delta) / Math.sin(delta), s2 = Math.sin(u * delta) / Math.sin(delta); return [A[0] * s1 + B[0] * s2, A[1] * s1 + B[1] * s2, A[2] * s1 + B[2] * s2]; };
      const gc = []; for (let k = 0; k <= 96; k++) gc.push(toLL(slerp(k / 96)));
      const mid = toLL(slerp(0.42 + 0.16 * smooth(cl01(local / dur))));
      const zoomIn = 0.86 + 0.14 * easeOutCubic(cl01(local / 1.6));
      let pr, degPx, bounds;
      if (flat) {
        // flache Karte (plattkartenähnlich), Kamera gleitet mit
        const lat0 = mid[0], lon0 = mid[1], cf = Math.cos(lat0 * rad);
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        for (const [la, lo] of gc) { const x = wrap(lo - lon0) * cf, y = la - lat0; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
        const k = Math.min((W * 0.7) / Math.max(0.5, maxX - minX), (g.bh * 0.42) / Math.max(0.5, maxY - minY), short * 0.08) * zoomIn;
        pr = (la, lo) => [X0 + wrap(lo - lon0) * cf * k, Y0 - (la - lat0) * k, 1];
        degPx = k;
        const hl = (H / 2 + 40) / k, wl = (W / 2 + 40) / (k * cf);
        bounds = { lat0, la0: Math.max(-89, lat0 - hl), la1: Math.min(89, lat0 + hl), lo0: lon0 - Math.min(180, wl), lo1: lon0 + Math.min(180, wl) };
      } else {
        // Globus (orthografisch), Blick leicht südlich: der Großkreis wölbt sich nach oben
        const tilt = Math.min(22, (delta / rad) * 0.32);
        const lat0 = mid[0] - tilt, lon0 = mid[1];
        const span = short * (g.vertical ? 0.62 : 0.5);
        const Rmin = short * (g.vertical ? 0.4 : 0.33);
        const R = Math.max(Rmin, span / (2 * Math.sin(Math.min(delta, 3) / 2))) * zoomIn;
        Y0 += R * Math.sin(tilt * rad) * 0.55;
        const s0 = Math.sin(lat0 * rad), c0 = Math.cos(lat0 * rad);
        pr = (lat, lon) => {
          const cl = Math.cos(lat * rad), sl = Math.sin(lat * rad), dl = (lon - lon0) * rad;
          return [X0 + R * cl * Math.sin(dl), Y0 - R * (c0 * sl - s0 * cl * Math.cos(dl)), s0 * sl + c0 * cl * Math.cos(dl)];
        };
        degPx = R * rad;
        const diag = Math.hypot(W, H);
        if (R < diag * 0.75) {
          const body = ctx.createRadialGradient(X0 - R * 0.3, Y0 - R * 0.35, R * 0.1, X0, Y0, R);
          body.addColorStop(0, th.body0); body.addColorStop(1, th.body1);
          ctx.fillStyle = body;
          ctx.beginPath(); ctx.arc(X0, Y0, R, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = th.limb; ctx.lineWidth = lw * 0.8; ctx.stroke();
          ctx.globalAlpha = fade * 0.35;
          ctx.strokeStyle = th.limb; ctx.lineWidth = lw * 6;
          ctx.beginPath(); ctx.arc(X0, Y0, R + lw * 3, 0, Math.PI * 2); ctx.stroke();
          ctx.globalAlpha = fade;
        }
        const view = Math.min(90, (Math.asin(Math.min(1, diag / (2 * R))) / rad) * 1.2 + 2);
        const lonSpan = Math.min(180, view / Math.max(0.2, Math.cos(Math.min(80, Math.abs(lat0)) * rad)));
        bounds = { la0: Math.max(-89, lat0 - view), la1: Math.min(89, lat0 + view), lo0: lon0 - lonSpan, lo1: lon0 + lonSpan };
      }
      const onScreen = (q) => q[2] > 0.02 && q[0] > -4 && q[0] < W + 4 && q[1] > -4 && q[1] < H + 4;
      // Kontinente: Punkte oder Fläche aus der Landmaske (bei starkem Zoom ausgeblendet, dort ist die Küste zu grob)
      const landA = o.land === 'off' ? 0 : cl01((95 - degPx) / 45);
      if (landA > 0) {
        const solid = o.land === 'solid';
        const target = solid ? Math.max(2, g.base * 0.0035) : g.base * 0.0105;
        const sd = Math.max(LAND_RES, target / degPx);
        const px = sd * degPx;
        ctx.fillStyle = th.land;
        ctx.globalAlpha = fade * landA;
        for (let la = Math.ceil(bounds.la0 / sd) * sd; la <= bounds.la1; la += sd) {
          // Globus: gleiche Abstände auf der Kugel; flache Karte: gleiche Abstände auf dem Bildschirm
          const sdl = flat ? sd / Math.max(0.15, Math.cos(bounds.lat0 * rad)) : sd / Math.max(0.15, Math.cos(la * rad));
          for (let lo = Math.ceil(bounds.lo0 / sdl) * sdl; lo <= bounds.lo1; lo += sdl) {
            if (!isLand(la, lo)) continue;
            const q = pr(la, lo);
            if (!onScreen(q)) continue;
            if (solid) { const sz = px * 1.15 * (flat ? 1 : Math.max(0.3, q[2])); ctx.fillRect(q[0] - sz / 2, q[1] - sz / 2, sz, sz); } else { const r = Math.max(0.9, px * 0.2) * (flat ? 1 : 0.5 + 0.5 * q[2]); ctx.fillRect(q[0] - r, q[1] - r, r * 2, r * 2); }
          }
        }
        ctx.globalAlpha = fade;
      }
      // Gradnetz
      const spanDeg = bounds.la1 - bounds.la0;
      const step = spanDeg > 100 ? 15 : spanDeg > 40 ? 10 : spanDeg > 16 ? 5 : spanDeg > 6 ? 2 : 1;
      const res = Math.max(0.25, step / 8);
      ctx.strokeStyle = th.grid;
      ctx.lineWidth = Math.max(1, lw * 0.6);
      const line = (pts) => { ctx.beginPath(); let on = false; for (const [la, lo] of pts) { const q = pr(la, lo); if (q[2] > 0) { if (on) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); on = true; } else on = false; } ctx.stroke(); };
      for (let la = Math.ceil(bounds.la0 / step) * step; la <= bounds.la1; la += step) { const pts = []; for (let lo = bounds.lo0; lo <= bounds.lo1; lo += res) pts.push([la, lo]); line(pts); }
      for (let lo = Math.ceil(bounds.lo0 / step) * step; lo <= bounds.lo1; lo += step) { const pts = []; for (let la = bounds.la0; la <= bounds.la1; la += res) pts.push([la, lo]); line(pts); }
      // Städte als Lichter
      ctx.fillStyle = th.city;
      const dotR = Math.max(1, lw * 0.55);
      for (const c of CITIES) { const q = pr(c[1], c[2]); if (onScreen(q)) ctx.fillRect(q[0] - dotR, q[1] - dotR, dotR * 2, dotR * 2); }
      path = gc.map(([la, lo]) => pr(la, lo));
    } else {
      const a = [W * 0.2, Y0 + short * 0.1], b = [W * 0.8, Y0 + short * 0.1];
      path = arcPath(a, b).map((q) => [q[0], q[1], 1]);
    }
    // Flugbahn
    ctx.lineCap = 'round';
    ctx.setLineDash([lw * 0.2, lw * 3]);
    ctx.strokeStyle = th.grid.replace(/[\d.]+\)$/, '0.5)');
    ctx.lineWidth = lw;
    ctx.beginPath(); path.forEach((q, k) => (k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke();
    const n = Math.max(1, Math.round(draw * (path.length - 1)));
    ctx.setLineDash([lw * 3.2, lw * 2.2]);
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw * 1.3;
    ctx.beginPath(); for (let k = 0; k <= n; k++) (k ? ctx.lineTo(path[k][0], path[k][1]) : ctx.moveTo(path[k][0], path[k][1])); ctx.stroke();
    ctx.setLineDash([]);
    const P0 = path[0], P1 = path[path.length - 1];
    ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(P0[0], P0[1], lw * 2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(P1[0], P1[1], lw * 2.6, 0, Math.PI * 2); ctx.stroke();
    if (draw > 0.995) { ctx.beginPath(); ctx.arc(P1[0], P1[1], lw * 1.5, 0, Math.PI * 2); ctx.fill(); }
    const hq = path[n], hp = path[Math.max(0, n - 2)];
    if (draw > 0.01 && draw < 0.995) {
      const ang = Math.atan2(hq[1] - hp[1], hq[0] - hp[0]) + Math.PI / 2;
      const ps = g.base * 0.0078;
      ctx.save();
      ctx.translate(hq[0], hq[1]);
      ctx.rotate(ang);
      ctx.scale(ps, ps);
      ctx.beginPath();
      ctx.moveTo(0, -5.2); ctx.quadraticCurveTo(0.9, -4.6, 0.9, -2.2); ctx.lineTo(5.6, 0.9); ctx.lineTo(5.6, 1.9); ctx.lineTo(0.9, 0.7);
      ctx.lineTo(0.8, 3.6); ctx.lineTo(2.2, 4.8); ctx.lineTo(2.2, 5.5); ctx.lineTo(0, 4.9); ctx.lineTo(-2.2, 5.5); ctx.lineTo(-2.2, 4.8);
      ctx.lineTo(-0.8, 3.6); ctx.lineTo(-0.9, 0.7); ctx.lineTo(-5.6, 1.9); ctx.lineTo(-5.6, 0.9); ctx.lineTo(-0.9, -2.2); ctx.quadraticCurveTo(-0.9, -4.6, 0, -5.2);
      ctx.fillStyle = ink;
      ctx.shadowColor = th.dark ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 6 / ps;
      ctx.fill();
      ctx.restore();
    }
    const ls = g.base * 0.02;
    ctx.font = this.small(ls);
    ctx.fillStyle = text;
    ctx.textBaseline = 'middle';
    const lab = (q, label, other) => {
      const right = q[0] >= other[0];
      const tw = trackedWidth(ctx, label, 0.2, ls);
      const tx = q[0] + (right ? 1 : -1) * lw * 6;
      const x = Math.max(g.margin * 0.5, Math.min(W - g.margin * 0.5 - tw, right ? tx : tx - tw));
      drawTracked(ctx, label, x, q[1] + (q[1] > Y0 ? ls * 1.4 : -ls * 1.4), 0.2, ls, 'left');
    };
    ctx.globalAlpha = fade * 0.85;
    lab(P0, (f.from && f.from.name || '').toLocaleUpperCase('de-DE'), P1);
    ctx.globalAlpha = fade * (0.35 + 0.5 * draw);
    lab(P1, (f.to && f.to.name || '').toLocaleUpperCase('de-DE'), P0);
    ctx.globalAlpha = fade;
    ctx.textBaseline = 'alphabetic';
    const title = this.caseTitle(`${f.from && f.from.name || ''} – ${f.to && f.to.name || ''}`);
    const size = fitSize(ctx, title, (sz) => this.font('title', sz), g.base * 0.075, W * 0.84, this.titleTrack(0.03));
    const ty = g.vertical ? g.by + g.bh * 0.8 : g.by + g.bh * 0.88;
    ctx.shadowColor = th.dark ? 'rgba(0,0,0,0.45)' : 'transparent';
    ctx.shadowBlur = size * 0.2;
    ctx.font = this.font('title', size);
    drawTracked(ctx, title, W / 2, ty, this.titleTrack(0.03), size, 'center');
    ctx.shadowColor = 'transparent';
    const ss = g.base * 0.019;
    ctx.font = this.small(ss);
    const info = [];
    if (f.dep) info.push('ABFLUG ' + f.dep);
    if (f.arr) info.push('ANKUNFT ' + f.arr);
    if (f.mins) info.push(`${Math.floor(f.mins / 60)} H ${String(f.mins % 60).padStart(2, '0')} MIN`);
    ctx.globalAlpha = fade * 0.75;
    if (info.length) drawTracked(ctx, info.join('   ·   '), W / 2, ty + ss * 2.6, 0.22, ss, 'center');
    if (f.km > 5 && o.km !== false) {
      ctx.globalAlpha = fade * 0.9;
      ctx.fillStyle = ink;
      drawTracked(ctx, `${Math.round(f.km * draw).toLocaleString('de-DE')} KM`, W / 2, ty + ss * (info.length ? 4.8 : 2.6), 0.3, ss, 'center');
    }
    const top = g.vertical ? Math.max(g.by + g.bh * 0.02, H * 0.13) : g.by + g.bh * 0.1;
    ctx.fillStyle = text;
    ctx.globalAlpha = fade * 0.55;
    drawTracked(ctx, 'FLUG', W / 2, top, 0.6, ss, 'center');
  }

  /**
   * Countdown wie ein alter Filmvorspann: Kreise, Fadenkreuz, umlaufender Zeiger, große Ziffer.
   * Darunter laufen deine Bilder in Schwarzweiß (nie ein schwarzes Bild), dazu Sepia, Flackern, Kratzer.
   */
  /** Zurückspulen wie auf einer alten Kassette: Bildstörstreifen, Zeilen, ◀◀ und rückwärts laufende Zeit. */
  drawRewind(ctx, o, t, g) {
    const W = g.W, top = g.by, bh = g.bh;
    const short = Math.min(W, bh);
    const local = t - o.start, dur = Math.max(0.1, o.end - o.start);
    const u = cl01(local / dur);
    const frame = Math.floor(t * 30);
    const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    ctx.save();
    ctx.beginPath(); ctx.rect(0, top, W, bh); ctx.clip();
    // kühler Videoton
    ctx.fillStyle = this.toneA(0.18);
    ctx.fillRect(0, top, W, bh);
    // Zeilenstruktur
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    const step = Math.max(2, Math.round(bh / 260));
    for (let y = top; y < top + bh; y += step * 2) ctx.fillRect(0, y, W, step);
    // Bildstörstreifen, die schnell nach oben laufen
    for (let k = 0; k < 2; k++) {
      const yb = top + bh * (1 - ((t * (1.7 + k * 0.9) + k * 0.37) % 1));
      const hb = bh * (0.035 + 0.02 * k);
      for (let i = 0; i < 14; i++) {
        const yy = yb + (i / 14) * hb;
        const x0 = rnd(frame * 31 + i + k * 7) * W * 0.6;
        ctx.fillStyle = `rgba(245,242,235,${(0.1 + rnd(frame + i * 3 + k) * 0.28).toFixed(3)})`;
        ctx.fillRect(x0, yy, W * (0.2 + rnd(i + frame) * 0.8), Math.max(1, hb / 16));
      }
    }
    // kurzes Aufflackern beim Einlegen des Rückspulens
    if (t < o.teaseEnd + 0.1) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 6; i++) ctx.fillRect(0, top + rnd(frame + i * 11) * bh, W, Math.max(2, bh * 0.012));
    }
    ctx.restore();
    // Anzeige
    const m = g.margin;
    const fs = short * 0.06;
    ctx.font = this.small(fs);
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = fs * 0.2;
    ctx.fillStyle = this.inkA(0.95);
    const y = top + m * 0.8;
    if (frame % 16 < 12) {
      // ◀◀ als zwei Dreiecke (unabhängig von der Schrift)
      const tw = fs * 0.62, th = fs * 0.72;
      for (let k = 0; k < 2; k++) {
        const x = m + k * tw * 0.95;
        ctx.beginPath(); ctx.moveTo(x, y + th / 2); ctx.lineTo(x + tw, y); ctx.lineTo(x + tw, y + th); ctx.closePath(); ctx.fill();
      }
      ctx.fillText('REW', m + tw * 2.3, y - fs * 0.04);
    }
    // Zeit läuft rückwärts auf 0:00:00 zu
    const secs = Math.max(0, Math.round((1 - u) * (o.span || 754)));
    const tc = `0:${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'left';
    drawTracked(ctx, tc, W - m, top + bh - m * 0.9, 0.08, fs, 'right', true);
    ctx.textAlign = 'left';
  }

  /**
   * Countdown vor dem Drop: große Ziffer in der Titelschrift auf jedem der letzten drei Beats,
   * ein feiner Ring läuft pro Beat einmal herum. Das Bild läuft weiter, nur leicht abgedunkelt.
   */
  drawCountIn(ctx, o, t, g) {
    const m = o.marks;
    let k = 0;
    while (k < m.length - 1 && t >= m[k + 1]) k++;
    const t0 = m[k], t1 = k + 1 < m.length ? m[k + 1] : o.end;
    const u = cl01((t - t0) / Math.max(0.05, t1 - t0));
    const short = Math.min(g.W, g.bh);
    const pop = easeOutCubic(cl01(u / 0.3));
    ctx.fillStyle = this.toneA(0.18 + 0.1 * (1 - u));
    ctx.fillRect(0, g.by, g.W, g.bh);
    ctx.fillStyle = this.ink;
    this.shadow(ctx, short * 0.04);
    const size = short * 0.34 * (1.12 - 0.12 * pop);
    ctx.globalAlpha = pop * (1 - cl01((u - 0.82) / 0.18));
    ctx.font = this.font('title', size);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(m.length - k), g.cx, g.cy);
    ctx.textAlign = 'left';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = this.inkA(0.8);
    ctx.lineWidth = Math.max(1.5, short * 0.004);
    ctx.beginPath();
    ctx.arc(g.cx, g.cy, short * 0.3, -Math.PI / 2, -Math.PI / 2 + easeInOut3(u) * Math.PI * 2);
    ctx.stroke();
  }

  /** Datumsstempel wie auf einer Digitalkamera der 2000er: orange Ziffern unten rechts. */
  drawDateStamp(ctx, o, t, g) {
    const W = g.W, short = Math.min(W, g.bh);
    const fs = short * 0.045;
    ctx.font = `600 ${fs}px ${OV_FONTS.mono}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    const a = cl01((t - o.start) / 0.15) * cl01((o.end - t) / 0.15);
    ctx.globalAlpha = a;
    const x = W - g.margin * 0.9, y = g.by + g.bh - g.margin * (g.vertical ? 1.6 : 0.8);
    // weiches Leuchten wie bei eingebrannten LED-Ziffern
    ctx.shadowColor = 'rgba(255,120,30,0.75)';
    ctx.shadowBlur = fs * 0.5;
    ctx.fillStyle = '#ffa23a';
    ctx.fillText(o.text, x, y);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,196,120,0.9)';
    ctx.fillText(o.text, x, y);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  drawLeader(ctx, o, t, g) {
    const W = g.W, H = g.H, cx = g.cx, cy = g.cy;
    const m = o.marks;
    let k = 0;
    while (k < m.length - 1 && t >= m[k + 1]) k++;
    const t0 = m[k], t1 = k + 1 < m.length ? m[k + 1] : o.end;
    const u = cl01((t - t0) / Math.max(0.05, t1 - t0));
    const frame = Math.floor(t * 24);
    const rnd = (n) => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
    const short = Math.min(W, g.bh);
    // Bildstand wackelt leicht wie im Projektor
    const jx = (rnd(frame) - 0.5) * short * 0.004, jy = (rnd(frame + 99) - 0.5) * short * 0.006;
    ctx.translate(jx, jy);
    // Ton des Looks (statt festem Sepia) und Flackern: der Vorspann gehört farblich schon zum Film
    ctx.fillStyle = this.toneA(0.22);
    ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = `rgba(10,8,6,${(0.04 + rnd(frame + 7) * 0.08).toFixed(3)})`;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    const vig = ctx.createRadialGradient(cx, cy, short * 0.25, cx, cy, Math.hypot(W, H) * 0.62);
    vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(8,6,4,0.62)');
    ctx.fillStyle = vig;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    const ink = this.inkA(0.92);
    const lw = Math.max(1.5, short * 0.005);
    const r1 = short * 0.3, r2 = short * 0.36;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = lw * 3;
    // Wischer: Fläche, die im Uhrzeigersinn einmal pro Ziffer umläuft
    const a0 = -Math.PI / 2, a1 = a0 + u * Math.PI * 2;
    ctx.fillStyle = this.inkA(0.16);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r2, a0, a1); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = lw;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a1) * r2, cy + Math.sin(a1) * r2); ctx.stroke();
    // Kreise und Fadenkreuz
    ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, r1, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = lw * 0.6;
    ctx.globalAlpha = 0.7;
    ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(W, cy); ctx.moveTo(cx, g.by); ctx.lineTo(cx, g.by + g.bh); ctx.stroke();
    ctx.globalAlpha = 1;
    // Ziffer
    const num = String(m.length - k);
    const size = r1 * 1.25 * (1.06 - 0.06 * easeOutCubic(cl01(u / 0.25)));
    ctx.font = this.font('title', size * 1.15);
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(num, cx, cy + size * 0.04);
    ctx.textAlign = 'left';
    ctx.shadowColor = 'transparent';
    // Kratzer und Staub, jedes Bild anders
    ctx.strokeStyle = this.inkA(0.35);
    ctx.lineWidth = Math.max(1, short * 0.0015);
    for (let i = 0; i < 2; i++) {
      if (rnd(frame * 3 + i) < 0.45) continue;
      const x = rnd(frame * 5 + i * 17) * W;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (rnd(frame + i) - 0.5) * short * 0.02, H); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,16,12,0.55)';
    for (let i = 0; i < 6; i++) {
      const r = short * (0.002 + rnd(frame * 11 + i) * 0.004);
      ctx.beginPath(); ctx.arc(rnd(frame * 13 + i * 3) * W, rnd(frame * 17 + i * 5) * H, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  /** „Durch den Namen“: Der Ortsname ist ein Fenster ins Bild, dann zoomt die Kamera durch die Buchstaben. */
  drawKnockout(ctx, o, t, g) {
    const title = this.caseTitle(o.text);
    if (!title) return;
    const local = t - o.start;
    const zp = cl01((t - o.zoomStart) / Math.max(0.1, o.end - o.zoomStart));
    const ez = zp * zp * zp;
    const set = this.fontSet;
    const heavy = (sz) => `${set.italic ? 'italic ' : ''}900 ${sz}px ${set.css}`;
    const size = fitSize(ctx, title, heavy, g.base * 0.4, g.W * 0.9, 0.0);
    const S = 1 + ez * 60;
    const settle = easeOutCubic(cl01(local / 0.9));
    // nie ganz schwarz: das Bild schimmert auch um die Buchstaben herum durch
    ctx.globalAlpha = 0.86 * (1 - smooth(cl01((zp - 0.55) / 0.45)));
    ctx.fillStyle = '#07090d';
    ctx.fillRect(0, 0, g.W, g.H);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 1;
    ctx.font = heavy(size);
    ctx.textBaseline = 'middle';
    ctx.translate(g.cx, g.cy);
    ctx.scale(S * (1.06 - 0.06 * settle), S * (1.06 - 0.06 * settle));
    drawTracked(ctx, title, 0, 0, 0.0, size, 'center');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (o.sub && zp < 0.05) this.drawLabel(ctx, o.sub, g.cx, g.cy + size * 0.75, g.base * 0.023, 'center', cl01((local - 0.4) / 0.5), 0.4);
    if (zp < 0.05) this.drawGeoLine(ctx, o, t, g.cx, g.cy + size * 0.75 + g.base * (o.sub ? 0.05 : 0), g.base * 0.022, 'center', 1);
  }

  drawLower(ctx, o, t, g) {
    // Bauchbinde: Titel in der Titelschrift, wortweise im Takt aus der Maske, Datum darunter
    const center = !!o.center;
    const title = this.caseTitle(o.text);
    const tr = this.titleTrack(0.06);
    const size = fitSize(ctx, title, (sz) => this.font('title', sz), g.base * 0.088, g.W - g.margin * 2, tr);
    const x = center ? g.cx : g.margin;
    const align = center ? 'center' : 'left';
    const y = g.lowerY;
    const words = Math.max(1, title.split(/\s+/).length);
    const times = this.beatTimes(o, words + 1);
    const exitT = this.beatExit(o);
    const out = cl01((t - exitT) / 0.32);
    ctx.fillStyle = this.ink;
    this.shadow(ctx, size * 0.6);
    ctx.textBaseline = 'alphabetic';
    const lp = easeOutCubic(cl01((t - times[0]) / 0.5)) * (1 - out);
    ctx.globalAlpha = lp * 0.85;
    const lw = g.W * 0.07 * lp;
    ctx.fillRect(center ? g.cx - lw / 2 : x, y - size * 1.25, lw, Math.max(1, g.base * 0.0022));
    ctx.globalAlpha = 1;
    this.maskTitle(ctx, title, x, y, size, tr, align, times, exitT, t, (sz) => this.font('title', sz));
    const sp = easeOutCubic(cl01((t - times[words]) / 0.5)) * (1 - out);
    const ss = g.base * 0.021;
    this.drawLabel(ctx, o.sub, x, y + ss * 2.4, ss, align, sp);
    this.drawGeoLine(ctx, o, t, x, y + ss * (o.sub ? 4.8 : 2.4), ss, align, sp);
  }


  /** Titel Wort für Wort auf den Beats, harte Schnitte, am Ende komplett mit Unterzeile. */
  drawType(ctx, o, t, g) {
    const words = this.caseTitle(o.text).split(/\s+/).filter(Boolean);
    if (!words.length) return;
    const beats = (o.beats && o.beats.length ? o.beats : [o.start]).filter((b) => b >= o.start - 0.01);
    let steps;
    if (words.length === 1) {
      const n = Math.min(4, Math.max(2, beats.length - 1), words[0].length);
      steps = Array.from({ length: n }, (_, k) => ({ text: words[0].slice(0, Math.ceil((words[0].length * (k + 1)) / n)), partial: k < n - 1 }));
    } else steps = words.map((w) => ({ text: w }));
    const final = { text: words.join(' '), final: true };
    const seq = steps.concat([final]);
    let idx = -1;
    for (let k = 0; k < seq.length; k++) if (beats[k] != null && t >= beats[k] - 0.001) idx = k;
    if (idx < 0) return;
    const cur = seq[Math.min(idx, seq.length - 1)];
    const left = o.end - t;
    const a = 1 - cl01((0.45 - left) / 0.45);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.ink;
    ctx.textBaseline = 'middle';
    this.shadow(ctx, g.base * 0.05);
    const bt = beats[Math.min(idx, beats.length - 1)];
    const sc = 1.03 - 0.03 * easeOutCubic(cl01((t - bt) / 0.35));
    if (!cur.final) {
      const full = words.length === 1 ? words[0] : cur.text;
      const size = fitSize(ctx, full, (sz) => this.font('title', sz), g.base * 0.26, g.W * 0.86, 0.02);
      ctx.font = this.font('title', size);
      ctx.translate(g.cx, g.cy);
      ctx.scale(sc, sc);
      if (words.length === 1) {
        const wFull = trackedWidth(ctx, full, 0.02, size);
        drawTracked(ctx, cur.text, -wFull / 2, 0, 0.02, size, 'left');
      } else drawTracked(ctx, cur.text, 0, 0, 0.02, size, 'center');
      return;
    }
    const size = fitSize(ctx, final.text, (sz) => this.font('title', sz), g.base * 0.15, g.W * 0.86, 0.06);
    ctx.font = this.font('title', size);
    drawTracked(ctx, final.text, g.cx, g.cy, 0.06, size, 'center');
    this.drawLabel(ctx, o.sub, g.cx, g.cy + size * 0.72, g.base * 0.023, 'center', a * cl01((t - bt) / 0.4), 0.4);
  }

  /**
   * Karten-Moment im Roadtrip: kleine Karte oben rechts, die ganze Route fein gepunktet,
   * die gefahrene Strecke in der Kartenfarbe, die neue Etappe zeichnet sich auf dem Beat bis zum neuen Ort.
   */
  drawRouteMap(ctx, o, t, g) {
    const pts = o.stops, k = o.idx;
    const fade = smooth(cl01((t - o.start) / 0.4)) * smooth(cl01((o.end - t) / 0.4));
    if (fade <= 0 || !pts || !pts[k] || !pts[k - 1]) return;
    const th = MAP_THEMES[o.theme] || MAP_THEMES.nacht;
    const ink = o.ink || th.ink;
    const W = g.W, H = g.H;
    const cw = Math.round(Math.min(W, H) * (g.vertical ? 0.3 : 0.22)), ch = Math.round(cw * 0.78);
    const x0 = W - g.margin - cw;
    const y0 = g.vertical && g.by < H * 0.05 ? H * 0.13 : Math.max(g.by + g.margin * 0.7, H * 0.13);
    const rad = Math.PI / 180;
    let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
    for (const p of pts) if (p) { la0 = Math.min(la0, p[0]); la1 = Math.max(la1, p[0]); lo0 = Math.min(lo0, p[1]); lo1 = Math.max(lo1, p[1]); }
    const cf = Math.cos(((la0 + la1) / 2) * rad);
    const pad = 0.16, lab = o.label ? ch * 0.2 : 0;
    const sc = Math.min((cw * (1 - 2 * pad)) / Math.max(0.05, (lo1 - lo0) * cf), ((ch - lab) * (1 - 2 * pad)) / Math.max(0.05, la1 - la0));
    const mx = (lo0 + lo1) / 2, my = (la0 + la1) / 2;
    const pr = (la, lo) => [x0 + cw / 2 + (lo - mx) * cf * sc, y0 + (ch - lab) / 2 - (la - my) * sc];
    // Hintergrund mit Landpunkten einmal je Größe und Thema zeichnen
    const bk = [cw, ch, o.theme].join('|');
    if (!o._bg || o._bg.k !== bk) {
      const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(cw, ch) : Object.assign(document.createElement('canvas'), { width: cw, height: ch });
      const b = c.getContext('2d');
      b.fillStyle = th.bg1; b.globalAlpha = th.dark ? 0.8 : 0.9;
      roundRect(b, 0, 0, cw, ch, cw * 0.06); b.fill();
      b.globalAlpha = 1;
      b.save(); roundRect(b, 0, 0, cw, ch, cw * 0.06); b.clip();
      const step = Math.max(LAND_RES, 3.2 / sc), r = Math.max(0.7, cw * 0.0045);
      b.fillStyle = th.land;
      for (let la = my - ch / 2 / sc; la <= my + ch / 2 / sc; la += step) {
        for (let lo = mx - cw / 2 / (sc * cf); lo <= mx + cw / 2 / (sc * cf); lo += step / cf) {
          if (!isLand(la, lo)) continue;
          const q = pr(la, lo);
          b.fillRect(q[0] - x0 - r, q[1] - y0 - r, r * 2, r * 2);
        }
      }
      b.restore();
      b.strokeStyle = th.limb; b.lineWidth = 1;
      roundRect(b, 0.5, 0.5, cw - 1, ch - 1, cw * 0.06); b.stroke();
      o._bg = { k: bk, c };
    }
    ctx.globalAlpha = fade;
    ctx.drawImage(o._bg.c, x0, y0);
    const lw = Math.max(1.2, cw * 0.012);
    const P = pts.map((p) => (p ? pr(p[0], p[1]) : null));
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // ganze Route fein gepunktet
    ctx.setLineDash([lw * 0.2, lw * 2.4]);
    ctx.strokeStyle = th.text; ctx.globalAlpha = fade * 0.45; ctx.lineWidth = lw;
    ctx.beginPath(); let on = false;
    for (const q of P) { if (!q) continue; if (on) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); on = true; }
    ctx.stroke();
    ctx.setLineDash([]);
    // gefahrene Strecke und neue Etappe
    const draw = easeInOut3(cl01((t - o.start - 0.25) / Math.max(0.8, o.draw || 1.6)));
    ctx.globalAlpha = fade; ctx.strokeStyle = ink; ctx.lineWidth = lw * 1.3;
    ctx.beginPath(); on = false;
    for (let i = 0; i < k; i++) { const q = P[i]; if (!q) continue; if (on) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); on = true; }
    const a = P[k - 1], b = P[k];
    const hx = a[0] + (b[0] - a[0]) * draw, hy = a[1] + (b[1] - a[1]) * draw;
    if (on) ctx.lineTo(hx, hy);
    ctx.stroke();
    ctx.fillStyle = th.text; ctx.globalAlpha = fade * 0.7;
    for (let i = 0; i < k; i++) if (P[i]) { ctx.beginPath(); ctx.arc(P[i][0], P[i][1], lw * 0.9, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = fade; ctx.fillStyle = ink;
    ctx.beginPath(); ctx.arc(hx, hy, lw * 1.7, 0, Math.PI * 2); ctx.fill();
    if (draw >= 1) {
      const pulse = cl01((t - o.start - 0.25 - (o.draw || 1.6)) / 0.7);
      if (pulse < 1) { ctx.globalAlpha = fade * (1 - pulse) * 0.8; ctx.strokeStyle = ink; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.arc(hx, hy, lw * (1.7 + pulse * 4), 0, Math.PI * 2); ctx.stroke(); }
    }
    if (lab) {
      const fs = lab * 0.46;
      ctx.globalAlpha = fade * 0.85 * cl01((t - o.start - 0.4) / 0.5);
      ctx.fillStyle = th.text; ctx.font = `500 ${fs}px ${OV_FONTS.sans}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const yl = y0 + ch - lab / 2 - fs * 0.15;
      const km = o.km || '';
      ctx.textAlign = 'right'; ctx.fillText(km, x0 + cw - fs, yl);
      const room = cw - fs * 3 - (km ? ctx.measureText(km).width : 0);
      let txt = o.label;
      while (txt.length > 4 && ctx.measureText(txt).width > room) txt = txt.slice(0, -2) + '…';
      ctx.textAlign = 'left'; ctx.fillText(txt, x0 + fs, yl);
    }
    ctx.globalAlpha = 1;
  }

  drawChapter(ctx, o, t, g) {
    // Kapitel: Nummer als kleine Zeile, Ortsname in der Titelschrift wortweise im Takt
    const title = this.caseTitle(o.text);
    const tr = this.titleTrack(0.06);
    const size = fitSize(ctx, title, (sz) => this.font('title', sz), g.base * 0.07, g.W - g.margin * 2, tr);
    const x = g.margin, y = g.lowerY;
    const words = Math.max(1, title.split(/\s+/).length);
    const times = this.beatTimes(o, words + 1);
    const exitT = this.beatExit(o);
    const out = cl01((t - exitT) / 0.32);
    const lp = easeOutCubic(cl01((t - times[0]) / 0.45)) * (1 - out);
    const ss = g.base * 0.02;
    this.drawLabel(ctx, `${String(o.no).padStart(2, '0')} / ${String(o.total).padStart(2, '0')}`, x, y - size * 1.2, ss, 'left', lp, 0.3);
    ctx.fillStyle = this.ink;
    this.shadow(ctx, size * 0.6);
    ctx.textBaseline = 'alphabetic';
    this.maskTitle(ctx, title, x, y, size, tr, 'left', times, exitT, t, (sz) => this.font('title', sz));
    this.drawGeoLine(ctx, o, t, x, y + ss * 2.4, ss, 'left', easeOutCubic(cl01((t - times[words]) / 0.5)) * (1 - out));
  }


  /**
   * Zeile unter dem Ortsnamen: Koordinaten erscheinen Ziffer für Ziffer,
   * dann wechselt die Zeile zu den gefahrenen Kilometern, die hochzählen.
   */
  drawGeoLine(ctx, o, t, x, y, size, align, alpha) {
    const geo = o.geo;
    if (!geo || alpha <= 0) return;
    size *= 1.22; // Koordinaten und Kilometer etwas größer als die übrigen kleinen Zeilen
    const local = t - o.start;
    const hasPos = geo.lat != null, hasKm = geo.km != null;
    const sw = !hasPos ? o.start + 0.3 : hasKm ? o.start + Math.max(1.3, (o.end - o.start) * 0.45) : Infinity;
    const shift = cl01((t - sw) / 0.35);
    ctx.save();
    ctx.font = this.small(size);
    ctx.fillStyle = this.ink;
    ctx.textBaseline = 'alphabetic';
    if (hasPos && shift < 1) {
      const deg = (v, p, n) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? p : n}`;
      const full = `${deg(geo.lat, 'N', 'S')}   ${deg(geo.lon, 'O', 'W')}`;
      const u = cl01((local - 0.2) / 0.9);
      const lock = Math.floor(u * full.length);
      const frame = Math.floor(t * 24);
      let txt = '';
      Array.from(full).forEach((ch, i) => { txt += i >= lock && /\d/.test(ch) ? String((frame * 7 + i * 13) % 10) : ch; });
      ctx.globalAlpha = alpha * cl01(local / 0.25) * (1 - shift);
      drawTracked(ctx, txt, x, y - shift * size * 0.7, 0.2, size, align, true);
    }
    if (hasKm && t >= sw) {
      const p = easeOutCubic(cl01((t - sw) / 0.9));
      const v = geo.kmFrom + (geo.km - geo.kmFrom) * p;
      const txt = `${geo.mode === 'leg' ? '+' : ''}${Math.round(v).toLocaleString('de-DE')} KM${geo.mode === 'total' ? ' UNTERWEGS' : ''}`;
      ctx.globalAlpha = alpha * shift;
      drawTracked(ctx, txt, x, y + (1 - shift) * size * 0.7, 0.25, size, align, true);
    }
    ctx.restore();
  }

  drawUserText(ctx, o, t, g, selected) {
    const st = TEXT_STYLES[o.style] || TEXT_STYLES[LEGACY_STYLE[o.style]] || TEXT_STYLES.modern;
    const size = g.base * 0.055 * (o.size || 1);
    const text = st.upper ? String(o.text || '').toLocaleUpperCase('de-DE') : String(o.text || '');
    const lines = text.split('\n');
    ctx.font = st.font(size);
    ctx.textBaseline = 'middle';
    const em = parseFloat(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] || size);
    const lh = em * 1.25;
    const anim = o.anim || 'rise';
    const local = t - o.start, pout = cl01((o.end - t) / 0.3);
    let alpha = pout, dy = 0, track = st.track, budget = Infinity;
    if (anim === 'rise') { const pin = easeOutCubic(cl01(local / 0.45)); alpha = Math.min(pin, pout); dy = (1 - pin) * em * 0.25; }
    else if (anim === 'fade') alpha = Math.min(smooth(cl01(local / 0.7)), pout);
    else if (anim === 'track') { const pin = easeOutCubic(cl01(local / 1.1)); alpha = Math.min(cl01(local / 0.5), pout); track = st.track + 0.4 * (1 - pin); }
    else if (anim === 'type') budget = Math.floor(local / 0.055);
    else if (anim === 'words') {
      // ein Wort pro Beat ab Einblendbeginn
      const bs = this.beats.filter((b) => b >= o.start - 0.02);
      let k = 0;
      while (k < 60 && t >= (bs[k] != null ? bs[k] : o.start + k * 0.35)) k++;
      budget = -k; // negativ = Anzahl Wörter
    }
    const widths = lines.map((l) => trackedWidth(ctx, l, track, em));
    const maxW = Math.max(...widths);
    const cx = (o.x != null ? o.x : 0.5) * g.W, cy = (o.y != null ? o.y : 0.5) * g.H;
    ctx.translate(cx, cy + dy);
    ctx.rotate(((o.rot || 0) * Math.PI) / 180);
    ctx.globalAlpha = alpha;
    const y0 = -((lines.length - 1) * lh) / 2;
    const bg = o.bg || 'none';
    const color = o.color || this.ink;
    // sichtbarer Teil je Zeile (Tippen / Wort im Takt)
    let chars = budget >= 0 ? budget : Infinity, words = budget < 0 ? -budget : Infinity;
    const parts = lines.map((l) => {
      let part = l;
      if (chars !== Infinity) { part = Array.from(l).slice(0, Math.max(0, chars)).join(''); chars -= Array.from(l).length + 1; }
      if (words !== Infinity) { const ws = l.split(' '); part = ws.slice(0, Math.max(0, words)).join(' '); words -= ws.length; }
      return part;
    });
    if (bg !== 'none') {
      const px = em * 0.45, py = em * 0.28;
      ctx.fillStyle = bg === 'block' ? color : 'rgba(6,8,12,0.58)';
      // der Hintergrund wächst mit dem sichtbaren Text
      parts.forEach((part, i) => { const pw = part ? trackedWidth(ctx, part, track, em) : 0; if (pw > 0) ctx.fillRect(-widths[i] / 2 - px, y0 + i * lh - lh / 2 - py * 0.2, pw + px * 2, lh + py * 0.4); });
    }
    const dark = (c) => { const h = c.replace('#', ''); const v = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16); return ((v >> 16) & 255) * 0.3 + ((v >> 8) & 255) * 0.59 + (v & 255) * 0.11 < 128; };
    ctx.fillStyle = bg === 'block' ? (dark(color) ? '#f4efe4' : '#0b0d12') : color;
    if (bg === 'none') this.shadow(ctx, em);
    parts.forEach((part, i) => { if (part) drawTracked(ctx, part, -widths[i] / 2, y0 + i * lh, track, em, 'left'); });
    if (selected) this.drawSelection(ctx, maxW, lh * lines.length, em);
  }

  drawSelection(ctx, w, h, size) {
    ctx.shadowColor = 'transparent';
    ctx.globalAlpha = 1;
    ctx.setLineDash([size * 0.15, size * 0.12]);
    ctx.lineWidth = Math.max(2, size * 0.04);
    ctx.strokeStyle = '#d9c9a7';
    ctx.strokeRect(-w / 2 - size * 0.3, -h / 2 - size * 0.25, w + size * 0.6, h + size * 0.5);
    ctx.setLineDash([]);
  }

  drawSticker(ctx, o, t, g, selected) {
    const size = g.base * 0.04 * (o.size || 1);
    const cx = (o.x != null ? o.x : 0.5) * g.W, cy = (o.y != null ? o.y : 0.5) * g.H;
    const pin = easeOutCubic(cl01((t - o.start) / 0.45)), pout = cl01((o.end - t) / 0.3);
    ctx.translate(cx, cy);
    ctx.rotate(((o.rot || 0) * Math.PI) / 180);
    ctx.globalAlpha = Math.min(pin, pout);
    let bw, bh;
    if (o.kind === 'date') {
      ctx.font = this.small(size);
      ctx.textBaseline = 'middle';
      ctx.fillStyle = this.ink;
      this.shadow(ctx, size);
      bw = drawTracked(ctx, String(o.text || ''), 0, 0, 0.25, size, 'center');
      bh = size * 1.4;
    } else {
      const label = String(o.text || 'Ort').toLocaleUpperCase('de-DE');
      ctx.font = this.small(size * 1.05);
      const tw = trackedWidth(ctx, label, 0.18, size);
      bw = tw + size * 2.6; bh = size * 2.1;
      ctx.fillStyle = 'rgba(8,10,16,0.55)';
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(239,230,210,0.55)';
      ctx.lineWidth = Math.max(1, size * 0.06);
      ctx.stroke();
      // Ortsmarke als Linien-Symbol
      const px = -bw / 2 + size * 1.05, py = -size * 0.12, r = size * 0.36;
      ctx.beginPath();
      ctx.arc(px, py, r, Math.PI * 0.8, Math.PI * 2.2);
      ctx.lineTo(px, py + r * 1.6);
      ctx.closePath();
      ctx.strokeStyle = this.ink;
      ctx.stroke();
      ctx.beginPath(); ctx.arc(px, py, r * 0.3, 0, Math.PI * 2); ctx.fillStyle = this.ink; ctx.fill();
      ctx.textBaseline = 'middle';
      drawTracked(ctx, label, -bw / 2 + size * 1.75, size * 0.05, 0.18, size, 'left');
    }
    if (selected) this.drawSelection(ctx, bw, bh, size);
  }
}
