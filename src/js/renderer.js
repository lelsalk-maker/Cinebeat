/* ============================================================
 * Renderer: WebGL-Compositing, Farbangleichung, Grading,
 * Übergänge, Kinoband, Einblendungen
 * ============================================================ */

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = vec2(aPos.x * 0.5 + 0.5, 0.5 - aPos.y * 0.5); // y=0 oben
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uTexA;
uniform sampler2D uTexB;
uniform sampler2D uOvTop;
uniform vec4 uXfA;      // Cover-Ausschnitt: fw, fh, cx, cy
uniform vec4 uXfB;
uniform vec3 uBoxA;     // contain: an/aus, Boxgröße
uniform vec3 uBoxB;
uniform vec3 uBlurA;    // Modus (0 aus, 1 Richtung, 2 radial), Stärke
uniform vec3 uBlurB;
uniform vec4 uGeoA;     // Drehung, Weichheit (LOD), Abzug-Modus, Randbreite
uniform vec4 uGeoB;
uniform vec2 uOffA;
uniform vec2 uOffB;
uniform vec3 uCorrA;    // Farbangleichung je Aufnahme
uniform vec3 uCorrB;
uniform vec2 uBand;     // Bildbereich: oben, Höhe (Ausgabe-UV)
uniform float uHasA;
uniform float uHasB;
uniform float uMix;
uniform int uTrans;
uniform float uDir;
uniform vec2 uRes;
uniform float uTime;
uniform float uSat, uVib, uContrast, uTemp, uLift, uCrush, uBW, uGrain, uVig;
uniform vec3 uTint, uSh, uHi;
uniform float uGlow, uLeak, uFlash, uBars, uBlack, uDim, uDesat;
uniform float uHasOvTop;
uniform float uLod;
uniform float uSharp;   // leichte Unscharfmaskierung über die Mipmap-Stufe
uniform vec2 uFocA;     // Bildschwerpunkt im Ausgabebild (für Bild-aus-Bild-Übergänge)
uniform vec2 uFocB;
uniform vec2 uParA;     // Parallax: Versatz der nahen Bildteile (Ausschnitt-Einheiten)
uniform vec2 uParB;
uniform vec2 uHor;      // Horizont je Ebene im Ausgabebild (−1: keiner erkannt)
uniform vec4 uCol;      // Schwarzweiß → Farbe: Modus, Fortschritt, Motiv (x, y)

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
vec2 rot2(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }

// Tiefe ohne Tiefenkarte: unten und am Motiv nah, oben (Himmel, Horizont) fern. Weich, ohne Kanten.
float nearness(vec2 uv, vec2 foc, float hor) {
  float v = hor > -0.5 ? smoothstep(hor - 0.04, min(1.0, hor + 0.5), uv.y) : smoothstep(0.2, 1.0, uv.y);
  float m = 1.0 - smoothstep(0.0, 0.5, distance(uv, foc));
  return 0.65 * v + 0.35 * m;
}

