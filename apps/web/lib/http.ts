export const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(/\/$/, '');
const TOKEN_KEY = 'vibebox-v2-token';
export function getToken() { return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_KEY) : null; }
export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export async function api<T>(route: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (typeof init.body === 'string') headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_URL}${route}`, { ...init, headers, cache: 'no-store' });
  let data: { error?: string } & Record<string, unknown> = {};
  try { data = await response.json(); } catch { /* empty response */ }
  if (!response.ok) throw new HttpError(response.status, String(data.error || `HTTP ${response.status}`));
  return data as T;
}
export function json(body: object, method: 'POST' | 'PATCH' | 'PUT' = 'POST'): RequestInit {
  return { method, body: JSON.stringify(body) };
}
export function sendSignedFile(url: string, file: File, mime: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mime);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round(e.loaded / e.total * 100)); };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Storage upload failed (HTTP ${xhr.status}). Check R2 CORS and permissions.`));
    xhr.onerror = () => reject(new Error('Storage upload interrupted. Check R2 CORS/network.'));
    xhr.send(file);
  });
}
export type AppConfig = { needsSetup: boolean; googleClientId: string; maxUploadMB: number; storageDriver: 'local' | 'r2' };
export type AuthResult = { token: string; user: { id: string; email: string } };
