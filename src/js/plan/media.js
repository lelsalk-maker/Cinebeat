/* Planer · Tempo-Kurven, Videolängen, Reihenfolge, Auswahl und Kamerafahrten */
/** Zurückgelegte Quellzeit einer Tempo-Kurve (Punkte [Zeit, Tempo], linear dazwischen) bis t. */
function rampIntegral(pts, t) {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, r0] = pts[i], [t1, r1] = pts[i + 1];
    if (t <= t0) break;
    const te = Math.min(t, t1), f = (te - t0) / Math.max(1e-6, t1 - t0);
    acc += (te - t0) * (r0 + (r0 + (r1 - r0) * f)) / 2;
  }
  const last = pts[pts.length - 1];
  if (t > last[0]) acc += (t - last[0]) * last[1];
  return acc;
}
function rampRate(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) if (t < pts[i + 1][0]) { const [t0, r0] = pts[i], [t1, r1] = pts[i + 1]; return r0 + (r1 - r0) * (t - t0) / Math.max(1e-6, t1 - t0); }
  return pts[pts.length - 1][1];
}

/** Spielbarer Teil eines Videos (gewählter Ausschnitt oder ganz), in Sekunden. */
function videoSpan(m) {
  const d = m.duration || 3;
  if (m.trim && m.trim[1] > m.trim[0]) return Math.max(0.5, Math.min(d, m.trim[1]) - Math.max(0, m.trim[0]));
  return d;
}
/** So lange soll ein Video im Film laufen: fast ganz, höchstens vmax. */
function videoPlay(m, vmax) {
  return Math.max(1.5, Math.min(vmax, videoSpan(m) * 0.96));
}

/** Energie einer Aufnahme (0 … 1): kräftige Farben, Schärfe und bei Videos Bewegung. */
function mediaEnergy(m) {
  const hl = m.kind === 'video' && m.highlights && m.highlights[0] ? 0.2 : 0;
  return Math.max(0, Math.min(1, 0.5 * (m.color || 0.4) + 0.35 * (m.sharp || 0.5) + hl));
}
const isCalmLabel = (l) => l !== 'drop' && l !== 'chorus';

/**
 * Eigene Plätze für Videos: in ruhigen Songteilen, lang genug, dass sie nicht mitten in der Bewegung abreißen,
 * und zeitlich dort, wo sie in der Reise liegen. Benachbarte Schnitte werden dafür zusammengelegt (bleiben auf Beats).
 */
