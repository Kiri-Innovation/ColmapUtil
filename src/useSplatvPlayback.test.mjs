import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePlayback, playbackPeriod } from './useSplatvPlayback.js';

test('period defaults and bounds', () => {
  for (const invalid of [null, '', 'bad', 0, 1, 121]) assert.equal(playbackPeriod(invalid), 8);
  assert.equal(playbackPeriod('10'), 10);
});
test('a full cycle returns to the same time, including endpoints', () => {
  for (const value of [0, .2, .5, 1]) for (const direction of [-1, 1]) {
    assert.ok(Math.abs(advancePlayback(value, direction, 8, 8).value - value) < 1e-12);
  }
});
test('reflects at both ends and resumes without a discontinuity', () => {
  assert.ok(Math.abs(advancePlayback(.9, 1, 1, 8).value - .85) < 1e-12);
  assert.equal(advancePlayback(.9, 1, 1, 8).direction, -1);
  assert.ok(Math.abs(advancePlayback(.1, -1, 1, 8).value - .15) < 1e-12);
  assert.equal(advancePlayback(.1, -1, 1, 8).direction, 1);
  assert.ok(Math.abs(advancePlayback(.4, -1, 0, 8).value - .4) < 1e-12);
});
