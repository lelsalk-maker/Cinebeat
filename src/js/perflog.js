/* Leistungsprotokoll: misst auf dem Gerät, wo beim Einlesen, Planen, Abspielen und Exportieren die Zeit bleibt.
 * Bleibt lokal (nur dieses Gerät, letzte 40 Einträge), nichts wird gesendet. */

const PERF_KEY = 'cinebeat-perf';
const perfLog = {
  items: null,
  _load() {
    if (this.items) return this.items;
    try { this.items = JSON.parse(localStorage.getItem(PERF_KEY) || '[]'); } catch (e) { this.items = []; }
    if (!Array.isArray(this.items)) this.items = [];
    return this.items;
  },
  /** kind: 'import' | 'plan' | 'export' | 'preview' | 'heat'; data: flache Kennzahlen */
  add(kind, data) {
    const list = this._load();
    list.push({ kind, at: Date.now(), ...data });
    while (list.length > 40) list.shift();
    try { localStorage.setItem(PERF_KEY, JSON.stringify(list)); } catch (e) { /* voll oder gesperrt: nur im Speicher */ }
  },
  list() { return this._load().slice(); },
  clear() { this.items = []; try { localStorage.removeItem(PERF_KEY); } catch (e) { /* egal */ } },
  device() {
    const n = typeof navigator !== 'undefined' ? navigator : {};
    return {
      cores: n.hardwareConcurrency || 0,
      memGB: n.deviceMemory || 0,
      dpr: typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
      screen: typeof screen !== 'undefined' ? `${screen.width}×${screen.height}` : '',
      ua: (n.userAgent || '').replace(/\s*\([^)]*\)/, '').slice(0, 80),
      worker: typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined',
      webcodecs: typeof VideoEncoder !== 'undefined',
      pressure: typeof PressureObserver !== 'undefined',
    };
  },
};

/**
 * Wärmeschutz beim Export. Browser verraten keine Temperatur; zwei Hinweise gibt es aber:
 * die Compute-Pressure-Schnittstelle (wo vorhanden) und die eigene Rechenzeit pro Bild. Wird ein Gerät heiß,
 * drosselt das System den Prozessor und dieselbe Arbeit dauert deutlich länger. Dann legt der Export kurze
 * Pausen ein (höchstens so lang wie die Arbeit selbst), bis es sich wieder beruhigt. Das Video bleibt gleich,
 * nur die Rechenpausen ändern sich.
 */
class HeatGuard {
  constructor() {
    this.base = null; this.ema = null; this.n = 0; this.samples = [];
    this.hot = false; this.hotFrames = 0; this.coolMs = 0; this.events = 0; this.pressure = 'nominal';
    this.obs = null;
    try {
      if (typeof PressureObserver !== 'undefined') {
        this.obs = new PressureObserver((recs) => { const r = recs[recs.length - 1]; if (r) this.pressure = r.state; });
        this.obs.observe('cpu', { sampleInterval: 1000 }).catch(() => { this.obs = null; });
      }
    } catch (e) { this.obs = null; }
  }
  /** workMs: eigene Rechenzeit des Bildes (ohne Warten auf den Encoder); liefert die Pause in ms */
  frame(workMs) {
    this.n++;
    // Grundwert aus den Bildern 20–110 (nach dem Aufwärmen), Median gegen Ausreißer
    if (this.base == null) {
      if (this.n > 20) this.samples.push(workMs);
      if (this.samples.length >= 90) { const s = this.samples.sort((a, b) => a - b); this.base = Math.max(4, s[s.length >> 1]); this.samples = null; }
      return 0;
    }
    this.ema = this.ema == null ? workMs : this.ema * 0.97 + workMs * 0.03;
    const press = this.pressure === 'serious' || this.pressure === 'critical';
    const slow = this.ema > this.base * 2.2 && this.ema > 14;
    if (!this.hot && (press || slow)) { if (++this.hotFrames > 90 || this.pressure === 'critical') { this.hot = true; this.events++; } }
    else if (!this.hot) this.hotFrames = 0;
    if (this.hot && !press && this.ema < this.base * 1.4) { this.hot = false; this.hotFrames = 0; }
    if (!this.hot) return 0;
    const pause = Math.min(40, workMs * (this.pressure === 'critical' ? 1 : 0.5));
    this.coolMs += pause;
    return pause;
  }
  close() { try { this.obs && this.obs.disconnect(); } catch (e) { /* egal */ } }
}
