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

/** Von dir festgelegte Länge im Film (Sekunden, höchstens der spielbare Teil); 0 = automatisch. */
function userVideoLen(m) {
  return m && m.kind === 'video' && m.vlen > 0 ? Math.max(1, Math.min(videoSpan(m), m.vlen)) : 0;
}

/** Spielbarer Teil eines Videos (gewählter Ausschnitt oder ganz), in Sekunden. */
function videoSpan(m) {
  const d = m.duration || 3;
  if (m.trim && m.trim[1] > m.trim[0]) return Math.max(0.5, Math.min(d, m.trim[1]) - Math.max(0, m.trim[0]));
  return d;
}
/** So lange soll ein Video im Film laufen: fast ganz, höchstens vmax – oder genau so lange, wie du es festgelegt hast (m.vlen). */
function videoPlay(m, vmax) {
  if (m.vlen > 0) return userVideoLen(m);
  return Math.max(1.5, Math.min(vmax, videoSpan(m) * 0.96));
}

/** Energie einer Aufnahme (0 … 1): kräftige Farben, Schärfe und bei Videos Bewegung. */
function mediaEnergy(m) {
  const hl = m.kind === 'video' && m.highlights && m.highlights[0] ? 0.2 : 0;
  const e = Math.max(0, Math.min(1, 0.5 * (m.color || 0.4) + 0.35 * (m.sharp || 0.5) + hl));
  // Bildverständnis: Erregung (Kontrast, Farbe, Details) schärft die Energie eines Bilds
  return m.mood ? Math.max(0, Math.min(1, 0.6 * e + 0.4 * m.mood[1])) : e;
}

/**
 * Stimmung des Songs als Valenz 0 (dunkel, Moll) … 1 (hell, Dur): Tonart (falls sicher erkannt bzw. vom eigenen Beat),
 * Klanghelligkeit. Bilder mit passender Bildstimmung (vision.js: hell, warm, farbig) werden bevorzugt.
 */
