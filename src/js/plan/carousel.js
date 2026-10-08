/* Planer · Karussell-Beitrag (Instagram, 4:5): die besten Fotos als Einzelbilder, dazwischen kurze Clips (3–6 s,
 * ganze Takte) im Takt mit einem Songausschnitt – das Beste aus beiden Welten. Alle Slides teilen Look, Farbabgleich
 * und Format; die Clips führen den Song von Slide zu Slide fort, so klingt das Wischen wie ein Stück. */

const CAROUSEL = { min: 6, max: 10, clipMin: 3, clipMax: 6 };

/**
 * Slides planen. Liefert { slides, notes, corr, look } mit
 *   { kind: 'photo', id } oder { kind: 'clip', ids, videoId, start, len } (start/len in Songsekunden, auf Takten).
 * count: Anzahl der Slides (Standard automatisch 6–10).
 */
function planCarousel({ an, media, count }) {
  const pool = media.filter((m) => !m.bad && !m.loading && !m.excluded && !(m.dupOf && !m.fav));
  const imgs = pool.filter((m) => m.kind === 'image'), vids = pool.filter((m) => m.kind === 'video');
  const notes = [];
  if (!pool.length) return { slides: [], notes: ['Keine Aufnahmen für ein Karussell.'], corr: new Map() };
  const score = (m) => (m.score || 0.5) + (m.fav ? 0.25 : 0) + usScore(m) * 0.2;
  const colorD = (a, b) => (a.avg && b.avg ? Math.hypot(a.avg[0] - b.avg[0], a.avg[1] - b.avg[1], a.avg[2] - b.avg[2]) : 99);
  // zu ähnlich für zwei Slides: Beinahe-Doppel oder gleicher Aufbau im selben Tagesblock
  const tooClose = (a, b) => sameMotif(a, b) || (a.hash && b.hash && hamming(a.hash, b.hash) < 12 && colorD(a, b) < 30) || (dayBlock(a) === dayBlock(b) && layoutSim(a.layout, b.layout) > 0.85 && colorD(a, b) < 40);

  // Anzahl: mit der Menge des Materials wachsend, 6–10
  const total = Math.max(1, Math.min(pool.length, count || Math.max(CAROUSEL.min, Math.min(CAROUSEL.max, Math.round(4 + Math.sqrt(pool.length) * 0.9)))));
  // Clips: jedes gute Video, sonst kleine Foto-Sequenzen aus Fotos, die nicht einzeln stehen (je 3–4 Fotos)
  const wantClips = total >= 4 ? Math.max(1, Math.round(total * 0.35)) : 0;

  // Einzelbilder: nach Wert, jeder Tagesblock kommt vor (reihum), keine ähnlichen Bilder
  const blocks = new Map();
  for (const m of imgs.slice().sort((a, b) => score(b) - score(a))) {
    const k = dayBlock(m) || 'x';
    if (!blocks.has(k)) blocks.set(k, []);
    blocks.get(k).push(m);
  }
  const nVidClips = Math.min(vids.length, wantClips);
  const leftForMontage = Math.max(0, imgs.length - (total - wantClips));
  // (knappes Material: ein Clip darf auch aus einem oder zwei Fotos bestehen – lebendiges Foto mit Kamerafahrt im Takt)
  const nMontage = Math.min(wantClips - nVidClips, leftForMontage);
  const perClip = nMontage ? Math.min(4, Math.max(1, Math.floor(leftForMontage / nMontage))) : 0;
  const nPhotos = Math.min(imgs.length, total - nVidClips - nMontage);
  const photos = [];
  const lists = [...blocks.values()];
  // reihum je Tagesblock das beste noch passende Foto
  for (let took = true; took && photos.length < nPhotos;) {
    took = false;
    for (const l of lists) {
      if (photos.length >= nPhotos) break;
      const k = l.findIndex((m) => !photos.some((p) => tooClose(p, m)));
      if (k >= 0) { photos.push(l.splice(k, 1)[0]); took = true; }
    }
  }
  // (reicht die Vielfalt nicht, die nächstbesten auffüllen)
  for (const m of imgs.slice().sort((a, b) => score(b) - score(a))) if (photos.length < nPhotos && !photos.includes(m)) photos.push(m);

  // Clips
  const clips = vids.slice().sort((a, b) => score(b) - score(a)).slice(0, nVidClips).map((v) => ({ kind: 'clip', ids: [v.id], videoId: v.id, time: v.time || 0 }));
  const rest = imgs.filter((m) => !photos.includes(m)).sort((a, b) => (a.time || 0) - (b.time || 0));
  for (let k = 0; k < nMontage; k++) {
    // Sequenz aus nahe beieinander entstandenen Fotos (derselbe Tagesblock), die stärksten zuerst
    const seed = rest.filter((m) => !clips.some((c) => c.ids.includes(m.id))).sort((a, b) => score(b) - score(a))[0];
    if (!seed) break;
    const near = rest.filter((m) => !clips.some((c) => c.ids.includes(m.id)) && dayBlock(m) === dayBlock(seed)).sort((a, b) => Math.abs((a.time || 0) - (seed.time || 0)) - Math.abs((b.time || 0) - (seed.time || 0))).slice(0, perClip);
    if (!near.length) break;
    near.sort((a, b) => (a.time || 0) - (b.time || 0));
    clips.push({ kind: 'clip', ids: near.map((m) => m.id), videoId: null, time: near[0].time || 0 });
  }

  // Reihenfolge: Titelbild = stärkstes Foto (hält beim Scrollen im Feed), danach chronologisch;
  // Clips stehen nie auf Slide 1 und nie zwei nebeneinander
  const cover = photos.slice().sort((a, b) => score(b) - score(a))[0];
  const items = [...photos.filter((p) => p !== cover).map((m) => ({ kind: 'photo', id: m.id, time: m.time || 0 })), ...clips]
    .sort((a, b) => a.time - b.time);
  // (Tausch nur innerhalb eines Tagesblocks; geht das nicht, wird aus einer Foto-Sequenz ihr bestes Einzelbild)
  const blockOf = (x) => dayBlock(pool.find((m) => m.id === (x.kind === 'photo' ? x.id : x.ids[0])));
  for (let i = 1; i < items.length; i++) {
    if (!(items[i].kind === 'clip' && items[i - 1].kind === 'clip')) continue;
    const j = items.findIndex((x, k) => k > i && x.kind === 'photo' && blockOf(x) === blockOf(items[i]));
    if (j > 0) { const [p] = items.splice(j, 1); items.splice(i, 0, p); continue; }
    if (i >= 2 && items[i - 2].kind === 'photo' && blockOf(items[i - 2]) === blockOf(items[i - 1]) && (i < 3 || items[i - 3].kind !== 'clip')) {
      [items[i - 2], items[i - 1]] = [items[i - 1], items[i - 2]];
      continue;
    }
    const k = items[i].videoId ? (items[i - 1].videoId ? i : i - 1) : i;
    const c = items[k];
    if (!c.videoId) { const bestImg = c.ids.map((id) => pool.find((m) => m.id === id)).sort((a, b) => score(b) - score(a))[0]; items[k] = { kind: 'photo', id: bestImg.id, time: bestImg.time || 0 }; }
    else items.splice(k, 1);
    i = 0;
  }
  const slides = cover ? [{ kind: 'photo', id: cover.id }, ...items] : items;
  if (slides[0] && slides[0].kind === 'clip' && slides.length > 1) { const j = slides.findIndex((x) => x.kind === 'photo'); if (j > 0) slides.unshift(slides.splice(j, 1)[0]); }

  // Song: ganze Takte, 3–6 s je Clip; der erste Clip beginnt am Refrain/Drop, die weiteren setzen fort
  const bars = Array.from(an.barStart || []);
  const barDur = an.beatPeriod * 4;
  let nb = Math.max(1, Math.round(4.5 / barDur));
  while (nb > 1 && nb * barDur > CAROUSEL.clipMax + 0.05) nb--;
  while (nb * barDur < CAROUSEL.clipMin - 0.05) nb++;
  const len = nb * barDur;
  const songEnd = an.lastSound != null ? Math.min(an.duration, an.lastSound) : an.duration;
  const hook = an.hook != null ? an.hook : bars[0] || 0;
  const snapBar = (t) => bars.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a), bars[0] != null ? bars[0] : t);
  let t = snapBar(hook);
  for (const s of slides) {
    if (s.kind !== 'clip') continue;
    if (t + len > songEnd) t = snapBar(hook);
    s.start = t; s.len = len;
    t = snapBar(t + len);
  }
  for (const s of slides) delete s.time;

  // ein Look und ein Farbabgleich für alle Slides
  const used = slides.flatMap((s) => (s.kind === 'photo' ? [s.id] : s.ids)).map((id) => pool.find((m) => m.id === id)).filter(Boolean);
  const cm = colorMatch(used);
  const nP = slides.filter((s) => s.kind === 'photo').length, nC = slides.length - nP;
  notes.push(`Karussell mit ${slides.length} Slides: ${nP} ${nP === 1 ? 'Foto' : 'Fotos'} einzeln${nC ? `, dazwischen ${nC} ${nC === 1 ? 'Clip' : 'Clips'} à ${len.toFixed(1)} s im Takt (der Song läuft von Clip zu Clip weiter)` : ''}. Titelbild ist euer stärkstes Foto, danach chronologisch.`);
  return { slides, notes, corr: cm.corr, len };
}

