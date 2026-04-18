import { describe, it, expect } from 'vitest';
import { emitBosl2, fmt } from '../src/openscad/emitBosl2';
import { emitHull, computeTangentsDeg } from '../src/openscad/emitHull';
import { emitPrism } from '../src/openscad/emitPrism';
import type { PathResult, ProfileResult, Vec2, Vec3 } from '../src/types';

function makeProfile(): ProfileResult {
  const verts: Vec2[] = [
    [-1, -0.25],
    [1, -0.25],
    [1, 0.25],
    [-1, 0.25]
  ];
  return {
    vertices: verts,
    closed: true,
    unit: { code: 4, name: 'mm', isMm: true, isUnitless: false },
    bbox: { min: [-1, -0.25], max: [1, 0.25] },
    issues: []
  };
}

function makeRemoverProfile(): ProfileResult {
  // Smaller groove rectangle centered on the main profile.
  const verts: Vec2[] = [
    [-0.25, -0.1],
    [0.25, -0.1],
    [0.25, 0.1],
    [-0.25, 0.1]
  ];
  return {
    vertices: verts,
    closed: true,
    unit: { code: 4, name: 'mm', isMm: true, isUnitless: false },
    bbox: { min: [-0.25, -0.1], max: [0.25, 0.1] },
    issues: []
  };
}

function makePath(closed: boolean): PathResult {
  const pts: Vec3[] = [
    [0, 0, 0],
    [10, 0, 0],
    [10, 10, 0],
    [0, 10, 0]
  ];
  return {
    points: pts,
    closed,
    length: 30,
    components: [{ points: pts, closed, length: 30 }],
    unit: { code: 4, name: 'mm', isMm: true, isUnitless: false },
    bbox: { min: [0, 0, 0], max: [10, 10, 0] },
    entityCount: 4,
    issues: []
  };
}

describe('fmt', () => {
  it('strips trailing zeros while staying within 6-decimal precision', () => {
    expect(fmt(1.5)).toBe('1.5');
    expect(fmt(2)).toBe('2');
    expect(fmt(0)).toBe('0');
  });

  it('collapses negative zero', () => {
    expect(fmt(-0)).toBe('0');
  });

  it('respects 6-decimal precision', () => {
    expect(fmt(1 / 3)).toBe('0.333333');
  });
});

