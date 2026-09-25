/* ============================================================
 * Video-Einleser für den Export: liest MP4/MOV-Dateien (auch vom
 * iPhone: H.264, HEVC, Drehung, Schnittlisten) und dekodiert die
 * Bilder mit WebCodecs der Reihe nach, in voller Originalqualität.
 * Viel schneller als für jedes Filmbild im Video zu springen.
 * Wird ein Format nicht unterstützt, nutzt der Export das Videoelement.
 * ============================================================ */

const hex2 = (n) => n.toString(16).padStart(2, '0');

/** WebCodecs-Codec-Kennung aus dem Sample-Eintrag und seiner Konfiguration. */
function codecString(type, cfg) {
  if (!cfg) return null;
  if (type === 'avc1' || type === 'avc3') return `${type}.${hex2(cfg[1])}${hex2(cfg[2])}${hex2(cfg[3])}`;
  if (type === 'hvc1' || type === 'hev1') {
    const space = cfg[1] >> 6, tier = (cfg[1] >> 5) & 1, profile = cfg[1] & 31;
    let compat = ((cfg[2] << 24) | (cfg[3] << 16) | (cfg[4] << 8) | cfg[5]) >>> 0;
    let rev = 0;
    for (let i = 0; i < 32; i++) { rev = ((rev << 1) | (compat & 1)) >>> 0; compat >>>= 1; }
    const cons = Array.from(cfg.subarray(6, 12));
    while (cons.length && cons[cons.length - 1] === 0) cons.pop();
    return [`${type}.${['', 'A', 'B', 'C'][space]}${profile}`, rev.toString(16), `${tier ? 'H' : 'L'}${cfg[12]}`, ...cons.map((c) => c.toString(16).toUpperCase())].join('.');
  }
  if (type === 'vp09') {
    // vpcC ist eine FullBox: 4 Byte Version/Flags, dann Profil, Level, Bittiefe (obere 4 Bit)
    return `vp09.${String(cfg[4]).padStart(2, '0')}.${String(cfg[5]).padStart(2, '0')}.${String(cfg[6] >> 4).padStart(2, '0')}`;
  }
  if (type === 'av01') {
    const profile = cfg[1] >> 5, level = cfg[1] & 31, tier = cfg[2] >> 7, hbd = (cfg[2] >> 6) & 1, twelve = (cfg[2] >> 5) & 1;
    return `av01.${profile}.${String(level).padStart(2, '0')}${tier ? 'H' : 'M'}.${hbd ? (twelve ? '12' : '10') : '08'}`;
  }
  return null;
}

