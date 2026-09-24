/* ============================================================
 * Metadaten: Aufnahmezeit und Standort aus Fotos (EXIF) und
 * Videos (MOV/MP4), Ortsnamen offline, Stopps einer Reise
 * ============================================================ */

// Offline-Ortsliste [Name, Breite, Länge]. Keine Netzabfrage: Namen werden lokal zugeordnet.
const CITIES = [
  // Deutschland
  ['Berlin', 52.52, 13.405], ['Hamburg', 53.551, 9.994], ['München', 48.137, 11.575], ['Köln', 50.938, 6.96], ['Frankfurt', 50.11, 8.682],
  ['Stuttgart', 48.776, 9.183], ['Düsseldorf', 51.227, 6.774], ['Leipzig', 51.34, 12.375], ['Dresden', 51.05, 13.738], ['Hannover', 52.376, 9.732],
  ['Nürnberg', 49.452, 11.077], ['Bremen', 53.079, 8.802], ['Freiburg', 47.999, 7.842], ['Heidelberg', 49.399, 8.672], ['Münster', 51.961, 7.626],
  ['Kiel', 54.323, 10.123], ['Rostock', 54.092, 12.099], ['Lübeck', 53.866, 10.686], ['Konstanz', 47.66, 9.175], ['Garmisch-Partenkirchen', 47.492, 11.095],
  ['Sylt', 54.906, 8.31], ['Rügen', 54.43, 13.43], ['Usedom', 53.96, 14.05], ['Bonn', 50.737, 7.098], ['Mainz', 49.993, 8.247], ['Würzburg', 49.791, 9.953],
  ['Regensburg', 49.013, 12.101], ['Augsburg', 48.366, 10.894], ['Essen', 51.456, 7.012], ['Dortmund', 51.514, 7.468], ['Aachen', 50.776, 6.084],
  ['Erfurt', 50.978, 11.029], ['Weimar', 50.98, 11.33], ['Potsdam', 52.39, 13.065], ['Karlsruhe', 49.007, 8.404], ['Berchtesgaden', 47.63, 13.0],
  ['Lindau', 47.546, 9.684], ['Füssen', 47.569, 10.7], ['Trier', 49.75, 6.637], ['Mannheim', 49.487, 8.466],
  // Österreich & Schweiz
  ['Wien', 48.208, 16.373], ['Salzburg', 47.8, 13.044], ['Innsbruck', 47.269, 11.404], ['Graz', 47.071, 15.439], ['Linz', 48.306, 14.286],
  ['Hallstatt', 47.562, 13.649], ['Zürich', 47.377, 8.541], ['Genf', 46.204, 6.143], ['Bern', 46.948, 7.447], ['Basel', 47.56, 7.588],
  ['Luzern', 47.05, 8.309], ['Lausanne', 46.52, 6.633], ['Interlaken', 46.686, 7.863], ['Zermatt', 46.02, 7.749], ['Lugano', 46.004, 8.951], ['St. Moritz', 46.498, 9.838],
  // Portugal & Spanien
  ['Lissabon', 38.722, -9.139], ['Porto', 41.158, -8.629], ['Sintra', 38.8, -9.388], ['Cascais', 38.697, -9.421], ['Lagos', 37.102, -8.673],
  ['Faro', 37.019, -7.93], ['Albufeira', 37.089, -8.25], ['Coimbra', 40.203, -8.41], ['Nazaré', 39.602, -9.07], ['Évora', 38.571, -7.909], ['Funchal', 32.65, -16.908],
  ['Ponta Delgada', 37.74, -25.668], ['Douro-Tal', 41.16, -7.79], ['Algarve', 37.1, -8.3], ['Peniche', 39.356, -9.381], ['Ericeira', 38.963, -9.417], ['Madrid', 40.417, -3.704], ['Barcelona', 41.385, 2.173], ['Valencia', 39.47, -0.376], ['Sevilla', 37.389, -5.984],
  ['Granada', 37.177, -3.599], ['Málaga', 36.721, -4.421], ['Córdoba', 37.888, -4.779], ['Bilbao', 43.263, -2.935], ['San Sebastián', 43.318, -1.981],
  ['Palma', 39.57, 2.65], ['Ibiza', 38.907, 1.433], ['Menorca', 39.95, 4.1], ['Teneriffa', 28.29, -16.63], ['Gran Canaria', 27.96, -15.59],
  ['Lanzarote', 29.04, -13.63], ['Fuerteventura', 28.36, -14.05], ['La Palma', 28.68, -17.86], ['Cádiz', 36.527, -6.289], ['Marbella', 36.51, -4.886],
  ['Alicante', 38.345, -0.481], ['Salamanca', 40.965, -5.664], ['Toledo', 39.863, -4.027], ['Santiago de Compostela', 42.878, -8.545], ['Ronda', 36.742, -5.167],
  // Frankreich & Benelux
  ['Paris', 48.857, 2.352], ['Nizza', 43.71, 7.262], ['Marseille', 43.296, 5.37], ['Lyon', 45.764, 4.836], ['Bordeaux', 44.838, -0.579],
  ['Toulouse', 43.605, 1.444], ['Montpellier', 43.611, 3.877], ['Cannes', 43.552, 7.017], ['Monaco', 43.738, 7.425], ['Avignon', 43.949, 4.806],
  ['Straßburg', 48.573, 7.752], ['Provence', 43.9, 5.4], ['Verdonschlucht', 43.76, 6.35], ['Annecy', 45.899, 6.129], ['Chamonix', 45.924, 6.869], ['Biarritz', 43.483, -1.559], ['Saint-Malo', 48.649, -2.026],
  ['Mont-Saint-Michel', 48.636, -1.511], ['Ajaccio', 41.919, 8.738], ['Bastia', 42.697, 9.451], ['Nantes', 47.218, -1.554], ['Lille', 50.629, 3.057],
  ['Amsterdam', 52.368, 4.904], ['Rotterdam', 51.924, 4.478], ['Den Haag', 52.08, 4.31], ['Utrecht', 52.091, 5.122], ['Brüssel', 50.85, 4.352],
  ['Brügge', 51.209, 3.225], ['Gent', 51.054, 3.717], ['Antwerpen', 51.219, 4.402], ['Luxemburg', 49.612, 6.13],
  // Italien & Malta
  ['Rom', 41.903, 12.496], ['Mailand', 45.464, 9.19], ['Venedig', 45.441, 12.316], ['Florenz', 43.77, 11.256], ['Neapel', 40.852, 14.268],
  ['Turin', 45.07, 7.687], ['Bologna', 44.494, 11.343], ['Genua', 44.405, 8.946], ['Pisa', 43.716, 10.402], ['Siena', 43.318, 11.331],
  ['Verona', 45.438, 10.992], ['Como', 45.808, 9.085], ['Gardasee', 45.6, 10.64], ['Bergamo', 45.698, 9.677], ['Positano', 40.628, 14.485],
  ['Amalfi', 40.634, 14.603], ['Sorrent', 40.626, 14.376], ['Capri', 40.551, 14.243], ['Cinque Terre', 44.127, 9.71], ['Portofino', 44.303, 9.21],
  ['Palermo', 38.116, 13.361], ['Catania', 37.502, 15.087], ['Taormina', 37.852, 15.288], ['Syrakus', 37.075, 15.287], ['Bari', 41.117, 16.872],
  ['Lecce', 40.353, 18.174], ['Polignano a Mare', 40.996, 17.22], ['Matera', 40.666, 16.604], ['Cagliari', 39.224, 9.122], ['Olbia', 40.923, 9.498],
  ['Alghero', 40.559, 8.319], ['Toskana', 43.35, 11.2], ['Val d’Orcia', 43.03, 11.6], ['Südtirol', 46.67, 11.16], ['Bozen', 46.498, 11.354], ['Meran', 46.671, 11.16], ['Dolomiten', 46.41, 11.84], ['Triest', 45.65, 13.777],
  ['Valletta', 35.899, 14.514],
  // Südosteuropa & Griechenland
  ['Athen', 37.984, 23.728], ['Thessaloniki', 40.64, 22.944], ['Santorini', 36.393, 25.461], ['Mykonos', 37.446, 25.328], ['Kreta', 35.24, 24.8],
  ['Heraklion', 35.339, 25.144], ['Chania', 35.514, 24.018], ['Rhodos', 36.434, 28.217], ['Korfu', 39.624, 19.921], ['Zakynthos', 37.787, 20.899],
  ['Naxos', 37.105, 25.376], ['Paros', 37.085, 25.15], ['Milos', 36.73, 24.43], ['Kefalonia', 38.175, 20.57], ['Dubrovnik', 42.65, 18.094],
  ['Split', 43.508, 16.44], ['Zadar', 44.119, 15.231], ['Zagreb', 45.815, 15.982], ['Pula', 44.867, 13.85], ['Rovinj', 45.081, 13.639], ['Hvar', 43.172, 16.443],
  ['Plitvicer Seen', 44.865, 15.582], ['Ljubljana', 46.056, 14.506], ['Bled', 46.369, 14.114], ['Kotor', 42.425, 18.771], ['Budva', 42.288, 18.84],
  ['Sarajevo', 43.856, 18.413], ['Mostar', 43.343, 17.808], ['Belgrad', 44.787, 20.457], ['Tirana', 41.327, 19.819], ['Sarandë', 39.875, 20.005],
  ['Sofia', 42.698, 23.322], ['Bukarest', 44.427, 26.103], ['Istanbul', 41.008, 28.978], ['Antalya', 36.897, 30.713], ['Kappadokien', 38.643, 34.83],
  ['Bodrum', 37.034, 27.43], ['Izmir', 38.423, 27.143], ['Fethiye', 36.622, 29.116], ['Zypern', 34.917, 33.63], ['Paphos', 34.772, 32.43],
  // Mittel- & Osteuropa
  ['Prag', 50.075, 14.438], ['Budapest', 47.498, 19.04], ['Krakau', 50.065, 19.945], ['Warschau', 52.23, 21.012], ['Danzig', 54.352, 18.646],
  ['Breslau', 51.108, 17.039], ['Bratislava', 48.149, 17.107], ['Český Krumlov', 48.811, 14.315], ['Tallinn', 59.437, 24.754], ['Riga', 56.95, 24.105], ['Vilnius', 54.687, 25.28],
  // Nordeuropa & Britische Inseln
  ['Kopenhagen', 55.676, 12.568], ['Stockholm', 59.329, 18.069], ['Oslo', 59.914, 10.752], ['Bergen', 60.391, 5.322], ['Helsinki', 60.17, 24.938],
  ['Göteborg', 57.709, 11.975], ['Malmö', 55.605, 13.004], ['Reykjavík', 64.147, -21.942], ['Tromsø', 69.649, 18.955], ['Lofoten', 68.15, 13.9],
  ['Stavanger', 58.97, 5.733], ['Aarhus', 56.162, 10.203], ['London', 51.507, -0.128], ['Edinburgh', 55.953, -3.188], ['Glasgow', 55.864, -4.252],
  ['Manchester', 53.48, -2.242], ['Liverpool', 53.408, -2.991], ['Brighton', 50.822, -0.137], ['Oxford', 51.752, -1.258], ['Cambridge', 52.205, 0.119],
  ['Bath', 51.381, -2.359], ['Dublin', 53.35, -6.26], ['Galway', 53.271, -9.057], ['Cork', 51.898, -8.475], ['Isle of Skye', 57.27, -6.2],
  // Nordafrika & Nahost
  ['Marrakesch', 31.63, -7.99], ['Agadir', 30.427, -9.598], ['Fès', 34.033, -5.0], ['Chefchaouen', 35.171, -5.269], ['Tanger', 35.759, -5.834],
  ['Kairo', 30.044, 31.236], ['Hurghada', 27.258, 33.812], ['Scharm el-Scheich', 27.915, 34.33], ['Tunis', 36.806, 10.181], ['Djerba', 33.8, 10.85],
  ['Dubai', 25.205, 55.271], ['Abu Dhabi', 24.454, 54.377], ['Doha', 25.285, 51.531], ['Tel Aviv', 32.085, 34.782], ['Jerusalem', 31.768, 35.214],
  ['Petra', 30.329, 35.444], ['Amman', 31.954, 35.911], ['Maskat', 23.588, 58.383],
  // Amerika
  ['New York', 40.713, -74.006], ['Los Angeles', 34.052, -118.244], ['San Francisco', 37.775, -122.419], ['Las Vegas', 36.17, -115.14], ['Miami', 25.762, -80.192],
  ['Chicago', 41.878, -87.63], ['Boston', 42.36, -71.059], ['Washington', 38.907, -77.037], ['Seattle', 47.606, -122.332], ['San Diego', 32.716, -117.161],
  ['New Orleans', 29.951, -90.072], ['Austin', 30.267, -97.743], ['Nashville', 36.163, -86.781], ['Honolulu', 21.307, -157.858], ['Maui', 20.8, -156.33],
  ['Grand Canyon', 36.107, -112.113], ['Yosemite', 37.865, -119.538], ['Big Sur', 36.27, -121.81], ['Key West', 24.556, -81.78], ['Orlando', 28.538, -81.379],
  ['Toronto', 43.653, -79.383], ['Vancouver', 49.283, -123.121], ['Montreal', 45.502, -73.567], ['Banff', 51.178, -115.572], ['Québec', 46.813, -71.208],
  ['Mexiko-Stadt', 19.433, -99.133], ['Cancún', 21.161, -86.851], ['Tulum', 20.211, -87.465], ['Playa del Carmen', 20.629, -87.074], ['Havanna', 23.113, -82.366],
  ['Punta Cana', 18.582, -68.405], ['Rio de Janeiro', -22.907, -43.173], ['São Paulo', -23.551, -46.633], ['Buenos Aires', -34.604, -58.382], ['Lima', -12.046, -77.043],
  ['Cusco', -13.532, -71.967], ['Santiago de Chile', -33.449, -70.669], ['Cartagena', 10.391, -75.479], ['Medellín', 6.244, -75.581], ['Bogotá', 4.711, -74.072],
  ['Costa Rica', 9.93, -84.08],
  // Asien & Ozeanien
  ['Tokio', 35.676, 139.65], ['Kyoto', 35.012, 135.768], ['Osaka', 34.694, 135.502], ['Seoul', 37.567, 126.978], ['Peking', 39.904, 116.407],
  ['Shanghai', 31.23, 121.474], ['Hongkong', 22.32, 114.169], ['Taipeh', 25.033, 121.565], ['Singapur', 1.352, 103.82], ['Bangkok', 13.756, 100.502],
  ['Chiang Mai', 18.788, 98.986], ['Phuket', 7.88, 98.392], ['Koh Samui', 9.512, 100.014], ['Krabi', 8.086, 98.906], ['Bali', -8.409, 115.189],
  ['Ubud', -8.507, 115.263], ['Canggu', -8.647, 115.138], ['Jakarta', -6.208, 106.846], ['Kuala Lumpur', 3.139, 101.687], ['Hanoi', 21.028, 105.834],
  ['Ho-Chi-Minh-Stadt', 10.823, 106.63], ['Hội An', 15.88, 108.338], ['Halong-Bucht', 20.91, 107.18], ['Siem Reap', 13.367, 103.844], ['Manila', 14.6, 120.984],
  ['Palawan', 10.0, 118.9], ['Colombo', 6.927, 79.861], ['Malediven', 4.175, 73.509], ['Mumbai', 19.076, 72.878], ['Delhi', 28.614, 77.209], ['Goa', 15.3, 74.12],
  ['Kathmandu', 27.717, 85.324], ['Sydney', -33.869, 151.209], ['Melbourne', -37.814, 144.963], ['Brisbane', -27.47, 153.026], ['Perth', -31.953, 115.857],
  ['Cairns', -16.92, 145.77], ['Auckland', -36.848, 174.763], ['Queenstown', -45.031, 168.663], ['Kapstadt', -33.925, 18.424], ['Johannesburg', -26.204, 28.047],
  ['Sansibar', -6.165, 39.2], ['Mauritius', -20.16, 57.5], ['Seychellen', -4.62, 55.45], ['Nairobi', -1.286, 36.817],
];

