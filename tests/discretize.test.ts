import { describe, it, expect } from 'vitest';
import {
  discretizeArc,
  discretizeBulge,
  discretizeCircle,
  TAU
} from '../src/lib/geometry';

describe('discretizeArc', () => {
  it('respects chord tolerance: higher tolerance → fewer segments', () => {
    const coarse = discretizeArc([0, 0], 10, 0, TAU, 1.0);
    const fine = discretizeArc([0, 0], 10, 0, TAU, 0.01);
    expect(fine.length).toBeGreaterThan(coarse.length);
  });

  it('keeps sagitta below the requested tolerance', () => {
    const tol = 0.05;
    const r = 10;
    const pts = discretizeArc([0, 0], r, 0, TAU / 4, tol);
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1][0] + pts[i][0]) / 2;
      const my = (pts[i - 1][1] + pts[i][1]) / 2;
      const sagitta = r - Math.hypot(mx, my);
      expect(sagitta).toBeLessThanOrEqual(tol + 1e-9);
    }
  });

  it('produces endpoints exactly on the arc start and end', () => {
    const pts = discretizeArc([1, 2], 3, 0, Math.PI, 0.1);
    const start = pts[0];
    const end = pts[pts.length - 1];
    expect(start[0]).toBeCloseTo(1 + 3, 9);
    expect(start[1]).toBeCloseTo(2, 9);
    expect(end[0]).toBeCloseTo(1 - 3, 9);
    expect(end[1]).toBeCloseTo(2, 9);
  });
});

describe('discretizeCircle', () => {
  it('returns a closed loop (first ≈ last)', () => {
    const pts = discretizeCircle([0, 0], 5, 0.1);
    const first = pts[0];
    const last = pts[pts.length - 1];
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeLessThan(1e-9);
  });

  it('all points lie on the circle to within numerical noise', () => {
    const r = 7;
    const pts = discretizeCircle([3, -4], r, 0.1);
    for (const [x, y] of pts) {
      expect(Math.hypot(x - 3, y + 4)).toBeCloseTo(r, 9);
    }
  });
});

describe('discretizeBulge', () => {
  it('bulge=1 is a semicircle: mid-point sits on the perpendicular arc', () => {
    const p1: [number, number] = [0, 0];
    const p2: [number, number] = [2, 0];
    const pts = discretizeBulge(p1, p2, 1, 0.01);
    // Find the point with max y — should be near (1, 1) for CCW semicircle.
    let best = pts[0];
    for (const p of pts) if (p[1] > best[1]) best = p;
    expect(best[0]).toBeCloseTo(1, 1);
    expect(best[1]).toBeCloseTo(1, 1);
  });

  it('negative bulge flips to the opposite side', () => {
    const pts = discretizeBulge([0, 0], [2, 0], -1, 0.01);
    let minY = Infinity;
    for (const p of pts) if (p[1] < minY) minY = p[1];
    expect(minY).toBeLessThan(-0.5);
  });
});