vec3 sampleSrc(sampler2D tex, vec4 xf, vec3 box, vec4 geo, vec2 uv, vec2 par, vec2 foc, float hor) {
  float asp = uRes.x / (uRes.y * uBand.y);
  if (geo.z > 0.5) {
    // Standbild als Abzug: leicht gedreht, weißer Rand, dunkler Grund
    vec2 p = (uv - 0.5) * vec2(asp, 1.0);
    vec2 q = rot2(p, -geo.x) / vec2(asp, 1.0) / box.yz + 0.5;
    vec2 bgUv = xf.zw + (uv - 0.5) * xf.xy / 1.12;
    vec3 back = texture2D(tex, bgUv, uLod).rgb * 0.45;
    vec2 edge = min(q, 1.0 - q);
    float d = min(edge.x * box.y * asp, edge.y * box.z);
    back *= mix(1.0, 0.5, smoothstep(-0.05, 0.0, d));
    float inside = smoothstep(-0.0015, 0.0015, d);
    float bw = geo.w;
    float inner = smoothstep(bw - 0.0015, bw + 0.0015, d);
    vec2 bxy = vec2(box.y * asp, box.z);
    vec2 qi = (q - 0.5) * bxy / max(bxy - 2.0 * bw, vec2(0.01)) + 0.5;
    vec3 img = texture2D(tex, xf.zw + (qi - 0.5) * xf.xy).rgb;
    return mix(back, mix(vec3(0.95, 0.93, 0.89), img, inner), inside);
  }
  if (box.x > 0.5) {
    // gerahmt: ganzes Bild vorn, dahinter dasselbe Bild weich, ruhig und abgedunkelt, dazu ein weicher Schatten
    vec2 q = (uv - 0.5) / box.yz + 0.5;
    vec2 bg = xf.zw + (uv - 0.5) * xf.xy;
    vec3 back = texture2D(tex, bg, uLod).rgb;
    back = mix(vec3(luma(back)), back, 0.75) * 0.46;
    vec2 edge = min(q, 1.0 - q);
    float e = min(edge.x * box.y * asp, edge.y * box.z);
    back *= 1.0 - 0.45 * exp(min(e, 0.0) * 28.0);
    float inside = smoothstep(-0.0025, 0.0025, e);
    vec3 fg = texture2D(tex, clamp(q, 0.0, 1.0), geo.y - 0.5).rgb;
    return mix(back, fg, inside);
  }
  vec2 p = uv - 0.5;
  if (geo.x != 0.0) p = rot2(p * vec2(asp, 1.0), -geo.x) / vec2(asp, 1.0);
  vec2 s = xf.zw + p * xf.xy;
  if (par.x != 0.0 || par.y != 0.0) s = clamp(s + par * (nearness(uv, foc, hor) - 0.4) * xf.xy, 0.0, 1.0);
  // leichte negative Mipmap-Verschiebung: volle Auflösung statt Mischung mit der halben Stufe
  vec3 c = texture2D(tex, s, geo.y - 0.75).rgb;
  if (uSharp > 0.0 && geo.y < 0.5) {
    vec3 soft = texture2D(tex, s, geo.y + 0.9).rgb;
    c = clamp(c + (c - soft) * uSharp, 0.0, 1.0);
  }
  if (uGlow > 0.0) {
    vec3 g = texture2D(tex, s, 3.5).rgb;
    g = max(g - 0.5, 0.0) * 1.8;
    // Halation: Lichter strahlen leicht warm aus
    c = 1.0 - (1.0 - c) * (1.0 - g * vec3(1.0, 0.82, 0.7) * uGlow);
  }
  return c;
}

vec3 layer(sampler2D tex, vec4 xf, vec3 box, vec3 blur, vec4 geo, vec2 off, vec2 uv, vec2 par, vec2 foc, float hor) {
  uv -= off;
  if (blur.x < 0.5) return sampleSrc(tex, xf, box, geo, uv, par, foc, hor);
  vec2 dir = blur.x < 1.5 ? blur.yz : (uv - 0.5) * blur.y;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    float k = float(i) / 7.0 - 0.5;
    acc += sampleSrc(tex, xf, box, geo, uv + dir * k, par, foc, hor);
  }
  return acc / 8.0;
}

vec3 layerA(vec2 uv) { return layer(uTexA, uXfA, uBoxA, uBlurA, uGeoA, uOffA, uv, uParA, uFocA, uHor.x) * uCorrA; }
vec3 layerB(vec2 uv) { return layer(uTexB, uXfB, uBoxB, uBlurB, uGeoB, uOffB, uv, uParB, uFocB, uHor.y) * uCorrB; }

vec3 leakColor(vec2 uv, float t) {
  vec2 c1 = vec2(0.15 + 0.7 * fract(t * 0.07), 0.3 + 0.2 * sin(t * 0.6));
  vec2 c2 = vec2(0.9 - 0.5 * fract(t * 0.05 + 0.3), 0.75);
  float a = smoothstep(0.75, 0.0, distance(uv, c1));
  float b = smoothstep(0.6, 0.0, distance(uv, c2));
  return vec3(1.0, 0.55, 0.26) * a + vec3(1.0, 0.36, 0.3) * b * 0.6;
}

