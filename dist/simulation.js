export const clips = [
  { category: 'ODDLY SATISFYING', user: '@loop.department', caption: 'your brain needed this', tag: '#satisfying #perfectloop', likes: '128.4K', duration: 12, thought: '“just one more”', reward: 79 },
  { category: 'ZERO ATTENTION SPAN', user: '@subway.specimen', caption: 'bro has nowhere to be', tag: '#runner #brainrot', likes: '892.1K', duration: 14, thought: '“i could do that”', reward: 85 },
  { category: 'FORBIDDEN KNOWLEDGE', user: '@orb.enjoyer', caption: 'wait for the drop', tag: '#oddlysatisfying #orbs', likes: '241.7K', duration: 11, thought: '“the orb understands me”', reward: 82 },
  { category: 'PEAK BRAINROT', user: '@fruit.thoughts', caption: 'pov: you are the fruit', tag: '#fruitcore #literallyme', likes: '1.2M', duration: 13, thought: '“is that my cousin?”', reward: 92 },
  { category: 'ONE MORE LOOP', user: '@infinite.geometry', caption: 'you have been here before', tag: '#hypnotic #infinite', likes: '67.3K', duration: 10, thought: '“time is a flat scroll”', reward: 87 },
];

export function createSimulation({ reducedMotion = false, onNext = () => {} } = {}) {
  const state = { time: 0, clipElapsed: 0, clipIndex: 0, swipe: 1, swipeElapsed: 1, boost: 0, dopamine: 78.4, neural: 783.8, attention: 1.2, consumed: 1, paused: reducedMotion, injections: 0 };
  function next() {
    if (state.swipeElapsed < .62) return false;
    const index = (state.clipIndex + 1) % clips.length;
    onNext(index); state.clipIndex = index; state.clipElapsed = 0; state.consumed++; state.swipeElapsed = 0; state.swipe = reducedMotion ? 1 : 0;
    state.boost = Math.max(state.boost, .24); return true;
  }
  function tick(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new TypeError('Time step must be a finite nonnegative number.');
    dt = Math.min(dt, .1); state.swipeElapsed += dt;
    const p = Math.min(1, state.swipeElapsed / .62); state.swipe = reducedMotion ? 1 : p < .5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2;
    if (state.paused) return state;
    state.time += dt; state.clipElapsed += dt; state.boost *= Math.exp(-dt * .47);
    const target = Math.min(99.8, clips[state.clipIndex].reward + Math.sin(state.time * .68) * 2.4 + Math.sin(state.time * 2.8) * .9 + state.boost * 22);
    state.dopamine += (target - state.dopamine) * (1 - Math.exp(-dt * 2.3));
    state.neural = state.dopamine * 9.68 + Math.sin(state.time * 4.1) * 18 + state.boost * 122;
    state.attention = Math.max(.1, 2.3 - state.dopamine / 69 - Math.min(.45, state.consumed * .014));
    if (state.clipElapsed >= clips[state.clipIndex].duration) next();
    return state;
  }
  function setPaused(value) { if (typeof value !== 'boolean') throw new TypeError('paused must be a boolean'); state.paused = value; return state.paused; }
  function inject() { if (state.paused) return false; state.boost = 1.35; state.injections++; return true; }
  return { state, next, tick, inject, setPaused };
}