function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Nächster bekannter Ort innerhalb von maxKm, sonst null. */
function nearestCity(pos, maxKm = 35) {
  if (!pos) return null;
  let best = null, bd = Infinity;
  for (const c of CITIES) {
    if (Math.abs(c[1] - pos[0]) > 1.5) continue;
    const d = haversineKm(pos, [c[1], c[2]]);
    if (d < bd) { bd = d; best = c[0]; }
  }
  return bd <= maxKm ? best : null;
}

/* ---------- EXIF (JPEG) ---------- */
function parseExifDate(s) {
  const m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s || '');
  if (!m) return null;
  // Ortszeit der Aufnahme; für die Reihenfolge reicht das
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return isFinite(t) && +m[1] > 1990 ? t : null;
}

function readJpegExif(buf) {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let p = 2;
  while (p + 4 < v.byteLength) {
    if (v.getUint8(p) !== 0xff) return null;
    const marker = v.getUint8(p + 1);
    const len = v.getUint16(p + 2);
    if (marker === 0xe1 && v.getUint32(p + 4) === 0x45786966) return parseTiff(v, p + 10, len - 8);
    if (marker === 0xda) return null;
    p += 2 + len;
  }
  return null;
}

function parseTiff(v, base, maxLen) {
  const end = Math.min(v.byteLength, base + maxLen);
  const le = v.getUint16(base) === 0x4949;
  const u16 = (o) => v.getUint16(o, le), u32 = (o) => v.getUint32(o, le);
  if (u16(base + 2) !== 42) return null;
  const readIfd = (off) => {
    const out = {};
    const at = base + off;
    if (at + 2 > end) return out;
    const n = u16(at);
    for (let i = 0; i < n; i++) {
      const e = at + 2 + i * 12;
      if (e + 12 > end) break;
      out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), valOff: e + 8 };
    }
    return out;
  };
  const ascii = (ent) => {
    if (!ent) return '';
    const o = ent.count > 4 ? base + u32(ent.valOff) : ent.valOff;
    let s = '';
    for (let i = 0; i < ent.count - 1 && o + i < end; i++) s += String.fromCharCode(v.getUint8(o + i));
    return s;
  };
  const rationals = (ent) => {
    if (!ent) return null;
    const o = base + u32(ent.valOff);
    const r = [];
    for (let i = 0; i < ent.count; i++) {
      if (o + i * 8 + 8 > end) return null;
      const d = u32(o + i * 8 + 4);
      r.push(d ? u32(o + i * 8) / d : 0);
    }
    return r;
  };
  const ifd0 = readIfd(u32(base + 4));
  const res = {};
  if (ifd0[0x8769]) {
    const ex = readIfd(u32(ifd0[0x8769].valOff));
    res.time = parseExifDate(ascii(ex[0x9003])) || parseExifDate(ascii(ex[0x9004]));
  }
  if (!res.time) res.time = parseExifDate(ascii(ifd0[0x0132]));
  if (ifd0[0x8825]) {
    const g = readIfd(u32(ifd0[0x8825].valOff));
    const lat = rationals(g[2]), lon = rationals(g[4]);
    if (lat && lon && lat.length === 3 && lon.length === 3) {
      let la = lat[0] + lat[1] / 60 + lat[2] / 3600;
      let lo = lon[0] + lon[1] / 60 + lon[2] / 3600;
      if (ascii(g[1]).toUpperCase() === 'S') la = -la;
      if (ascii(g[3]).toUpperCase() === 'W') lo = -lo;
      if (isFinite(la) && isFinite(lo) && (la !== 0 || lo !== 0) && Math.abs(la) <= 90 && Math.abs(lo) <= 180) res.pos = [la, lo];
    }
  }
  return res;
}

