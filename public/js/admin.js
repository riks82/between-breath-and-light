// Admin panel: login, client-side resize + upload, and photo management.

const loginPanel = document.getElementById('loginPanel');
const dashboard = document.getElementById('dashboard');

async function api(path, options = {}) {
  const res = await fetch(`/api/${path}`, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function init() {
  const session = await api('session');
  if (session.admin) {
    loginPanel.hidden = true;
    dashboard.hidden = false;
    document.getElementById('familyPublicToggle').checked = session.familyPublic;
    loadPhotos();
  } else {
    loginPanel.hidden = false;
    dashboard.hidden = true;
  }
}

// ---- login / logout ----
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  try {
    await api('login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin', password: document.getElementById('loginPassword').value }),
    });
    init();
  } catch {
    errEl.textContent = 'Incorrect password.';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('logout', { method: 'POST' });
  init();
});

// ---- family folder visibility ----
document.getElementById('familyPublicToggle').addEventListener('change', async (e) => {
  try {
    await api('settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family_public: e.target.checked }),
    });
  } catch (err) {
    alert(err.message);
    e.target.checked = !e.target.checked;
  }
});

// ---- resize ----
// Stepped downscale (halving) keeps fine detail crisp, then a final draw to
// the exact target. Re-encoding also strips all EXIF/GPS metadata.
async function resizeImage(file, maxEdge, quality, opts = {}) {
  let bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const targetW = Math.max(1, Math.round(bmp.width * scale));
  const targetH = Math.max(1, Math.round(bmp.height * scale));

  while (bmp.width / 2 >= targetW && bmp.height / 2 >= targetH) {
    const half = new OffscreenCanvas(Math.round(bmp.width / 2), Math.round(bmp.height / 2));
    const hctx = half.getContext('2d');
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(bmp, 0, 0, half.width, half.height);
    bmp.close?.();
    bmp = await createImageBitmap(half);
  }

  // Final composite on a regular canvas (has access to document fonts for the
  // signature). Display versions get a thin white matte + handwritten signature.
  const matte = opts.matte ? Math.max(8, Math.round(Math.max(targetW, targetH) * 0.012)) : 0;
  const canvas = document.createElement('canvas');
  canvas.width = targetW + matte * 2;
  canvas.height = targetH + matte * 2;
  const ctx = canvas.getContext('2d');
  if (matte) {
    ctx.fillStyle = '#f6f4ee';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, matte, matte, targetW, targetH);
  bmp.close?.();

  if (opts.signature) {
    const size = Math.max(24, Math.round(Math.max(targetW, targetH) * 0.032));
    ctx.font = `${size}px "Great Vibes", cursive`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = Math.round(size / 5);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(opts.signature, matte + targetW - Math.round(size * 0.7), matte + targetH - Math.round(size * 0.35));
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  return { blob, width: canvas.width, height: canvas.height };
}

// ---- upload ----
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const progressList = document.getElementById('progressList');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
  fileInput.value = '';
});

const SIGNATURE = 'Rishi Sarangi';

async function handleFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith('image/'));
  const genre = document.getElementById('uploadGenre').value;
  const isPublic = document.getElementById('uploadPublic').checked ? '1' : '0';

  // make sure the handwriting font is ready before signing photos
  await document.fonts.load('32px "Great Vibes"').catch(() => {});

  for (const file of files) {
    const line = document.createElement('div');
    line.textContent = `${file.name} — resizing…`;
    progressList.append(line);
    try {
      const display = await resizeImage(file, 2048, 0.85, { matte: true, signature: SIGNATURE });
      const thumb = await resizeImage(file, 640, 0.8);

      line.textContent = `${file.name} — uploading…`;
      const form = new FormData();
      form.append('display', display.blob, 'display.jpg');
      form.append('thumb', thumb.blob, 'thumb.jpg');
      form.append('genre', genre);
      form.append('title', file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
      form.append('is_public', isPublic);
      form.append('width', display.width);
      form.append('height', display.height);
      await api('photos', { method: 'POST', body: form });

      line.textContent = `${file.name} — done (${Math.round(display.blob.size / 1024)} KB)`;
      line.className = 'done';
    } catch (err) {
      line.textContent = `${file.name} — failed: ${err.message}`;
      line.className = 'fail';
    }
  }
  loadPhotos();
}

// ---- manage ----
const adminGrid = document.getElementById('adminGrid');
const GENRES = ['landscape', 'cityscape', 'macro', 'wildlife', 'travel', 'family'];

document.getElementById('filterGenre').addEventListener('change', loadPhotos);

async function loadPhotos() {
  const filter = document.getElementById('filterGenre').value;
  const { photos } = await api(`photos${filter ? `?genre=${filter}` : ''}`);
  adminGrid.innerHTML = '';
  document.getElementById('adminEmpty').hidden = photos.length > 0;

  for (const photo of photos) {
    const card = document.createElement('div');
    card.className = 'admin-card';

    const img = document.createElement('img');
    img.src = `/img/${photo.id}/thumb`;
    img.alt = photo.title;
    img.loading = 'lazy';

    const meta = document.createElement('div');
    meta.className = 'meta';

    const row1 = document.createElement('div');
    row1.className = 'row';
    const pill = document.createElement('button');
    pill.className = `pill ${photo.is_public ? 'public' : 'private'}`;
    pill.style.cursor = 'pointer';
    pill.style.background = 'none';
    pill.textContent = photo.is_public ? 'public' : 'private';
    pill.title = 'Click to toggle visibility';
    pill.addEventListener('click', async () => {
      await api(`photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !photo.is_public }),
      });
      loadPhotos();
    });
    const del = document.createElement('button');
    del.className = 'btn small danger';
    del.textContent = 'Delete';
    del.addEventListener('click', async () => {
      if (!confirm('Delete this photo permanently?')) return;
      await api(`photos/${photo.id}`, { method: 'DELETE' });
      loadPhotos();
    });
    row1.append(pill, del);

    const genreSel = document.createElement('select');
    for (const g of GENRES) {
      const opt = new Option(g, g, false, g === photo.genre);
      genreSel.append(opt);
    }
    genreSel.addEventListener('change', async () => {
      await api(`photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ genre: genreSel.value }),
      });
    });

    meta.append(row1, genreSel);
    card.append(img, meta);
    adminGrid.append(card);
  }
}

init();
