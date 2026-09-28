/* Planer · Anordnung nach Tageszeit: die besten Bilder zur richtigen Zeit im Song.
 * Die Reise bleibt chronologisch in Tagesblöcken – je Tag „Morgen & Mittag“ (bis 14 Uhr) und „Nachmittag & Abend“
 * (Nacht bis 4 Uhr zählt zum Vorabend). Innerhalb eines Blocks ordnet die Regie wie ein Cutter: eure Aufnahmen in die
 * ruhigen Passagen, Natur und Dinge in die schnellen, Totalen und starke Bilder auf die langen Plätze, Bildenergie
 * passend zur Songstelle, nie zwei ähnliche Bilder nebeneinander. */

/** Fester Zahlenwert einer Aufnahme-Kennung (für reproduzierbare Varianten). */
function hashId(id) {
  let h = 2166136261;
  for (let i = 0; i < String(id).length; i++) h = Math.imul(h ^ String(id).charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Tagesblock einer Aufnahme ('2026-4-3-0' = 3. Mai, Morgen & Mittag) oder null ohne Zeit. */
function dayBlock(m) {
  if (!m || !m.time) return null;
  const d = new Date(m.time - 4 * 3600e3);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours() + 4 < 14 ? 0 : 1}`;
}

// Energie des Songteils (0 ruhig … 1 Höhepunkt)
const SLOT_ENERGY = { drop: 1, chorus: 0.9, build: 0.65, verse: 0.4, intro: 0.3, outro: 0.3, break: 0.2 };

/**
 * Ordnet die schlichten Foto-Einstellungen jedes Tagesblocks neu (lokale Suche über Tausche).
 * Fest bleiben: Videos, eigene Entscheidungen, verschobene Aufnahmen, Startbild, Stil-Mittel und Bilder, auf die sich
 * Rückspulen, Wiederholung oder Echo beziehen. Liefert { moved, blocks } für die Erklärung.
 */
function arrangeBlocks(clips, { byId, ov = {}, moved: userMoved = new Set(), us = true, aspect = 0, vary = 0 }) {
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.leader || c.flightAnim || c.loop || c.vid || c.gridMid || c.afterGrid || c.replay || c.replaySeg || c.repeatSeg || c.echo;
  // eigenes Motiv bleibt; „Gefällt mir nicht“ ändert nur die Bewegung und wird mitgeordnet
  const own = (c) => { const o = ov[c.i]; return !!(o && o.mediaId); };
  const img = (id) => { const m = byId.get(id); return m && m.kind === 'image' ? m : null; };
  const echoed = new Set();
  for (const c of clips) if (c.miniRew || c.replay || c.loop || c.echo || c.pre) echoed.add(c.mediaId);
  const free = (c) => c && !special(c) && !own(c) && c.role !== 'hook' && c.role !== 'chapter' && !!img(c.mediaId) && !echoed.has(c.mediaId) && !userMoved.has(c.mediaId);

  const idx = clips.map((c, k) => k).filter((k) => free(clips[k]));
  if (idx.length < 3) return { moved: 0, blocks: 0 };
  const durs = idx.map((k) => clips[k].end - clips[k].start);
  const avgDur = durs.reduce((a, b) => a + b, 0) / durs.length;
  const scores = idx.map((k) => img(clips[k].mediaId).score || 0.5);
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));

  // wie gut passt Aufnahme m auf Platz c (ohne Nachbarn)
  const unary = (c, m, rank, pos, n) => {
    const calm = isCalmLabel(c.label);
    const durN = cl((c.end - c.start - avgDur) / Math.max(0.2, avgDur), -1, 1);
    const u = us ? usScore(m) : 0;
    let v = u * (calm ? 1 : -0.7) + (1 - u) * (calm ? 0 : 0.25);
    const size = sizeOf(m);
    v += durN * (size === 0 ? 0.35 : size === 2 ? -0.25 : 0);
    v += durN * ((m.score || 0.5) - meanScore) * 1.2;
    v -= 0.4 * Math.abs(energyOf(m) - (SLOT_ENERGY[c.label] != null ? SLOT_ENERGY[c.label] : 0.5));
    // Einsatz eines Refrains/Drops: dort gehört ein starkes Bild hin
    if (c.sectionChange && (c.label === 'drop' || c.label === 'chorus')) v += ((m.score || 0.5) - meanScore) * 1.5;
    // bei Gleichstand die Aufnahmezeit: sanfter Zug zur ursprünglichen Reihenfolge
    v -= 0.15 * Math.abs(rank - pos) / Math.max(1, n);
    // „Neu schneiden“: eine feste, je Schnitt andere Vorliebe (Aufnahme × Platz) – so entsteht eine neue Anordnung,
    // die Regeln (Wir ruhig, starke Bilder lang, Energie zur Songstelle) wiegen weiter schwerer
    if (vary) { let h = (vary ^ Math.imul(hashId(m.id), 2654435761) ^ Math.imul(c.i + 1, 40503)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; v += ((h >>> 8) / 16777216 - 0.5) * 0.7; }
    return v;
  };
  // Zwischenspeicher: die Suche prüft viele Tausche, Bildvergleiche nur einmal rechnen
  const sizeC = new Map(), energyC = new Map(), pairC = new Map();
  const sizeOf = (m) => { let v = sizeC.get(m.id); if (v == null) { v = shotSize(m); sizeC.set(m.id, v); } return v; };
  const energyOf = (m) => { let v = energyC.get(m.id); if (v == null) { v = mediaEnergy(m); energyC.set(m.id, v); } return v; };
  // zwei Nachbarn: nie Beinahe-Doppel hintereinander; ähnlicher Bildaufbau ist eine Match-Cut-Chance (wie in flowOrder),
  // gleiche Einstellungsgröße leicht vermeiden
  const framed = (m) => { if (!aspect || !m.w || !m.h) return false; const r = m.w / m.h; return (r > aspect ? aspect / r : r / aspect) < 0.5; };
  const pair = (a, b) => {
    if (!a || !b) return 0;
    const key = a.id + '|' + b.id;
    let p = pairC.get(key);
    if (p != null) return p;
    p = 0;
    const sim = layoutSim(a.layout, b.layout);
    // Beinahe-Doppel: gleicher Aufbau UND gleiche Farbe (gleicher Aufbau in anderer Farbe ist ein Match-Cut)
    const colorD = a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 99;
    const dup = a.dupOf === b.id || b.dupOf === a.id || (a.hash && b.hash && hamming(a.hash, b.hash) < 12 && colorD < 30);
    if (dup) p -= 0.6;
    // Match-Cut (Übergangswahl ab 0,78): unsichtbarer Schnitt, Kamerafahrt läuft weiter – nur bildfüllend möglich
    // (ein gerahmtes Querfoto im Hochformat hat keinen Ausschnitt, an den die Bewegung anschließen könnte)
    else if (sim > 0.78 && !framed(a) && !framed(b)) p += 0.7;
    if (a.kind === 'image' && b.kind === 'image' && sizeOf(a) === sizeOf(b)) p -= 0.08;
    // Hoch- und Querformat im Wechsel: die Kamera müsste zwischen Schwenk und Zoom springen – ruhiger gleich bei gleich
    const land = (m) => (m.w && m.h ? (m.w > m.h * 1.1 ? 1 : m.h > m.w * 1.1 ? -1 : 0) : 0);
    if (land(a) * land(b) < 0) p -= 0.35;
    // tonale Kontinuität: harte Helligkeitssprünge zwischen Nachbarn wirken abgehackt
    const dL = Math.abs((a.luma || 0.45) - (b.luma || 0.45));
    if (dL > 0.22) p -= (dL - 0.22) * 1.5;
    pairC.set(key, p);
    return p;
  };

  // Blöcke: zusammenhängende freie Plätze, deren Aufnahmen im selben Tagesblock liegen
  // (im Gesamtfilm nie über ein Ortskapitel hinweg)
  const chap = [];
  let ci = 0;
  for (const c of clips) { if (c.chapter) ci++; chap.push(ci); }
  const groups = new Map();
  for (const k of idx) {
    // (ohne Aufnahmezeit gibt es keine Chronologie – beim Neuschneiden dürfen sie als eine Gruppe neu angeordnet werden)
    const d = dayBlock(img(clips[k].mediaId)) ?? (vary ? 'ohne-Zeit' : null);
    if (d == null) continue;
    const b = d + '|' + chap[k];
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(k);
  }
  let moved = 0, blocks = 0;
  const mediaAt = (k) => (clips[k] ? byId.get(clips[k].mediaId) : null);
  for (const ks of groups.values()) {
    const n = ks.length;
    if (n < 2) continue;
    // Rang nach Aufnahmezeit (für den sanften Zug zur Chronologie)
    const rankOf = new Map(ks.map((k) => clips[k].mediaId).sort((a, b) => (byId.get(a).time || 0) - (byId.get(b).time || 0)).map((id, r) => [id, r]));
    const before = ks.map((k) => clips[k].mediaId);
    const pos = new Map(ks.map((k, p) => [k, p]));
    const local = (set) => {
      let v = 0;
      const edges = new Set();
      for (const k of set) {
        if (pos.has(k)) v += unary(clips[k], byId.get(clips[k].mediaId), rankOf.get(clips[k].mediaId), pos.get(k), n);
        edges.add(k - 1); edges.add(k);
      }
      for (const e of edges) if (e >= 0) v += pair(mediaAt(e), mediaAt(e + 1));
      return v;
    };
    // lokale Suche: bester Tausch je Runde, bis nichts mehr besser wird
    for (let round = 0; round < n * 2; round++) {
      let best = null, gain = 1e-3;
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          const ka = ks[a], kb = ks[b];
          const set = [ka, kb];
          const v0 = local(set);
          [clips[ka].mediaId, clips[kb].mediaId] = [clips[kb].mediaId, clips[ka].mediaId];
          const v1 = local(set);
          [clips[ka].mediaId, clips[kb].mediaId] = [clips[kb].mediaId, clips[ka].mediaId];
          if (v1 - v0 > gain) { gain = v1 - v0; best = [ka, kb]; }
        }
      }
      if (!best) break;
      const [ka, kb] = best;
      [clips[ka].mediaId, clips[kb].mediaId] = [clips[kb].mediaId, clips[ka].mediaId];
    }
    const ch = ks.filter((k, p) => clips[k].mediaId !== before[p]).length;
    if (ch) { moved += ch; blocks++; }
  }
  return { moved, blocks };
}