function videoSlots(segs, an, win, vids, all, barDur, startAt, endAt, vmax, rampDrop = false) {
  const special = (g) => g.burst || g.leader || g.knock || g.gridSeg || g.gridMid || g.pre || g.reveal || g.vslot || g.miniRew || g.stackSeg || g.rush;
  const labelAt = (t) => sectionAt(an, win.start + t + 0.01).label;
  const bars = (an.barStart || []).map((b) => b - win.start);
  const onBar = (t) => bars.some((b) => Math.abs(b - t) < 0.04);
  const span = Math.max(1, endAt - startAt);
  let budget = (endAt - startAt) * 0.7;
  // Speed-Ramp an: ein längeres Video darf auf den Drop zulaufen (beschleunigt) oder auf ihm landen (Zeitlupe)
  const peaks = (an.sections || []).filter((x) => x.label === 'drop' || x.label === 'chorus').map((x) => x.start - win.start);
  const atPeak = (t) => peaks.some((x) => Math.abs(x - t) < 0.06);
  let rampLeft = rampDrop ? 1 : 0;
  // Jedes Video bekommt einen eigenen Platz. Reicht die Zeit nicht für alle in voller Länge, werden die Plätze
  // gleichmäßig kürzer – aber nie kürzer als ein Takt (bzw. das ganze Video), damit kein Video nur vorbeihuscht.
  const fits = vids.filter((v) => videoSpan(v) >= 1.2);
  const full = fits.map((v) => videoPlay(v, vmax));
  const tot = full.reduce((a, b) => a + b, 0);
  const shrink = tot > budget ? budget / tot : 1;
  const minW = (v) => Math.min(videoSpan(v) * 0.96, Math.max(2.4, barDur));
  for (const v of vids) {
    // fast die ganze Länge (bzw. der gewählte Ausschnitt), höchstens vmax
    if (videoSpan(v) < 1.2) continue;
    const want = Math.max(minW(v), videoPlay(v, vmax) * shrink);
    if (budget < minW(v) * 0.8) continue;
    const p = all.length > 1 ? all.indexOf(v) / (all.length - 1) : 0.5;
    const target = startAt + p * span;
    // bewegte Videos (Action) passen in Drop/Refrain, ruhige in Strophe und Break
    const lively = (v.motion || 0) > 0.05;
    let best = null;
    for (let k = 0; k < segs.length - 1; k++) {
      const g = segs[k];
      if (special(g) || g.start < startAt - 0.01 || g.end > endAt + 0.01) continue;
      const lab = labelAt(g.start);
      let j = k, end = g.end, cross = 0;
      while (end - g.start < want * 0.95 && j + 1 < segs.length - 1 && !special(segs[j + 1]) && segs[j + 1].end - g.start <= want * 1.2) {
        j++; end = segs[j].end;
        if (labelAt(segs[j].start) !== lab) cross++;
      }
      // eine Einstellung mehr, wenn das näher an der Länge des Videos liegt (es läuft dann leicht verlangsamt ganz)
      const nx = segs[j + 1];
      if (end - g.start < want * 0.9 && nx && j + 1 < segs.length - 1 && !special(nx) && nx.end - g.start <= Math.min(want * 1.3, videoSpan(v) / 0.8) && nx.end - g.start - want < want - (end - g.start)) {
        j++; end = nx.end;
        if (labelAt(nx.start) !== lab) cross++;
      }
      const len = end - g.start;
      if (len < Math.min(want * 0.8, 1.5)) continue;
      const calm = isCalmLabel(lab);
      // zu kurz wiegt schwerer als etwas zu lang: das Video soll nicht abgeschnitten werden
      const cost = (Math.abs(g.start - target) / span) * 0.8 + (len < want ? 1.2 : 0.6) * Math.abs(len - want) / want + (onBar(g.start) ? 0 : 0.25) + cross * 0.15
        + (lively ? (calm ? 0.3 : 0) : (calm ? 0 : 0.6));
      const ramp = rampLeft > 0 && videoSpan(v) > want * 1.15 && (atPeak(end) || atPeak(g.start));
      const c2 = cost - (ramp ? 1.2 : 0);
      if (!best || c2 < best.cost) best = { k, j, cost: c2, end, ramp };
    }
    if (!best) continue;
    if (best.ramp) rampLeft--;
    const g0 = segs[best.k];
    segs.splice(best.k, best.j - best.k + 1, { start: g0.start, end: best.end, w: g0.w, vslot: true, vid: v.id, freezeAt: undefined });
    budget -= best.end - g0.start;
  }
  return segs;
}

/**
 * Verteilt Aufnahmen auf die Einstellungen: Videos auf ihre Plätze (oder die längste passende ruhige Einstellung),
 * Fotos in ihrer Reihenfolge, aber jeweils die, deren Energie am besten zum Songteil passt (Blick auf die nächsten drei).
 */
