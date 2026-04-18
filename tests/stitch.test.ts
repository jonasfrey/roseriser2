import { describe, it, expect } from 'vitest';
import { stitchPolylines } from '../src/dxf/stitch';
import type { EntityPolyline } from '../src/dxf/discretize';

function poly(handle: string, points: [number, number][], closed = false): EntityPolyline {
  return { handle, type: 'TEST', points, closed };
}

describe('stitchPolylines', () => {
  it('joins two lines sharing an endpoint', () => {
    const a = poly('A', [[0, 0], [1, 0]]);
    const b = poly('B', [[1, 0], [1, 1]]);
    const { components } = stitchPolylines([a, b], 1e-6);
    expect(components).toHaveLength(1);
    expect(components[0].points.map((p) => [p[0], p[1]])).toEqual([
      [0, 0],
      [1, 0],
      [1, 1]
    ]);
    expect(components[0].closed).toBe(false);
  });

  it('reverses a polyline whose direction is backwards', () => {
    const a = poly('A', [[0, 0], [1, 0]]);
    // B's natural direction is (2,0) -> (1,0); stitcher should reverse it.
    const b = poly('B', [[2, 0], [1, 0]]);
    const { components } = stitchPolylines([a, b], 1e-6);
    expect(components[0].points.map((p) => [p[0], p[1]])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0]
    ]);
  });

  it('detects a closed loop when endpoints meet', () => {
    const a = poly('A', [[0, 0], [1, 0]]);
    const b = poly('B', [[1, 0], [1, 1]]);
    const c = poly('C', [[1, 1], [0, 1]]);
    const d = poly('D', [[0, 1], [0, 0]]);
    const { components } = stitchPolylines([a, b, c, d], 1e-6);
    expect(components).toHaveLength(1);
    expect(components[0].closed).toBe(true);
  });

  it('passes inherently-closed polylines through unchanged', () => {
    const c = poly('C', [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]], true);
    const { components } = stitchPolylines([c], 1e-6);
    expect(components).toHaveLength(1);
    expect(components[0].closed).toBe(true);
  });

  it('reports disconnected components as a warning', () => {
    const a = poly('A', [[0, 0], [1, 0]]);
    const b = poly('B', [[10, 0], [11, 0]]);
    const { components, issues } = stitchPolylines([a, b], 1e-6);
    expect(components).toHaveLength(2);
    expect(issues.some((i) => /disconnected/.test(i.message))).toBe(true);
  });

  it('stitches across seed when seed direction is wrong', () => {
    // Seed is B, preceding A connects to B's head.
    const b = poly('B', [[1, 0], [2, 0]]);
    const a = poly('A', [[0, 0], [1, 0]]);
    const { components } = stitchPolylines([b, a], 1e-6);
    expect(components[0].points.map((p) => p[0])).toEqual([0, 1, 2]);
  });
});
