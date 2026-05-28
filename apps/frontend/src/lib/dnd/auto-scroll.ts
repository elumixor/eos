// Edge auto-scroll. Self-arms only while the finger is inside an edge zone
// (gated by `arm`) and exits the loop as soon as the finger leaves it.
// Use visualViewport when available — iOS Safari's URL bar collapses during
// scroll and `innerHeight` lags the actual visible area.

const EDGE_ZONE = 80;
const EDGE_MAX_SPEED = 14; // px per frame at the very edge

const viewportHeight = () => window.visualViewport?.height ?? window.innerHeight;

export const inEdgeZone = (y: number) => y < EDGE_ZONE || y > viewportHeight() - EDGE_ZONE;

export class AutoScroller {
  #rafId = 0;
  #lastTs = 0;
  #getY: () => number;
  #onTick: () => void;
  #isActive: () => boolean;

  constructor(args: { getY: () => number; isActive: () => boolean; onTick: () => void }) {
    this.#getY = args.getY;
    this.#isActive = args.isActive;
    this.#onTick = args.onTick;
  }

  arm() {
    if (this.#rafId) return;
    this.#lastTs = performance.now();
    this.#rafId = requestAnimationFrame(this.#tick);
  }

  cancel() {
    if (this.#rafId) {
      cancelAnimationFrame(this.#rafId);
      this.#rafId = 0;
    }
  }

  #tick = (ts: number) => {
    this.#rafId = 0;
    if (!this.#isActive()) return;
    const dtMs = Math.min(64, ts - this.#lastTs);
    this.#lastTs = ts;

    const vh = viewportHeight();
    const y = this.#getY();
    let dy = 0;
    if (y < EDGE_ZONE) {
      const f = (EDGE_ZONE - y) / EDGE_ZONE; // 0 → 1 as finger approaches top
      dy = -EDGE_MAX_SPEED * Math.min(1, Math.max(0, f));
    } else if (y > vh - EDGE_ZONE) {
      const f = (y - (vh - EDGE_ZONE)) / EDGE_ZONE;
      dy = EDGE_MAX_SPEED * Math.min(1, Math.max(0, f));
    }
    if (dy === 0) return; // left the zone — stop spinning

    // iOS WKWebView silently no-ops `window.scrollBy` while a non-passive
    // touch is in flight; mutating scrollTop bypasses that path. Assumes
    // task lists live in the root document scroller (true for current
    // layout; walk up to nearest scrollable ancestor if that ever changes).
    const scroller = document.scrollingElement ?? document.documentElement;
    // Normalise speed to 60fps so a janky frame doesn't undershoot.
    scroller.scrollTop += dy * (dtMs / (1000 / 60));
    this.#onTick();
    this.#rafId = requestAnimationFrame(this.#tick);
  };
}
