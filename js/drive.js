// Armazenamento no Google Drive (um arquivo JSON compartilhado entre o casal).
import { CONFIG } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive';
const API = 'https://www.googleapis.com/drive/v3';
const UP = 'https://www.googleapis.com/upload/drive/v3';
let tokenClient = null;
let token = null; // { access_token, exp }

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = res; s.onerror = () => rej(new Error('Não foi possível carregar o login do Google'));
    document.head.appendChild(s);
  });
}

export const driveConfigured = () => !!CONFIG.GOOGLE_CLIENT_ID;
export const isSignedIn = () => {
  if (!token) { try { token = JSON.parse(sessionStorage.getItem('gtoken') || 'null'); } catch {} }
  return !!token && token.exp > Date.now();
};

export async function signIn(interactive = true) {
  if (!driveConfigured()) throw new Error('Configure o GOOGLE_CLIENT_ID em js/config.js');
  try {
    const saved = JSON.parse(sessionStorage.getItem('gtoken') || 'null');
    if (saved && saved.exp > Date.now() + 60000) { token = saved; return token; }
  } catch {}
  await loadGis();
  return new Promise((resolve, reject) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: r => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        token = { access_token: r.access_token, exp: Date.now() + (r.expires_in - 60) * 1000 };
        sessionStorage.setItem('gtoken', JSON.stringify(token));
        localStorage.setItem('driveConsent', '1');
        resolve(token);
      },
      error_callback: e => reject(new Error(e.message || e.type || 'Login cancelado')),
    });
    tokenClient.requestAccessToken({ prompt: interactive && !localStorage.getItem('driveConsent') ? 'consent' : '' });
  });
}

export function signOut() {
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token.access_token, () => {});
  token = null; sessionStorage.removeItem('gtoken');
}

async function call(url, init = {}) {
  if (!isSignedIn()) await signIn(false);
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token.access_token}`, ...(init.headers || {}) } });
  if (r.status === 401) { token = null; sessionStorage.removeItem('gtoken'); throw new Error('Sessão do Google expirou — entre de novo'); }
  if (!r.ok) throw new Error(`Google Drive: ${r.status} ${await r.text()}`);
  return r;
}

const FIELDS = 'id,name,modifiedTime,version,owners(displayName,emailAddress)';

export async function findFile() {
  const pinned = localStorage.getItem('driveFileId');
  if (pinned) {
    try { return await (await call(`${API}/files/${pinned}?fields=${FIELDS}&supportsAllDrives=true`)).json(); }
    catch { localStorage.removeItem('driveFileId'); }
  }
  const q = encodeURIComponent(`name='${CONFIG.DRIVE_FILE_NAME}' and trashed=false`);
  const r = await (await call(`${API}/files?q=${q}&fields=files(${FIELDS})&orderBy=modifiedTime desc&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
  const f = r.files && r.files[0];
  if (f) localStorage.setItem('driveFileId', f.id);
  return f || null;
}

export function useFileId(idOrLink) {
  const m = String(idOrLink).match(/[-\w]{25,}/);
  if (!m) throw new Error('Link ou ID do arquivo inválido');
  localStorage.setItem('driveFileId', m[0]);
}

export async function meta(id) { return (await call(`${API}/files/${id}?fields=${FIELDS}&supportsAllDrives=true`)).json(); }
export async function download(id) { return (await call(`${API}/files/${id}?alt=media&supportsAllDrives=true`)).json(); }

export async function create(data) {
  const boundary = 'fin' + Math.random().toString(36).slice(2);
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: CONFIG.DRIVE_FILE_NAME, mimeType: 'application/json' })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(data)}\r\n--${boundary}--`;
  const f = await (await call(`${UP}/files?uploadType=multipart&fields=${FIELDS}`, {
    method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
  })).json();
  localStorage.setItem('driveFileId', f.id);
  return f;
}

export async function update(id, data) {
  return (await call(`${UP}/files/${id}?uploadType=media&fields=${FIELDS}&supportsAllDrives=true`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  })).json();
}
