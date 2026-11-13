import test from 'node:test';
import assert from 'node:assert/strict';
import { ownerDenial } from '../src/ownerPolicy.ts';
const owner = { email: 'owner@example.com', sub: 'google-sub-123' };
test('empty database: only configured email can create owner', () => {
  assert.equal(ownerDenial(owner, 'owner@example.com', null), null);
  assert.equal(ownerDenial(owner, 'stranger@example.com', null), 'unapproved-email');
});
test('legacy owner can link Google with same verified email', () => {
  assert.equal(ownerDenial(owner, 'owner@example.com', { email: 'OWNER@example.com', google_sub: null }), null);
});
test('existing library never switches email or Google subject', () => {
  assert.equal(ownerDenial(owner, 'owner@example.com', { email: 'other@example.com', google_sub: null }), 'existing-owner-mismatch');
  assert.equal(ownerDenial(owner, 'owner@example.com', { email: 'owner@example.com', google_sub: 'other-google-sub' }), 'existing-owner-mismatch');
  assert.equal(ownerDenial(owner, 'owner@example.com', { email: 'owner@example.com', google_sub: 'google-sub-123' }), null);
});
