// Shared behavior: genre labels, footer year + image save deterrents.

// slug → { label: short name for tiles/nav, title: full gallery heading }
window.GENRE_META = {
  landscape: { label: 'Landscape' },
  cityscape: { label: 'Cityscape' },
  macro: { label: 'Macro' },
  wildlife: { label: 'Wildlife' },
  street: { label: 'Street', title: 'Street Photography' },
  'fine-art': { label: 'Fine Art' },
  favourites: { label: 'My Favourites', title: 'My Personal Favourites' },
  family: { label: 'Family' },
};

document.getElementById('year')?.append(new Date().getFullYear());

// Deter casual saving: block context menu and dragging on photos.
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('img, .photo-card, .lightbox')) e.preventDefault();
});
document.addEventListener('dragstart', (e) => {
  if (e.target.closest('img')) e.preventDefault();
});
