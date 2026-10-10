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

// Bildvergleich zweier Aufnahmen (Aufbau, Farbabstand, Beinahe-Doppel) hängt nur von den Bildern ab: über alle
// Planer-Durchgänge zwischenspeichern (die Suche baut einen Film viele Male, die Aufnahmen bleiben dieselben)
const PAIR_BASE = new WeakMap();
function pairBase(a, b) {
  let m = PAIR_BASE.get(a);
  if (!m) { m = new Map(); PAIR_BASE.set(a, m); }
  let v = m.get(b);
  // (ändern sich die Merkmale eines Bilds – Nachanalyse –, wird neu gerechnet)
  if (!v || v[3] !== a.layout || v[4] !== b.layout || v[5] !== a.sig || v[6] !== b.sig || v[7] !== a.avg || v[8] !== b.avg || v[9] !== a.hash || v[10] !== b.hash) {
    const sim = layoutSim(a.layout, b.layout);
    // Beinahe-Doppel: gleicher Aufbau UND gleiche Farbe (gleicher Aufbau in anderer Farbe ist ein Match-Cut)
    const colorD = a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 99;
    const dup = !!(sameMotif(a, b) || (a.hash && b.hash && hamming(a.hash, b.hash) < 12 && colorD < 30));
    v = [sim, colorD, dup, a.layout, b.layout, a.sig, b.sig, a.avg, b.avg, a.hash, b.hash];
    m.set(b, v);
  }
  return v;
}

/**
 * Ordnet die schlichten Foto-Einstellungen jedes Tagesblocks neu (lokale Suche über Tausche).
 * Fest bleiben: Videos, eigene Entscheidungen, verschobene Aufnahmen, Startbild, Stil-Mittel und Bilder, auf die sich
 * Rückspulen, Wiederholung oder Echo beziehen. Liefert { moved, blocks } für die Erklärung.
 */
