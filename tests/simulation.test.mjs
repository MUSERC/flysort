import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayback, clips } from '../dist/simulation.js';
import { BrainClient } from '../dist/backend.js';

const advance = (sim, seconds) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) sim.tick(1 / 60); };
test('presentation waits for the backend and never invents neural telemetry', () => {
  const sim = createPlayback(); advance(sim, 10);
  assert.equal(sim.state.time, 0); assert.equal(sim.state.pam11Hz, 0);
  assert.equal('dopamine' in sim.state, false); assert.equal('attention' in sim.state, false);
  sim.setPaused(false); advance(sim, 2); assert.ok(sim.state.time > 1);
  assert.equal(sim.state.pam11Hz, 0);
});
test('autoplay cycles shorts and pause freezes the exposure clock', () => {
  const observed = [], sim = createPlayback({ onNext: i => observed.push(i) }); sim.setPaused(false);
  advance(sim, clips.reduce((sum, clip) => sum + clip.duration, 0) + 1);
  assert.deepEqual(observed, [1, 2, 3, 4, 0]); assert.equal(sim.state.consumed, 6);
  sim.setPaused(true); const time = sim.state.time; advance(sim, 3); assert.equal(sim.state.time, time);
});
test('manual swipes debounce without resuming a paused brain', () => {
  const sim = createPlayback(); assert.equal(sim.next(), true); assert.equal(sim.next(), false);
  advance(sim, 1); assert.equal(sim.state.swipe, 1); assert.equal(sim.next(), true); assert.equal(sim.state.paused, true);
});
test('invalid presentation steps fail intentionally', () => {
  const sim = createPlayback({ reducedMotion: true }); assert.equal(sim.state.paused, true);
  assert.throws(() => sim.tick(NaN), TypeError); assert.throws(() => sim.tick(-1), TypeError); assert.throws(() => sim.setPaused('yes'), TypeError);
});
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
test('bridge transmits the captured bytes and publishes only server measurements', async () => {
  const bytes = new Uint8Array(90 * 160 * 4).fill(73), calls = [], seen = [];
  const measured = { phase: 'ready', paused: false, busy: false, telemetry: { pam11_hz: 17.5 } };
  const client = new BrainClient({ captureFrame: () => bytes, onStatus: s => seen.push(s), onError: e => { throw e; }, fetcher: async (path, options) => {
    calls.push([path, options]);
    return json(path === '/api/session' ? { token: 'unit-test-token' } : path === '/api/status' ? measured : { accepted: true });
  } });
  client.stopped = false; await client.poll(); client.stop();
  assert.deepEqual(seen, [measured]); const frame = calls.find(([path]) => path === '/api/frame');
  assert.equal(frame[1].body, bytes); assert.equal(frame[1].headers['X-Fly-Token'], 'unit-test-token');
});
test('disconnect clears measured status and cannot advance or inject a fake brain', async () => {
  let error, captures = 0;
  const client = new BrainClient({ captureFrame: () => captures++, onStatus: () => assert.fail('No measurements expected'), onError: e => error = e, fetcher: async () => { throw new Error('offline'); } });
  client.stopped = false; await client.poll(); client.stop();
  assert.equal(client.status, null); assert.equal(captures, 0); assert.equal(error.message, 'offline');
  await assert.rejects(client.action('stimulate'), /not connected/);
  await assert.rejects(client.action('fabricate'), TypeError);
});
