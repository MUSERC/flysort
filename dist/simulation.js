export const clips = [
  { category: 'ODDLY SATISFYING', user: '@loop.department', caption: 'your brain needed this', tag: '#satisfying #perfectloop', likes: '128.4K', duration: 12 },
  { category: 'ZERO ATTENTION SPAN', user: '@subway.specimen', caption: 'bro has nowhere to be', tag: '#runner #brainrot', likes: '892.1K', duration: 14 },
  { category: 'FORBIDDEN KNOWLEDGE', user: '@orb.enjoyer', caption: 'wait for the drop', tag: '#oddlysatisfying #orbs', likes: '241.7K', duration: 11 },
  { category: 'PEAK BRAINROT', user: '@fruit.thoughts', caption: 'pov: you are the fruit', tag: '#fruitcore #literallyme', likes: '1.2M', duration: 13 },
  { category: 'ONE MORE LOOP', user: '@infinite.geometry', caption: 'you have been here before', tag: '#hypnotic #infinite', likes: '67.3K', duration: 10 },
];

// Presentation clock only. All neural measurements come from the local backend.
export function createPlayback({ reducedMotion = false, onNext = () => {} } = {}) {
  const state = { time: 0, clipElapsed: 0, clipIndex: 0, swipe: 1, swipeElapsed: 1, paused: true, consumed: 1, pam11Hz: 0, motorHz: 0, turnHz: 0 };
  function next() {
    if (state.swipeElapsed < .62) return false;
    const index = (state.clipIndex + 1) % clips.length;
    onNext(index); state.clipIndex = index; state.clipElapsed = 0; state.consumed++; state.swipeElapsed = 0; state.swipe = reducedMotion ? 1 : 0;
    return true;
  }
  function tick(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new TypeError('Time step must be a finite nonnegative number.');
    dt = Math.min(dt, .1); state.swipeElapsed += dt;
    const p = Math.min(1, state.swipeElapsed / .62); state.swipe = reducedMotion ? 1 : p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
    if (state.paused) return state;
    state.time += dt; state.clipElapsed += dt;
    if (state.clipElapsed >= clips[state.clipIndex].duration) next();
    return state;
  }
  function setPaused(value) { if (typeof value !== 'boolean') throw new TypeError('paused must be a boolean'); state.paused = value; return state.paused; }
  return { state, next, tick, setPaused };
}
