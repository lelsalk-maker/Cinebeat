/* ============================================================
 * MP4-Muxer (ISO BMFF) für WebCodecs-Ausgabe
 * Video: avc1 (H.264) oder vp09; Audio: mp4a (AAC) oder Opus.
 * Nicht fragmentiert, moov am Ende, ein Sample pro Chunk.
 * ============================================================ */

class ByteWriter {
  constructor(size = 1024) { this.buf = new Uint8Array(size); this.pos = 0; }
  ensure(n) {
    if (this.pos + n <= this.buf.length) return;
    let s = this.buf.length * 2;
    while (s < this.pos + n) s *= 2;
    const nb = new Uint8Array(s); nb.set(this.buf.subarray(0, this.pos)); this.buf = nb;
  }
  u8(v) { this.ensure(1); this.buf[this.pos++] = v & 0xff; }
  u16(v) { this.ensure(2); this.buf[this.pos++] = (v >>> 8) & 0xff; this.buf[this.pos++] = v & 0xff; }
  u24(v) { this.u8(v >>> 16); this.u16(v & 0xffff); }
  u32(v) { this.ensure(4); v >>>= 0; this.buf[this.pos++] = v >>> 24; this.buf[this.pos++] = (v >>> 16) & 0xff; this.buf[this.pos++] = (v >>> 8) & 0xff; this.buf[this.pos++] = v & 0xff; }
  bytes(a) { this.ensure(a.length); this.buf.set(a, this.pos); this.pos += a.length; }
  str(s) { for (let i = 0; i < s.length; i++) this.u8(s.charCodeAt(i)); }
  zeros(n) { this.ensure(n); this.buf.fill(0, this.pos, this.pos + n); this.pos += n; }
  box(type, fn) { const start = this.pos; this.u32(0); this.str(type); fn(); this.patch32(start, this.pos - start); }
  fullBox(type, version, flags, fn) { this.box(type, () => { this.u8(version); this.u24(flags); fn(); }); }
  patch32(at, v) { this.buf[at] = v >>> 24; this.buf[at + 1] = (v >>> 16) & 0xff; this.buf[at + 2] = (v >>> 8) & 0xff; this.buf[at + 3] = v & 0xff; }
  out() { return this.buf.slice(0, this.pos); }
}

const MATRIX = [0x00010000, 0, 0, 0, 0x00010000, 0, 0, 0, 0x40000000];

class Mp4Muxer {
  /**
   * video: {codec:'avc'|'vp9', width, height, fps}
   * audio: {codec:'aac'|'opus', sampleRate, channels} | null
   */
  constructor({ video, audio }) {
    this.video = video;
    this.audio = audio || null;
    this.vSamples = []; // {size, pts(µs), key, offset}
    this.aSamples = []; // {size, dur(µs), offset}
    this.parts = [];    // Blob-Teile des mdat-Inhalts
    this.pending = [];
    this.pendingBytes = 0;
    this.dataSize = 0;
    this.vDesc = null;
    this.aDesc = null;
  }

  _push(chunk) {
    const a = new Uint8Array(chunk.byteLength);
    chunk.copyTo(a);
    const off = this.dataSize;
    this.pending.push(a);
    this.pendingBytes += a.length;
    this.dataSize += a.length;
    if (this.pendingBytes > 8 * 1024 * 1024) this._flushPending();
    return { off, size: a.length };
  }

  _flushPending() {
    if (!this.pending.length) return;
    this.parts.push(new Blob(this.pending));
    this.pending = [];
    this.pendingBytes = 0;
  }