function assignStream(clips, idxs, list, byId) {
  const taken = new Set();
  const vids = list.filter((m) => m.kind === 'video');
  const free = new Set(idxs);
  // 1. Videoplätze
  for (const i of idxs) {
    const c = clips[i];
    if (c.vid && byId.has(c.vid) && list.includes(byId.get(c.vid))) { c.mediaId = c.vid; free.delete(i); taken.add(c.vid); }
  }
  // 2. übrige Videos: längste ruhige Einstellung nahe ihrer Zeitposition
  const idxArr = idxs.slice();
  for (const v of vids) {
    if (taken.has(v.id)) continue;
    const p = list.length > 1 ? list.indexOf(v) / (list.length - 1) : 0.5;
    let best = -1, bs = -Infinity;
    for (const i of free) {
      const c = clips[i], len = c.end - c.start;
      if (len < 1.5) continue;
      const pos = idxArr.indexOf(i) / Math.max(1, idxArr.length - 1);
      const sc = Math.min(len, 4) - Math.abs(pos - p) * 6 + (isCalmLabel(c.label) ? 1.2 : 0);
      if (sc > bs) { bs = sc; best = i; }
    }
    if (best >= 0) { clips[best].mediaId = v.id; free.delete(best); taken.add(v.id); }
  }
  // 3. Fotos (und Videos ohne Platz nur auf langen Einstellungen) nach Reihenfolge und passender Energie
  let stream = list.filter((m) => !taken.has(m.id));
  if (!stream.length) stream = list.slice();
  let pos = 0;
  const recent = [];
  for (const i of idxs) {
    if (!free.has(i)) { recent.push(clips[i].mediaId); continue; }
    const c = clips[i];
    const want = Math.max(0, Math.min(1, c.energy != null ? c.energy : 0.5));
    let bk = -1, bv = Infinity;
    // nur unter den in dieser Runde noch nicht gezeigten wählen: sonst verdrängte ein Wiederholer eine neue Aufnahme
    for (let k = 0; k < Math.min(3, stream.length - pos); k++) {
      const m = stream[(pos + k) % stream.length];
      if (m.kind === 'video' && c.end - c.start < 1.5) continue;
      if (recent.slice(-3).includes(m.id) && stream.length > 3) continue;
      // ähnlicher Bildaufbau direkt nach dem vorigen Bild (Match-Cut) hat Vorrang vor der Energie
      const prevM = byId.get(recent[recent.length - 1]);
      const v = Math.abs(mediaEnergy(m) - want) + k * 0.16 - (prevM && layoutSim(prevM.layout, m.layout) > 0.78 ? 0.3 : 0);
      if (v < bv) { bv = v; bk = k; }
    }
    if (bk < 0) {
      // alle nahen Kandidaten passen nicht (z. B. Videos auf einer sehr kurzen Einstellung): das nächste Foto nehmen
      bk = 0;
      const short = c.end - c.start < 1.5;
      for (let k = 0; k < stream.length - pos; k++) {
        const m = stream[(pos + k) % stream.length];
        if (short && m.kind === 'video') continue;
        if (recent.slice(-3).includes(m.id) && stream.length > 3) continue;
        bk = k; break;
      }
    }
    // gewählte Aufnahme mit der fälligen tauschen: keine wird übersprungen, die Reihenfolge bleibt fast erhalten
    const at = (pos + bk) % stream.length, here = pos % stream.length;
    const m = stream[at];
    stream[at] = stream[here]; stream[here] = m;
    c.mediaId = m.id;
    recent.push(m.id);
    pos = (pos + 1) % stream.length;
  }
}

/** Vom Nutzer in der Zeitleiste verschobene Aufnahmen: [{ id, before }] (before: null = ans Ende). */
function applyMoves(list, moves) {
  if (!moves || !moves.length) return list;
  let out = list.slice();
  for (const mv of moves) {
    const k = out.findIndex((m) => m.id === mv.id);
    if (k < 0) continue;
    const [m] = out.splice(k, 1);
    const at = mv.before ? out.findIndex((x) => x.id === mv.before) : -1;
    if (at < 0) out.push(m); else out.splice(at, 0, m);
  }
  return out;
}

function orderChrono(list) {
  return list.slice().sort((a, b) => (a.time || 0) - (b.time || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'de', { numeric: true }));
}

/** Wählt K Medien: Favoriten zuerst, dann nach Bewertung; Reihenfolge chronologisch. */
function selectMedia(pool, K, mustIds) {
  let clean = pool.filter((m) => !m.bad && !m.excluded && (!m.dupOf || m.fav || mustIds.has(m.id)));
  if (clean.length < 2) {
    // nur bei fast leerem Material dürfen Doppelte/Unscharfe aushelfen
    const dups = pool.filter((m) => !m.bad && !m.excluded && m.dupOf && !clean.includes(m)).sort((a, b) => (b.score || 0) - (a.score || 0));
    clean = clean.concat(dups.slice(0, Math.max(0, Math.min(K, 3) - clean.length)));
  }
  if (clean.length <= K) return orderChrono(clean);
  const must = clean.filter((m) => m.fav || mustIds.has(m.id));
  const rest = clean.filter((m) => !(m.fav || mustIds.has(m.id))).sort((a, b) => (b.score || 0) - (a.score || 0));
  return orderChrono(must.concat(rest.slice(0, Math.max(0, K - must.length))));
}

