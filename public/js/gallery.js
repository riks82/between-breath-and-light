// Gallery page: fetch photos for the genre, render grid + lightbox,
// and show the family unlock form when the gallery is locked.
const params = new URLSearchParams(location.search);
const genre = params.get('genre') || 'landscape';

const titleEl = document.getElementById('galleryTitle');
const grid = document.getElementById('photoGrid');
const emptyNote = document.getElementById('emptyNote');
const unlockPanel = document.getElementById('unlockPanel');

titleEl.textContent = genre;
document.title = `${genre[0].toUpperCase()}${genre.slice(1)} — Between Breath & Light`;
document.querySelector(`#mainNav a[data-genre="${genre}"]`)?.classList.add('active');

let photos = [];
let lbIndex = 0;

async function load() {
  grid.innerHTML = '';
  emptyNote.hidden = true;
  unlockPanel.hidden = true;

  let res;
  try {
    res = await fetch(`/api/photos?genre=${encodeURIComponent(genre)}`);
  } catch {
    emptyNote.textContent = 'Could not load the gallery. Please try again.';
    emptyNote.hidden = false;
    return;
  }

  if (res.status === 403) {
    unlockPanel.hidden = false;
    return;
  }
  if (res.status === 400) {
    location.replace('/');
    return;
  }

  ({ photos } = await res.json());
  if (!photos.length) {
    emptyNote.hidden = false;
    return;
  }

  // reveal each photograph as it flows into view
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  photos.forEach((photo, i) => {
    const card = document.createElement('figure');
    card.className = 'photo-card';
    const img = document.createElement('img');
    img.src = `/img/${photo.id}/display`;
    img.alt = photo.title || `${genre} photograph`;
    img.loading = i < 2 ? 'eager' : 'lazy';
    card.append(img);
    if (photo.title) {
      const caption = document.createElement('figcaption');
      caption.textContent = photo.title;
      card.append(caption);
    }
    if (!photo.is_public) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'private';
      card.append(badge);
    }
    card.addEventListener('click', () => openLightbox(i));
    grid.append(card);
    observer.observe(card);
  });
}

// ---- family unlock ----
document.getElementById('unlockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('unlockError');
  errEl.textContent = '';
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'family', password: document.getElementById('unlockPassword').value }),
  });
  if (res.ok) {
    load();
  } else {
    errEl.textContent = 'Incorrect password.';
  }
});

// ---- lightbox ----
const lightbox = document.getElementById('lightbox');
const lbImg = lightbox.querySelector('img');
const lbCaption = lightbox.querySelector('.lb-caption');

function openLightbox(i) {
  lbIndex = i;
  showCurrent();
  lightbox.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeLightbox() {
  lightbox.classList.remove('open');
  document.body.style.overflow = '';
}
function showCurrent() {
  const photo = photos[lbIndex];
  lbImg.src = `/img/${photo.id}/display`;
  lbImg.alt = photo.title || `${genre} photograph`;
  lbCaption.textContent = photo.title || '';
}
function step(delta) {
  lbIndex = (lbIndex + delta + photos.length) % photos.length;
  showCurrent();
}

lightbox.querySelector('.lb-close').addEventListener('click', closeLightbox);
lightbox.querySelector('.lb-prev').addEventListener('click', (e) => { e.stopPropagation(); step(-1); });
lightbox.querySelector('.lb-next').addEventListener('click', (e) => { e.stopPropagation(); step(1); });
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
document.addEventListener('keydown', (e) => {
  if (!lightbox.classList.contains('open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
});

load();