describe('emitBosl2', () => {
  it('includes BOSL2 install instructions and the include line', () => {
    const scad = emitBosl2(makeProfile(), makePath(true));
    expect(scad).toContain('include <BOSL2/std.scad>');
    expect(scad).toContain('BelfrySCAD/BOSL2');
  });

  it('emits polygon_points and path_points vector literals', () => {
    const scad = emitBosl2(makeProfile(), makePath(false));
    expect(scad).toMatch(/polygon_points\s*=\s*\[/);
    expect(scad).toMatch(/path_points\s*=\s*\[/);
    expect(scad).toContain('[-1, -0.25]');
    expect(scad).toContain('[10, 0, 0]');
  });

  it('passes detected closed topology to path_sweep and pins profile upright', () => {
    expect(emitBosl2(makeProfile(), makePath(true))).toContain(
      'path_sweep(polygon_points, path_points, closed=true, normal=[0,0,1]);'
    );
    expect(emitBosl2(makeProfile(), makePath(false))).toContain(
      'path_sweep(polygon_points, path_points, closed=false, normal=[0,0,1]);'
    );
  });
});

describe('emitHull', () => {
  it('does not require BOSL2', () => {
    const scad = emitHull(makeProfile(), makePath(false));
    expect(scad).not.toContain('BOSL2/std.scad');
    expect(scad).toContain('hull()');
  });

  it('emits per-segment beam entries with start and end tangents', () => {
    const scad = emitHull(makeProfile(), makePath(false));
    expect(scad).toMatch(/beams\s*=\s*\[/);
    expect(scad).toMatch(/miters\s*=\s*\[/);
    // Each beam row has four numeric fields.
    expect(scad).toMatch(/\[\s*\d+\s*,\s*\d+\s*,\s*-?\d/);
  });

  it('closed paths emit one beam per segment including the wraparound', () => {
    const scad = emitHull(makeProfile(), makePath(true));
    // makePath(true) has 4 points + closed → 4 segments → 4 beam entries.
    const beamsBlock = scad.match(/beams\s*=\s*\[([\s\S]*?)\];/);
    expect(beamsBlock).not.toBeNull();
    const rows = beamsBlock![1].split('\n').filter((l) => l.trim().startsWith('['));
    expect(rows.length).toBe(4);
  });

  it('90° corners are detected as sharp and produce miter fillers', () => {
    // makePath's 4-point rectangle has four 90° corners; closed → all four sharp.
    const scad = emitHull(makeProfile(), makePath(true));
    const miterBlock = scad.match(/miters\s*=\s*\[([\s\S]*?)\];/);
    expect(miterBlock).not.toBeNull();
    const rows = miterBlock![1].split('\n').filter((l) => l.trim().startsWith('['));
    expect(rows.length).toBe(4);
  });

  it('smooth discretised arcs do NOT emit miter fillers', () => {
    // 16-point circle approximation → every vertex's angle change is ~22.5°
    // at radius = 1, but a radius-10 discretisation keeps each step well under
    // the 15° threshold.
    const pts: Vec3[] = [];
    const N = 64;
    for (let i = 0; i < N; i++) {
      const t = (i * 2 * Math.PI) / N;
      pts.push([10 * Math.cos(t), 10 * Math.sin(t), 0]);
    }
    const path: PathResult = {
      points: pts,
      closed: true,
      length: 2 * Math.PI * 10,
      components: [{ points: pts, closed: true, length: 2 * Math.PI * 10 }],
      unit: { code: 4, name: 'mm', isMm: true, isUnitless: false },
      bbox: { min: [-10, -10, 0], max: [10, 10, 0] },
      entityCount: 1,
      issues: []
    };
    const scad = emitHull(makeProfile(), path);
    const miterBlock = scad.match(/miters\s*=\s*\[([\s\S]*?)\];/);
    expect(miterBlock).not.toBeNull();
    const rows = miterBlock![1].split('\n').filter((l) => l.trim().startsWith('['));
    expect(rows.length).toBe(0);
  });
});

describe('computeTangentsDeg', () => {
  it('tangent of a horizontal step is 0°', () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0]
    ];
    const t = computeTangentsDeg(pts, false);
    expect(t[1]).toBeCloseTo(0, 6);
  });

  it('tangent of a vertical step is 90°', () => {
    const pts: Vec3[] = [
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0]
    ];
    const t = computeTangentsDeg(pts, false);
    expect(t[1]).toBeCloseTo(90, 6);
  });
});

describe('multi-component emission', () => {
  function makeMulti(): PathResult {
    const a: Vec3[] = [[0, 0, 0], [1, 0, 0], [2, 0, 0]];
    const b: Vec3[] = [[10, 0, 0], [11, 1, 0], [12, 0, 0]];
    return {
      points: a,
      closed: false,
      length: 2,
      components: [
        { points: a, closed: false, length: 2 },
        { points: b, closed: true, length: 3 }
      ],
      unit: { code: 4, name: 'mm', isMm: true, isUnitless: false },
      bbox: { min: [0, 0, 0], max: [12, 1, 0] },
      entityCount: 6,
      issues: []
    };
  }

  it('BOSL2 emits one path_sweep per component inside a union()', () => {
    const scad = emitBosl2(makeProfile(), makeMulti());
    expect(scad).toContain('path_points_1');
    expect(scad).toContain('path_points_2');
    expect(scad).toContain('union() {');
    // Each component's closed flag is preserved.
    expect(scad).toMatch(/path_sweep\(polygon_points, path_points_1, closed=false, normal=\[0,0,1\]\);/);
    expect(scad).toMatch(/path_sweep\(polygon_points, path_points_2, closed=true, normal=\[0,0,1\]\);/);
  });

  it('hull emits one sweep module per component', () => {
    const scad = emitHull(makeProfile(), makeMulti());
    // sweep modules are now parameterised on the polygon variable
    expect(scad).toContain('module sweep_1(poly)');
    expect(scad).toContain('module sweep_2(poly)');
    expect(scad).toContain('sweep_1(polygon_points);');
    expect(scad).toContain('sweep_2(polygon_points);');
  });

  it('prism emits one segments list per component and no BOSL2 include', () => {
    const scad = emitPrism(makeProfile(), makeMulti());
    expect(scad).not.toContain('include <BOSL2');
    expect(scad).not.toContain('path_sweep(');
    expect(scad).toContain('segments_1 = [');
    expect(scad).toContain('segments_2 = [');
    expect(scad).toContain('module segment_prism(seg, poly)');
    // Component 2 is closed → its segments list should wrap back to the start.
    const seg2Match = scad.match(/segments_2 = \[([\s\S]*?)\];/);
    expect(seg2Match).not.toBeNull();
    // 3 points, closed → 3 segments (2 + 1 wrap).
    expect(seg2Match?.[1].split('\n').filter((l) => l.trim().startsWith('[[')).length).toBe(3);
  });
});

describe('emitPrism', () => {
  it('emits per-segment linear_extrude prisms with tangent + 90 rotation', () => {
    const path: PathResult = {
      points: [
        [0, 0, 0],
        [10, 0, 0],
        [10, 10, 0]
      ],
      closed: false,
      length: 20,
      components: [
        {
          points: [
            [0, 0, 0],
            [10, 0, 0],
            [10, 10, 0]
          ],
          closed: false,
          length: 20
        }
      ],
      unit: { code: 4, name: 'mm', isMm: true, isUnitless: false },
      bbox: { min: [0, 0, 0], max: [10, 10, 0] },
      entityCount: 2,
      issues: []
    };
    const scad = emitPrism(makeProfile(), path);
    expect(scad).toContain('linear_extrude(height = L)');
    expect(scad).toContain('rotate([0, 0, angle + 90])');
    expect(scad).toContain('rotate([90, 0, 0])');
    // Open path, 3 points → 2 segments.
    const segMatch = scad.match(/segments_1 = \[([\s\S]*?)\];/);
    expect(segMatch?.[1].split('\n').filter((l) => l.trim().startsWith('[[')).length).toBe(2);
  });
});

describe('remover profile (difference)', () => {
  it('BOSL2 emits a difference() block with both polygon lists', () => {
    const scad = emitBosl2(makeProfile(), makePath(true), { remover: makeRemoverProfile() });
    expect(scad).toContain('polygon_points = [');
    expect(scad).toContain('remover_polygon = [');
    expect(scad).toContain('difference() {');
    // Both polygon variables are passed into path_sweep calls.
    expect(scad).toMatch(/path_sweep\(polygon_points,/);
    expect(scad).toMatch(/path_sweep\(remover_polygon,/);
  });

  it('hull emits difference() with both polygon lists and shared prof_at', () => {
    const scad = emitHull(makeProfile(), makePath(true), { remover: makeRemoverProfile() });
    expect(scad).toContain('polygon_points = [');
    expect(scad).toContain('remover_polygon = [');
    expect(scad).toContain('difference() {');
    // prof_at now takes a poly arg.
    expect(scad).toMatch(/module prof_at\(p, ang, poly\)/);
    // The sweep module is invoked with each polygon variable once.
    expect(scad).toMatch(/sweep\(polygon_points\)/);
    expect(scad).toMatch(/sweep\(remover_polygon\)/);
  });

  it('prism emits difference() with parameterised segment_prism', () => {
    const scad = emitPrism(makeProfile(), makePath(true), { remover: makeRemoverProfile() });
    expect(scad).toContain('polygon_points = [');
    expect(scad).toContain('remover_polygon = [');
    expect(scad).toContain('difference() {');
    expect(scad).toMatch(/module segment_prism\(seg, poly\)/);
    expect(scad).toMatch(/segment_prism\(s, polygon_points\)/);
    expect(scad).toMatch(/segment_prism\(s, remover_polygon\)/);
  });

  it('without a remover, emitters do NOT wrap in difference()', () => {
    const bosl = emitBosl2(makeProfile(), makePath(true));
    const hull = emitHull(makeProfile(), makePath(true));
    const prism = emitPrism(makeProfile(), makePath(true));
    expect(bosl).not.toContain('difference() {');
    expect(hull).not.toContain('difference() {');
    expect(prism).not.toContain('difference() {');
    expect(bosl).not.toContain('remover_polygon');
    expect(hull).not.toContain('remover_polygon');
    expect(prism).not.toContain('remover_polygon');
  });
});