/**
 * Bewusste Reihenfolge: grob chronologisch, innerhalb einer Szene (Aufnahmen kurz nacheinander)
 * aber so, dass jedes Bild aus dem vorigen hervorgeht: ähnliche Farbe und Helligkeit fließen,
 * ähnlicher Bildaufbau ergibt Match-Cuts, Beinahe-Doppel stehen nie direkt hintereinander.
 */
function flowOrder(list, wantMatch) {
  if (list.length < 3) return list.slice();
  const colorD = (a, b) => (a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 60);
  const twin = (a, b) => colorD(a, b) < 18 && a.hash && b.hash && hamming(a.hash, b.hash) < 14;
  const flow = (a, b) => {
    if (twin(a, b)) return -1;
    let v = 0.45 * (1 - Math.min(1, colorD(a, b) / 160)) + 0.25 * (1 - Math.min(1, Math.abs((a.luma || 0.45) - (b.luma || 0.45)) / 0.4));
    const sim = layoutSim(a.layout, b.layout);
    if (wantMatch && sim > 0.72) v += 0.35 * sim;
    if (a.kind !== b.kind) v += 0.05;
    // Einstellungsgrößen wechseln wie im Film (Totale → Halbnah → Detail), gleiche Größen hintereinander wirken flach
    const sa = shotSize(a), sb = shotSize(b);
    if (sa === sb) v -= sa === 1 ? 0.05 : 0.14;
    else v += Math.abs(sa - sb) === 1 ? 0.12 : 0.07;
    // eine neue Szene eröffnet am liebsten eine Totale (Establishing Shot)
    if (a.time && b.time && b.time - a.time > 20 * 60 * 1000 && sb === 0) v += 0.2;
    return v;
  };
  // Momente: nur Aufnahmen, die wenige Minuten auseinander liegen, dürfen die Plätze tauschen (die Reise bleibt chronologisch)
  const scenes = [];
  for (const m of list) {
    const last = scenes[scenes.length - 1];
    const prev = last && last[last.length - 1];
    if (!prev || !m.time || !prev.time || m.time - prev.time > 3 * 60 * 1000) scenes.push([m]); else last.push(m);
  }
  const out = [];
  for (const sc of scenes) {
    const rest = sc.slice();
    let prev = out[out.length - 1] || null;
    while (rest.length) {
      let bi = 0;
      if (prev) {
        let bv = -Infinity;
        // nur unter den nächsten vier Aufnahmen wählen: die Geschichte bleibt in ihrer Zeit
        for (let k = 0; k < Math.min(3, rest.length); k++) {
          // nur innerhalb weniger Minuten tauschen: die Aufnahme-Reihenfolge bleibt erhalten
          // (Ausnahme: ein Beinahe-Doppel rückt einen Platz nach hinten, damit es nicht wie ein Hänger wirkt)
          if (k && rest[k].time && rest[0].time && Math.abs(rest[k].time - rest[0].time) > 3 * 60 * 1000 && !(k === 1 && twin(prev, rest[0]))) break;
          const v = flow(prev, rest[k]) - k * 0.09;
          if (v > bv) { bv = v; bi = k; }
        }
      }
      prev = rest.splice(bi, 1)[0];
      out.push(prev);
    }
  }
  // Beinahe-Doppel nie direkt hintereinander (wirkt wie ein Hänger): um einen Platz verschieben
  for (let i = 1; i < out.length - 1; i++) if (twin(out[i - 1], out[i]) && !twin(out[i - 1], out[i + 1])) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t; }
  return out;
}

/**
 * Einstellungsgröße wie im Film: 0 = Totale (Landschaft, Horizont, viel Himmel, Details überall),
 * 1 = Halbnah (Menschen, Plätze, Gebäude), 2 = Nah/Detail (kleines, freigestelltes Motiv, Gesicht füllt das Bild).
 * Nutzt nur Werte aus der Bildbewertung; ältere Aufnahmen ohne Freistellung werden aus Horizont und Motivgröße geschätzt.
 */