/** Liest nur die Kopfdaten (moov) einer MP4/MOV-Datei und baut die Bildtabelle der Videospur. */
async function demuxVideo(file) {
  const size = file.size;
  const read = async (pos, len) => new DataView(await file.slice(pos, pos + len).arrayBuffer());
  // oberste Ebene nach moov durchsuchen
  let pos = 0, moov = null;
  for (let guard = 0; pos + 8 <= size && guard < 64; guard++) {
    const h = await read(pos, 16);
    let len = h.getUint32(0);
    const type = String.fromCharCode(h.getUint8(4), h.getUint8(5), h.getUint8(6), h.getUint8(7));
    if (len === 1) len = h.getUint32(8) * 4294967296 + h.getUint32(12);
    else if (len === 0) len = size - pos;
    if (len < 8) return null;
    if (type === 'moov') { if (len > 64e6) return null; moov = await read(pos, len); break; }
    pos += len;
  }
  if (!moov) return null;
  const u8 = new Uint8Array(moov.buffer, moov.byteOffset, moov.byteLength);
  const boxes = (start, end) => {
    const out = [];
    let p = start;
    while (p + 8 <= end) {
      let len = moov.getUint32(p);
      const type = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
      let hdr = 8;
      if (len === 1) { len = moov.getUint32(p + 8) * 4294967296 + moov.getUint32(p + 12); hdr = 16; } else if (len === 0) len = end - p;
      if (len < hdr || p + len > end) break;
      out.push({ type, start: p + hdr, end: p + len });
      p += len;
    }
    return out;
  };
  const child = (b, type) => boxes(b.start, b.end).find((x) => x.type === type);
  const top = boxes(0, u8.length)[0];
  for (const trak of boxes(top.start, top.end).filter((b) => b.type === 'trak')) {
    const mdia = child(trak, 'mdia');
    const hdlr = mdia && child(mdia, 'hdlr');
    if (!hdlr || String.fromCharCode(u8[hdlr.start + 8], u8[hdlr.start + 9], u8[hdlr.start + 10], u8[hdlr.start + 11]) !== 'vide') continue;
    // Drehung aus der Matrix der Spur (iPhone speichert Hochkant oft quer + 90°)
    const tkhd = child(trak, 'tkhd');
    const tv = u8[tkhd.start];
    const mOff = tkhd.start + (tv === 1 ? 52 : 40);
    const a = moov.getInt32(mOff) / 65536, bb = moov.getInt32(mOff + 4) / 65536;
    const rotation = ((Math.round(Math.atan2(bb, a) * 180 / Math.PI / 90) * 90) % 360 + 360) % 360;
    const mdhd = child(mdia, 'mdhd');
    const timescale = moov.getUint32(mdhd.start + (u8[mdhd.start] === 1 ? 20 : 12));
    // Schnittliste: Beginn der sichtbaren Medienzeit
    let editShift = 0;
    const edts = child(trak, 'edts'), elst = edts && child(edts, 'elst');
    if (elst) {
      const v = u8[elst.start], n = moov.getUint32(elst.start + 4);
      let p = elst.start + 8, emptyDur = 0;
      for (let i = 0; i < n; i++) {
        const mt = v === 1 ? moov.getInt32(p + 8) * 4294967296 + moov.getUint32(p + 12) : moov.getInt32(p + 4);
        if (mt === -1) { emptyDur += v === 1 ? moov.getUint32(p + 4) : moov.getUint32(p); p += v === 1 ? 20 : 12; continue; }
        editShift = mt; break;
      }
      if (emptyDur) return null; // leere Vorlaufstrecken: selten, lieber sicher über das Videoelement
    }
    const stbl = child(child(mdia, 'minf'), 'stbl');
    const get = (t) => child(stbl, t);
    const stsd = get('stsd');
    const entry = boxes(stsd.start + 8, stsd.end)[0];
    const width = moov.getUint16(entry.start + 24), height = moov.getUint16(entry.start + 26);
    const cfgBox = boxes(entry.start + 78, entry.end).find((x) => ['avcC', 'hvcC', 'vpcC', 'av1C'].includes(x.type));
    const cfg = cfgBox ? u8.slice(cfgBox.start, cfgBox.end) : null;
    const codec = codecString(entry.type, cfg);
    if (!codec) return null;
    // Bildtabelle
    const stsz = get('stsz');
    const fixed = moov.getUint32(stsz.start + 4), count = moov.getUint32(stsz.start + 8);
    const sizes = new Uint32Array(count);
    for (let i = 0; i < count; i++) sizes[i] = fixed || moov.getUint32(stsz.start + 12 + i * 4);
    const stco = get('stco'), co64 = get('co64');
    const chunkOffsets = [];
    if (stco) { const n = moov.getUint32(stco.start + 4); for (let i = 0; i < n; i++) chunkOffsets.push(moov.getUint32(stco.start + 8 + i * 4)); }
    else if (co64) { const n = moov.getUint32(co64.start + 4); for (let i = 0; i < n; i++) chunkOffsets.push(moov.getUint32(co64.start + 8 + i * 8) * 4294967296 + moov.getUint32(co64.start + 12 + i * 8)); }
    const stsc = get('stsc');
    const scN = moov.getUint32(stsc.start + 4);
    const sc = [];
    for (let i = 0; i < scN; i++) sc.push([moov.getUint32(stsc.start + 8 + i * 12), moov.getUint32(stsc.start + 12 + i * 12)]);
    const offsets = new Float64Array(count);
    let si = 0;
    for (let c = 0; c < chunkOffsets.length && si < count; c++) {
      let per = sc[0][1];
      for (const [first, n] of sc) if (c + 1 >= first) per = n;
      let off = chunkOffsets[c];
      for (let k = 0; k < per && si < count; k++) { offsets[si] = off; off += sizes[si]; si++; }
    }
    const dts = new Float64Array(count);
    const stts = get('stts');
    let t = 0, i = 0;
    for (let e = 0, n = moov.getUint32(stts.start + 4); e < n; e++) {
      const cnt = moov.getUint32(stts.start + 8 + e * 8), d = moov.getUint32(stts.start + 12 + e * 8);
      for (let k = 0; k < cnt && i < count; k++) { dts[i++] = t; t += d; }
    }
    const cts = Float64Array.from(dts);
    const ctts = get('ctts');
    if (ctts) {
      const v = u8[ctts.start];
      let j = 0;
      for (let e = 0, n = moov.getUint32(ctts.start + 4); e < n; e++) {
        const cnt = moov.getUint32(ctts.start + 8 + e * 8);
        const off = v === 1 ? moov.getInt32(ctts.start + 12 + e * 8) : moov.getUint32(ctts.start + 12 + e * 8);
        for (let k = 0; k < cnt && j < count; k++) cts[j] += off, j++;
      }
    }
    const key = new Uint8Array(count);
    const stss = get('stss');
    if (stss) { for (let e = 0, n = moov.getUint32(stss.start + 4); e < n; e++) key[moov.getUint32(stss.start + 8 + e * 4) - 1] = 1; } else key.fill(1);
    // Zeiten in Mikrosekunden der Wiedergabe (nach Schnittliste)
    const us = (v) => Math.round(((v - editShift) / timescale) * 1e6);
    const samples = [];
    for (let k = 0; k < count; k++) samples.push({ off: offsets[k], size: sizes[k], dts: us(dts[k]), cts: us(cts[k]), key: !!key[k], dur: k + 1 < count ? us(dts[k + 1]) - us(dts[k]) : 33333 });
    return { codec, description: entry.type === 'avc1' || entry.type === 'avc3' || entry.type === 'hvc1' || entry.type === 'hev1' || entry.type === 'av01' ? cfg : undefined, width, height, rotation, samples, file };
  }
  return null;
}