/* ---------- MOV/MP4 ---------- */
async function readMp4Meta(file) {
  // Nur die Kopfzeilen der Boxen lesen, dann gezielt die moov-Box
  let pos = 0;
  for (let guard = 0; guard < 64 && pos + 8 <= file.size; guard++) {
    const head = new DataView(await file.slice(pos, pos + 16).arrayBuffer());
    let size = head.getUint32(0);
    const type = String.fromCharCode(head.getUint8(4), head.getUint8(5), head.getUint8(6), head.getUint8(7));
    let hdr = 8;
    if (size === 1 && head.byteLength >= 16) { size = head.getUint32(8) * 4294967296 + head.getUint32(12); hdr = 16; }
    else if (size === 0) size = file.size - pos;
    if (size < hdr) return null;
    if (type === 'moov') {
      if (size > 64 * 1024 * 1024) return null;
      const buf = new Uint8Array(await file.slice(pos, pos + size).arrayBuffer());
      return parseMoov(buf);
    }
    pos += size;
  }
  return null;
}

function parseMoov(buf) {
  const res = {};
  // Text (latin1) für ISO-6709-Koordinaten und Apple-Datumsangaben
  let txt = '';
  for (let i = 0; i < buf.length; i++) txt += buf[i] >= 32 && buf[i] < 127 ? String.fromCharCode(buf[i]) : ' ';
  const loc = /([+-]\d{1,2}\.\d{3,})([+-]\d{1,3}\.\d{3,})/.exec(txt);
  if (loc) {
    const la = parseFloat(loc[1]), lo = parseFloat(loc[2]);
    if (Math.abs(la) <= 90 && Math.abs(lo) <= 180 && (la !== 0 || lo !== 0)) res.pos = [la, lo];
  }
  const cd = /(20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:[+-]\d\d:?\d\d|Z)?)/.exec(txt);
  if (cd) {
    const t = Date.parse(cd[1].replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
    if (isFinite(t)) res.time = t;
  }
  if (!res.time) {
    // mvhd: Sekunden seit 1904
    const i = txt.indexOf('mvhd');
    if (i > 0 && i + 16 < buf.length) {
      const dv = new DataView(buf.buffer, buf.byteOffset);
      const ver = buf[i + 4];
      const secs = ver === 1 ? dv.getUint32(i + 8) * 4294967296 + dv.getUint32(i + 12) : dv.getUint32(i + 8);
      const t = (secs - 2082844800) * 1000;
      if (secs > 0 && t > 946684800000 && t < Date.now() + 86400000) res.time = t;
    }
  }
  return res;
}