  addVideoChunk(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.vDesc) {
      this.vDesc = new Uint8Array(ArrayBuffer.isView(meta.decoderConfig.description) ? meta.decoderConfig.description.buffer.slice(meta.decoderConfig.description.byteOffset, meta.decoderConfig.description.byteOffset + meta.decoderConfig.description.byteLength) : meta.decoderConfig.description);
    }
    const { off, size } = this._push(chunk);
    this.vSamples.push({ off, size, pts: chunk.timestamp, key: chunk.type === 'key' });
  }

  addAudioChunk(chunk, meta) {
    if (meta && meta.decoderConfig && meta.decoderConfig.description && !this.aDesc) {
      const d = meta.decoderConfig.description;
      this.aDesc = new Uint8Array(ArrayBuffer.isView(d) ? d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength) : d);
    }
    const { off, size } = this._push(chunk);
    this.aSamples.push({ off, size, dur: chunk.duration || 0, pts: chunk.timestamp });
  }

  finalize() {
    this._flushPending();
    if (!this.vSamples.length) throw new Error('Keine Videodaten');
    if (this.video.codec === 'avc' && !this.vDesc) throw new Error('H.264-Konfiguration fehlt');
    // ftyp + mdat-Header
    const head = new ByteWriter(64);
    head.box('ftyp', () => {
      head.str('isom'); head.u32(0x200);
      head.str('isom'); head.str('iso2'); head.str(this.video.codec === 'avc' ? 'avc1' : 'iso6'); head.str('mp41');
    });
    const mdatHeaderAt = head.pos;
    const large = this.dataSize + 8 > 0xffffffff;
    if (large) { head.u32(1); head.str('mdat'); head.u32(0); head.u32(0); } else { head.u32(this.dataSize + 8); head.str('mdat'); }
    if (large) {
      const total = this.dataSize + 16;
      head.patch32(mdatHeaderAt + 8, Math.floor(total / 0x100000000));
      head.patch32(mdatHeaderAt + 12, total >>> 0);
    }
    const base = head.pos;
    const moov = this._moov(base);
    return new Blob([head.out(), ...this.parts, moov], { type: 'video/mp4' });
  }

  _moov(base) {
    const w = new ByteWriter(4096 + (this.vSamples.length + this.aSamples.length) * 16);
    const v = this.video;
    const vTs = 90000;
    const frameDur = Math.round(vTs / v.fps);
    const n = this.vSamples.length;
    // Präsentationszeiten -> Zeitskala; Decodier-Reihenfolge = Ausgabereihenfolge
    const pts = this.vSamples.map((s) => Math.round((s.pts * vTs) / 1e6));
    const minPts = Math.min(...pts);
    const ptsRel = pts.map((p) => p - minPts);
    let shift = 0;
    for (let i = 0; i < n; i++) shift = Math.max(shift, i * frameDur - ptsRel[i]);
    const ctts = ptsRel.map((p, i) => p - i * frameDur + shift);
    const needCtts = ctts.some((c) => c !== ctts[0]) || shift > 0;
    const vDur = n * frameDur;
    const movieTs = 1000;
    const vDurMovie = Math.round((vDur / vTs) * movieTs);

    let aDurMovie = 0, aTs = 0, aDurs = null;
    if (this.audio && this.aSamples.length) {
      aTs = this.audio.sampleRate;
      // Dauer je Sample in Zeitskala, kumulativ gerundet (keine Drift)
      aDurs = [];
      let accUs = 0, accTs = 0;
      for (const s of this.aSamples) {
        const d = s.dur || (this.audio.codec === 'aac' ? (1024 * 1e6) / aTs : 20000);
        accUs += d;
        const t = Math.round((accUs * aTs) / 1e6);
        aDurs.push(t - accTs);
        accTs = t;
      }
      aDurMovie = Math.round((accTs / aTs) * movieTs);
    }
    const movieDur = Math.max(vDurMovie, aDurMovie);

    w.box('moov', () => {
      w.fullBox('mvhd', 0, 0, () => {
        w.u32(0); w.u32(0); w.u32(movieTs); w.u32(movieDur);
        w.u32(0x00010000); w.u16(0x0100); w.zeros(10);
        for (const m of MATRIX) w.u32(m);
        w.zeros(24);
        w.u32(this.audio && this.aSamples.length ? 3 : 2);
      });
      // Videospur
      w.box('trak', () => {
        w.fullBox('tkhd', 0, 3, () => {
          w.u32(0); w.u32(0); w.u32(1); w.u32(0); w.u32(vDurMovie);
          w.zeros(8); w.u16(0); w.u16(0); w.u16(0); w.u16(0);
          for (const m of MATRIX) w.u32(m);
          w.u32(v.width * 65536); w.u32(v.height * 65536);
        });
        if (needCtts && shift > 0) {
          w.box('edts', () => w.fullBox('elst', 0, 0, () => {
            w.u32(1); w.u32(vDurMovie); w.u32(shift); w.u16(1); w.u16(0);
          }));
        }
        w.box('mdia', () => {
          w.fullBox('mdhd', 0, 0, () => { w.u32(0); w.u32(0); w.u32(vTs); w.u32(vDur); w.u16(0x55c4); w.u16(0); });
          w.fullBox('hdlr', 0, 0, () => { w.u32(0); w.str('vide'); w.zeros(12); w.str('VideoHandler'); w.u8(0); });
          w.box('minf', () => {
            w.fullBox('vmhd', 0, 1, () => { w.u16(0); w.zeros(6); });
            this._dinf(w);
            w.box('stbl', () => {
              w.fullBox('stsd', 0, 0, () => {
                w.u32(1);
                w.box(v.codec === 'avc' ? 'avc1' : 'vp09', () => {
                  w.zeros(6); w.u16(1); w.u16(0); w.u16(0); w.zeros(12);
                  w.u16(v.width); w.u16(v.height);
                  w.u32(0x00480000); w.u32(0x00480000); w.u32(0); w.u16(1);
                  const name = 'CineBeat';
                  w.u8(name.length); w.str(name); w.zeros(31 - name.length);
                  w.u16(0x0018); w.u16(0xffff);
                  if (v.codec === 'avc') {
                    w.box('avcC', () => w.bytes(this.vDesc));
                  } else {
                    w.fullBox('vpcC', 1, 0, () => {
                      w.u8(0); w.u8(40); w.u8((8 << 4) | (1 << 1) | 0);
                      w.u8(1); w.u8(1); w.u8(1); w.u16(0);
                    });
                  }
                  w.box('colr', () => { w.str('nclx'); w.u16(1); w.u16(1); w.u16(1); w.u8(0); });
                  w.box('pasp', () => { w.u32(1); w.u32(1); });
                });
              });
              w.fullBox('stts', 0, 0, () => { w.u32(1); w.u32(n); w.u32(frameDur); });
              if (needCtts) {
                // Lauflängen-kodiert
                const runs = [];
                for (const c of ctts) {
                  if (runs.length && runs[runs.length - 1][1] === c) runs[runs.length - 1][0]++;
                  else runs.push([1, c]);
                }
                w.fullBox('ctts', 0, 0, () => { w.u32(runs.length); for (const [cnt, off] of runs) { w.u32(cnt); w.u32(off); } });
              }
              const keys = [];
              this.vSamples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
              if (keys.length < n) w.fullBox('stss', 0, 0, () => { w.u32(keys.length); for (const k of keys) w.u32(k); });
              this._tables(w, this.vSamples, base);
            });
          });
        });
      });
      if (this.audio && this.aSamples.length) {
        const a = this.audio;
        const aTotal = aDurs.reduce((x, y) => x + y, 0);
        w.box('trak', () => {
          w.fullBox('tkhd', 0, 3, () => {
            w.u32(0); w.u32(0); w.u32(2); w.u32(0); w.u32(aDurMovie);
            w.zeros(8); w.u16(0); w.u16(1); w.u16(0x0100); w.u16(0);
            for (const m of MATRIX) w.u32(m);
            w.u32(0); w.u32(0);
          });
          w.box('mdia', () => {
            w.fullBox('mdhd', 0, 0, () => { w.u32(0); w.u32(0); w.u32(aTs); w.u32(aTotal); w.u16(0x55c4); w.u16(0); });
            w.fullBox('hdlr', 0, 0, () => { w.u32(0); w.str('soun'); w.zeros(12); w.str('SoundHandler'); w.u8(0); });
            w.box('minf', () => {
              w.fullBox('smhd', 0, 0, () => { w.u16(0); w.u16(0); });
              this._dinf(w);
              w.box('stbl', () => {
                w.fullBox('stsd', 0, 0, () => {
                  w.u32(1);
                  w.box(a.codec === 'aac' ? 'mp4a' : 'Opus', () => {
                    w.zeros(6); w.u16(1); w.zeros(8);
                    w.u16(a.channels); w.u16(16); w.u16(0); w.u16(0);
                    w.u32((a.sampleRate & 0xffff) * 65536);
                    if (a.codec === 'aac') this._esds(w);
                    else this._dOps(w);
                  });
                });
                // stts lauflängen-kodiert
                const runs = [];
                for (const d of aDurs) {
                  if (runs.length && runs[runs.length - 1][1] === d) runs[runs.length - 1][0]++;
                  else runs.push([1, d]);
                }
                w.fullBox('stts', 0, 0, () => { w.u32(runs.length); for (const [c, d] of runs) { w.u32(c); w.u32(d); } });
                this._tables(w, this.aSamples, base);
              });
            });
          });
        });
      }
    });
    return w.out();
  }

  _dinf(w) {
    w.box('dinf', () => w.fullBox('dref', 0, 0, () => { w.u32(1); w.fullBox('url ', 0, 1, () => {}); }));
  }

  _tables(w, samples, base) {
    w.fullBox('stsc', 0, 0, () => { w.u32(1); w.u32(1); w.u32(1); w.u32(1); });
    w.fullBox('stsz', 0, 0, () => { w.u32(0); w.u32(samples.length); for (const s of samples) w.u32(s.size); });
    const maxOff = base + this.dataSize;
    if (maxOff > 0xffffffff) {
      w.fullBox('co64', 0, 0, () => {
        w.u32(samples.length);
        for (const s of samples) { const o = base + s.off; w.u32(Math.floor(o / 0x100000000)); w.u32(o >>> 0); }
      });
    } else {
      w.fullBox('stco', 0, 0, () => { w.u32(samples.length); for (const s of samples) w.u32(base + s.off); });
    }
  }

  _esds(w) {
    const a = this.audio;
    let asc = this.aDesc;
    if (!asc || !asc.length) {
      const freqs = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
      const fi = Math.max(0, freqs.indexOf(a.sampleRate));
      asc = new Uint8Array([(2 << 3) | (fi >> 1), ((fi & 1) << 7) | (a.channels << 3)]);
    }
    const desc = (tag, body) => {
      const out = [tag];
      const len = body.length;
      out.push(0x80 | ((len >> 21) & 0x7f), 0x80 | ((len >> 14) & 0x7f), 0x80 | ((len >> 7) & 0x7f), len & 0x7f);
      return out.concat(body);
    };
    const dsi = desc(0x05, Array.from(asc));
    const br = a.bitrate || 192000;
    const dcd = desc(0x04, [0x40, 0x15, 0, 0, 0, (br >>> 24) & 0xff, (br >>> 16) & 0xff, (br >>> 8) & 0xff, br & 0xff, (br >>> 24) & 0xff, (br >>> 16) & 0xff, (br >>> 8) & 0xff, br & 0xff].concat(dsi));
    const sl = desc(0x06, [0x02]);
    const es = desc(0x03, [0, 1, 0].concat(dcd, sl));
    w.fullBox('esds', 0, 0, () => w.bytes(new Uint8Array(es)));
  }

  _dOps(w) {
    const a = this.audio;
    let preSkip = 312;
    const d = this.aDesc;
    if (d && d.length >= 12 && String.fromCharCode(...d.slice(0, 8)) === 'OpusHead') preSkip = d[10] | (d[11] << 8);
    w.box('dOps', () => { w.u8(0); w.u8(a.channels); w.u16(preSkip); w.u32(a.inputSampleRate || 48000); w.u16(0); w.u8(0); });
  }
}
