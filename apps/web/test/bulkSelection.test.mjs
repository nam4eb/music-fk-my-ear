import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleTrackSelection, toggleVisibleSelection, chunkTrackIds } from '../lib/bulkSelection.ts';

test('individual selection adds and removes exactly one track', () => {
  assert.deepEqual(toggleTrackSelection(['a'], 'b'), ['a','b']);
  assert.deepEqual(toggleTrackSelection(['a','b'], 'a'), ['b']);
});

test('select all filtered tracks does not keep invisible selection', () => {
  assert.deepEqual(toggleVisibleSelection(['hidden'], ['visible-1','visible-2']), ['visible-1','visible-2']);
});

test('select all a second time clears the selection and removes duplicate IDs', () => {
  assert.deepEqual(toggleVisibleSelection([], ['one','one','two']), ['one','two']);
  assert.deepEqual(toggleVisibleSelection(['one','two'], ['one','two']), []);
});

test('bulk chunks bound each request and preserve ordering', () => {
  const ids = Array.from({length:765},(_,i)=>`id-${i}`);
  const chunks = chunkTrackIds(ids,100);
  assert.equal(chunks.length,8);
  assert.ok(chunks.every(chunk=>chunk.length<=100));
  assert.deepEqual(chunks.flat(),ids);
});

test('batching handles empty arrays and rejects unsafe sizes', () => {
  assert.deepEqual(chunkTrackIds([],100),[]);
  assert.throws(()=>chunkTrackIds(['x'],0),/Invalid batch size/);
});