/** Liest Aufnahmezeit und Standort. Liefert {time?, pos?}. Scheitert still. */
async function readMediaMeta(file, kind) {
  try {
    if (kind === 'image') {
      if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name || '')) return {};
      return readJpegExif(await file.slice(0, 256 * 1024).arrayBuffer()) || {};
    }
    return (await readMp4Meta(file)) || {};
  } catch (e) {
    return {};
  }
}

/* ---------- Stopps einer Reise ---------- */
function centroid(items) {
  const g = items.filter((m) => m.pos);
  if (!g.length) return null;
  return [g.reduce((a, m) => a + m.pos[0], 0) / g.length, g.reduce((a, m) => a + m.pos[1], 0) / g.length];
}

/**
 * Teilt Aufnahmen in Stopps: neuer Stopp bei > 25 km Entfernung,
 * ohne Standort bei > 10 h Pause. Kleine Gruppen werden eingemeindet.
 */
function clusterStops(items) {
  const list = items.slice().sort((a, b) => (a.time || 0) - (b.time || 0));
  const groups = [];
  let cur = null;
  for (const m of list) {
    if (!cur) { cur = { items: [m] }; groups.push(cur); continue; }
    const c = centroid(cur.items);
    const last = cur.items[cur.items.length - 1];
    const gap = (m.time || 0) - (last.time || 0);
    let split;
    if (m.pos && c) split = haversineKm(c, m.pos) > 25;
    else split = gap > 10 * 3600 * 1000;
    if (split) { cur = { items: [m] }; groups.push(cur); } else cur.items.push(m);
  }
  // Mini-Gruppen (< 3 Aufnahmen) dem zeitlich nächsten Stopp zuordnen, wenn nah genug
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    if (g.items.length >= 3 || groups.length === 1) continue;
    const c = centroid(g.items);
    const cands = [groups[i - 1], groups[i + 1]].filter(Boolean);
    let best = null, bd = Infinity;
    for (const o of cands) {
      const oc = centroid(o.items);
      const d = c && oc ? haversineKm(c, oc) : 0;
      if (d < bd) { bd = d; best = o; }
    }
    if (best && bd < 80) { best.items.push(...g.items); best.items.sort((a, b) => (a.time || 0) - (b.time || 0)); groups.splice(i, 1); i--; }
  }
  return groups.map((g, k) => {
    const pos = centroid(g.items);
    const times = g.items.map((m) => m.time).filter(Boolean);
    return { items: g.items, pos, name: nearestCity(pos) || null, from: times.length ? Math.min(...times) : null, to: times.length ? Math.max(...times) : null, index: k };
  });
}

function dateRangeLabel(from, to) {
  if (!from) return '';
  const a = new Date(from), b = new Date(to || from);
  const mon = (d) => d.toLocaleDateString('de-DE', { month: 'long' });
  if (a.toDateString() === b.toDateString()) return `${a.getDate()}. ${mon(a)} ${a.getFullYear()}`;
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) return `${a.getDate()}.–${b.getDate()}. ${mon(a)} ${a.getFullYear()}`;
  return `${a.getDate()}. ${mon(a)} – ${b.getDate()}. ${mon(b)} ${b.getFullYear()}`;
}