/**
 * Liefert Bilder zu aufsteigenden Zeitpunkten. Dekodiert fortlaufend ab dem passenden Schlüsselbild
 * und hält immer das Bild, das zum gewünschten Zeitpunkt zu sehen ist.
 */
class FrameReader {
  constructor(track, maxDim = Infinity, cpu = false) {
    this.t = track;
    this.dec = null;
    this.queue = [];
    this.cur = null;
    this.next = 0;
    this.flushed = false;
    this.failed = null;
    this.waiters = [];
    const rot = track.rotation % 180 !== 0;
    this.canvas = document.createElement('canvas');
    const dw = rot ? track.height : track.width, dh = rot ? track.width : track.height;
    const sc = Math.min(1, maxDim / Math.max(dw, dh));
    this.canvas.width = Math.max(2, Math.round(dw * sc));
    this.canvas.height = Math.max(2, Math.round(dh * sc));
    // zum Auslesen der Pixel (Bewertung) im Arbeitsspeicher halten
    if (cpu) this.canvas.getContext('2d', { willReadFrequently: true });
    this.drawnTs = null;
  }

  static async open(track, maxDim, cpu) {
    if (typeof VideoDecoder === 'undefined' || !track) return null;
    const cfg = { codec: track.codec, codedWidth: track.width, codedHeight: track.height, hardwareAcceleration: 'no-preference' };
    if (track.description) cfg.description = track.description;
    try { if (!(await VideoDecoder.isConfigSupported(cfg)).supported) return null; } catch (e) { return null; }
    const r = new FrameReader(track, maxDim, cpu);
    r.cfg = cfg;
    return r;
  }

