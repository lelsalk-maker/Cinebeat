/* ============================================================
 * Beispielbilder (prozedural gemalt, damit die App sofort etwas zeigt)
 * ============================================================ */

function demoScenes() {
  const rng = mulberry32(20260924);
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const grain = (ctx, w, h, amt) => {
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng() - 0.5) * amt;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  };
  const ridge = (ctx, w, h, base, amp, freq, color, seed) => {
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const u = x / w;
      const y = base
        + Math.sin(u * freq * 6.28 + seed) * amp
        + Math.sin(u * freq * 2.3 * 6.28 + seed * 2.1) * amp * 0.45
        + Math.sin(u * freq * 5.7 * 6.28 + seed * 0.7) * amp * 0.15;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  };
  const scenes = [];

  // 1 Sonnenuntergang am Meer
  {
    const w = 1600, h = 1000, c = mk(w, h), x = c.getContext('2d');
    let g = x.createLinearGradient(0, 0, 0, h * 0.62);
    g.addColorStop(0, '#2a1b4a'); g.addColorStop(0.45, '#b1476a'); g.addColorStop(0.8, '#f08a4b'); g.addColorStop(1, '#ffd08a');
    x.fillStyle = g; x.fillRect(0, 0, w, h * 0.62);
    const sg = x.createRadialGradient(w * 0.62, h * 0.58, 10, w * 0.62, h * 0.58, 420);
    sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(0.12, 'rgba(255,214,150,0.95)'); sg.addColorStop(0.4, 'rgba(255,150,90,0.25)'); sg.addColorStop(1, 'rgba(255,120,80,0)');
    x.fillStyle = sg; x.fillRect(0, 0, w, h * 0.62);
    g = x.createLinearGradient(0, h * 0.62, 0, h);
    g.addColorStop(0, '#6d3a5c'); g.addColorStop(1, '#141028');
    x.fillStyle = g; x.fillRect(0, h * 0.62, w, h * 0.38);
    for (let i = 0; i < 180; i++) {
      const y = h * 0.62 + Math.pow(rng(), 1.6) * h * 0.38;
      const spread = 60 + (y - h * 0.62) * 0.9;
      const cx = w * 0.62 + (rng() - 0.5) * spread;
      x.fillStyle = `rgba(255,${190 + rng() * 50 | 0},${120 + rng() * 60 | 0},${0.25 + rng() * 0.5})`;
      x.fillRect(cx, y, 20 + rng() * 90, 2 + rng() * 2);
    }
    ridge(x, w, h, h * 0.6, 14, 1.2, '#3b2340', 1.3);
    grain(x, w, h, 14);
    scenes.push(c);
  }
  // 2 Berge im Morgendunst (Hochformat)
  {
    const w = 1000, h = 1500, c = mk(w, h), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#9fc3cf'); g.addColorStop(0.5, '#f1d9bf'); g.addColorStop(1, '#f7e7d4');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const cols = ['#b7c1c9', '#8e9aa8', '#667586', '#44525f', '#27323c'];
    for (let k = 0; k < cols.length; k++) ridge(x, w, h, h * (0.42 + k * 0.1), 70 - k * 8, 0.8 + k * 0.35, cols[k], k * 1.7 + 0.4);
    const fog = x.createLinearGradient(0, h * 0.5, 0, h);
    fog.addColorStop(0, 'rgba(255,245,230,0)'); fog.addColorStop(0.5, 'rgba(255,245,230,0.25)'); fog.addColorStop(1, 'rgba(255,245,230,0)');
    x.fillStyle = fog; x.fillRect(0, 0, w, h);
    grain(x, w, h, 12);
    scenes.push(c);
  }
  // 3 Stadt bei Nacht (Bokeh)
  {
    const w = 1600, h = 1000, c = mk(w, h), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#060814'); g.addColorStop(1, '#1b1531');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 140; i++) {
      const cx = rng() * w, cy = h * 0.25 + rng() * h * 0.75, r = 12 + rng() * 70;
      const warm = rng() < 0.7;
      const col = warm ? [255, 150 + rng() * 80 | 0, 60 + rng() * 60 | 0] : [90 + rng() * 60 | 0, 170, 255];
      const rg = x.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      rg.addColorStop(0, `rgba(${col},${0.35 + rng() * 0.3})`); rg.addColorStop(0.85, `rgba(${col},0.18)`); rg.addColorStop(1, `rgba(${col},0)`);
      x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, r, 0, 6.29); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    grain(x, w, h, 16);
    scenes.push(c);
  }
  // 4 Wald im Nebel
  {
    const w = 1600, h = 1000, c = mk(w, h), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#d8e2d6'); g.addColorStop(1, '#7c9483');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let layer = 0; layer < 4; layer++) {
      const shade = 170 - layer * 42;
      x.fillStyle = `rgb(${shade * 0.55 | 0},${shade * 0.75 | 0},${shade * 0.62 | 0})`;
      const n = 16 + layer * 6;
      for (let i = 0; i < n; i++) {
        const tx = rng() * w, th = h * (0.45 + layer * 0.12 + rng() * 0.2), tw = 18 + layer * 12 + rng() * 20;
        x.beginPath();
        x.moveTo(tx, h - th);
        x.lineTo(tx - tw * 2.2, h);
        x.lineTo(tx + tw * 2.2, h);
        x.closePath();
        x.fill();
      }
      const fog = x.createLinearGradient(0, h * 0.4, 0, h);
      fog.addColorStop(0, 'rgba(225,235,225,0.35)'); fog.addColorStop(1, 'rgba(225,235,225,0.05)');
      x.fillStyle = fog; x.fillRect(0, 0, w, h);
    }
    const sun = x.createRadialGradient(w * 0.3, h * 0.2, 0, w * 0.3, h * 0.2, 600);
    sun.addColorStop(0, 'rgba(255,248,220,0.55)'); sun.addColorStop(1, 'rgba(255,248,220,0)');
    x.fillStyle = sun; x.fillRect(0, 0, w, h);
    grain(x, w, h, 12);
    scenes.push(c);
  }
  // 5 Dünen
  {
    const w = 1600, h = 1000, c = mk(w, h), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h * 0.5);
    g.addColorStop(0, '#5d8fb3'); g.addColorStop(1, '#f3d7b0');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    const cols = ['#e2a86a', '#cf8a4f', '#b86e3a', '#8f4f2a'];
    for (let k = 0; k < cols.length; k++) {
      ridge(x, w, h, h * (0.48 + k * 0.13), 50, 0.5 + k * 0.2, cols[k], k * 2.3 + 1);
      x.globalAlpha = 0.35;
      ridge(x, w, h, h * (0.5 + k * 0.13), 48, 0.5 + k * 0.2, '#5a2e19', k * 2.3 + 1.25);
      x.globalAlpha = 1;
    }
    grain(x, w, h, 12);
    scenes.push(c);
  }
  // 6 Polarlicht über dem See (Hochformat)
  {
    const w = 1000, h = 1500, c = mk(w, h), x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#040915'); g.addColorStop(0.55, '#0c2233'); g.addColorStop(1, '#03060c');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(255,255,255,${rng() * 0.8})`; x.fillRect(rng() * w, rng() * h * 0.6, 1.6, 1.6); }
    x.globalCompositeOperation = 'lighter';
    for (let b = 0; b < 3; b++) {
      for (let xx = 0; xx < w; xx += 3) {
        const u = xx / w;
        const y = h * (0.18 + b * 0.08) + Math.sin(u * 5 + b) * 90 + Math.sin(u * 13 + b * 3) * 25;
        const len = 180 + Math.sin(u * 7 + b) * 90;
        const lg = x.createLinearGradient(0, y, 0, y + len);
        lg.addColorStop(0, 'rgba(80,255,180,0)'); lg.addColorStop(0.6, `rgba(${60 + b * 60},255,${170 - b * 30},0.10)`); lg.addColorStop(1, 'rgba(120,80,255,0)');
        x.fillStyle = lg; x.fillRect(xx, y, 3, len);
      }
    }
    x.globalCompositeOperation = 'source-over';
    ridge(x, w, h, h * 0.62, 40, 1.4, '#02040a', 0.8);
    const lake = x.createLinearGradient(0, h * 0.66, 0, h);
    lake.addColorStop(0, 'rgba(40,160,130,0.35)'); lake.addColorStop(1, 'rgba(5,10,20,0.9)');
    x.fillStyle = lake; x.fillRect(0, h * 0.66, w, h * 0.34);
    grain(x, w, h, 14);
    scenes.push(c);
  }
  return scenes;
}