function shotSize(m) {
  if (!m) return 1;
  let c = 0.5;
  const sub = m.subject;
  if (sub) c += (0.3 - sub[2] * sub[3]) * 0.9;
  // Landschaft: Horizont mit Himmel darüber
  if (m.horizon != null && (m.sky || 0) > 0.3) c -= 0.3;
  // Gesicht füllt das Bild (sehr große Hautflächen sind eher Sand, Holz oder Wände)
  if (m.skinFrac != null && m.skinFrac > 0.15 && m.skinFrac < 0.5) c += 0.45;
  else if (m.faces && sub && sub[2] * sub[3] > 0.25) c += 0.3;
  if (m.iso != null) c += Math.max(-0.1, Math.min(0.3, (m.iso - 1.4) * 0.16));
  return c < 0.28 ? 0 : c > 0.62 ? 2 : 1;
}
const SHOT_DE = ['Totale', 'Halbnah', 'Detail'];

/** Beziehung zweier aufeinanderfolgender Aufnahmen für die Wahl des Übergangs. */
function shotRelation(a, b) {
  if (!a || !b) return null;
  const colorD = a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 60;
  return { sim: layoutSim(a.layout, b.layout), colorD, dl: (b.luma || 0.45) - (a.luma || 0.45), aLuma: a.luma || 0.45, sizeA: shotSize(a), sizeB: shotSize(b) };
}

/** Ähnliche Bilder nicht direkt hintereinander (Farbe/Hash). */
function spreadSimilar(order) {
  const sim = (a, b) => a && b && a.avg && b.avg && Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) < 18 && (!a.hash || !b.hash || hamming(a.hash, b.hash) < 14);
  for (let i = 2; i < order.length - 1; i++) {
    if (sim(order[i], order[i - 1]) && !sim(order[i + 1], order[i - 1])) { const t = order[i]; order[i] = order[i + 1]; order[i + 1] = t; }
  }
  return order;
}

/** Ken-Burns-Fahrt, die auf dem Bildschwerpunkt landet. */
function imageMotion(rng, m, outAspect, visDur, role, prevDir, hint) {
  const mo = imageMotionRaw(rng, m, outAspect, visDur, role, prevDir, hint);
  return fitSubject(mo, m, outAspect);
}

/**
 * Motiv im Bild halten: der Ausschnitt wird nie so eng, dass das Motiv (Gesichter, Person, auffälliger Bereich)
 * angeschnitten würde. Liegt ein Horizont vor, bleibt er beim Schweben waagerecht (keine Neigung).
 */
function fitSubject(mo, m, outAspect) {
  const sub = m.subject;
  if (m.horizon != null) { mo.m.from.r = 0; mo.m.to.r = 0; }
  if (!sub) return mo;
  const srcAspect = m.w && m.h ? m.w / m.h : outAspect;
  const fw = srcAspect > outAspect ? outAspect / srcAspect : 1, fh = srcAspect > outAspect ? 1 : srcAspect / outAspect;
  const cap = Math.min(fw / Math.max(0.05, sub[2] * 1.08), fh / Math.max(0.05, sub[3] * 1.08));
  if (cap < 1.02) return mo;
  for (const k of ['from', 'to']) if (mo.m[k].s > cap) mo.m[k].s = Math.max(1.0, cap);
  return mo;
}

