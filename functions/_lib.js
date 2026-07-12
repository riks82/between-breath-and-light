// Shared helpers: session cookies (HMAC-signed), DB bootstrap, JSON responses.

const GENRES = ['landscape', 'cityscape', 'macro', 'wildlife', 'street', 'fine-art', 'favourites', 'family'];
const SESSION_DAYS = 7;

const enc = new TextEncoder();

async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function sign(secret, payload) {
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export async function makeToken(env, role) {
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const payload = `${role}.${exp}`;
  return `${payload}.${await sign(env.SESSION_SECRET, payload)}`;
}

async function verifyToken(env, token, role) {
  if (!token) return false;
  const [r, exp, sig] = token.split('.');
  if (r !== role || !exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = await sign(env.SESSION_SECRET, `${r}.${exp}`);
  // constant-time compare
  if (sig.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function getCookie(request, name) {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export async function getAuth(request, env) {
  const [admin, family] = await Promise.all([
    verifyToken(env, getCookie(request, 'bbl_admin'), 'admin'),
    verifyToken(env, getCookie(request, 'bbl_family'), 'family'),
  ]);
  return { admin, family: family || admin };
}

export function sessionCookie(name, token, maxAgeSeconds) {
  return `${name}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

export const COOKIE_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers },
  });
}

export function isValidGenre(genre) {
  return GENRES.includes(genre);
}

let dbReady = false;
export async function ensureDb(env) {
  if (dbReady) return;
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      genre TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      is_public INTEGER NOT NULL DEFAULT 1,
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`),
    env.DB.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('family_public', '0')`),
  ]);
  dbReady = true;
}

export async function familyIsPublic(env) {
  const row = await env.DB.prepare(`SELECT value FROM settings WHERE key = 'family_public'`).first();
  return row?.value === '1';
}
