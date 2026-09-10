import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, clips } from '../dist/simulation.js';

const advance = (sim, seconds) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) sim.tick(1 / 60); };
test('autoplay advances and loops through every short without unbounded telemetry', () => {
  const observed = [];
  const sim = createSimulation({ onNext: i => observed.push(i) });
  advance(sim, clips.reduce((sum, clip) => sum + clip.duration, 0) + 1);
  assert.deepEqual(observed, [1, 2, 3, 4, 0]);
  assert.equal(sim.state.consumed, 6);
  assert.ok(sim.state.dopamine > 0 && sim.state.dopamine <= 100);
  assert.ok(sim.state.attention > 0);
});
test('pause freezes exposure, videos, dopamine, and injection; resume restores progress', () => {
  const sim = createSimulation(); advance(sim, 3); sim.setPaused(true);
  const before = { ...sim.state }; advance(sim, 5);
  for (const key of ['time', 'clipElapsed', 'dopamine', 'neural', 'consumed']) assert.equal(sim.state[key], before[key]);
  assert.equal(sim.inject(), false);
  sim.setPaused(false); advance(sim, 1); assert.ok(sim.state.time > before.time);
});
test('manual swipes debounce and can change a frozen feed without resuming it', () => {
  const sim = createSimulation(); sim.setPaused(true);
  assert.equal(sim.next(), true); assert.equal(sim.next(), false);
  advance(sim, 1); assert.equal(sim.state.swipe, 1);
  assert.equal(sim.next(), true); assert.equal(sim.state.clipIndex, 2);
  assert.equal(sim.state.time, 0); assert.equal(sim.state.paused, true);
});
test('reward injection raises activity and decays, including under repeated input', () => {
  const sim = createSimulation(); advance(sim, 1); const baseline = sim.state.dopamine;
  sim.inject(); advance(sim, 1); assert.ok(sim.state.dopamine > baseline + 10);
  for (let i = 0; i < 80; i++) { sim.inject(); sim.tick(.1); }
  assert.ok(sim.state.dopamine <= 100); advance(sim, 9); assert.ok(sim.state.boost < .1);
});
test('reduced motion starts paused and input validation cannot corrupt state', () => {
  const sim = createSimulation({ reducedMotion: true });
  assert.equal(sim.state.paused, true); assert.equal(sim.state.swipe, 1);
  assert.throws(() => sim.tick(NaN), TypeError); assert.throws(() => sim.tick(-1), TypeError);
  assert.throws(() => sim.setPaused('yes'), TypeError); assert.equal(sim.state.time, 0);
});
