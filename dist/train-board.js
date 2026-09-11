/* The board, and the arm that pours it.
 *
 * The arm is a snake: a chain of segments that follows a curve from its base to
 * whatever bottle it is working on, each segment lagging slightly behind the one
 * ahead so the whole thing moves like a tentacle rather than a rigid linkage.
 *
 * The pour is played as an animation because the trainer reports a pour only
 * after it has finished thinking about it, which takes long enough that the
 * board would otherwise just blink between two states with nothing to watch.
 */

const COLORS = ["#fac814", "#1937f0", "#f5f5f5", "#0f961e", "#e12321", "#14c8dc"];
const LOCKED = -1;
const SEGMENTS = 16;
const POUR_MS = 900;

export class BoardView {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.board = null;
    this.height = 4;
    this.pour = null;
    this.startedAt = 0;
    this.spine = [];
    this.stream = [];
    requestAnimationFrame(() => this.frame());
  }

  /* A pour the trainer has already committed. We animate it, then show the result. */
  show(board, height, pour, previous) {
    const changed = pour && (!this.pour || this.pour.key !== `${pour[0]}-${pour[1]}-${board.flat().join("")}`);
    this.height = height;
    if (changed) {
      this.previous = previous || this.board;
      this.pour = { from: pour[0], to: pour[1], key: `${pour[0]}-${pour[1]}-${board.flat().join("")}` };
      this.startedAt = performance.now();
    }
    this.board = board;
  }

  geometry() {
    const { width: W, height: H } = this.canvas;
    const n = (this.board && this.board.length) || 1;
    const slot = W / n;
    const bw = Math.min(58, slot * 0.6);
    const unit = (H - 110) / this.height;
    return { W, H, n, slot, bw, unit, top: 66, bh: unit * this.height };
  }

  bottleAt(i) {
    const g = this.geometry();
    return { x: g.slot * i + (g.slot - g.bw) / 2, ...g };
  }

  /* Cubic curve from the arm's base up to a target, used as the snake's spine. */
  curveTo(tx, ty, t) {
    const g = this.geometry();
    const bx = g.W / 2, by = g.H - 4;
    const pts = [];
    const cx1 = bx, cy1 = by - 120;
    const cx2 = tx + (bx - tx) * 0.15, cy2 = ty + 90;
    for (let i = 0; i <= SEGMENTS; i++) {
      const u = (i / SEGMENTS) * t;
      const v = 1 - u;
      pts.push([
        v * v * v * bx + 3 * v * v * u * cx1 + 3 * v * u * u * cx2 + u * u * u * tx,
        v * v * v * by + 3 * v * v * u * cy1 + 3 * v * u * u * cy2 + u * u * u * ty,
      ]);
    }
    return pts;
  }

  drawSnake(pts, tint) {
    const ctx = this.ctx;
    for (let i = 0; i < pts.length; i++) {
      const k = i / (pts.length - 1);
      const r = 2.5 + 7 * (1 - k) ** 0.7;
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], r, 0, Math.PI * 2);
      ctx.fillStyle = i === pts.length - 1 ? tint : `rgba(${70 + 40 * k | 0},${92 + 60 * k | 0},${104 + 60 * k | 0},0.95)`;
      ctx.fill();
    }
    const head = pts[pts.length - 1];
    ctx.beginPath();
    ctx.arc(head[0], head[1], 8, 0, Math.PI * 2);
    ctx.strokeStyle = tint;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  drawBottle(i, tube, highlight) {
    const ctx = this.ctx;
    const { x, bw, unit, top, bh } = this.bottleAt(i);
    const locked = tube.length && tube[0] === LOCKED;
    ctx.fillStyle = locked ? "#252c31" : "#121719";
    ctx.fillRect(x, top, bw, bh);
    if (locked) {
      ctx.fillStyle = "#66757d";
      ctx.font = "600 20px ui-monospace, monospace";
      ctx.fillText("?", x + bw / 2 - 6, top + bh / 2 + 7);
    } else {
      tube.forEach((c, j) => {
        ctx.fillStyle = COLORS[c % COLORS.length];
        ctx.fillRect(x + 3, top + bh - unit * (j + 1) + 1, bw - 6, unit - 2);
      });
    }
    ctx.strokeStyle = highlight ? (highlight === "from" ? "#e8c15a" : "#7fd7a8") : "#333f46";
    ctx.lineWidth = highlight ? 2.5 : 1.5;
    ctx.strokeRect(x, top, bw, bh);
    ctx.fillStyle = highlight ? "#c8d2d8" : "#47555c";
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillText(highlight || String(i), x + bw / 2 - (highlight ? 12 : 3), top + bh + 16);
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    const ctx = this.ctx;
    const { W, H } = this.geometry();
    ctx.clearRect(0, 0, W, H);
    if (!this.board) return;

    const t = this.pour ? Math.min(1, (performance.now() - this.startedAt) / POUR_MS) : 1;
    // Before the pour lands, keep showing the board as it was, so the liquid is
    // seen leaving one bottle and arriving in the other.
    const mid = t < 0.55;
    const shown = mid && this.previous ? this.previous : this.board;

    shown.forEach((tube, i) => {
      let tag = null;
      if (this.pour && t < 1) tag = i === this.pour.from ? "from" : i === this.pour.to ? "into" : null;
      this.drawBottle(i, tube, tag);
    });

    if (this.pour && t < 1) {
      // Reach for the source, then swing across to the target.
      const a = this.bottleAt(this.pour.from), b = this.bottleAt(this.pour.to);
      const reach = Math.min(1, t / 0.35);
      const swing = Math.max(0, Math.min(1, (t - 0.35) / 0.4));
      const ease = swing < 0.5 ? 2 * swing * swing : 1 - (-2 * swing + 2) ** 2 / 2;
      const tx = (a.x + a.bw / 2) + ((b.x + b.bw / 2) - (a.x + a.bw / 2)) * ease;
      const ty = a.top - 16 - 10 * Math.sin(Math.PI * ease);
      const source = shown[this.pour.from];
      const tint = source && source.length && source[0] !== LOCKED
        ? COLORS[source[source.length - 1] % COLORS.length] : "#8fa3ad";
      this.drawSnake(this.curveTo(tx, ty, reach), tint);

      if (swing > 0.55) {
        // Liquid falling into the target.
        const fall = (swing - 0.55) / 0.45;
        ctx.fillStyle = tint;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(b.x + b.bw / 2 - 3, ty + 10, 6, (b.top - ty - 10) * fall);
        ctx.globalAlpha = 1;
      }
    } else if (this.pour === null) {
      this.drawSnake(this.curveTo(this.geometry().W / 2, this.geometry().H - 90, 1), "#8fa3ad");
    }
  }
}
