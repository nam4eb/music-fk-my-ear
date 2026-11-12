import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackTitle, suggestTags, daypart, dailyMix, computeInsights, formatTime } from '../src/index.ts';
const t = (id, moods = []) => ({ id, title: id, artist: 'Artist', album: '', genre: 'Pop', language: 'vi', moods, duration_seconds: 210, size_bytes: 10, mime_type: 'audio/mpeg', year: null, is_favorite: false, cover_key: null, created_at: '2026-11-01T00:00:00Z' });
test('filename parser preserves hyphenated titles', () => assert.deepEqual(fallbackTitle('Singer - Best-Song.mp3'), { artist: 'Singer', title: 'Best-Song' }));
test('genre suggestion is conservative', () => assert.deepEqual(suggestTags('Chill Lofi Mix.mp3'), { genre: 'Lo-fi', language: 'unknown', moods: ['chill'] }));
test('morning daypart', () => assert.equal(daypart(new Date('2026-11-12T08:00:00')), 'morning'));
test('dailyMix prioritizes preferred morning mood', () => assert.equal(dailyMix([t('a', ['sleep']), t('b', ['energy'])], [], new Date('2026-11-12T08:00:00'), 2)[0].id, 'b'));
test('dailyMix favors completed music over repeatedly skipped', () => {
  const now = new Date('2026-11-12T08:00:00Z');
  const e = ['complete', 'complete', 'skip', 'skip', 'skip'].map((event_type, i) => ({ track_id: i < 2 ? 'good' : 'bad', event_type, listened_seconds: 0, created_at: '2026-11-11T08:00:00Z' }));
  assert.equal(dailyMix([t('bad'), t('good')], e, now, 2)[0].id, 'good');
});
test('history insights measure completed/pause listening time', () => {
  const es = [{ track_id: 'x', event_type: 'play', listened_seconds: 0, created_at: '2026-11-12T08:00:00Z' }, { track_id: 'x', event_type: 'complete', listened_seconds: 130, created_at: '2026-11-12T08:03:00Z' }];
  assert.deepEqual(computeInsights([t('x')], es, new Date('2026-11-12T09:00:00Z')), { plays: 1, minutes: 2, favoriteGenre: 'Pop', favoriteLanguage: 'vi' });
});
test('formats duration safely', () => assert.equal(formatTime(125), '2:05'));
