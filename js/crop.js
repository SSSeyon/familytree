// Image cropper: drag to move, pinch / wheel / slider to zoom, rotate in 90° steps.
// cropImage(fileOrBlob, opts) → Promise<data URL (JPEG) | null if cancelled>
//   opts.aspect: fixed width/height ratio (e.g. 1 for profile photos); omit to let the user choose
//   opts.round:  show a round guide (profile photos)
//   opts.size:   output width for fixed-aspect crops (e.g. 360); otherwise opts.max = longest side
import { t } from './i18n.js';
import { icon, html, $, $$, modal } from './ui.js';

const SOURCE_MAX = 2400; // big phone photos are scaled down first to keep things quick

async function toCanvas(blob) {
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, SOURCE_MAX / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}
function rotated(src) {
  const c = document.createElement('canvas');
  c.width = src.height; c.height = src.width;
  const g = c.getContext('2d');
  g.translate(c.width, 0); g.rotate(Math.PI / 2);
  g.drawImage(src, 0, 0);
  return c;
}

export async function cropImage(blob, { aspect, round = false, size = 360, max = 1400 } = {}) {
  let src = await toCanvas(blob);
  const choose = !aspect;
  const ASPECTS = [['orig', t('cropOriginal')], ['1', '1:1'], ['1.3333', '4:3'], ['0.75', '3:4'], ['1.7778', '16:9']];
  let ratio = aspect || src.width / src.height;

  const body = html(`<div class="crop">
    <div class="crop-stage"><div class="crop-frame${round ? ' round' : ''}"></div></div>
    ${choose ? `<div class="seg crop-aspects" role="radiogroup">${ASPECTS.map(([v, l], i) => `<label><input type="radio" name="asp" value="${v}" ${i === 0 ? 'checked' : ''}>${l}</label>`).join('')}</div>` : ''}
    <div class="crop-tools">
      <span aria-hidden="true">−</span><input type="range" min="1" max="5" step="0.01" value="1" data-zoom aria-label="${t('zoomIn')}"><span aria-hidden="true">+</span>
      <button type="button" class="btn sm" data-rot>${icon('refresh')}${t('cropRotate')}</button>
    </div>
    <p class="small muted">${t('cropHelp')}</p>
  </div>`);
  const foot = `<button class="btn" data-close>${t('cancel')}</button><button class="btn primary" data-ok>${icon('check')}${t('cropUse')}</button>`;

  return new Promise(resolve => {
    let result = null;
    const m = modal({ title: t('cropTitle'), body, foot, sticky: true, onClose: () => resolve(result) });
    const frame = $('.crop-frame', body), stage = $('.crop-stage', body), zoomIn = $('[data-zoom]', body);
    let fw = 0, fh = 0, minS = 1, s = 1, x = 0, y = 0;

    const show = () => {
      frame.replaceChildren(src);
      src.className = 'crop-img';
    };
    const clamp = () => {
      s = Math.min(Math.max(s, minS), minS * 5);
      x = Math.min(0, Math.max(fw - src.width * s, x));
      y = Math.min(0, Math.max(fh - src.height * s, y));
      src.style.transform = `translate(${x}px,${y}px) scale(${s})`;
      zoomIn.value = (s / minS).toFixed(2);
    };
    // fit the frame inside the stage and the picture to cover the frame
    const layout = () => {
      const W = stage.clientWidth, H = Math.min(window.innerHeight * 0.5, 420);
      fw = Math.min(W, H * ratio); fh = fw / ratio;
      frame.style.width = fw + 'px'; frame.style.height = fh + 'px';
      minS = Math.max(fw / src.width, fh / src.height);
      s = minS; x = (fw - src.width * s) / 2; y = (fh - src.height * s) / 2;
      clamp();
    };
    const zoomAt = (ns, cx = fw / 2, cy = fh / 2) => {
      const k = Math.min(Math.max(ns, minS), minS * 5) / s;
      x = cx - (cx - x) * k; y = cy - (cy - y) * k; s *= k;
      clamp();
    };

    // drag and pinch
    const pts = new Map();
    let last = null;
    frame.addEventListener('pointerdown', e => { frame.setPointerCapture(e.pointerId); pts.set(e.pointerId, e); last = null; });
    frame.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, e);
      if (pts.size === 1) { x += e.clientX - prev.clientX; y += e.clientY - prev.clientY; clamp(); return; }
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const r = frame.getBoundingClientRect();
      if (last) zoomAt(s * d / last, (a.clientX + b.clientX) / 2 - r.left, (a.clientY + b.clientY) / 2 - r.top);
      last = d;
    });
    const up = e => { pts.delete(e.pointerId); last = null; };
    frame.addEventListener('pointerup', up); frame.addEventListener('pointercancel', up);
    frame.addEventListener('wheel', e => {
      e.preventDefault();
      const r = frame.getBoundingClientRect();
      zoomAt(s * (e.deltaY < 0 ? 1.1 : 1 / 1.1), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    zoomIn.oninput = () => zoomAt(minS * +zoomIn.value);
    $('[data-rot]', body).onclick = () => {
      src = rotated(src);
      if (!aspect && $('[name=asp]:checked', body)?.value === 'orig') ratio = src.width / src.height;
      show(); layout();
    };
    $$('[name=asp]', body).forEach(r => r.onchange = () => { ratio = r.value === 'orig' ? src.width / src.height : +r.value; layout(); });

    $('[data-ok]', m.el).onclick = () => {
      const sx = -x / s, sy = -y / s, sw = fw / s, sh = fh / s;
      const k = aspect ? size / sw : Math.min(1, max / Math.max(sw, sh));
      const out = document.createElement('canvas');
      out.width = Math.round(sw * k); out.height = Math.round(sh * k);
      const g = out.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(src, sx, sy, sw, sh, 0, 0, out.width, out.height);
      result = out.toDataURL('image/jpeg', 0.86);
      m.close();
    };
    show();
    requestAnimationFrame(layout);
  });
}
