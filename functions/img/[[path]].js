import { getAuth, ensureDb, familyIsPublic } from '../_lib.js';

// Serves images from R2 at /img/<photo-id>/<display|thumb>
// Every request is authorized against the photo's privacy settings —
// there are no public bucket URLs to leak.
export async function onRequest({ request, env, params }) {
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  await ensureDb(env);

  const [id, size] = params.path || [];
  if (!id || !['display', 'thumb'].includes(size)) return new Response('Not found', { status: 404 });

  const photo = await env.DB.prepare('SELECT genre, is_public FROM photos WHERE id = ?').bind(id).first();
  if (!photo) return new Response('Not found', { status: 404 });

  const auth = await getAuth(request, env);
  let allowed;
  if (auth.admin) {
    allowed = true;
  } else if (!photo.is_public) {
    allowed = false; // private photos are admin-only
  } else if (photo.genre === 'family') {
    allowed = auth.family || (await familyIsPublic(env));
  } else {
    allowed = true;
  }
  if (!allowed) return new Response('Unauthorized', { status: 401 });

  const object = await env.PHOTOS.get(`photos/${id}/${size}.jpg`);
  if (!object) return new Response('Not found', { status: 404 });

  const restricted = !photo.is_public || photo.genre === 'family';
  return new Response(object.body, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': restricted ? 'private, no-store' : 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