vec3 composite(vec2 uv) {
  float p = clamp(uMix, 0.0, 1.0);
  if (uTrans == 9 && uHasB > 0.5) {
    float e = p * p * (3.0 - 2.0 * p);
    float ax = uv.x + e * uDir;
    if (uDir > 0.0 ? ax < 1.0 : ax >= 0.0) return layerA(vec2(ax, uv.y));
    return layerB(vec2(ax - uDir, uv.y));
  }
  vec3 a = uHasA > 0.5 ? layerA(uv) : vec3(0.0);
  vec3 c = a;
  if (uHasB > 0.5) {
    vec3 b = layerB(uv);
    if (uTrans == 1) c = mix(a, b, smoothstep(0.0, 1.0, p));
    else if (uTrans == 2) c = p < 0.5 ? a * (1.0 - smoothstep(0.0, 0.5, p)) : b * smoothstep(0.5, 1.0, p);
    else if (uTrans == 4 || uTrans == 5) c = mix(a, b, smoothstep(0.44, 0.56, p));
    else if (uTrans == 13) c = mix(a, b, smoothstep(0.22, 0.78, p));
    else if (uTrans == 20) {
      // Echo: das vorige Bild blitzt hell und halbtransparent über dem neuen auf
      vec3 scr = 1.0 - (1.0 - a) * (1.0 - b);
      c = mix(a, mix(scr, b, 0.35), p);
    }
    else if (uTrans == 6) c = mix(a, b, smoothstep(0.25, 0.75, p)) + leakColor(uv, uTime) * sin(3.14159265 * p) * 0.55;
    else if (uTrans == 7) {
      float thr = mix(-0.25, 1.25, p);
      c = mix(a, b, smoothstep(1.0 - thr - 0.18, 1.0 - thr + 0.18, luma(b)));
    }
    else if (uTrans >= 10) {
      vec2 asp2 = vec2(uRes.x / (uRes.y * uBand.y), 1.0);
      // Abstand zum Motiv, auf die entfernteste Bildecke normiert (gleiches Tempo in jedem Format)
      float d = length((uv - uFocB) * asp2) / length(max(uFocB, 1.0 - uFocB) * asp2);
      if (uTrans == 10) {
        // Farbfluss: das neue Bild breitet sich wie Tinte vom Motiv aus
        float field = d * 0.8 + (fbm(uv * asp2 * 3.2 + uDir * 1.7) - 0.5) * 0.5;
        float thr = mix(-0.32, 1.1, p);
        float m = smoothstep(thr - 0.05, thr + 0.05, field);
        float rim = smoothstep(0.1, 0.0, abs(field - thr)) * (1.0 - m);
        c = mix(b, a, m) + rim * 0.1 * vec3(1.0, 0.93, 0.82);
      } else if (uTrans == 11) {
        // Bild aus Bild: helle Formen und das Motiv des neuen Bilds wachsen aus dem alten heraus
        float field = 0.55 * (1.0 - luma(b)) + 0.45 * d + (fbm(uv * asp2 * 5.0) - 0.5) * 0.12;
        float thr = mix(-0.3, 1.3, p);
        float m = smoothstep(thr - 0.2, thr + 0.2, field);
        c = mix(b, a, m);
        c += (1.0 - m) * m * 0.35 * sin(3.14159265 * p) * vec3(1.0, 0.95, 0.88);
      } else {
        // Doppelbelichtung: das neue Bild erscheint in den hellen Flächen des alten
        vec3 scr = 1.0 - (1.0 - a) * (1.0 - b);
        vec3 dbl = mix(a * 0.85 + b * 0.15, scr * 0.94, clamp(luma(a) * 1.3, 0.0, 1.0) * 0.8);
        c = p < 0.5 ? mix(a, dbl, smoothstep(0.0, 0.5, p)) : mix(dbl, b, smoothstep(0.5, 1.0, p));
      }
    }
    else c = p < 0.5 ? a : b;
  }
  return c;
}

