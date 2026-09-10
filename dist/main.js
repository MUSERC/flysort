import { createLab } from './scene.js';
import { clips, createPlayback, createFrameClock } from './simulation.js';
import { BrainClient } from './backend.js';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene'), reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let lab, view = 0, messageTimer, status = null, connection = 'CONNECTING', lastSequence = -1, commandPending = false;
let soundOn = false, audioContext, master, filter;
let sceneFailed = false, sceneRendered = false;
const playback = createPlayback({ reducedMotion, onNext(index) { lab?.nextClip(index); playTone(340 + index * 55, .12); } });
const state = playback.state;
try { lab = createLab(canvas); }
catch (error) { sceneFailed = true; console.error(error); $('#scene-error').hidden = false; }
const client = new BrainClient({
  reducedMotion,
  captureFrame: () => sceneRendered ? lab?.captureFrame() : null,
  onStatus(data) {
    status = data;
    connection = data.phase === 'ready' ? (data.paused ? 'PAUSED' : 'CONNECTED') : data.phase.toUpperCase();
    playback.setPaused(sceneFailed || data.phase !== 'ready' || data.paused);
    if (data.telemetry) {
      state.pam11Hz = data.telemetry.pam11_hz;
      state.motorHz = data.telemetry.motor_hz;
      state.turnHz = data.telemetry.turn_hz;
      if (data.sequence !== lastSequence && data.telemetry.stimulus_ms > 0) playTone(520, .08);
      lastSequence = data.sequence;
    }
    $('#engine-message').textContent = sceneFailed ? 'Visual input suspended — reload to restart the 3D scene.' : data.phase === 'error' ? `${data.message}. Run uv run flywirehead prepare, then restart.` : data.message;
    updateLabels(); drawTelemetry(); syncAudio();
  },
  onError(error) {
    status = null; connection = 'DISCONNECTED'; playback.setPaused(true);
    state.pam11Hz = state.motorHz = state.turnHz = 0;
    $('#engine-message').textContent = error.message;
    updateLabels(); drawTelemetry(); syncAudio();
  }
});
function showMessage(text) { clearTimeout(messageTimer); $('#scene-message').textContent = text; $('#scene-message').classList.add('visible'); messageTimer = setTimeout(() => $('#scene-message').classList.remove('visible'), 2600); }
function nextShort() { const changed = playback.next(); updateLabels(); return changed; }
async function command(action) {
  if (commandPending) return false;
  commandPending = true;
  try { await client.action(action); if (action === 'stimulate') showMessage('PAM11 PULSE QUEUED · 200 ms'); if (action === 'save') showMessage('BRAIN CHECKPOINT REQUESTED'); return true; }
  catch (error) { showMessage(error.message); return false; }
  finally { commandPending = false; }
}
function changeCamera() { view = (view + 1) % 3; lab?.setView(view); $('.scene-view').innerHTML = `${['PERSPECTIVE', 'SPECIMEN CLOSEUP', 'FEED VIEW'][view]} <span>0${view + 1} / 03</span>`; }
function updateLabels() {
  const clip = clips[state.clipIndex], t = status?.telemetry, ready = status?.phase === 'ready';
  $('#clip-label').textContent = clip.category;
  $('#fly-thought').textContent = t ? `${t.total_spikes.toLocaleString()} spikes / sample` : 'waiting for neural output';
  $('#short-number').textContent = String(state.consumed).padStart(2, '0');
  $('#consumed').innerHTML = `${String(state.consumed).padStart(2, '0')} <small>shorts presented</small>`;
  const seconds = Math.floor(state.time), minutes = Math.floor(seconds / 60);
  $('#session-time').textContent = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('#exposure').textContent = `${minutes}m ${String(seconds % 60).padStart(2, '0')}s`;
  $('#clip-time').textContent = `00:${String(Math.floor(state.clipElapsed)).padStart(2, '0')} / 00:${clip.duration}`;
  $('#dopamine-value').textContent = t ? t.pam11_hz.toFixed(1) : '—';
  $('#dopamine-meter').style.width = `${t ? Math.min(100, t.pam11_hz) : 0}%`;
  $('#dopamine-change').textContent = t ? `${t.pam11_spikes} spikes` : 'NO DATA';
  $('#neural-value').innerHTML = t ? `${(t.network_spikes_per_second / 1000).toFixed(1)} <small>K/s</small>` : '—';
  $('#attention-value').innerHTML = t ? `${t.kc_hz.toFixed(2)} <small>Hz</small>` : '—';
  $('#brainrot-value').textContent = t ? t.memory.changed_edges.toLocaleString() : '—';
  $('#brain-time').textContent = t ? `${(t.sim_ms / 1000).toFixed(2)} s` : status?.restored_ms ? `${(status.restored_ms / 1000).toFixed(2)} s` : '—';
  $('#subject-status').textContent = sceneFailed ? 'Scene stopped · reload to retry' : ready ? (status.paused ? (status.busy ? 'Finishing current step' : 'Paused') : status.busy ? 'Integrating neurons' : t ? 'Awaiting next frame' : 'Waiting for pixels') : connection.toLowerCase();
  $('#top-state').textContent = `BRAIN ${connection}`;
  $('#link-label').textContent = ready ? 'FULL CONNECTOME LOADED' : 'LOCAL BRAIN REQUIRED';
  $('#link-detail').textContent = ready ? `${status.model.neurons.toLocaleString()} NEURONS / ${status.model.retinal_inputs.toLocaleString()} VISUAL INPUTS` : 'PYTHON + C++ / NO SYNTHETIC TELEMETRY';
  $('#pause-button').textContent = state.paused ? '▶' : 'Ⅱ';
  $('#pause-button').setAttribute('aria-label', state.paused ? 'Resume experiment' : 'Pause experiment');
  $('#pause-button').disabled = !ready;
  $('#stimulate-button').disabled = !ready || status.paused;
  $('#save-button').disabled = !ready;
  $('#checkpoint-label').textContent = status?.checkpoint ? `SAVED ${new Date(status.checkpoint.saved_at * 1000).toLocaleTimeString()}` : 'SAVES ON EXIT';
  $('#timing-detail').textContent = t ? `${t.interval_ms} ms neural time / ${(t.compute_seconds * 1000).toFixed(0)} ms compute` : 'Waiting for a measured sample';
  document.body.classList.toggle('paused', state.paused);
  document.body.classList.toggle('disconnected', !ready);
}
$('#next-button').addEventListener('click', nextShort);
$('#pause-button').addEventListener('click', () => command(state.paused ? 'resume' : 'pause'));
$('#stimulate-button').addEventListener('click', () => command('stimulate'));
$('#save-button').addEventListener('click', () => command('save'));
$('#camera-button').addEventListener('click', changeCamera);
$('#about-open').addEventListener('click', () => $('#about-dialog').showModal());
$('#about-dialog').addEventListener('click', event => { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.currentTarget.close(); });
$('#fullscreen-button').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if ($('#scene-wrap').requestFullscreen) await $('#scene-wrap').requestFullscreen(); else showMessage('Fullscreen unavailable in this browser'); } catch { showMessage('Fullscreen unavailable in this view'); } });
document.addEventListener('keydown', event => {
  if ($('#about-dialog').open || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(document.activeElement?.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) void command(state.paused ? 'resume' : 'pause'); }
  if (event.code === 'ArrowDown' || event.code === 'ArrowUp') { event.preventDefault(); if (!event.repeat) nextShort(); }
});
let pointer = null, wheelAt = 0;
canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, type: e.pointerType }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => { if (!pointer || pointer.id !== e.pointerId) return; const dy = e.clientY - pointer.y, dx = e.clientX - pointer.x; if (pointer.type !== 'touch' || Math.abs(dx) > Math.abs(dy) * .8) lab?.orbit(e.clientX - pointer.lastX, e.clientY - pointer.lastY); pointer.lastX = e.clientX; pointer.lastY = e.clientY; });
canvas.addEventListener('pointerup', e => { if (!pointer || pointer.id !== e.pointerId) return; const dx = e.clientX - pointer.x, dy = e.clientY - pointer.y; if (pointer.type === 'touch' && Math.abs(dy) > 42 && Math.abs(dy) > Math.abs(dx) * 1.2) nextShort(); pointer = null; });
canvas.addEventListener('pointercancel', () => pointer = null);
canvas.addEventListener('lostpointercapture', () => pointer = null);
canvas.addEventListener('wheel', e => { e.preventDefault(); if (Math.abs(e.deltaY) > 8 && performance.now() - wheelAt > 800) { nextShort(); wheelAt = performance.now(); } }, { passive: false });
function syncAudio() { if (audioContext && master) master.gain.setTargetAtTime(soundOn && !state.paused && !document.hidden ? .027 : 0, audioContext.currentTime, .18); }
function playTone(frequency, duration) { if (!soundOn || !audioContext || state.paused) return; const tone = audioContext.createOscillator(), gain = audioContext.createGain(); tone.frequency.setValueAtTime(frequency, audioContext.currentTime); gain.gain.setValueAtTime(.035, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration); tone.connect(gain); gain.connect(audioContext.destination); tone.start(); tone.stop(audioContext.currentTime + duration); }
$('#sound-button').addEventListener('click', async () => {
  try {
    if (!audioContext) { const Audio = window.AudioContext || window.webkitAudioContext; audioContext = new Audio(); const drone = audioContext.createOscillator(); filter = audioContext.createBiquadFilter(); master = audioContext.createGain(); drone.type = 'sawtooth'; drone.frequency.value = 57; filter.type = 'lowpass'; filter.frequency.value = 165; master.gain.value = 0; drone.connect(filter); filter.connect(master); master.connect(audioContext.destination); drone.start(); }
    await audioContext.resume(); soundOn = !soundOn; syncAudio();
    $('#sound-button').innerHTML = soundOn ? '♩' : '♩<span class="sound-slash">/</span>';
    $('#sound-button').setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on'); $('#sound-button').setAttribute('aria-pressed', String(soundOn));
  } catch { showMessage('Audio unavailable in this browser'); }
});
document.addEventListener('visibilitychange', syncAudio);
function contextFor(element) { const rect = element.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2); const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr); if (element.width !== w || element.height !== h) { element.width = w; element.height = h; } const ctx = element.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return { ctx, w: rect.width, h: rect.height }; }
function drawTelemetry() {
  const { ctx: c, w, h } = contextFor($('#dopamine-chart'));
  c.clearRect(0, 0, w, h); c.strokeStyle = '#28382b'; c.lineWidth = .5;
  for (let i = 1; i <= 3; i++) { c.beginPath(); c.moveTo(0, i * h / 4); c.lineTo(w, i * h / 4); c.stroke(); }
  const history = status?.history || [], peak = Math.max(10, ...history.map(p => p.pam11_hz));
  const y = value => h - 4 - value / peak * (h - 9), x = i => i / Math.max(1, history.length - 1) * (w - 3);
  if (history.length) {
    c.beginPath(); history.forEach((p, i) => i ? c.lineTo(x(i), y(p.pam11_hz)) : c.moveTo(0, y(p.pam11_hz))); c.strokeStyle = '#c4f86a'; c.lineWidth = 1.4; c.stroke();
    c.beginPath(); c.arc(x(history.length - 1), y(history.at(-1).pam11_hz), 2, 0, Math.PI * 2); c.fillStyle = '#e4ffaa'; c.fill();
  }
  $('#chart-start').textContent = history.length ? `${(history[0].sim_ms / 1000).toFixed(2)}s` : 'NO SAMPLES';
  $('#chart-end').textContent = history.length ? `${(history.at(-1).sim_ms / 1000).toFixed(2)}s NEURAL` : 'NEURAL TIME';
  const { ctx: s, w: rw, h: rh } = contextFor($('#spike-raster')); s.clearRect(0, 0, rw, rh);
  const raster = status?.raster || [];
  raster.forEach((bin, col) => bin.counts.forEach((count, row) => { if (count > 0) { s.fillStyle = `rgba(167,228,160,${Math.min(1, .3 + count * .3)})`; s.fillRect(col / 120 * rw, row / 96 * rh, Math.max(1, rw / 120), Math.max(.6, rh / 96)); } }));
}
const frameClock = createFrameClock();
let hudClock = 0;
function frame(now) {
  if (sceneFailed) return;
  const dt = frameClock(now);
  if (!document.hidden) {
    sceneRendered = false;
    try {
      playback.tick(dt); lab.render(state.time, dt, state);
      sceneRendered = true;
      hudClock += dt; if (hudClock > .2) { hudClock = 0; updateLabels(); }
      if (filter && soundOn) filter.frequency.setTargetAtTime(150 + Math.min(600, state.pam11Hz * 7), audioContext.currentTime, .2);
    } catch (error) {
      console.error(error); sceneFailed = true; sceneRendered = false; playback.setPaused(true);
      $('#scene-error').textContent = 'The 3D scene stopped. Visual input is suspended. Reload to try again.';
      $('#scene-error').hidden = false;
      updateLabels(); syncAudio();
      return;
    }
  }
  requestAnimationFrame(frame);
}
updateLabels(); drawTelemetry(); requestAnimationFrame(frame); client.start();
window.addEventListener('pagehide', () => client.stop(), { once: true });

const context = document.modelContext;
if (context?.registerTool) {
  const lifecycle = new AbortController();
  try { Promise.resolve(context.registerTool({ name: 'control_fly_experiment', title: 'Control local fly brain', description: 'Read the measured neural state, pause or resume, change the short, stimulate PAM11, or save the local brain.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'pause', 'resume', 'next_short', 'stimulate', 'save'] } }, required: ['action'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) {
    if (!input || Object.keys(input).length !== 1 || !['status', 'pause', 'resume', 'next_short', 'stimulate', 'save'].includes(input.action)) throw new TypeError('Invalid action');
    let applied = true; if (input.action === 'next_short') applied = nextShort(); else if (input.action !== 'status') { await client.action(input.action); }
    return { applied, connection, paused: state.paused, clip: clips[state.clipIndex].category, telemetry: status?.telemetry ?? null };
  } }, { signal: lifecycle.signal })).catch(console.warn); } catch (error) { console.warn(error); }
  window.addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