function imageMotionRaw(rng, m, outAspect, visDur, role, prevDir, hint) {
  const srcAspect = m.w && m.h ? m.w / m.h : outAspect;
  const fw = srcAspect > outAspect ? outAspect / srcAspect : 1;
  const fh = srcAspect > outAspect ? 1 : srcAspect / outAspect;
  const fx = m.focus ? m.focus[0] : 0.5, fy = m.focus ? m.focus[1] : 0.45;
  const toPos = (f, frac) => (frac >= 0.999 ? 0 : Math.max(-1, Math.min(1, ((f - 0.5) * 2) / (1 - frac))));
  const px = toPos(fx, fw), py = toPos(fy, fh);
  const speed = Math.min(1.4, Math.max(0.6, visDur / 3.2));
  // Totale: weiter, ruhiger Blick (wenig Zoom); Detail: sanftes Heranfahren statt großer Sprünge
  const size = shotSize(m);
  const z = (role === 'burst' ? 0.1 : 0.075) * speed * (size === 0 ? 0.75 : size === 2 ? 0.85 : 1);
  // feine Neigung, die über die Einstellung ausläuft (modern, nie wackelig)
  const tilt = (rng() < 0.5 ? -1 : 1) * 0.0065 * speed;
  // Richtung bleibt meist über zwei Einstellungen gleich: ruhiger Fluss statt Hin und Her
  // (in ruhigen Teilen noch häufiger: die Kamera fließt in eine Richtung statt hin und her)
  const keep = rng() < (role === 'burst' ? 0.55 : 0.72);
  // Schwenkweite wächst mit der Dauer: kurze Einstellungen gleiten nur ein Stück, nie ruckartig über das ganze Bild
  const sweep = Math.min(1, 0.3 * Math.pow(Math.max(0.1, visDur), 1.6));
  // Anschluss an ein Video: die Fahrt nimmt dessen Schwenk-Richtung auf
  if (hint === 'left' || hint === 'right' || hint === 'up' || hint === 'down') prevDir = hint;
  if (fh < 0.72) {
    const down = hint === 'down' ? true : hint === 'up' ? false : prevDir === 'up' ? !keep : prevDir === 'down' ? keep : rng() < 0.5;
    const a = Math.max(-1, Math.min(1, py + (down ? -0.6 : 0.6) * sweep));
    return { dir: down ? 'down' : 'up', m: { from: { s: 1.03, x: 0, y: a, r: tilt }, to: { s: 1.03 + z * 0.6, x: 0, y: py, r: 0 } } };
  }
  if (fw < 0.72) {
    const right = hint === 'right' ? true : hint === 'left' ? false : prevDir === 'left' ? !keep : prevDir === 'right' ? keep : rng() < 0.5;
    const a = Math.max(-1, Math.min(1, px + (right ? -0.65 : 0.65) * sweep));
    return { dir: right ? 'right' : 'left', m: { from: { s: 1.03, x: a, y: 0, r: tilt }, to: { s: 1.03 + z * 0.6, x: px, y: 0, r: 0 } } };
  }
  const zin = size === 2 && !hint ? prevDir !== 'in' || keep || rng() < 0.6 : prevDir === 'in' ? keep || rng() < 0.3 : prevDir === 'out' ? !keep : rng() < 0.7;
  const tx = px * 0.8, ty = py * 0.8;
  // leichter Versatz quer zur Zoomrichtung: die Fahrt bekommt eine Kurve statt einer geraden Linie
  const sx = hint === 'right' ? -0.3 : hint === 'left' ? 0.3 : (rng() - 0.5) * 0.35;
  // Weg quer zum Zoom wie beim Schwenk: in kurzen Einstellungen nur angedeutet
  const k = Math.min(1, sweep * 1.6);
  const ox = tx - (tx * 0.8 - sx) * k, oy = ty - ty * 0.8 * k;
  return zin
    ? { dir: 'in', m: { from: { s: 1.02, x: ox, y: oy, r: tilt }, to: { s: 1.02 + z, x: tx, y: ty, r: -tilt * 0.3 } } }
    : { dir: 'out', m: { from: { s: 1.02 + z, x: tx, y: ty, r: -tilt * 0.3 }, to: { s: 1.02, x: ox, y: oy, r: tilt } } };
}

/**
 * Szenen der Reise: eine neue Szene beginnt nach einer längeren Pause (45 min), an einem anderen Ort (> 1,5 km)
 * oder bei deutlich anderem Licht nach einer kurzen Pause (z. B. Strand → Altstadt am Abend).
 * Liefert die Ids der Aufnahmen, mit denen eine Szene beginnt.
 */
function sceneStarts(list) {
  const out = new Set();
  const km = (a, b) => {
    if (!a || !b) return 0;
    const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  };
  const colorD = (a, b) => (a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 0);
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1], b = list[i];
    const gap = a.time && b.time ? (b.time - a.time) / 60000 : 0;
    if (gap > 45 || km(a.pos, b.pos) > 1.5 || (gap > 10 && colorD(a, b) > 95)) out.add(b.id);
  }
  return out;
}