function arrangeBlocks(clips, { byId, ovOf = () => null, moved: userMoved = new Set(), us = true, aspect = 0, vary = 0, lied = false, energyAt = null, rounds = 0 }) {
  // (rounds: Probeläufe der Längensuche ordnen nur grob – der gewählte Schnitt wird danach vollständig geordnet)
  const special = (c) => c.split || c.grid || c.burst || c.rush || c.stack || c.strip || c.miniRew || c.pre || c.reveal || c.leader || c.flightAnim || c.loop || c.vid || c.gridMid || c.afterGrid || c.replay || c.replaySeg || c.repeatSeg || c.echo;
  // eigenes Motiv bleibt; „Gefällt mir nicht“ ändert nur die Bewegung und wird mitgeordnet
  // (auch ein bei „Gefällt mir nicht“ getauschtes Foto bleibt, wo es ist: nur diese Stelle ändert sich)
  const own = (c) => { const o = ovOf(c); return !!(o && o.mediaId) || !!c.again; };
  const img = (id) => { const m = byId.get(id); return m && m.kind === 'image' ? m : null; };
  const echoed = new Set();
  for (const c of clips) if (c.miniRew || c.replay || c.loop || c.echo || c.pre) echoed.add(c.mediaId);
  const free = (c) => c && !special(c) && !own(c) && c.role !== 'hook' && c.role !== 'chapter' && !!img(c.mediaId) && !echoed.has(c.mediaId) && !userMoved.has(c.mediaId);

  const idx = clips.map((c, k) => k).filter((k) => free(clips[k]));
  if (idx.length < (vary ? 2 : 3)) return { moved: 0, blocks: 0 };
  const durs = idx.map((k) => clips[k].end - clips[k].start);
  const avgDur = durs.reduce((a, b) => a + b, 0) / durs.length;
  const scores = idx.map((k) => img(clips[k].mediaId).score || 0.5);
  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const cl = (x, a, b) => Math.max(a, Math.min(b, x));
  // „Zum Lied“: Energie von Platz und Bild über ihren Rang vergleichen (die kräftigsten Bilder auf die kräftigsten Stellen)
  const qSlot = new Map(), qImg = new Map(), momentOf = new Map();
  if (lied && energyAt) {
    const rank = (pairs, map) => { pairs.sort((a, b) => a[1] - b[1]); pairs.forEach(([k], r) => map.set(k, pairs.length > 1 ? r / (pairs.length - 1) : 0.5)); };
    rank(idx.map((k) => [clips[k], energyAt((clips[k].start + clips[k].end) / 2)]), qSlot);
    // ein Moment (gleicher Ort, wenige Minuten) zählt mit seiner gemeinsamen Energie – er soll als Ganzes passen
    const ms = idx.map((k) => img(clips[k].mediaId));
    const eOwn = (m) => mediaEnergy(m) + 0.15 * (m.score || 0.5);
    for (const mo of liedMoments(ms)) { const avg = mo.reduce((a, m) => a + eOwn(m), 0) / mo.length; mo.forEach((m) => momentOf.set(m.id, { mo, avg })); }
    rank(ms.map((m) => [m.id, 0.6 * momentOf.get(m.id).avg + 0.4 * eOwn(m)]), qImg);
  }

  // wie gut passt Aufnahme m auf Platz c (ohne Nachbarn)
  const unary = (c, m, rank, pos, n) => {
    const calm = isCalmLabel(c.label);
    const durN = cl((c.end - c.start - avgDur) / Math.max(0.2, avgDur), -1, 1);
    // Wir (von euch markiert): klar in die ruhigen Passagen und auf die langen Plätze
    const u = us ? usScore(m) : 0;
    let v = u * (calm ? 1.6 : -1.2) + (1 - u) * (calm ? 0 : 0.25) + u * durN * 0.7;
    const size = sizeOf(m);
    v += durN * (size === 0 ? 0.35 : size === 2 ? -0.25 : 0);
    v += durN * ((m.score || 0.5) - meanScore) * 1.2;
    if (lied && qSlot.has(c) && qImg.has(m.id)) v -= 1.2 * Math.abs(qImg.get(m.id) - qSlot.get(c));
    else v -= 0.4 * Math.abs(energyOf(m) - (SLOT_ENERGY[c.label] != null ? SLOT_ENERGY[c.label] : 0.5));
    // Einsatz eines Refrains/Drops: dort gehört ein starkes Bild hin
    if (c.sectionChange && (c.label === 'drop' || c.label === 'chorus')) v += ((m.score || 0.5) - meanScore) * (lied ? 3 : 1.5);
    // bei Gleichstand die Aufnahmezeit: sanfter Zug zur ursprünglichen Reihenfolge
    if (!lied) v -= 0.15 * Math.abs(rank - pos) / Math.max(1, n);
    // „Neu schneiden“: eine feste, je Schnitt andere Vorliebe (Aufnahme × Platz) – so entsteht eine neue Anordnung,
    // die Regeln (Wir ruhig, starke Bilder lang, Energie zur Songstelle) wiegen weiter schwerer
    if (vary) { let h = (vary ^ Math.imul(hashId(m.id), 2654435761) ^ Math.imul(c.i + 1, 40503)) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; v += ((h >>> 8) / 16777216 - 0.5) * 0.7; }
    return v;
  };
  // Zwischenspeicher: die Suche prüft viele Tausche, Bildvergleiche nur einmal rechnen
  const sizeC = new Map(), energyC = new Map();
  // (Aufnahmen als Zahlen: Nachbar-Bewertung in einer Tabelle statt über Text-Schlüssel – die Suche prüft sehr viele Tausche)
  const mList = [...new Set(clips.map((c) => c.mediaId).filter((id) => id != null && byId.has(id)))].map((id) => byId.get(id));
  const mIdx = new Map(mList.map((m, i) => [m.id, i]));
  const NM = mList.length;
  const pairT = new Float64Array(NM * NM).fill(NaN);
  const slotM = Int32Array.from(clips, (c) => (c.mediaId != null && mIdx.has(c.mediaId) ? mIdx.get(c.mediaId) : -1));
  const swapK = (ka, kb) => { [clips[ka].mediaId, clips[kb].mediaId] = [clips[kb].mediaId, clips[ka].mediaId]; const x = slotM[ka]; slotM[ka] = slotM[kb]; slotM[kb] = x; };
  const sizeOf = (m) => { let v = sizeC.get(m.id); if (v == null) { v = shotSize(m); sizeC.set(m.id, v); } return v; };
  const energyOf = (m) => { let v = energyC.get(m.id); if (v == null) { v = mediaEnergy(m); energyC.set(m.id, v); } return v; };
  // zwei Nachbarn: nie Beinahe-Doppel hintereinander; ähnlicher Bildaufbau ist eine Match-Cut-Chance (wie in flowOrder),
  // gleiche Einstellungsgröße leicht vermeiden
  const framed = (m) => { if (!aspect || !m.w || !m.h) return false; const r = m.w / m.h; return (r > aspect ? aspect / r : r / aspect) < 0.5; };
  const pair = (a, b) => {
    if (!a || !b) return 0;
    let p = 0;
    const [sim, colorD, dup] = pairBase(a, b);
    if (dup) p -= 0.6;
    // Match-Cut (Übergangswahl ab 0,78): unsichtbarer Schnitt, Kamerafahrt läuft weiter – nur bildfüllend möglich
    // (ein gerahmtes Querfoto im Hochformat hat keinen Ausschnitt, an den die Bewegung anschließen könnte)
    else if (sim > 0.78 && !framed(a) && !framed(b)) p += 0.7;
    // Einstellungsgrößen wie ein Cutter: innerhalb einer Szene von weit nach nah (Totale → Halbnah → Detail),
    // eine neue Szene beginnt mit einer Totale (Orientierung), gleiche Größe hintereinander springt
    if (a.kind === 'image' && b.kind === 'image') {
      const sa = sizeOf(a), sb = sizeOf(b);
      const sameScene = momentOf.size ? momentOf.has(a.id) && momentOf.get(a.id) === momentOf.get(b.id) : a.time && b.time && Math.abs(a.time - b.time) <= 10 * 60000;
      if (sa === sb) p -= 0.12;
      if (sameScene && sb === sa + 1) p += 0.18;
      if (!sameScene && sb === 0) p += 0.15;
      if (!sameScene && sb === 2) p -= 0.08;
    }
    // Hoch- und Querformat im Wechsel: die Kamera müsste zwischen Schwenk und Zoom springen – ruhiger gleich bei gleich
    const land = (m) => (m.w && m.h ? (m.w > m.h * 1.1 ? 1 : m.h > m.w * 1.1 ? -1 : 0) : 0);
    if (land(a) * land(b) < 0) p -= 0.35;
    // tonale Kontinuität: harte Helligkeitssprünge zwischen Nachbarn wirken abgehackt
    const dL = Math.abs((a.luma || 0.45) - (b.luma || 0.45));
    if (dL > 0.22) p -= (dL - 0.22) * 1.5;
    // „Zum Lied“: Farbe fließt weich weiter, ein Moment (wenige Minuten, gleicher Ort) bleibt beieinander
    if (lied) {
      if (!dup) p -= 0.25 * Math.min(1, colorD / 160);
      if (momentOf.has(a.id) && momentOf.get(a.id) === momentOf.get(b.id)) p += 0.5;
      else if (a.time && b.time && Math.abs(a.time - b.time) <= 10 * 60000) p += 0.2;
    }
    return p;
  };
  const pairI = (i, j) => {
    if (i < 0 || j < 0) return 0;
    const q = i * NM + j;
    let p = pairT[q];
    if (p !== p) { p = pair(mList[i], mList[j]); pairT[q] = p; }
    return p;
  };
  // Einstellungsgröße je Aufnahme (−1: kein Foto) für „drei gleiche hintereinander“
  const sizeI = Int8Array.from(mList, (m) => (m.kind === 'image' ? sizeOf(m) : -1));
  const stamp = new Int32Array(clips.length + 3), stamp2 = new Int32Array(clips.length + 3), blockT = new Int32Array(clips.length + 3);
  let tick = 0, bTick = 0;

  // Blöcke: zusammenhängende freie Plätze, deren Aufnahmen im selben Tagesblock liegen
  // (im Gesamtfilm nie über ein Ortskapitel hinweg)
  const chap = [];
  let ci = 0;
  for (const c of clips) { if (c.chapter) ci++; chap.push(ci); }
  const groups = new Map();
  for (const k of idx) {
    // (ohne Aufnahmezeit gibt es keine Chronologie – beim Neuschneiden dürfen sie als eine Gruppe neu angeordnet werden)
    const d = lied ? 'lied' : dayBlock(img(clips[k].mediaId)) ?? (vary ? 'ohne-Zeit' : null);
    if (d == null) continue;
    const b = d + '|' + chap[k];
    if (!groups.has(b)) groups.set(b, []);
    groups.get(b).push(k);
  }
  let moved = 0, blocks = 0;
  for (const ks of groups.values()) {
    const n = ks.length;
    if (n < 2) continue;
    // Rang nach Aufnahmezeit (für den sanften Zug zur Chronologie)
    const rankOf = new Map(ks.map((k) => clips[k].mediaId).sort((a, b) => (byId.get(a).time || 0) - (byId.get(b).time || 0)).map((id, r) => [id, r]));
    const before = ks.map((k) => clips[k].mediaId);
    const posA = new Int32Array(clips.length).fill(-1);
    ks.forEach((k, p) => { posA[k] = p; });
    // Platz × Aufnahme ohne Nachbarn: hängt nur von beiden ab – einmal rechnen
    const unT = new Float64Array(clips.length * NM).fill(NaN);
    const sm = (k) => (k >= 0 && k < clips.length ? slotM[k] : -1);
    const local = (set) => {
      let v = 0;
      const t1 = ++tick;
      for (let a = 0; a < set.length; a++) {
        const k = set[a], p = posA[k], mi = slotM[k];
        if (p >= 0) {
          const q = k * NM + mi;
          let u = unT[q];
          if (u !== u) { const m = mList[mi]; u = unary(clips[k], m, rankOf.get(m.id), p, n); unT[q] = u; }
          v += u;
        }
      }
      // (gleiche Reihenfolge der Summe wie bisher: erst alle Plätze, dann die Nachbarn)
      for (let a = 0; a < set.length; a++) {
        const k = set[a];
        if (k - 1 >= 0 && stamp[k - 1] !== t1) { stamp[k - 1] = t1; v += pairI(sm(k - 1), sm(k)); }
        if (stamp[k] !== t1) { stamp[k] = t1; v += pairI(sm(k), sm(k + 1)); }
      }
      // drei gleiche Einstellungsgrößen hintereinander wirken eintönig
      for (let a = 0; a < set.length; a++) {
        for (let q = set[a] - 2; q <= set[a]; q++) {
          if (q < 0 || stamp2[q] === t1) continue;
          stamp2[q] = t1;
          const i0 = sm(q), i1 = sm(q + 1), i2 = sm(q + 2);
          if (i0 >= 0 && i1 >= 0 && i2 >= 0) { const z = sizeI[i0]; if (z >= 0 && z === sizeI[i1] && z === sizeI[i2]) v -= 0.25; }
        }
      }
      return v;
    };
    // je Runde alle verbessernden Tausche, der beste zuerst; jeder weitere nur, wenn er die schon getauschten Stellen
    // (± 2 Plätze, so weit reicht die Bewertung) nicht berührt und nach dem Nachrechnen immer noch verbessert – so
    // kommt die Suche in wenigen Runden ans Ziel statt in vielen mit je einem Tausch
    const applyBatch = (cands, swap) => {
      if (!cands.length) return 0;
      cands.sort((x, y) => y.g - x.g);
      const t = ++bTick;
      let done = 0;
      for (const c of cands) {
        const set = c.A.concat(c.B);
        if (set.some((k) => blockT[k] === t)) continue;
        if (done) {
          const v0 = local(set);
          swap(c.A, c.B);
          if (local(set) - v0 <= 1e-3) { swap(c.A, c.B); continue; }
        } else swap(c.A, c.B);
        for (const k of set) for (let q = Math.max(0, k - 2); q <= k + 2; q++) blockT[q] = t;
        done++;
      }
      return done;
    };
    // „Zum Lied“: Momente bleiben am Stück – getauscht werden ganze Läufe gleicher Länge (eine Szene an eine besser
    // passende Songstelle) und Bilder innerhalb eines Moments (welches zuerst, welches auf den Einsatz)
    if (lied) {
      const momId = (k) => { const mo = momentOf.get(clips[k].mediaId); return mo ? mo.mo : null; };
      const swapSets = (A, B) => { for (let i = 0; i < A.length; i++) swapK(A[i], B[i]); };
      for (let round = 0; round < (rounds || 60); round++) {
        const runs = [];
        for (let q = 0; q < n; q++) {
          const k = ks[q], last = runs[runs.length - 1];
          if (last && ks[q - 1] === k - 1 && momId(k) && momId(k) === momId(last[last.length - 1])) last.push(k); else runs.push([k]);
        }
        const cands = [];
        const tryMove = (A, B) => {
          const set = A.concat(B), v0 = local(set);
          swapSets(A, B);
          const v1 = local(set);
          swapSets(A, B);
          if (v1 - v0 > 1e-3) cands.push({ A, B, g: v1 - v0 });
        };
        for (const r of runs) for (let a = 0; a < r.length; a++) for (let b = a + 1; b < r.length; b++) tryMove([r[a]], [r[b]]);
        for (let a = 0; a < runs.length; a++) for (let b = a + 1; b < runs.length; b++) if (runs[a].length === runs[b].length) tryMove(runs[a], runs[b]);
        // eine Szene gegen mehrere aufeinanderfolgende ganze Szenen gleicher Gesamtlänge (so findet auch eine Szene,
        // die ein Video teilt, ihren Platz – keine Szene zerfällt dabei)
        for (let a = 0; a < runs.length; a++) {
          if (runs[a].length < 2) continue;
          for (let b = 0; b < runs.length; b++) {
            if (b === a) continue;
            const W = [];
            for (let j = b; j < runs.length && W.length < runs[a].length; j++) {
              if (j === a || (W.length && runs[j][0] !== W[W.length - 1] + 1)) { W.length = runs[a].length + 1; break; }
              W.push(...runs[j]);
            }
            if (W.length === runs[a].length && runs[b].length !== runs[a].length) tryMove(runs[a], W);
          }
        }
        // eine von einem Video geteilte Szene zieht als Ganzes um (auf gleich viele Plätze einer anderen Szene)
        const split = new Map();
        for (const r of runs) { const mo = momId(r[0]); if (mo) { if (!split.has(mo)) split.set(mo, []); split.get(mo).push(r); } }
        for (const parts of split.values()) {
          if (parts.length < 2) continue;
          const A = parts.flat();
          for (const r of runs) if (r.length === A.length && !A.includes(r[0])) tryMove(A, r);
        }
        // ein Einzelbild (z. B. auf einem Einsatz zwischen zwei Videos) darf mit dem Randbild eines Moments tauschen
        // (nur echte Einzelbilder oder der Einsatz selbst – sonst zerfielen Momente Stück für Stück)
        const heroK = (k) => clips[k].sectionChange && (clips[k].label === 'drop' || clips[k].label === 'chorus');
        for (const r of runs) if (r.length === 1 && (heroK(r[0]) || (momentOf.get(clips[r[0]].mediaId) || { mo: [] }).mo.length === 1)) for (const o of runs) if (o !== r && o.length > 1) { tryMove(r, [o[0]]); tryMove(r, [o[o.length - 1]]); }
        if (!applyBatch(cands, swapSets)) break;
      }
    }
    // lokale Suche: die besten Tausche je Runde, bis nichts mehr besser wird
    const swap1 = (A, B) => swapK(A[0], B[0]);
    for (let round = 0; !lied && round < (rounds || Math.min(n * 2, 90)); round++) {
      const cands = [];
      for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
          const ka = ks[a], kb = ks[b];
          const set = [ka, kb];
          const v0 = local(set);
          swapK(ka, kb);
          const v1 = local(set);
          swapK(ka, kb);
          if (v1 - v0 > 1e-3) cands.push({ A: [ka], B: [kb], g: v1 - v0 });
        }
      }
      if (!applyBatch(cands, swap1)) break;
    }
    const ch = ks.filter((k, p) => clips[k].mediaId !== before[p]).length;
    if (ch) { moved += ch; blocks++; }
  }
  return { moved, blocks };
}
