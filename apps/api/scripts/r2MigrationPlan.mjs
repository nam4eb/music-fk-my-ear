/** Pure helpers; no cloud calls. */
export const SAFE_OBJECT_KEY = /^users\/[0-9a-f-]+\/(tracks|covers)\/[0-9a-f-]+\.(mp3|m4a|aac|wav|flac|ogg|opus|webm|png|jpg|jpeg|webp)$/;
export function validateObjectKey(key) {
  if (typeof key !== 'string' || !SAFE_OBJECT_KEY.test(key)) throw new Error('Unsafe storage key in database');
  return key;
}
export function parseMigrationArgs(args) {
  const parsed = { apply: false, confirm: false, verifyDownload: false, limit: Infinity };
  for (const a of args) {
    if (a === '--apply') parsed.apply = true;
    else if (a === '--confirm') parsed.confirm = true;
    else if (a === '--verify-download') parsed.verifyDownload = true;
    else if (/^--limit=\d+$/.test(a)) parsed.limit = Number(a.slice(8));
    else throw new Error(`Unknown flag: ${a}`);
  }
  if (!Number.isSafeInteger(parsed.limit) && parsed.limit !== Infinity) throw new Error('Invalid limit');
  if (parsed.limit < 1) throw new Error('Use --limit=1 or greater');
  if (parsed.apply && !parsed.confirm) throw new Error('Apply needs --confirm; default mode is read-only');
  return parsed;
}
export function coverMime(key) {
  return key.endsWith('.png') ? 'image/png' : key.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
}
export function compareRemote(head, size, sha256) {
  return Number(head?.ContentLength) === size && head?.Metadata?.sha256 === sha256;
}