void main() {
  vec2 full = vUv;
  vec3 c = vec3(0.0);
  if (full.y >= uBand.x && full.y <= uBand.x + uBand.y) {
    vec2 uv = vec2(full.x, (full.y - uBand.x) / uBand.y);
    c = composite(uv);
    // Grading
    // Farbtemperatur (wie Weißabgleich: Rot/Blau gegenläufig, Grün leicht mit)
    c *= vec3(1.0 + uTemp * 0.13, 1.0 + uTemp * 0.02, 1.0 - uTemp * 0.15);
    // Farbräder: Schatten und Lichter getrennt tönen, die Mitten bleiben natürlich
    float l = luma(c);
    c += uSh * (1.0 - smoothstep(0.0, 0.55, l)) + uHi * smoothstep(0.42, 1.0, l);
    l = luma(c);
    c = mix(vec3(l), c, uSat);
    // Vibrance: blasse Farben kräftiger, bereits satte (Haut, Sonnenuntergang) kaum
    float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
    c = mix(vec3(luma(c)), c, 1.0 + uVib * (1.0 - clamp((mx - mn) * 1.8, 0.0, 1.0)));
    c = max(c, 0.0);
    c = c / (1.0 + max(c - 0.8, 0.0) * 1.4); // weiche Lichter
    c = clamp(c, 0.0, 1.0);
    vec3 sc = c * c * (3.0 - 2.0 * c);
    c = mix(c, sc, uContrast);
    c = mix(c, vec3(luma(c)), max(uBW, uDesat));
    if (uCol.x > 0.5) {
      // Schwarzweiß → Farbe: 1 ganz, 2 vom Motiv aus, 3 Farbwelle, 4 Farbtupfer (kräftige Farben bleiben)
      float col = uCol.y;
      vec2 a2 = vec2(uRes.x / (uRes.y * uBand.y), 1.0);
      if (uCol.x > 1.5 && uCol.x < 2.5) {
        float d = length((uv - uCol.zw) * a2) / length(max(uCol.zw, 1.0 - uCol.zw) * a2);
        d += (fbm(uv * a2 * 3.0) - 0.5) * 0.18;
        float thr = mix(-0.15, 1.2, uCol.y);
        col = 1.0 - smoothstep(thr - 0.12, thr + 0.12, d);
      } else if (uCol.x > 2.5 && uCol.x < 3.5) {
        float f = dot(uv * a2, normalize(vec2(1.0, 0.55))) / dot(a2, normalize(vec2(1.0, 0.55)));
        f += (fbm(uv * a2 * 2.5) - 0.5) * 0.12;
        float thr = mix(-0.2, 1.2, uCol.y);
        col = 1.0 - smoothstep(thr - 0.1, thr + 0.1, f);
      } else if (uCol.x > 3.5) {
        float mx2 = max(c.r, max(c.g, c.b)), mn2 = min(c.r, min(c.g, c.b));
        col = max(uCol.y, smoothstep(0.2, 0.42, mx2 - mn2) * 0.95);
      }
      c = mix(vec3(luma(c)), c, clamp(col, 0.0, 1.0));
    }
    c = mix(vec3(uLift), vec3(1.0 - uCrush), clamp(c, 0.0, 1.0));
    c *= uTint;
    if (uLeak > 0.0) c += leakColor(uv, uTime * 0.5) * uLeak * (0.6 + 0.4 * sin(uTime * 1.3));
    // Vignette
    float asp = uRes.x / (uRes.y * uBand.y);
    vec2 vv = (uv - 0.5) * vec2(asp, 1.0);
    float am = max(asp, 1.0);
    float r = length(vv) / (0.5 * sqrt(am * am + 1.0));
    c *= mix(1.0, smoothstep(1.25, 0.35, r), uVig);
    // Filmkorn
    float n = hash(floor(gl_FragCoord.xy) + fract(uTime * 7.31) * 173.0) - 0.5;
    float mid = 1.0 - abs(luma(c) - 0.5) * 1.4;
    c += n * uGrain * (0.45 + 0.55 * mid);
    c = mix(c, vec3(1.0, 0.985, 0.96), uFlash);
    c *= (1.0 - uDim) * (1.0 - uBlack);
    if (uv.y < uBars || uv.y > 1.0 - uBars) c = vec3(0.0);
  }
  // Titel, Texte, Sticker: ungegradet, über Schwarz
  if (uHasOvTop > 0.5) {
    vec4 o = texture2D(uOvTop, full);
    c = mix(c, o.rgb, o.a);
  }
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    // Kein preserveDrawingBuffer: spart pro Bild eine Kopie des ganzen Bildpuffers (Wärme, Akku).
    // Ausgelesen wird die Leinwand nur direkt nach dem Zeichnen (Export, Titelbild).
    const attrs = { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'default' };
    let gl = canvas.getContext('webgl2', attrs);
    this.isGL2 = !!gl;
    if (!gl) gl = canvas.getContext('webgl', attrs) || canvas.getContext('experimental-webgl', attrs);
    if (!gl) throw new Error('WebGL wird von diesem Browser nicht unterstützt.');
    this.gl = gl;
    this._setup();
    // iOS entzieht Webseiten unter Speicherdruck die Grafikkarte: dann neu aufsetzen statt schwarz zu bleiben
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => {
      this._setup();
      this.onRestore && this.onRestore();
    });
  }

  _setup() {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('Shader: ' + gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.bindAttribLocation(prog, 0, 'aPos');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('Programm: ' + gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    this.prog = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(prog, i);
      const name = info.name.replace(/\[0\]$/, '');
      this.u[name] = gl.getUniformLocation(prog, name);
    }
    gl.uniform1i(this.u.uTexA, 0);
    gl.uniform1i(this.u.uTexB, 1);
    gl.uniform1i(this.u.uOvTop, 2);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.black = this.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.black);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.ovTex = { top: this.createTexture() };
    gl.bindTexture(gl.TEXTURE_2D, this.ovTex.top);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.lost = false;
  }

  createTexture() {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  /** Lädt Bild/Video/Canvas in eine Textur (mit Mipmaps unter WebGL2). */
  upload(tex, source, mip = true) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch (e) {
      return false;
    }
    if (this.isGL2 && mip) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    } else if (this.isGL2) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    return true;
  }

  uploadOverlay(which, canvas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.ovTex[which]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  }

  deleteTexture(t) {
    if (t && t !== this.black) this.gl.deleteTexture(t);
  }

  resize(w, h) {
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  draw(f) {
    const gl = this.gl, u = this.u;
    if (this.lost || gl.isContextLost()) return;
    gl.useProgram(this.prog);
    const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); };
    bind(0, f.A ? f.A.tex : this.black);
    bind(1, f.B ? f.B.tex : this.black);
    bind(2, this.ovTex.top);
    gl.activeTexture(gl.TEXTURE0);
    const L = (o, key, fb) => (o && o[key] ? o[key] : fb);
    gl.uniform4fv(u.uXfA, L(f.A, 'xf', [1, 1, 0.5, 0.5]));
    gl.uniform4fv(u.uXfB, L(f.B, 'xf', [1, 1, 0.5, 0.5]));
    gl.uniform3fv(u.uBoxA, L(f.A, 'box', [0, 1, 1]));
    gl.uniform3fv(u.uBoxB, L(f.B, 'box', [0, 1, 1]));
    gl.uniform3fv(u.uBlurA, L(f.A, 'blur', [0, 0, 0]));
    gl.uniform3fv(u.uBlurB, L(f.B, 'blur', [0, 0, 0]));
    gl.uniform4fv(u.uGeoA, L(f.A, 'geo', [0, 0, 0, 0]));
    gl.uniform4fv(u.uGeoB, L(f.B, 'geo', [0, 0, 0, 0]));
    gl.uniform2fv(u.uOffA, L(f.A, 'off', [0, 0]));
    gl.uniform2fv(u.uOffB, L(f.B, 'off', [0, 0]));
    gl.uniform3fv(u.uCorrA, L(f.A, 'corr', [1, 1, 1]));
    gl.uniform3fv(u.uCorrB, L(f.B, 'corr', [1, 1, 1]));
    gl.uniform2fv(u.uFocA, L(f.A, 'foc', [0.5, 0.45]));
    gl.uniform2fv(u.uFocB, L(f.B, 'foc', [0.5, 0.45]));
    gl.uniform2fv(u.uParA, L(f.A, 'par', [0, 0]));
    gl.uniform2fv(u.uParB, L(f.B, 'par', [0, 0]));
    gl.uniform2f(u.uHor, f.A && f.A.hor != null ? f.A.hor : -1, f.B && f.B.hor != null ? f.B.hor : -1);
    gl.uniform4fv(u.uCol, f.col || [0, 1, 0.5, 0.5]);
    gl.uniform2fv(u.uBand, f.band || [0, 1]);
    gl.uniform1f(u.uHasA, f.A ? 1 : 0);
    gl.uniform1f(u.uHasB, f.B ? 1 : 0);
    gl.uniform1f(u.uMix, f.mix || 0);
    gl.uniform1i(u.uTrans, f.trans || 0);
    gl.uniform1f(u.uDir, f.dir || 1);
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, f.time % 1000);
    const g = f.grade;
    gl.uniform1f(u.uSat, g.sat);
    gl.uniform1f(u.uContrast, g.contrast);
    gl.uniform1f(u.uTemp, g.temp);
    gl.uniform1f(u.uVib, g.vib || 0);
    gl.uniform3fv(u.uSh, g.sh || [0, 0, 0]);
    gl.uniform3fv(u.uHi, g.hi || [0, 0, 0]);
    gl.uniform1f(u.uLift, g.lift);
    gl.uniform1f(u.uCrush, g.crush);
    gl.uniform1f(u.uBW, g.bw);
    gl.uniform1f(u.uGrain, g.grain);
    gl.uniform1f(u.uVig, g.vig);
    gl.uniform3fv(u.uTint, g.tint);
    gl.uniform1f(u.uGlow, this.isGL2 ? g.glow : 0);
    gl.uniform1f(u.uLeak, g.leak || 0);
    gl.uniform1f(u.uFlash, f.flash || 0);
    gl.uniform1f(u.uBars, f.bars || 0);
    gl.uniform1f(u.uBlack, f.black || 0);
    gl.uniform1f(u.uDim, f.dim || 0);
    gl.uniform1f(u.uDesat, f.desat || 0);
    gl.uniform1f(u.uHasOvTop, f.ovTop ? 1 : 0);
    gl.uniform1f(u.uLod, this.isGL2 ? 5.0 : 0.0);
    gl.uniform1f(u.uSharp, this.isGL2 ? 0.4 : 0.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}
