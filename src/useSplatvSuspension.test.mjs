import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Deterministic hook harness: execute the production playback body, with a
// controllable RAF clock and React hook lifecycle (no real-time sleeps).
function harness(enabled = true) {
  const slots = [], effects = [], rafs = new Map(), writes = [];
  let index = 0, now = 0, nextId = 0, api;
  const context = {
    useRef(value) { const i = index++; return slots[i] ??= { current: value }; },
    useState(value) { const i = index++; if (!(i in slots)) slots[i] = typeof value === 'function' ? value() : value;
      return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useEffect(fn, deps) { const i = index++, old = slots[i];
      if (!old || deps.some((v, j) => !Object.is(v, old.deps[j]))) {
        effects.push(() => { old?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; });
      }
    },
    localStorage: { getItem: () => null, setItem: (key, value) => writes.push({ key, value: JSON.parse(value) }) },
    window: { addEventListener() {}, removeEventListener() {} },
    document: { addEventListener() {}, removeEventListener() {} },
    performance: { now: () => now },
    requestAnimationFrame: fn => { const id = ++nextId; rafs.set(id, fn); return id; },
    cancelAnimationFrame: id => rafs.delete(id),
    setTimeout: () => ++nextId, clearTimeout() {},
  };
  const source = readFileSync(new URL('./useSplatvPlayback.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]*\n/, '').replaceAll('export ', '');
  vm.createContext(context);
  vm.runInContext(source + '\nthis.makePlayback = useSplatvPlayback;', context);
  const render = () => { index = 0; api = context.makePlayback(8, enabled, true); while (effects.length) effects.shift()(); return api; };
  render();
  return { get api() { return api; }, rafs, writes,
    suspend(value) { api.setSuspended(value); render(); },
    step(ms) { now += ms; const callbacks = [...rafs.values()]; rafs.clear(); callbacks.forEach(fn => fn(now)); },
  };
}

test('inactive starts with no RAF or storage write; resume preserves phase across a long suspension', () => {
  const h = harness();
  assert.equal(h.rafs.size, 0); assert.equal(h.writes.length, 0);
  h.step(10000); assert.equal(h.api.timeRef.current, .5);
  h.suspend(false); h.step(1000); assert.equal(h.api.timeRef.current, .75);
  h.suspend(true); assert.equal(h.rafs.size, 0);
  assert.equal(h.writes.at(-1).value.mode, 'auto');
  assert.equal(h.writes.at(-1).value.time, .75);
  h.step(60000); assert.equal(h.api.timeRef.current, .75);
  h.suspend(false); h.step(100); assert.equal(h.api.timeRef.current, .775);
});

test('manual remains manual across pause/resume; explicit resume restores auto', () => {
  const h = harness(); h.suspend(false); h.api.adjust(-.2);
  assert.equal(h.api.timeRef.current, .3);
  h.suspend(true); h.step(10000); h.suspend(false); h.step(1000);
  assert.equal(h.api.timeRef.current, .3);
  h.api.resume({ preventDefault() {} }); h.step(1000);
  assert.equal(h.api.timeRef.current, .55);
});

test('static PLY never runs playback or writes its preference', () => {
  const h = harness(false); h.suspend(false); h.step(10000); h.suspend(true);
  assert.equal(h.rafs.size, 0); assert.equal(h.writes.length, 0);
});
