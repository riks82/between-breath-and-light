// Home page: build the six genre tiles, each showing its most recent public photo.
const GENRES = ['landscape', 'cityscape', 'macro', 'wildlife', 'travel', 'family'];

async function buildTiles() {
  const grid = document.getElementById('genreGrid');
  const session = await fetch('/api/session').then((r) => r.json()).catch(() => ({}));

  for (const genre of GENRES) {
    const tile = document.createElement('a');
    tile.className = 'genre-tile';
    tile.href = `/gallery.html?genre=${genre}`;

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = genre;

    let locked = false;
    let cover = null;
    try {
      const res = await fetch(`/api/photos?genre=${genre}`);
      if (res.status === 403) {
        locked = true;
      } else if (res.ok) {
        const { photos } = await res.json();
        cover = photos[0] || null;
      }
    } catch { /* tile still renders without a cover */ }

    if (genre === 'family' && (locked || (!session.familyPublic && !session.family))) {
      const lock = document.createElement('span');
      lock.className = 'lock';
      lock.textContent = '\u{1F512}';
      lock.setAttribute('aria-label', 'private');
      label.append(lock);
    }

    if (cover) {
      const img = document.createElement('img');
      img.src = `/img/${cover.id}/thumb`;
      img.alt = `${genre} photography`;
      img.loading = 'lazy';
      tile.append(img);
    } else {
      tile.classList.add('empty');
    }
    tile.append(label);
    grid.append(tile);
  }
}

buildTiles();