/** Plan einer Clip-Slide: nur ihre Aufnahmen, 4:5, Länge und Songausschnitt fest, gleicher Look und Farbabgleich. */
function carouselClipPlan(slide, { an, media, settings, corr, look }) {
  const ids = new Set(slide.ids);
  const sub = media.map((m) => (ids.has(m.id) ? { ...m, excluded: false } : { ...m, excluded: true }));
  const s = { ...settings, format: '4:5', length: slide.len, songStart: slide.start, intro: 'hook', outro: 'loop', pre: 'off', allMedia: 'on', showTitle: false, showChapters: false, showStats: false, midGrid: 'off', midCount: 'off', look: look || settings.look };
  const plan = buildPlan({ an, media: sub, settings: s, overrides: { texts: [], stickers: [] } });
  // Clip-Slides sind kurz und gehören nur ihren Aufnahmen: jede Aufnahme bekommt genau einen Platz, der Clip ist
  // lückenlos gefüllt (ein Video läuft durch, Fotos teilen sich den Clip auf den Schlägen)
  carouselFill(plan, slide, media);
  for (const c of plan.clips) { const m = media[c.mediaIndex]; if (m && corr && corr.get(m.id)) c.corr = corr.get(m.id); }
  plan.overlays = plan.overlays.filter((o) => o.type === 'sticker');
  return plan;
}

