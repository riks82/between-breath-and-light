// Shared behavior: footer year + image save deterrents.
document.getElementById('year')?.append(new Date().getFullYear());

// Deter casual saving: block context menu and dragging on photos.
document.addEventListener('contextmenu', (e) => {
  if (e.target.closest('img, .photo-card, .lightbox')) e.preventDefault();
});
document.addEventListener('dragstart', (e) => {
  if (e.target.closest('img')) e.preventDefault();
});
