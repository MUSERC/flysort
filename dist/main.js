import { createLab } from './scene.js';
import { clips, createSimulation } from './simulation.js';

const $ = (selector) => document.querySelector(selector);
const canvas = $('#scene'), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lab, view = 0, messageTimer, soundOn = false, audioContext, drone, master, filter;
const simulation = createSimulation({ reducedMotion, onNext(index) { lab?.nextClip(index); playTone(340 + index * 55, .12); } });
const state = simulation.state;
try { lab = createLab(canvas); }
catch (error) { console.error('The 3D chamber could not initialize:', error); $('#scene-error').hidden = false; }

function showMessage(message) { clearTimeout(messageTimer); $('#scene-message').textContent = message; $('#scene-message').classList.add('visible'); messageTimer = setTimeout(() => $('#scene-message').classList.remove('visible'), 2400); }
function nextShort() { if (!simulation.next()) return false; updateLabels(); return true; }
function updatePause() {
  document.body.classList.toggle('paused', state.paused);
  $('#pause-button').textContent = state.paused ? '▶' : 'Ⅱ';
  $('#pause-button').setAttribute('aria-label', state.paused ? 'Resume experiment' : 'Pause experiment');
  $('#pause-button').title = state.paused ? 'Resume (Space)' : 'Pause (Space)';
  $('#top-state').textContent = state.paused ? 'EXPERIMENT PAUSED' : 'EXPERIMENT RUNNING';
  $('#stimulate-button').setAttribute('aria-disabled', String(state.paused));
  syncAudio();
}
function togglePause() { simulation.setPaused(!state.paused); updatePause(); showMessage(state.paused ? 'FEED PAUSED · A MOMENT OF CLARITY' : 'THE ALGORITHM HAS YOU AGAIN'); }
function inject() { if (!simulation.inject()) { showMessage('RESUME THE EXPERIMENT FIRST'); return false; } showMessage('DOPAMINE INJECTED · FREE WILL −100%'); playTone(740, .4); $('#fly-thought').textContent = '“i can taste the pixels”'; return true; }
function changeCamera() { view = (view + 1) % 3; lab?.setView(view); $('.scene-view').innerHTML = `${['PERSPECTIVE', 'SPECIMEN CLOSEUP', 'FEED VIEW'][view]} <span>0${view + 1} / 03</span>`; }
function updateLabels() {
  const clip = clips[state.clipIndex];
  $('#clip-label').textContent = clip.category;
  if (state.boost < .7) $('#fly-thought').textContent = clip.thought;
  $('#short-number').textContent = String(state.consumed).padStart(2, '0');
  $('#consumed').innerHTML = `${String(state.consumed).padStart(2, '0')} <small>and counting</small>`;
  const elapsed = Math.floor(state.time), minutes = Math.floor(elapsed / 60), seconds = elapsed % 60;
  $('#session-time').textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  $('#exposure').textContent = `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  $('#clip-time').textContent = `00:${String(Math.floor(state.clipElapsed)).padStart(2, '0')} / 00:${clip.duration}`;
  $('#dopamine-value').textContent = state.dopamine.toFixed(1);
  $('#dopamine-meter').style.width = `${state.dopamine}%`;
  $('#dopamine-change').textContent = `+${(state.dopamine - 65.6).toFixed(1)}%`;
  $('#neural-value').innerHTML = `${state.neural.toFixed(1)} <small>K/s</small>`;
  $('#attention-value').innerHTML = `${state.attention.toFixed(1)} <small>sec</small>`;
  $('#brainrot-value').innerHTML = `${state.dopamine > 95 ? 'CRITICAL' : state.dopamine > 87 ? 'TERMINAL' : 'SEVERE'} <small>↗</small>`;
  $('#subject-status').textContent = state.paused ? 'Briefly self-aware' : state.boost > .8 ? 'Seeing new colors' : state.consumed > 15 ? 'One with the feed' : 'Terminally online';
}

$('#next-button').addEventListener('click', nextShort);
$('#pause-button').addEventListener('click', togglePause);
$('#stimulate-button').addEventListener('click', inject);
$('#camera-button').addEventListener('click', changeCamera);
$('#about-open').addEventListener('click', () => $('#about-dialog').showModal());
$('#about-dialog').addEventListener('click', (event) => { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close(); });
$('#fullscreen-button').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if ($('#scene-wrap').requestFullscreen) await $('#scene-wrap').requestFullscreen(); else showMessage('FULLSCREEN IS UNAVAILABLE IN THIS BROWSER'); } catch { showMessage('FULLSCREEN IS UNAVAILABLE IN THIS VIEW'); } });
document.addEventListener('keydown', (event) => {
  if ($('#about-dialog').open || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(document.activeElement?.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) togglePause(); }
  if (event.code === 'ArrowDown' || event.code === 'ArrowUp') { event.preventDefault(); if (!event.repeat) nextShort(); }
});
let pointer = null, wheelAt = 0;
canvas.addEventListener('pointerdown', (event) => { if (event.button !== 0) return; pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, type: event.pointerType }; canvas.setPointerCapture(event.pointerId); });
canvas.addEventListener('pointermove', (event) => { if (!pointer || pointer.id !== event.pointerId) return; const dy = event.clientY - pointer.y, dx = event.clientX - pointer.x; if (pointer.type !== 'touch' || Math.abs(dx) > Math.abs(dy) * .8) lab?.orbit(event.clientX - pointer.lastX, event.clientY - pointer.lastY); pointer.lastX = event.clientX; pointer.lastY = event.clientY; });
canvas.addEventListener('pointerup', (event) => { if (!pointer || pointer.id !== event.pointerId) return; const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; if (pointer.type === 'touch' && Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx) * 1.2) nextShort(); pointer = null; });
canvas.addEventListener('pointercancel', () => pointer = null);
canvas.addEventListener('lostpointercapture', () => pointer = null);
canvas.addEventListener('wheel', (event) => { event.preventDefault(); if (Math.abs(event.deltaY) > 8 && performance.now() - wheelAt > 800) { nextShort(); wheelAt = performance.now(); } }, { passive: false });

// Sound is opt-in: a quiet lab hum and a tiny reward ping.
function syncAudio() { if (!audioContext || !master) return; master.gain.setTargetAtTime(soundOn && !state.paused && !document.hidden ? .027 : 0, audioContext.currentTime, .18); }
function playTone(frequency, duration) { if (!soundOn || !audioContext || state.paused) return; const tone = audioContext.createOscillator(), gain = audioContext.createGain(); tone.type = 'sine'; tone.frequency.setValueAtTime(frequency, audioContext.currentTime); tone.frequency.exponentialRampToValueAtTime(frequency * .65, audioContext.currentTime + duration); gain.gain.setValueAtTime(.04, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration); tone.connect(gain); gain.connect(audioContext.destination); tone.start(); tone.stop(audioContext.currentTime + duration); }
$('#sound-button').setAttribute('aria-pressed', 'false');
$('#sound-button').addEventListener('click', async () => {
  try {
    if (!audioContext) { const Audio = window.AudioContext || window.webkitAudioContext; if (!Audio) throw new Error('Unavailable'); audioContext = new Audio(); drone = audioContext.createOscillator(); filter = audioContext.createBiquadFilter(); master = audioContext.createGain(); drone.type = 'sawtooth'; drone.frequency.value = 57; filter.type = 'lowpass'; filter.frequency.value = 165; master.gain.value = 0; drone.connect(filter); filter.connect(master); master.connect(audioContext.destination); drone.start(); }
    await audioContext.resume(); soundOn = !soundOn; syncAudio();
    $('#sound-button').innerHTML = soundOn ? '♩' : '♩<span class="sound-slash">/</span>';
    $('#sound-button').setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on'); $('#sound-button').setAttribute('aria-pressed', String(soundOn));
    showMessage(soundOn ? 'LAB AUDIO ON' : 'LAB AUDIO OFF');
  } catch { showMessage('AUDIO IS UNAVAILABLE IN THIS BROWSER'); }
});
document.addEventListener('visibilitychange', syncAudio);

const history = Array.from({ length: 120 }, (_, i) => 65.6 + i / 120 * 12.8 + Math.sin(i * .33) * 3 + Math.sin(i * 1.7) * 1.5);
const spikes = Array.from({ length: 96 }, (_, row) => Array.from({ length: 5 }, (_, k) => ({ x: ((Math.sin(row * 21 + k * 17) + 1) / 2), a: .15 + ((row + k) % 5) / 7 })));
function contextFor(element) { const rect = element.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2); const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr); if (element.width !== w || element.height !== h) { element.width = w; element.height = h; } const ctx = element.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w: rect.width, h: rect.height }; }
function drawTelemetry() {
  const { ctx: c, w, h } = contextFor($('#dopamine-chart')); c.clearRect(0, 0, w, h); c.strokeStyle = '#28382b'; c.lineWidth = .5;
  for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
  const y = (v) => h - ((v - 45) / 60 * (h - 8));
  c.beginPath(); history.forEach((v, i) => i ? c.lineTo(i / 119 * w, y(v)) : c.moveTo(0, y(v))); c.lineTo(w, h); c.lineTo(0, h); c.closePath(); const grad = c.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, '#c4f86a30'); grad.addColorStop(1, '#c4f86a00'); c.fillStyle = grad; c.fill();
  c.beginPath(); history.forEach((v, i) => i ? c.lineTo(i / 119 * w, y(v)) : c.moveTo(0, y(v))); c.lineWidth = 1.3; c.strokeStyle = '#c4f86a'; c.stroke(); c.beginPath(); c.arc(w - 2, y(history[119]), 2, 0, Math.PI * 2); c.fillStyle = '#e4ffaa'; c.fill();
  const { ctx: s, w: rw, h: rh } = contextFor($('#spike-raster')); s.clearRect(0, 0, rw, rh); s.strokeStyle = '#23332b'; s.lineWidth = .4;
  for (let i = 1; i < 5; i++) { s.beginPath(); s.moveTo(i * rw / 5, 0); s.lineTo(i * rw / 5, rh); s.stroke(); }
  for (let row = 0; row < 96; row++) for (const spike of spikes[row]) { const x = ((spike.x - state.time * .075) % 1 + 1) % 1; s.fillStyle = `rgba(${state.boost > .8 ? '226,255,167' : '135,207,164'},${spike.a})`; s.fillRect(x * rw, row * rh / 96, 1.2 + state.boost, .7); }
  s.fillStyle = '#c4f86a'; s.fillRect(rw - 1, 0, 1, rh);
}
let last = performance.now(), hudClock = 0, sampleClock = 0;
function frame(now) {
  const dt = Math.min((now - last) / 1000, .05); last = now;
  if (!document.hidden) {
    const previousClip = state.clipIndex; simulation.tick(dt);
    if (previousClip !== state.clipIndex) updateLabels();
    lab?.render(state.time, dt, state);
    if (!state.paused) sampleClock += dt;
    if (sampleClock >= .5) { sampleClock = 0; history.shift(); history.push(state.dopamine); }
    hudClock += dt; if (hudClock > .13) { hudClock = 0; updateLabels(); drawTelemetry(); }
    if (filter && soundOn) filter.frequency.setTargetAtTime(150 + state.boost * 550, audioContext.currentTime, .2);
  }
  requestAnimationFrame(frame);
}
updatePause(); updateLabels(); drawTelemetry(); requestAnimationFrame(frame);

// Optional imperative WebMCP uses exactly the same actions as the visible UI.
const modelContext = document.modelContext;
if (modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const tool = {
    name: 'control_fly_experiment', title: 'Control fly experiment',
    description: 'Pause or resume the fictional experiment, swipe to the next short, inject simulated dopamine, or read the current state.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'pause', 'resume', 'next_short', 'inject_dopamine'] } }, required: ['action'], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input) {
      if (!input || typeof input !== 'object' || Object.keys(input).length !== 1 || !['status', 'pause', 'resume', 'next_short', 'inject_dopamine'].includes(input.action)) throw new TypeError('Provide a valid action only.');
      let applied = true;
      if (input.action === 'pause' || input.action === 'resume') { simulation.setPaused(input.action === 'pause'); updatePause(); }
      if (input.action === 'next_short') applied = nextShort();
      if (input.action === 'inject_dopamine') applied = inject();
      updateLabels(); return { applied, paused: state.paused, short: clips[state.clipIndex].category, consumed: state.consumed, dopamine: Number(state.dopamine.toFixed(1)), injections: state.injections };
    }
  };
  try { Promise.resolve(modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(error => console.warn('Optional WebMCP registration unavailable:', error)); } catch (error) { console.warn('Optional WebMCP registration unavailable:', error); }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
