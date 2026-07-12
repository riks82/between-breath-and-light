# Between Breath & Light

A free, minimalist photography portfolio — black background, gold lettering, cyan highlights.
Genres: landscape, cityscape, macro, wildlife, travel, and a family gallery that can be made
private behind a shared password. Every photo has its own public/private toggle.

Built for **Cloudflare Pages** (free) with **R2** (photo storage, 10 GB free) and **D1**
(photo metadata database, free tier).

## How privacy works

- **Family gallery toggle** (admin panel): when private, visitors see a lock and must enter
  the family password you share with relatives. When public, anyone can view it.
- **Per-photo toggle**: a *private* photo (any genre) is visible only to you when signed in
  as admin. Photos are only ever served through an access-checked endpoint — there are no
  public storage URLs to leak.
- **Uploads**: photos are resized in your browser (~2048 px display + thumbnail, sharp
  stepped downscaling) before upload. Originals never leave your computer and all EXIF/GPS
  metadata is stripped automatically. The display version gets a thin white matte border
  and a handwritten "Rishi Sarangi" signature baked into the bottom-right corner
  (thumbnails stay clean since gallery tiles crop them).
- Right-click and drag-saving of images is blocked (a deterrent, not absolute protection).

## Run locally

```bash
npm install
npm run dev          # http://localhost:8788
```

Local passwords live in `.dev.vars` (admin: `dev-admin`, family: `dev-family`).
Local data is simulated on disk under `.wrangler/` — nothing touches the cloud.

## Deploy to Cloudflare (one-time setup, ~10 minutes)

1. Create a free account at https://dash.cloudflare.com (no credit card needed).
2. Sign in from the terminal:
   ```bash
   npx wrangler login
   ```
3. Create the storage bucket and database:
   ```bash
   npx wrangler r2 bucket create bbl-photos
   npx wrangler d1 create bbl-photos
   ```
   The second command prints a `database_id` — paste it into `wrangler.toml`
   (replacing the placeholder zeros). The database tables create themselves on first use.
4. Deploy:
   ```bash
   npm run deploy
   ```
5. Set your real passwords (Cloudflare dashboard → Workers & Pages →
   between-breath-and-light → Settings → Variables and Secrets → **Add** → type *Secret*):
   - `ADMIN_PASSWORD` — a long password only you know
   - `FAMILY_PASSWORD` — the password you share with family
   - `SESSION_SECRET` — any long random string (run `openssl rand -hex 32` to make one)

   Then redeploy once (`npm run deploy`) so the secrets take effect.

Your site will be live at `https://between-breath-and-light.pages.dev`.
Manage photos at `/admin.html`. You can attach a custom domain later in the
Pages project settings for free.

## Updating the site

Edit the files in `public/`, then `npm run deploy`. Photos are managed entirely
through the admin panel — no redeploy needed for new photos.
