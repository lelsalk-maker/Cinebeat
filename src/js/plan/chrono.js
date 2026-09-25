/* Planer · Chronologischer Durchlauf: Aufnahmen nach Aufnahmezeit auf die Schnitte legen */
/**
 * Legt die Aufnahmen der Reihe nach auf die Schnitte. Fotos: eine Einstellung. Videos: ein Platz in ihrer Länge
 * (bei knapper Zeit gleichmäßig kürzer, mindestens ein Takt; zeitlich nahe Videos bei Bedarf gemeinsam im Split-Screen).
 * Reicht die Zeit nicht für alle Fotos, nehmen Split-Screens aufeinanderfolgende Fotos zusammen.
 * Foto-Serie, Polaroid-Stapel und Raster nehmen die nächsten Fotos der Reihe.
 */
function layoutChrono(ctx, segs0, queue, bias) {
  const { s, an, win, fr, level, allOn, intro, outro, rush, reveal, leader, gridPlan, special, splitFit, splitN, barDur, beatDur, isPeakSec } = ctx;
  const sg = segs0.map((g) => ({ ...g }));
  const q = queue.slice();
  let qi = 0;
  const nPre = sg.filter((g) => g.pre).length;
  const count = (f) => sg.filter(f).length;
  const hookIdx = intro === 'split' ? -1 : rush ? nPre + count((g) => g.rush) : reveal ? nPre + count((g) => g.reveal) : leader ? nPre + 3 : gridPlan ? nPre + 1 : nPre;
  const skipSeg = (g) => g.pre || g.leader || g.reveal || g.rush || g.gridSeg || g.miniRew;
  // nach dem Mini-Rewind steht der beste Moment noch einmal: dieser Platz nimmt keine neue Aufnahme
  for (let i = 1; i < sg.length; i++) if (sg[i - 1].miniRew && !sg[i].miniRew) sg[i].replaySeg = true;
  const fitSplit = (m) => m && m.kind === 'image' && splitFit(m);
  const vidFit = (m) => m && m.kind === 'video' && splitFit(m);
  // Mindestspielzeit eines Videos: ein Takt (bei sehr viel Material knapp darunter)
  const minW = (v) => Math.min(videoSpan(v) * 0.96, level >= 3 ? Math.max(1.8, barDur * 0.8) : Math.max(2.4, barDur));
  const normal = (g) => !special(g) && !skipSeg(g) && !g.replaySeg;
  // Zeitbudget der Videos: Fotos behalten genug Platz (alle Aufnahmen) bzw. mindestens 40 % (beste Auswahl)
  const startI = Math.max(0, hookIdx + 1);
  const normTime = sg.slice(startI).filter(normal).reduce((a, g) => a + g.end - g.start, 0);
  const nNorm = Math.max(1, sg.slice(startI).filter(normal).length);
  const avgLen = normTime / nNorm;
  const vids = q.filter((m) => m.kind === 'video');
  const vWant = vids.reduce((a, v) => a + videoPlay(v, fr.vmax), 0);
  const nImg = q.filter((m) => m.kind === 'image').length;
  const specialCap = sg.reduce((a, g) => a + (g.burst ? 1 : g.stackSeg ? 4 : g.gridMid ? g.gridMid.n * g.gridMid.n - 1 : 0), 0);
  // Zeitbedarf der Fotos nach fester Richtlänge (nicht nach der aktuellen Schnittlänge – sonst würden Videos
  // jede gewonnene Sekunde wieder aufessen)
  const imgShot = level >= 3 ? Math.max(0.5, beatDur) : level >= 2 ? Math.max(0.55, fr.shotMin * 0.55) : level >= 1 ? fr.shotMin * 0.75 : fr.shotMin;
  const imgNeedT = Math.max(0, nImg - specialCap) * (allOn ? imgShot * 0.9 : avgLen * 0.4);
  const vBudget = Math.max(vids.reduce((a, v) => a + minW(v), 0) * (allOn ? 0.6 : 1), normTime - imgNeedT, normTime * (allOn ? 0.15 : 0.6));
  const shrink = vWant > 0 ? Math.min(1, vBudget / vWant) : 1;
  const want = (v) => Math.max(minW(v), videoPlay(v, fr.vmax) * shrink);
  // gemeinsam laufende Videos (2–3 im Split-Screen), wenn die Zeit knapp ist
  const vSplitOK = s.split !== 'off' && (shrink < 0.8 || level >= 2);
  let sinceSplit = 9;
  // nächstes Foto, nur wenn es auch das nächste in der Reihe ist (Videos werden nie übersprungen)
  const takeImage = () => (q[qi] && q[qi].kind === 'image' ? q[qi++] : null);
  const remaining = (i) => {
    let nT = 0, nN = 0, cap = 0;
    for (let k = i; k < sg.length; k++) { const g = sg[k]; if (normal(g)) { nT += g.end - g.start; nN++; } else if (g.burst) cap++; else if (g.stackSeg) cap += 4; else if (g.gridMid) cap += g.gridMid.n * g.gridMid.n - 1; }
    let vT = 0, img = 0;
    for (let k = qi; k < q.length; k++) if (q[k].kind === 'video') vT += want(q[k]); else img++;
    const avg = nN ? nT / nN : avgLen;
    // Plätze = Einstellungen (nicht Sekunden): eine lange Schlusseinstellung ist trotzdem nur ein Platz
    return img - Math.max(0, nN - vT / Math.max(0.3, avg)) - cap + bias;
  };
  let repeatPtr = 0;
  const repeatImg = () => {
    const imgs = queue.filter((m) => m.kind === 'image');
    if (!imgs.length) return null;
    return imgs[repeatPtr++ % imgs.length];
  };
  for (let i = 0; i < sg.length; i++) {
    const g = sg[i];
    if (i === hookIdx) {
      const m = q[qi];
      if (m) { g.mediaId = m.id; qi++; }
      continue;
    }
    if (i < hookIdx && !(intro === 'split' && i === 0)) continue;
    if (skipSeg(g) || g.replaySeg || g.knock) continue;
    const head = q[qi];
    // ist ein Video an der Reihe, wird die Foto-Serie/der Stapel/das Raster hier zu seinem Platz (Reihenfolge bleibt)
    const videoNext = head && head.kind === 'video';
    if (g.burst && !videoNext) { const m = takeImage() || repeatImg(); if (m) { g.mediaId = m.id; if (!head) g.repeat = true; } continue; }
    if (g.stackSeg && !videoNext) {
      const n = q.slice(qi, qi + 4).findIndex((m) => m.kind !== 'image');
      const k = n < 0 ? Math.min(4, q.length - qi) : n;
      if (k >= 3) { const ids = []; for (let j = 0; j < k; j++) ids.push(takeImage().id); g.stackIds = ids; continue; }
      delete g.stackSeg; // zu wenig Fotos am Stück: normale Einstellung
    }
    if (g.gridMid && !videoNext) {
      const need = g.gridMid.n * g.gridMid.n - 1;
      const n = q.slice(qi, qi + need).findIndex((m) => m.kind !== 'image');
      if (n < 0 && q.length - qi >= need + 1) { const ids = []; for (let j = 0; j < need; j++) ids.push(takeImage().id); g.gridIds = ids; continue; }
      continue; // zu wenig Fotos am Stück: das Raster zeigt Vorschau-Kacheln (wie der Einstieg) und nimmt keine Aufnahme
    }
    if (videoNext && (g.burst || g.stackSeg || g.gridMid)) { delete g.burst; delete g.stackSeg; delete g.gridMid; }
    if (!head) { const m = repeatImg(); if (m) { g.mediaId = m.id; g.repeat = true; } continue; }
    const len = g.end - g.start;
    const peak = !isCalmLabel(sectionAt(an, win.start + g.start + 0.01).label);
    // Einstieg oder Ende als Split-Screen
    if ((intro === 'split' && i === 0) || (outro === 'split' && i === sg.length - 1)) {
      const ids = [];
      while (ids.length < splitN && q[qi]) { const m = takeImage(); if (!m) break; ids.push(m.id); }
      if (ids.length >= 2) { g.splitIds = ids; sinceSplit = 0; continue; }
      if (ids.length === 1) { g.mediaId = ids[0]; continue; }
    }
    if (head.kind === 'video') {
      // gemeinsam laufende Videos: zeitlich nahe, passend ausgerichtet
      const group = [head];
      if (vSplitOK && vidFit(head)) for (let j = qi + 1; j < q.length && group.length < splitN; j++) { if (vidFit(q[j]) && Math.abs((q[j].time || 0) - (head.time || 0)) < 20 * 60000) group.push(q[j]); else break; }
      const w = group.length > 1 ? Math.max(...group.map(want)) : want(head);
      // beginnt das Video kurz vor einem Drop, bliebe es zu kurz oder liefe über den Einsatz hinweg:
      // dann steht das Bild davor etwas länger, und das Video setzt genau mit dem Drop ein
      {
        let k = i, pk = -1;
        while (k < sg.length && sg[k].end - g.start < w * 1.2) {
          if (k > i && !normal(sg[k])) break;
          if (isPeakSec(sectionAt(an, win.start + sg[k].end + 0.02)) && !isPeakSec(sectionAt(an, win.start + sg[k].end - 0.05))) { pk = k; break; }
          k++;
        }
        const prev = sg[i - 1];
        if (pk >= i && sg[pk].end - g.start < Math.max(minW(head), w * 0.5) && sg[pk].end - g.start < 3.2 && prev && (prev.mediaId || prev.splitIds) && !prev.vslot && !special(prev) && !skipSeg(prev) && pk + 1 < sg.length && (normal(sg[pk + 1]) || sg[pk + 1].burst || sg[pk + 1].stackSeg)) {
          prev.end = sg[pk].end;
          sg.splice(i, pk - i + 1);
          i--;
          continue;
        }
      }
      // ein Video darf auch Stücke einer Foto-Serie oder eines Stapels übernehmen (nie Einstieg, Vorspann, Ende)
      const absorb = (x) => x && (normal(x) || x.burst || x.stackSeg || x.gridMid) && !x.replaySeg;
      let j = i, end = g.end;
      // Plätze für die Aufnahmen nach dem Video frei halten (Split-Screens können je zwei aufnehmen)
      const after = q.slice(qi + group.length);
      const imgsAfter = after.filter((m) => m.kind === 'image').length, vidsAfter = after.length - imgsAfter;
      const needAfter = Math.ceil(imgsAfter / (allOn && s.split !== 'off' ? 2 : 1)) + vidsAfter;
      const slotsAfter = (k) => { let n = 0; for (let x = k + 1; x < sg.length; x++) if (normal(sg[x]) || sg[x].burst) n++; else if (sg[x].stackSeg) n += 4; return n; };
      const keepRoom = (k) => end - g.start < minW(head) || slotsAfter(k) >= needAfter;
      while (end - g.start < w * 0.95 && j + 1 < sg.length && absorb(sg[j + 1]) && sg[j + 1].end - g.start <= w * 1.2 && keepRoom(j + 1)) { j++; end = sg[j].end; }
      const nx = sg[j + 1];
      if (end - g.start < w * 0.9 && absorb(nx) && nx.end - g.start <= Math.min(w * 1.3, videoSpan(head) / 0.8) && nx.end - g.start - w < w - (end - g.start) && keepRoom(j + 1)) { j++; end = nx.end; }
      // Songdynamik: der Drop/Refrain setzt mit einem Schnitt ein – ein Video davor endet auf dem Einsatz,
      // wenn es dabei fast seine Länge behält (mit Speed-Ramp immer: es beschleunigt in den Drop hinein)
      for (let k = j - 1; k >= i; k--) {
        const pkStart = sg[k].end;
        if (pkStart - g.start >= Math.max(minW(head), s.ramp === 'drop' ? 0 : w >= 6 ? Math.min(w * 0.5, 3.5) : w * 0.8) && isPeakSec(sectionAt(an, win.start + pkStart + 0.02)) && !isPeakSec(sectionAt(an, win.start + pkStart - 0.05))) { j = k; end = pkStart; break; }
      }
      const merged = { start: g.start, end, w: g.w, vslot: true, freezeAt: undefined };
      if (group.length > 1) { merged.vsplitIds = group.map((m) => m.id); qi += group.length; } else { merged.vid = head.id; merged.mediaId = head.id; qi++; }
      sg.splice(i, j - i + 1, merged);
      continue;
    }
    // Split-Screen: aufeinanderfolgende Fotos zusammen – als Stilmittel im Refrain oder weil sonst Fotos fehlen würden
    const need = allOn ? remaining(i) : 0;
    const beatsIn = len / beatDur;
    const styleSplit = s.split !== 'off' && peak && sinceSplit >= (s.split === 'more' ? 3 : 5) && beatsIn >= 2.8;
    // Split-Screens zuerst in Refrain und Drop; in ruhigen Teilen erst, wenn es sonst nicht passt
    const needSplit = s.split !== 'off' && need > 0.5 && beatsIn >= (level >= 2 ? 0.9 : 1.8) && (peak || level >= 2);
    if (styleSplit || needSplit) {
      const k = needSplit ? Math.min(splitN, Math.max(2, Math.ceil(need) + 1)) : splitN;
      const ids = [];
      for (let j = qi; j < q.length && ids.length < Math.min(k, Math.max(2, Math.floor(beatsIn + 0.2))); j++) {
        if (fitSplit(q[j]) || (needSplit && level >= 1 && q[j].kind === 'image' && ids.length < 2)) ids.push(q[j].id); else break;
      }
      if (ids.length >= 2) { g.splitIds = ids; qi += ids.length; sinceSplit = 0; continue; }
    }
    sinceSplit++;
    g.mediaId = head.id; qi++;
  }
  return { segs: sg, dropped: q.slice(qi), hookIdx };
}