  _makeDecoder() {
    if (this.dec) { try { this.dec.close(); } catch (e) { /* ignore */ } }
    this.dec = new VideoDecoder({
      output: (f) => { this.queue.push(f); this.queue.sort((x, y) => x.timestamp - y.timestamp); this._wake(); },
      error: (e) => { this.failed = e; this._wake(); },
    });
    this.dec.configure(this.cfg);
  }

  _wake() { const w = this.waiters; this.waiters = []; for (const f of w) f(); }
  _wait(ms) { return new Promise((r) => { this.waiters.push(r); setTimeout(r, ms); }); }

  _reset(us) {
    for (const f of this.queue) f.close();
    this.queue = [];
    if (this.cur) { this.cur.close(); this.cur = null; }
    this.drawnTs = null;
    const s = this.t.samples;
    // letztes Schlüsselbild, dessen Anzeigezeit nicht nach dem Ziel liegt
    let k = 0;
    for (let i = 0; i < s.length; i++) if (s[i].key && s[i].cts <= us) k = i;
    this.next = k;
    this.flushed = false;
    this._makeDecoder();
  }

  /** Liest Dateibereiche blockweise (bis 4 MB) statt Bild für Bild: deutlich weniger Dateizugriffe. */
  async _bytes(s) {
    const b = this.buf;
    if (b && s.off >= b.start && s.off + s.size <= b.end) return b.data.subarray(s.off - b.start, s.off - b.start + s.size);
    const smp = this.t.samples;
    let end = s.off + s.size;
    for (let i = this.next; i < smp.length && i < this.next + 90; i++) {
      const e = smp[i].off + smp[i].size;
      if (smp[i].off < s.off || e - s.off > 4 << 20) break;
      end = Math.max(end, e);
    }
    const data = new Uint8Array(await this.t.file.slice(s.off, end).arrayBuffer());
    this.buf = { start: s.off, end: s.off + data.length, data };
    return data.subarray(0, s.size);
  }

