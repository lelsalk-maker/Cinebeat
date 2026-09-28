/* Hintergrund-Thread fürs Einlesen: Foto klein dekodieren, bewerten (score.js) und Vorschaubild erzeugen.
 * Wird von build.mjs zusammen mit score.js als eigener Code eingebettet (SCORE_WORKER_SRC). */
self.onmessage = async (e) => {
  const { id, file, w, h, max } = e.data;
  try {
    const sc = Math.min(1, max / Math.max(w, h));
    const bw = Math.max(1, Math.round(w * sc)), bh = Math.max(1, Math.round(h * sc));
    let bmp;
    try { bmp = await createImageBitmap(file, { resizeWidth: bw, resizeQuality: 'high', imageOrientation: 'from-image' }); } catch (err) {
      if (!(err && err.name === 'TypeError')) throw err;
      bmp = await createImageBitmap(file, { resizeWidth: bw, resizeQuality: 'high' });
    }
    // dreht dieser Browser hier nicht nach EXIF, übernimmt der sichere Weg im Hauptthread
    if (Math.abs(bmp.height - bh) > Math.max(2, bh * 0.01)) { bmp.close(); self.postMessage({ id, fallback: true }); return; }
    const res = scoreImage(bmp, bmp.width, bmp.height);
    const size = 160, c = new OffscreenCanvas(size, size), x = c.getContext('2d');
    const s = Math.max(size / bmp.width, size / bmp.height);
    x.drawImage(bmp, (size - bmp.width * s) / 2, (size - bmp.height * s) / 2, bmp.width * s, bmp.height * s);
    const thumb = new FileReaderSync().readAsDataURL(await c.convertToBlob({ type: 'image/jpeg', quality: 0.75 }));
    self.postMessage({ id, res, thumb, bmp }, [bmp]);
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
