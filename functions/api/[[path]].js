import {
  makeToken, getAuth, sessionCookie, COOKIE_MAX_AGE,
  json, isValidGenre, ensureDb, familyIsPublic,
} from '../_lib.js';

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // per resized image; web sizes are far smaller

export async function onRequest(context) {
  const { request, env, params } = context;
  await ensureDb(env);
  const path = (params.path || []).join('/');
  const method = request.method;

  try {
    if (path === 'login' && method === 'POST') return login(request, env);
    if (path === 'logout' && method === 'POST') return logout();
    if (path === 'session' && method === 'GET') return session(request, env);
    if (path === 'photos' && method === 'GET') return listPhotos(request, env);
    if (path === 'photos' && method === 'POST') return uploadPhoto(request, env);
    if (path.startsWith('photos/') && method === 'PATCH') return updatePhoto(request, env, path.slice(7));
    if (path.startsWith('photos/') && method === 'DELETE') return deletePhoto(request, env, path.slice(7));
    if (path === 'settings' && method === 'GET') return getSettings(request, env);
    if (path === 'settings' && method === 'POST') return updateSettings(request, env);
    return json({ error: 'Not found' }, 404);
  } catch (err) {
    console.error('API error:', err.stack || err.message);
    return json({ error: 'Server error' }, 500);
  }
}

async function login(request, env) {
  const { role, password } = await request.json().catch(() => ({}));
  if (role !== 'admin' && role !== 'family') return json({ error: 'Invalid role' }, 400);
  const expected = role === 'admin' ? env.ADMIN_PASSWORD : env.FAMILY_PASSWORD;
  if (!expected || !password || password !== expected) {
    return json({ error: 'Incorrect password' }, 401);
  }
  const token = await makeToken(env, role);
  return json({ ok: true, role }, 200, {
    'Set-Cookie': sessionCookie(role === 'admin' ? 'bbl_admin' : 'bbl_family', token, COOKIE_MAX_AGE),
  });
}

function logout() {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  headers.append('Set-Cookie', sessionCookie('bbl_admin', '', 0));
  headers.append('Set-Cookie', sessionCookie('bbl_family', '', 0));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

async function session(request, env) {
  const auth = await getAuth(request, env);
  return json({ admin: auth.admin, family: auth.family, familyPublic: await familyIsPublic(env) });
}

async function listPhotos(request, env) {
  const auth = await getAuth(request, env);
  const genre = new URL(request.url).searchParams.get('genre');
  if (genre && !isValidGenre(genre)) return json({ error: 'Unknown genre' }, 400);

  if (genre === 'family' && !auth.family && !(await familyIsPublic(env))) {
    return json({ locked: true, photos: [] }, 403);
  }

  let query, binds;
  if (auth.admin) {
    query = genre ? 'SELECT * FROM photos WHERE genre = ? ORDER BY created_at DESC' : 'SELECT * FROM photos ORDER BY created_at DESC';
    binds = genre ? [genre] : [];
  } else {
    query = genre ? 'SELECT * FROM photos WHERE genre = ? AND is_public = 1 ORDER BY created_at DESC' : 'SELECT * FROM photos WHERE is_public = 1 ORDER BY created_at DESC';
    binds = genre ? [genre] : [];
  }
  let { results } = await env.DB.prepare(query).bind(...binds).all();

  // Non-admins never see family photos in cross-genre listings unless unlocked/public.
  if (!auth.admin && !genre && !auth.family && !(await familyIsPublic(env))) {
    results = results.filter((p) => p.genre !== 'family');
  }
  return json({ photos: results });
}

async function requireAdmin(request, env) {
  const auth = await getAuth(request, env);
  return auth.admin ? null : json({ error: 'Unauthorized' }, 401);
}

async function uploadPhoto(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  const form = await request.formData();
  const display = form.get('display');
  const thumb = form.get('thumb');
  const genre = form.get('genre');
  const title = (form.get('title') || '').toString().slice(0, 200);
  const isPublic = form.get('is_public') === '1' ? 1 : 0;
  const width = Number(form.get('width')) || 0;
  const height = Number(form.get('height')) || 0;

  if (!isValidGenre(genre)) return json({ error: 'Unknown genre' }, 400);
  if (!(display instanceof File) || !(thumb instanceof File)) return json({ error: 'Missing image data' }, 400);
  if (display.size > MAX_UPLOAD_BYTES || thumb.size > MAX_UPLOAD_BYTES) return json({ error: 'Image too large' }, 413);

  const id = crypto.randomUUID();
  await env.PHOTOS.put(`photos/${id}/display.jpg`, display.stream(), {
    httpMetadata: { contentType: 'image/jpeg' },
  });
  await env.PHOTOS.put(`photos/${id}/thumb.jpg`, thumb.stream(), {
    httpMetadata: { contentType: 'image/jpeg' },
  });
  await env.DB.prepare(
    'INSERT INTO photos (id, genre, title, is_public, width, height, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(id, genre, title, isPublic, width, height, Date.now()).run();

  return json({ ok: true, id });
}

async function updatePhoto(request, env, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const photo = await env.DB.prepare('SELECT * FROM photos WHERE id = ?').bind(id).first();
  if (!photo) return json({ error: 'Not found' }, 404);

  const genre = body.genre !== undefined ? body.genre : photo.genre;
  if (!isValidGenre(genre)) return json({ error: 'Unknown genre' }, 400);
  const title = body.title !== undefined ? String(body.title).slice(0, 200) : photo.title;
  const isPublic = body.is_public !== undefined ? (body.is_public ? 1 : 0) : photo.is_public;

  await env.DB.prepare('UPDATE photos SET genre = ?, title = ?, is_public = ? WHERE id = ?')
    .bind(genre, title, isPublic, id).run();
  return json({ ok: true });
}

async function deletePhoto(request, env, id) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  const photo = await env.DB.prepare('SELECT id FROM photos WHERE id = ?').bind(id).first();
  if (!photo) return json({ error: 'Not found' }, 404);

  await env.PHOTOS.delete([`photos/${id}/display.jpg`, `photos/${id}/thumb.jpg`]);
  await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

async function getSettings(request, env) {
  return json({ family_public: await familyIsPublic(env) });
}

async function updateSettings(request, env) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  if (typeof body.family_public !== 'boolean') return json({ error: 'family_public must be boolean' }, 400);
  await env.DB.prepare(`UPDATE settings SET value = ? WHERE key = 'family_public'`)
    .bind(body.family_public ? '1' : '0').run();
  return json({ ok: true });
}
