/* Polls the trainer and drives the two views.
 *
 * Game state is small JSON and is polled often. Neuron activity is 139,662 raw
 * bytes and is polled on its own slower clock, so a heavy frame never delays the
 * board.
 */

import { BoardView } from "./train-board.js";
import { BrainView } from "./train-brain.js";

const $ = (id) => document.getElementById(id);
const pct = (v) => `${(v * 100).toFixed(0)}%`;

const board = new BoardView($("board"));
const brain = new BrainView($("brain"));
let peakDrive = 1;
let lastBoard = null;

brain.load().then((meta) => {
  $("brainnote").textContent =
    `${meta.neurons_drawn.toLocaleString()} neurons · ${meta.connections_drawn.toLocaleString()} connections drawn`;
  $("braincaveat").textContent = meta.caveat;
  fetch("state").then((r) => r.json()).then((s) => {
    if (s.kc_index) brain.setFamilies(s.kc_index, s.circuit_index || []);
  }).catch(() => {});
}).catch((e) => { $("brainnote").textContent = `could not load geometry (${e.message})`; });

const kc = $("kc"), kx = kc.getContext("2d");
function drawKC(counts) {
  const cols = 64, rows = Math.ceil(counts.length / cols);
  if (kc.width !== cols * 4) { kc.width = cols * 4; kc.height = rows * 4; }
  kx.fillStyle = "#0c0f12";
  kx.fillRect(0, 0, kc.width, kc.height);
  let peak = 1;
  for (const c of counts) if (c > peak) peak = c;
  counts.forEach((c, i) => {
    if (!c) return;
    const t = Math.min(1, c / peak);
    kx.fillStyle = `rgba(${120 + 90 * t | 0},${180 + 50 * t | 0},${200 + 40 * t | 0},${0.25 + 0.75 * t})`;
    kx.fillRect((i % cols) * 4, ((i / cols) | 0) * 4, 3, 3);
  });
}

function bar(el, value, scale) {
  el.style.width = `${Math.max(0, Math.min(100, (value / scale) * 100))}%`;
}

/* One bar per finished episode: green up for PAM11, red down for PPL101. */
const dop = $("dopamine"), dx = dop.getContext("2d");
function drawDopamine(events) {
  dx.clearRect(0, 0, dop.width, dop.height);
  const mid = dop.height / 2;
  dx.fillStyle = "#1c242a";
  dx.fillRect(0, mid, dop.width, 1);
  const w = dop.width / 40;
  events.forEach((e, i) => {
    const h = Math.min(mid - 1, (e.hz / 200) * (mid - 1));
    dx.fillStyle = e.rewarded ? "#7fd7a8" : "#e0736a";
    dx.fillRect(i * w + 1, e.rewarded ? mid - h : mid + 1, Math.max(1, w - 2), h);
  });
}

async function pollState() {
  try {
    const s = await (await fetch("state")).json();
    if (s.board) {
      board.show(s.board, s.height, s.pour, lastBoard);
      lastBoard = s.board;
      $("ep").textContent = s.episode;
      $("tier").textContent = s.tier || "–";
      $("rate").textContent = s.episodes_done ? pct(s.solve_rate) : "–";
      $("base").textContent = pct(s.baseline || 0);
      $("pours").textContent = `${s.pours}/${s.budget}`;
      const locked = s.locked ? `, ${s.locked} still locked` : "";
      $("movenote").textContent =
        (s.pour ? `poured bottle ${s.pour[0]} into ${s.pour[1]}, chosen from ${s.options.length} legal pours`
                : "no legal pour") + locked + (s.opened ? " — a locked bottle just opened" : "");
      $("options").innerHTML =
        `<tr><th>pour</th><th class="n">valence</th><th class="n">chance</th></tr>` +
        s.options.map((o, i) =>
          `<tr class="${i === s.chosen ? "pick" : ""}"><td>${o[0]} → ${o[1]}</td>` +
          `<td class="n">${o[2].toFixed(1)}</td><td class="n">${pct(o[3])}</td></tr>`).join("");
    }
    if (s.outcome) {
      const ENDING = { solved: "solved", dead: "lost — no win left", stuck: "no legal pour", budget: "ran out of pours" };
      $("verdict").className = `stat ${s.outcome === "solved" ? "win" : "lose"}`;
      $("verdict").textContent = `last episode: ${ENDING[s.ending] || s.outcome}`
        + (s.help ? ` (+${s.help} bottle)` : "");
    }
    if (s.dopamine) drawDopamine(s.dopamine);
    if (s.tiers) {
      $("tiers").innerHTML =
        `<tr><th>tier</th><th class="n">levels</th><th class="n">solved</th><th class="n">chance</th></tr>` +
        Object.entries(s.tiers).map(([name, r]) =>
          `<tr><td>${name}</td><td class="n">${r.n}</td>` +
          `<td class="n ${r.solved > r.baseline ? "win" : "lose"}">${pct(r.solved)}</td>` +
          `<td class="n">${pct(r.baseline)}</td></tr>`).join("");
    }
    if (s.kc) { drawKC(s.kc); $("kcnote").textContent = `${s.kc_active} of ${s.kc.length} firing`; }
    peakDrive = Math.max(peakDrive, Math.abs(s.reward_drive || 0), Math.abs(s.aversive_drive || 0));
    $("rv").textContent = (s.reward_drive || 0).toFixed(0);
    $("av").textContent = (s.aversive_drive || 0).toFixed(0);
    bar($("rb"), Math.abs(s.reward_drive || 0), peakDrive);
    bar($("ab"), Math.abs(s.aversive_drive || 0), peakDrive);
    $("da").textContent = `PAM11 ${(s.pam11_hz || 0).toFixed(1)} Hz · PPL101 ${(s.ppl101_hz || 0).toFixed(1)} Hz`;
    bar($("db"), Math.max(s.pam11_hz || 0, s.ppl101_hz || 0), 60);
    if (s.changed_edges != null) {
      $("wnote").textContent =
        `${s.changed_edges.toLocaleString()} of ${s.plastic_edges.toLocaleString()} plastic synapses moved`
        + ` · mean efficacy ${s.mean_efficacy.toFixed(4)}`;
    }
  } catch (e) { /* the trainer is mid-pour; try again shortly */ }
  setTimeout(pollState, 300);
}

async function pollActivity() {
  try {
    const buf = await (await fetch("activity")).arrayBuffer();
    if (buf.byteLength) brain.setActivity(new Uint8Array(buf));
  } catch (e) { /* ignore */ }
  setTimeout(pollActivity, 500);
}

pollState();
pollActivity();
