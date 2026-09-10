import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoFeed, nextClipIndex, fitVideo } from '../dist/video-feed.js';

function fixture(t) {
  const context = new Proxy({}, { get: () => () => {} });
  const original = globalThis.document;
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };
  t.after(() => { globalThis.document = original; });
  const video = new EventTarget();
  Object.assign(video, { currentTime: 0, readyState: 0, paused: true, ended: false, seeking: false,
    videoWidth: 640, videoHeight: 360, load() { this.readyState = 0; this.currentTime = 0; },
    pause() { this.paused = true; }, async play() { this.paused = false; }, removeAttribute() {} });
  let now = 0;
  const feed = new VideoFeed({ video, now: () => now });
  feed.clips = ['abcdefghijk', '12345678901'].map(id => ({ id, file: `${id}.mp4`, title: id }));
  const loaded = () => { video.readyState = 4; video.dispatchEvent(new Event('loadeddata')); };
  return { feed, video, loaded, setTime: value => now = value };
}

test('the final local video wraps to the first', () => {
  assert.equal(nextClipIndex(9, 10), 0); assert.equal(nextClipIndex(0, 10), 1);
});
test('wide insect footage stays fully visible and portrait footage fills the phone', () => {
  assert.deepEqual(fitVideo(1920, 1080), [0, 218.75, 360, 202.5]);
  assert.deepEqual(fitVideo(1080, 1920), [0, 0, 360, 640]);
});
test('only fresh decoded playing video can supply neural input', async t => {
  const { feed, video, loaded, setTime } = fixture(t);
  feed.select(0); feed.setPaused(false); assert.equal(feed.observing, false);
  loaded(); await Promise.resolve(); video.currentTime = .1; feed.render(.5);
  assert.equal(feed.observing, true); assert.equal(feed.consumed, 1);
  setTime(2000); assert.equal(feed.observing, false);
  video.currentTime = .2; feed.render(.02); assert.equal(feed.observing, true);
  feed.setPaused(true); assert.equal(video.paused, true); assert.equal(feed.observing, false);
});
test('ended advances the actual media source and manual next preserves pause', async t => {
  const { feed, video, loaded } = fixture(t);
  feed.select(0); feed.setPaused(false); loaded(); await Promise.resolve(); feed.render(.5);
  video.dispatchEvent(new Event('ended')); assert.equal(feed.index, 1); assert.equal(video.src, './media/12345678901.mp4');
  loaded(); await Promise.resolve(); feed.render(.5); feed.setPaused(true);
  assert.equal(feed.next(), true); assert.equal(feed.index, 0); assert.equal(feed.wantsPaused, true);
  assert.equal(feed.next(), false);
});
test('a failed clip stops visual input and can be skipped', async t => {
  const { feed, video, loaded } = fixture(t);
  feed.select(0); feed.setPaused(false); loaded(); await Promise.resolve(); feed.render(.5);
  video.dispatchEvent(new Event('error'));
  assert.equal(feed.observing, false); assert.match(feed.error, /could not be loaded/);
  assert.equal(feed.next(), true); assert.equal(feed.error, '');
});