/**
 * Lückenlose Clip-Slide: n Aufnahmen teilen sich die Dauer gleichmäßig, Schnitte auf dem nächsten Schlag.
 * Ein Video läuft im normalen Tempo durch, sein bester Moment liegt in der Mitte (ist es zu kurz, wird es sanft
 * langsamer, höchstens auf die Hälfte, und bleibt am Ende stehen). Fotos behalten ihre geplante Kamerafahrt.
 */
function carouselFill(plan, slide, media) {
  const D = plan.duration, n = slide.ids.length;
  const byId = new Map(media.map((m) => [m.id, m]));
  const own = plan.clips.filter((c) => !c.loop && media[c.mediaIndex] && slide.ids.includes(media[c.mediaIndex].id));
  const bts = (plan.beats || []).filter((t) => t > 0.3 && t < D - 0.3);
  const cuts = [0];
  for (let k = 1; k < n; k++) {
    const want = (D * k) / n;
    const cand = bts.filter((t) => t > cuts[k - 1] + 0.45 && t < D - 0.45 * (n - k));
    cuts.push(cand.length ? cand.reduce((a, t) => (Math.abs(t - want) < Math.abs(a - want) ? t : a)) : want);
  }
  cuts.push(D);
  const tpl = own[0] || plan.clips[0];
  const hadSound = new Set((plan.voice || []).map((v) => v.mediaId));
  const voice = [];
  plan.clips = slide.ids.map((id, k) => {
    const m = byId.get(id);
    const a = cuts[k], z = cuts[k + 1], len = z - a;
    const prev = own.find((c) => media[c.mediaIndex] === m);
    const c = { ...tpl, ...(prev || {}), i: k, start: a, end: z, visStart: a, visEnd: z, mediaIndex: media.indexOf(m), mediaId: id, tin: null, tout: null, loop: false, split: null, grid: null, freezeAt: undefined, role: k === 0 ? 'hook' : 'normal' };
    delete c.rp; delete c.echo; delete c.layer;
    if (m.kind === 'video') {
      const dur = m.duration || len;
      const rate = dur >= len ? 1 : Math.max(0.5, dur / len);
      const hl = (m.highlights || []).map((h) => h.t);
      const center = hl.length ? hl[0] : dur * 0.4;
      c.rate = rate;
      c.srcOffset = Math.max(0, Math.min(center - (len * rate) / 2, Math.max(0, dur - len * rate)));
      if (dur - c.srcOffset < len * rate - 0.02) c.freezeAt = a + (dur - c.srcOffset) / rate - 0.04;
      c.vid = id;
      if (!prev || !prev.motion) c.motion = { from: { s: 1, x: 0, y: 0 }, to: { s: 1.04, x: 0, y: 0 } };
      if (hadSound.has(id)) voice.push({ mediaIndex: media.indexOf(m), mediaId: id, t0: a, t1: c.freezeAt != null ? c.freezeAt : z, src: c.srcOffset, gain: m.sound });
    } else {
      c.rate = 1; c.srcOffset = 0; c.vid = null;
      if (!prev || !prev.motion) c.motion = { from: { s: 1.02, x: 0, y: 0 }, to: { s: 1.08, x: 0, y: 0 } };
    }
    return c;
  });
  plan.voice = voice;
}

/** Plan einer Foto-Slide: das Foto allein, ruhiger Ausschnitt (Mitte der geplanten Kamerafahrt, Drittel-Regel). */
function carouselPhotoPlan(slide, { an, media, settings, corr, look }) {
  const plan = carouselClipPlan({ ids: [slide.id], len: Math.max(2, an.beatPeriod * 8), start: 0 }, { an, media, settings, corr, look });
  for (const c of plan.clips) {
    if (!c.motion) continue;
    const a = c.motion.from, b = c.motion.to;
    const mid = { s: Math.max(1, (a.s + b.s) / 2), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    c.motion = { from: { ...mid }, to: { ...mid } };
  }
  plan.fx = [];
  plan.overlays = [];
  plan.win = { ...plan.win, fadeIn: 0, fadeOut: 0 };
  const c = plan.clips.find((x) => media[x.mediaIndex] && media[x.mediaIndex].id === slide.id) || plan.clips[0];
  plan.stillAt = c ? (c.visStart + c.visEnd) / 2 : 0;
  return plan;
}