  async _feed() {
    const s = this.t.samples[this.next++];
    const data = await this._bytes(s);
    this.dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: s.cts, duration: s.dur, data }));
  }

  /** Bild zum Zeitpunkt (Sekunden, Wiedergabezeit der Datei). */
  async frameAt(sec) {
    const us = Math.round(sec * 1e6);
    const tol = 500;
    if (!this.dec || (this.cur && us + tol < this.cur.timestamp) || (this.queue.length && this.cur && us + tol < this.cur.timestamp)) this._reset(us);
    // weit voraus gesprungen: vom nächsten Schlüsselbild neu anfangen statt alles dazwischen zu dekodieren
    const s = this.t.samples;
    // Liegt vor dem Ziel noch ein Schlüsselbild, das deutlich weiter vorne ist: dort neu ansetzen
    if (this.dec && !(this.cur && us <= this.cur.timestamp + tol)) {
      let k = -1;
      for (let i = this.next; i < s.length && s[i].cts <= us + 1e6; i++) if (s[i].key && s[i].cts <= us) k = i;
      if (k - this.next > 8) this._reset(us);
    }
    for (let guard = 0; guard < 100000; guard++) {
      if (this.failed) throw this.failed;
      while (this.queue.length && this.queue[0].timestamp <= us + tol) {
        const f = this.queue.shift();
        if (this.cur) this.cur.close();
        this.cur = f;
      }
      if (this.queue.length || (this.flushed && this.dec.decodeQueueSize === 0)) break;
      if (this.next < s.length) {
        if (this.dec.decodeQueueSize < 6) { await this._feed(); continue; }
        await this._wait(20);
      } else if (!this.flushed) {
        this.flushed = true;
        await this.dec.flush();
      } else await this._wait(20);
    }
    if (!this.cur && this.queue.length) { this.cur = this.queue.shift(); }
    return this.cur;
  }

  /** Zeichnet das Bild (mit Drehung) in die eigene Leinwand, nur wenn es sich geändert hat. */
  async canvasAt(sec) {
    const f = await this.frameAt(sec);
    if (!f) return null;
    if (this.drawnTs === f.timestamp) return this.canvas;
    this.drawTo(this.canvas, f);
    this.drawnTs = f.timestamp;
    return this.canvas;
  }

  /** Aktuelles Bild mit Drehung in eine beliebige Leinwand zeichnen (füllt sie ganz). */
  drawTo(c, f = this.cur) {
    if (!f) return false;
    const x = c.getContext('2d');
    const rot = this.t.rotation;
    const sw = rot % 180 ? c.height : c.width, sh = rot % 180 ? c.width : c.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    if (rot === 90) x.setTransform(0, 1, -1, 0, c.width, 0);
    else if (rot === 180) x.setTransform(-1, 0, 0, -1, c.width, c.height);
    else if (rot === 270) x.setTransform(0, -1, 1, 0, 0, c.height);
    if (sw !== this.t.width) x.imageSmoothingQuality = 'high';
    x.drawImage(f, 0, 0, sw, sh);
    x.setTransform(1, 0, 0, 1, 0, 0);
    return true;
  }

  close() {
    for (const f of this.queue) f.close();
    this.queue = [];
    this.buf = null;
    if (this.cur) this.cur.close();
    this.cur = null;
    if (this.dec) { try { this.dec.close(); } catch (e) { /* ignore */ } }
    this.dec = null;
    this.canvas.width = 0; this.canvas.height = 0;
    this._wake();
  }
}

/** Dauer der Videospur in Sekunden. */
function trackDuration(track) {
  let end = 0;
  for (const s of track.samples) end = Math.max(end, s.cts + s.dur);
  return end / 1e6;
}

/**
 * Schnelles Einlesen eines Videos: dekodiert nur die Stellen, die für Bewertung und Vorschaubild
 * gebraucht werden, direkt aus der Datei (ohne Videoelement). null, wenn das Format nicht passt.
 */
async function probeVideoFast(file) {
  if (typeof VideoDecoder === 'undefined' || !/\.(mp4|mov|m4v)$/i.test(file.name || '') && !/mp4|quicktime/.test(file.type || '')) return null;
  let track = null;
  try { track = await demuxVideo(file); } catch (e) { return null; }
  if (!track || track.samples.length < 2) return null;
  // Bewertung auf kleinem Bild im Arbeitsspeicher; nur das Vorschaubild wird größer gezeichnet
  const fr = await FrameReader.open(track, SCORE_SIZE, true);
  if (!fr) return null;
  try {
    const duration = trackDuration(track);
    const c = fr.canvas;
    const w = track.rotation % 180 ? track.height : track.width, h = track.rotation % 180 ? track.width : track.height;
    const grab = async (t) => fr.canvasAt(Math.max(0, Math.min(duration - 0.02, t)));
    const sc = await scoreFrames(grab, c.width, c.height, duration);
    const best = sc.highlights && sc.highlights[0] ? sc.highlights[0].t : Math.min(1, duration * 0.2);
    if (!(await grab(best))) return null;
    const ps = Math.min(1, 720 / Math.max(w, h));
    const poster = document.createElement('canvas');
    poster.width = Math.max(2, Math.round(w * ps)); poster.height = Math.max(2, Math.round(h * ps));
    fr.drawTo(poster);
    return { duration, w, h, poster, ...sc };
  } catch (e) {
    return null;
  } finally {
    fr.close();
  }
}