function songValence(an) {
  const md = (an && an.mood) || {};
  const mi = md.minor === true ? 1 : md.minor === false ? 0 : typeof md.minor === 'number' ? md.minor : 0.5;
  return Math.max(0, Math.min(1, 0.5 + (0.5 - mi) * 0.36 + ((md.bright != null ? md.bright : 0.5) - 0.5) * 0.3));
}
/** Wie gut passt die Bildstimmung zur Songstimmung (0 … 0,12; ohne Bildstimmung neutral). */
const moodFit = (m, sv) => (m && m.mood ? 0.12 * (1 - Math.min(1, Math.abs(m.mood[0] - sv) * 2)) : 0.06);
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
  const minW = (v) => (userVideoLen(v) ? userVideoLen(v) * 0.96 : Math.min(videoSpan(v) * 0.96, Math.max(2.4, barDur)));
  for (const v of vids) {
    // fast die ganze Länge (bzw. der gewählte Ausschnitt), höchstens vmax
    if (videoSpan(v) < 1.2) continue;
    const want = userVideoLen(v) || Math.max(minW(v), videoPlay(v, vmax) * shrink);
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
      // (nie über den Einsatz eines Refrains/Drops hinweg: dort ist immer ein Schnitt)
      while (end - g.start < want * 0.95 && j + 1 < segs.length - 1 && !special(segs[j + 1]) && !atPeak(segs[j + 1].start) && segs[j + 1].end - g.start <= want * 1.2) {
        j++; end = segs[j].end;
        if (labelAt(segs[j].start) !== lab) cross++;
      }
      // eine Einstellung mehr, wenn das näher an der Länge des Videos liegt (es läuft dann leicht verlangsamt ganz)
      const nx = segs[j + 1];
      if (end - g.start < want * 0.9 && nx && j + 1 < segs.length - 1 && !special(nx) && !atPeak(nx.start) && nx.end - g.start <= Math.min(want * 1.3, videoSpan(v) / 0.8) && nx.end - g.start - want < want - (end - g.start)) {
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

/**
 * Eigene Reihenfolge (overrides.order, Liste von Aufnahme-IDs – so, wie du den Film beim Verschieben gesehen hast):
 * diese Aufnahmen stehen genau in dieser Folge; alle übrigen behalten ihren Platz in der Reihe (neue reihen sich
 * chronologisch ein).
 */
function applyOrder(list, order) {
  if (!order || !order.length) return list;
  const rank = new Map(order.map((id, k) => [id, k]));
  const slots = [], items = [];
  list.forEach((m, k) => { if (rank.has(m.id)) { slots.push(k); items.push(m); } });
  items.sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const out = list.slice();
  slots.forEach((k, j) => { out[k] = items[j]; });
  return out;
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
function selectMedia(pool, K, mustIds, bonus = null) {
  let clean = pool.filter((m) => !m.bad && !m.excluded && (!m.dupOf || m.fav || mustIds.has(m.id)));
  if (clean.length < 2) {
    // nur bei fast leerem Material dürfen Doppelte/Unscharfe aushelfen
    const dups = pool.filter((m) => !m.bad && !m.excluded && m.dupOf && !clean.includes(m)).sort((a, b) => (b.score || 0) - (a.score || 0));
    clean = clean.concat(dups.slice(0, Math.max(0, Math.min(K, 3) - clean.length)));
  }
  if (clean.length <= K) return orderChrono(clean);
  const must = clean.filter((m) => m.fav || mustIds.has(m.id));
  const val = (m) => (m.score || 0) + (bonus ? bonus(m) : 0);
  const rest = clean.filter((m) => !(m.fav || mustIds.has(m.id))).sort((a, b) => val(b) - val(a));
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
  const twin = (a, b) => sameMotif(a, b) || (colorD(a, b) < 18 && a.hash && b.hash && hamming(a.hash, b.hash) < 14);
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
  // (nur innerhalb desselben Tagesblocks – nie über einen Tageswechsel oder eine Nacht hinweg)
  const sameMoment = (a, b) => !a.time || !b.time || dayBlock(a) === dayBlock(b);
  for (let i = 1; i < out.length - 1; i++) if (twin(out[i - 1], out[i]) && !twin(out[i - 1], out[i + 1]) && sameMoment(out[i], out[i + 1])) { const t = out[i]; out[i] = out[i + 1]; out[i + 1] = t; }
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

/** Ähnliche Bilder nicht direkt hintereinander (Motiv-Fingerabdruck, sonst Farbe/Hash). */
function spreadSimilar(order) {
  const sim = (a, b) => a && b && (sameMotif(a, b) || (a.avg && b.avg && Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) < 18 && (!a.hash || !b.hash || hamming(a.hash, b.hash) < 14)));
  for (let i = 2; i < order.length - 1; i++) {
    // nur mit einer Aufnahme aus demselben Moment tauschen (nie über eine Pause, einen Tageswechsel oder eine Nacht)
    const close = !order[i].time || !order[i + 1].time || Math.abs(order[i].time - order[i + 1].time) <= 3 * 60 * 1000;
    if (close && sim(order[i], order[i - 1]) && !sim(order[i + 1], order[i - 1])) { const t = order[i]; order[i] = order[i + 1]; order[i + 1] = t; }
  }
  return order;
}

/**
 * Beste Stellen eines Videos nach Inhalt: Bildqualität mit Menschen (Bewertung), Bewegungshöhepunkte (m.hits),
 * Lautstärkespitzen wie Lachen oder Jubel (m.loud); wackelige Stellen zählen weniger (m.shakes).
 * Nahe Kandidaten (< 0,6 s) verstärken sich. Liefert [{ t, s }] absteigend.
 */
function videoMoments(m) {
  const out = [];
  const add = (t, s, kind) => {
    const near = out.find((o) => Math.abs(o.t - t) < 0.6);
    if (near) { near.s = Math.max(near.s, s) + 0.12 * Math.min(near.s, s); near.kinds.add(kind); } else out.push({ t, s, kinds: new Set([kind]) });
  };
  for (const h of m.highlights || []) add(h.t, h.score || 0.5, 'bild');
  for (const [t, st] of m.hits || []) add(t, 0.5 + 0.35 * st, 'bewegung');
  for (const [t, st] of m.loud || []) add(t, 0.55 + 0.35 * st, 'ton');
  if (m.shakes && m.shakes.length) for (const o of out) {
    const sh = m.shakes.reduce((b, x) => (Math.abs(x.t - o.t) < Math.abs(b.t - o.t) ? x : b));
    if (Math.abs(sh.t - o.t) < 1.5) o.s -= 0.3 * sh.j;
  }
  return out.sort((a, b) => b.s - a.s).map((o) => ({ t: o.t, s: +o.s.toFixed(3), kinds: [...o.kinds] }));
}

/** Schwenk eines Videos um die Zeit t (Inhalt wandert je Sekunde um x/y Bildanteile) aus m.pans. */
function panAt(m, t) {
  const ps = m && m.pans;
  if (!ps || !ps.length) return null;
  return ps.reduce((b, p) => (Math.abs(p.t - t) < Math.abs(b.t - t) ? p : b));
}

/** Richtung eines Schwenks als Kamerarichtung ('left'|'right'|'up'|'down') oder null bei ruhiger Kamera. */
function panDir(p) {
  if (!p || Math.max(Math.abs(p.x), Math.abs(p.y)) < 0.04) return null;
  return Math.abs(p.x) >= Math.abs(p.y) ? (p.x < 0 ? 'right' : 'left') : (p.y < 0 ? 'down' : 'up');
}

/**
 * Wie langsam darf ein Video laufen? Echte Zeitlupe nur aus Aufnahmen mit hoher Bildrate (≥ 50 fps; 120/240 fps
 * auch deutlich langsamer), sonst nur ein leichtes Tempo-Spiel – sonst ruckelt es sichtbar (Bilder doppelt).
 */
function minRate(m) {
  const f = m && m.fps;
  return f >= 100 ? 0.25 : f >= 50 ? 0.5 : 0.85;
}

/** Ken-Burns-Fahrt, die auf dem Bildschwerpunkt landet. */
function imageMotion(rng, m, outAspect, visDur, role, prevDir, hint, tempo = 1) {
  const mo = fitSubject(imageMotionRaw(rng, m, outAspect, visDur, role, prevDir, hint, tempo), m, outAspect);
  // Hat der Motivschutz den Zoom gebremst, gleitet die Kamera stattdessen seitlich (sofern das Bild Platz hat),
  // damit das Tempo zum Rest des Films passt
  const dur = Math.max(0.25, visDur);
  const want = 0.0125 * tempo * 0.8;
  const have = motionSpeed(mo.m, m, outAspect, dur);
  const srcAspect = m.w && m.h ? m.w / m.h : outAspect;
  const fw = srcAspect > outAspect ? outAspect / srcAspect : 1;
  if (have < want * 0.7 && fw < 0.97 && (mo.dir === 'in' || mo.dir === 'out')) {
    const need = (want - have) * dur * 2 * fw / (1 - fw);
    const a = mo.m.from, b = mo.m.to;
    const sgn = (b.x || 0) >= (a.x || 0) ? 1 : -1;
    const span = Math.min(need, 1.2);
    if (mo.dir === 'in') a.x = Math.max(-1, Math.min(1, (b.x || 0) - sgn * (Math.abs((b.x || 0) - (a.x || 0)) + span)));
    else b.x = Math.max(-1, Math.min(1, (a.x || 0) + sgn * (Math.abs((b.x || 0) - (a.x || 0)) + span)));
  }
  return mo;
}

/**
 * Schiefen Horizont gerade richten (Bildverständnis: m.tilt in Grad, rechts tiefer = positiv): die Fahrt dreht um
 * −tilt und zoomt gerade so weit, dass der gedrehte Ausschnitt im Bild bleibt; Schwenks werden entsprechend kürzer.
 */
function levelHorizon(mo, m, outAspect) {
  const deg = m.tilt || 0;
  if (!deg || Math.abs(deg) > 5 || m.rot90) return;
  const th = (Math.abs(deg) * Math.PI) / 180, c = Math.cos(th), sn = Math.sin(th);
  const srcA = m.w && m.h ? m.w / m.h : outAspect;
  // Ausschnitt bei s = 1 als Anteil der Bildbreite/-höhe; gedrehter Umriss in Bildanteilen
  const fw = srcA > outAspect ? outAspect / srcA : 1, fh = srcA > outAspect ? 1 : srcA / outAspect;
  const wr = fw * c + fh * sn / srcA, hr = fw * sn * srcA + fh * c;
  const need = Math.max(wr, hr) * 1.01;
  for (const k of ['from', 'to']) {
    const e = mo[k];
    e.r = -(deg * Math.PI) / 180;
    const s0 = Math.max(e.s || 1, need);
    // Schwenkweite: freier Rand nach dem Drehen statt ohne Drehung
    const kx = 1 - fw / s0 > 0.001 ? Math.max(0, 1 - wr / s0) / (1 - fw / s0) : 0;
    const ky = 1 - fh / s0 > 0.001 ? Math.max(0, 1 - hr / s0) / (1 - fh / s0) : 0;
    e.s = s0; e.x = (e.x || 0) * Math.min(1, kx); e.y = (e.y || 0) * Math.min(1, ky);
  }
}

/** Bildschirmgeschwindigkeit einer Fahrt (Anteil der Bildbreite je Sekunde): Schwenk plus Zoom an den Bildrändern. */
function motionSpeed(mo, m, outAspect, dur) {
  if (!mo) return 0;
  const srcAspect = m && m.w && m.h ? m.w / m.h : outAspect;
  const fw = srcAspect > outAspect ? outAspect / srcAspect : 1, fh = srcAspect > outAspect ? 1 : srcAspect / outAspect;
  const dx = Math.abs((mo.to.x || 0) - (mo.from.x || 0)) * (1 - fw) / 2 / fw;
  const dy = (Math.abs((mo.to.y || 0) - (mo.from.y || 0)) * (1 - fh) / 2 / fh) / outAspect;
  return (dx + dy + Math.abs(mo.to.s - mo.from.s) * 0.5) / Math.max(0.2, dur);
}

/** Fahrt auf einen Bruchteil verkürzen; der Endausschnitt (das Ziel der Fahrt) bleibt. */
function scaleMotion(mo, k) {
  for (const key of ['s', 'x', 'y', 'r']) {
    const f = mo.from[key] || 0, t = mo.to[key] || 0;
    if (key === 's') mo.from.s = t + (f - t) * k; else mo.from[key] = t + (f - t) * k;
  }
}

/**
 * Motiv im Bild halten: der Ausschnitt wird nie so eng, dass das Motiv (Gesichter, Person, auffälliger Bereich)
 * angeschnitten würde. Liegt ein Horizont vor, bleibt er beim Schweben waagerecht (keine Neigung).
 */
function fitSubject(mo, m, outAspect) {
  const sub = m.subject;
  if (m.horizon != null) { mo.m.from.r = 0; mo.m.to.r = 0; }
  // schiefer Horizont: zuletzt gerade richten (der Zoom fürs Drehen geht vor dem Motivschutz)
  const done = () => { if (m.horizon != null) levelHorizon(mo.m, m, outAspect); return mo; };
  if (!sub) return done();
  const srcAspect = m.w && m.h ? m.w / m.h : outAspect;
  const fw = srcAspect > outAspect ? outAspect / srcAspect : 1, fh = srcAspect > outAspect ? 1 : srcAspect / outAspect;
  const cap = Math.min(fw / Math.max(0.05, sub[2] * 1.08), fh / Math.max(0.05, sub[3] * 1.08));
  if (cap < 1.02) return done();
  for (const k of ['from', 'to']) if (mo.m[k].s > cap) mo.m[k].s = Math.max(1.0, cap);
  return done();
}

/**
 * Bildausschnitt nach Fotografen-Regeln: Mittelpunkt des Ausschnitts (Quellkoordinaten 0–1), in dem das Motiv
 * auf einer Drittellinie steht und seine ursprüngliche Seite behält (Blickraum dorthin, wo im Foto Platz war),
 * der Horizont auf einem Drittel liegt (viel Himmel: unteres Drittel) und Köpfe nie angeschnitten werden.
 * fw/fh: Anteil des Ausschnitts an Breite/Höhe der Quelle.
 */
function framePoint(m, fw, fh) {
  let fx = m.focus ? m.focus[0] : 0.5, fy = m.focus ? m.focus[1] : 0.45;
  const sub = m.subject;
  // waagerecht: nur wenn stark beschnitten wird und das Motiv klein genug für ein Drittel ist
  if (fw < 0.8 && (!sub || sub[2] < fw * 0.55)) {
    const sp = Math.max(0.36, Math.min(0.64, fx));
    fx += (0.5 - sp) * fw;
  }
  if (fh < 0.9) {
    if (m.horizon != null && !(m.people > 0.25)) {
      // Horizont auf ein Drittel: viel Himmel ⇒ Horizont unten, sonst oben; halb zum Motiv hin
      const sp = (m.sky || 0) > 0.45 ? 2 / 3 : 1 / 3;
      fy = 0.5 * fy + 0.5 * (m.horizon + (0.5 - sp) * fh);
    } else if (sub && m.people > 0.25) {
      // Menschen: Kopf mit etwas Luft nach oben im Bild halten
      const top = sub[1] - sub[3] / 2;
      fy = Math.min(fy, top - 0.04 + fh / 2);
    }
  }
  return [Math.max(0, Math.min(1, fx)), Math.max(0, Math.min(1, fy))];
}

/**
 * Kamerafahrt einer Einstellung. Die Geschwindigkeit ist über alle Einstellungen gleich (tempo = Kameratempo aus dem Song):
 * kurze Bilder fahren ein kurzes Stück, lange ein langes – so läuft die Kamera über jeden Schnitt im selben Fluss.
 */
function imageMotionRaw(rng, m, outAspect, visDur, role, prevDir, hint, tempo = 1) {
  const srcAspect = m.w && m.h ? m.w / m.h : outAspect;
  const fw = srcAspect > outAspect ? outAspect / srcAspect : 1;
  const fh = srcAspect > outAspect ? 1 : srcAspect / outAspect;
  const [fx, fy] = framePoint(m, fw, fh);
  const toPos = (f, frac) => (frac >= 0.999 ? 0 : Math.max(-1, Math.min(1, ((f - 0.5) * 2) / (1 - frac))));
  const px = toPos(fx, fw), py = toPos(fy, fh);
  const dur = Math.max(0.25, visDur);
  const speed = Math.min(1.4, Math.max(0.6, dur / 3.2));
  // Totale: weiter, ruhiger Blick; Detail: sanftes Heranfahren
  const size = shotSize(m);
  // Bildschirmweg je Sekunde als Anteil der Bildbreite
  const v = 0.0125 * tempo * (size === 0 ? 0.85 : size === 2 ? 0.9 : 1);
  // Zoom: Maßstabsänderung so, dass sich die Bildränder mit v bewegen
  const z = Math.min(0.16, 2 * v * dur);
  // Schwenk: Weg im Ausschnitt (−1…1) für dieselbe Bildschirmgeschwindigkeit, quer wie hochkant
  const panX = fw >= 0.999 ? 0 : Math.min(1.3, (v * 1.15 * dur * 2 * fw) / (1 - fw));
  const panY = fh >= 0.999 ? 0 : Math.min(1.2, ((v * 1.15 * dur * 2 * fh) / (1 - fh)) * outAspect);
  // feine Neigung, die über die Einstellung ausläuft (modern, nie wackelig)
  const tilt = (rng() < 0.5 ? -1 : 1) * 0.0065 * speed;
  // Richtung bleibt meist über zwei Einstellungen gleich: ruhiger Fluss statt Hin und Her
  // (in ruhigen Teilen noch häufiger: die Kamera fließt in eine Richtung statt hin und her)
  const keep = rng() < (role === 'burst' ? 0.55 : 0.72);
  // Anschluss an ein Video: die Fahrt nimmt dessen Schwenk-Richtung auf
  if (hint === 'left' || hint === 'right' || hint === 'up' || hint === 'down') prevDir = hint;
  if (fh < 0.72) {
    const down = hint === 'down' ? true : hint === 'up' ? false : prevDir === 'up' ? !keep : prevDir === 'down' ? keep : rng() < 0.5;
    const a = Math.max(-1, Math.min(1, py + (down ? -1 : 1) * panY));
    return { dir: down ? 'down' : 'up', m: { from: { s: 1.03, x: 0, y: a, r: tilt }, to: { s: 1.03 + z * 0.35, x: 0, y: py, r: 0 } } };
  }
  if (fw < 0.72) {
    const right = hint === 'right' ? true : hint === 'left' ? false : prevDir === 'left' ? !keep : prevDir === 'right' ? keep : rng() < 0.5;
    const a = Math.max(-1, Math.min(1, px + (right ? -1 : 1) * panX));
    return { dir: right ? 'right' : 'left', m: { from: { s: 1.03, x: a, y: 0, r: tilt }, to: { s: 1.03 + z * 0.35, x: px, y: 0, r: 0 } } };
  }
  const zin = size === 2 && !hint ? prevDir !== 'in' || keep || rng() < 0.6 : prevDir === 'in' ? keep || rng() < 0.3 : prevDir === 'out' ? !keep : rng() < 0.7;
  const tx = px * 0.8, ty = py * 0.8;
  // leichter Versatz quer zur Zoomrichtung: die Fahrt bekommt eine Kurve statt einer geraden Linie
  const sx = hint === 'right' ? -0.3 : hint === 'left' ? 0.3 : (rng() - 0.5) * 0.35;
  // Weg quer zum Zoom wächst mit der Dauer (gleiches Tempo): in kurzen Einstellungen nur angedeutet
  const k = Math.min(1, (dur / 3.2) * tempo);
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

/**
 * Querfotos in der Story (9:16) um 90° gedreht zeigen (Himmel rechts – zum Ansehen das Handy drehen): eine gedrehte
 * Ansicht der Aufnahme (gleiche ID, Maße getauscht, Motivpunkt mitgedreht). Planer und Engine behandeln sie wie ein
 * Hochkantbild; die Engine dreht beim Laden (`rot90`). Gilt für alle Querfotos („Querfotos: Gedreht“) oder je Foto (m.rot).
 */
const ROT_VIEW = new Map();
function rotView(m) {
  const old = ROT_VIEW.get(m.id);
  if (old && old.base === m && old.w === m.h && old.h === m.w) return old;
  const p = Object.create(m);
  const rp = (pt) => (pt && pt.length >= 2 ? [+(1 - pt[1]).toFixed(3), +pt[0].toFixed(3), ...(pt.length >= 4 ? [pt[3], pt[2]] : pt.slice(2))] : pt);
  Object.assign(p, { base: m, rot90: true, w: m.h, h: m.w, focus: rp(m.focus), subject: rp(m.subject), layout: null, horizon: null });
  ROT_VIEW.set(m.id, p);
  return p;
}
const rotates = (m, st) => m.kind === 'image' && st.format === '9:16' && m.w > m.h * 1.15 && (m.rot === true || (m.rot !== false && st.quer === 'drehen'));
