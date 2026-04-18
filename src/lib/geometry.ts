import type { BBox2, BBox3, Vec2, Vec3 } from '../types';

export const TAU = Math.PI * 2;

export function sub2(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

export function dist2(a: Vec2, b: Vec2): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return Math.hypot(dx, dy);
}

export function dist3(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return Math.hypot(dx, dy, dz);
}

export function bbox2(points: readonly Vec2[]): BBox2 {
  if (points.length === 0) return { min: [0, 0], max: [0, 0] };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
  }
  return { min: [minX, minY], max: [maxX, maxY] };
}

export function bbox3(points: readonly Vec3[]): BBox3 {
  if (points.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    if (p[0] < minX) minX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[2] < minZ) minZ = p[2];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] > maxY) maxY = p[1];
    if (p[2] > maxZ) maxZ = p[2];
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

export function bboxDiagonal2(bb: BBox2): number {
  return Math.hypot(bb.max[0] - bb.min[0], bb.max[1] - bb.min[1]);
}

export function bboxDiagonal3(bb: BBox3): number {
  return Math.hypot(
    bb.max[0] - bb.min[0],
    bb.max[1] - bb.min[1],
    bb.max[2] - bb.min[2]
  );
}

export function polylineLength3(points: readonly Vec3[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist3(points[i - 1], points[i]);
  return s;
}

/**
 * Split an arc into line segments whose chord deviates from the true arc by
 * at most `chordTolerance`. Angle inputs are radians, CCW from startAngle
 * to endAngle (DXF arc convention).
 */
export function discretizeArc(
  center: Vec2,
  radius: number,
  startAngle: number,
  endAngle: number,
  chordTolerance: number
): Vec2[] {
  if (radius <= 0) return [[center[0], center[1]]];
  // DXF arcs are always CCW; normalise end >= start.
  let sweep = endAngle - startAngle;
  while (sweep <= 0) sweep += TAU;
  while (sweep > TAU) sweep -= TAU;

  // Max segment angle such that sagitta <= tol: theta = 2 * acos(1 - tol/r).
  const ratio = Math.max(0, 1 - chordTolerance / radius);
  const maxStep = ratio >= 1 ? TAU / 8 : 2 * Math.acos(ratio);
  const segments = Math.max(1, Math.ceil(sweep / maxStep));
  const out: Vec2[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = startAngle + (sweep * i) / segments;
    out.push([center[0] + radius * Math.cos(a), center[1] + radius * Math.sin(a)]);
  }
  return out;
}

export function discretizeCircle(
  center: Vec2,
  radius: number,
  chordTolerance: number
): Vec2[] {
  // Full-turn CCW starting at angle 0. Produces a closed loop with first == last.
  return discretizeArc(center, radius, 0, TAU, chordTolerance);
}

/**
 * Convert an LWPOLYLINE bulge segment to an arc and discretise it.
 *
 * Convention: positive bulge places the arc on the LEFT of the chord
 * direction (v1→v2), matching AutoCAD and ezdxf visuals. Negative bulge
 * places the arc on the RIGHT. bulge = tan(includedAngle / 4); the absolute
 * value controls arc depth (|bulge|=1 is a semicircle).
 *
 * Returns points starting at p1 but excluding p2; the caller owns p2 as the
 * next segment's start.
 */
export function discretizeBulge(
  p1: Vec2,
  p2: Vec2,
  bulge: number,
  chordTolerance: number
): Vec2[] {
  if (Math.abs(bulge) < 1e-12) return [p1];
  const chord = dist2(p1, p2);
  if (chord < 1e-12) return [p1];

  const theta = 4 * Math.atan(Math.abs(bulge));
  const radius = chord / (2 * Math.sin(theta / 2));
  const mid: Vec2 = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];

  // "Left" of travel direction (v1 → v2) in the XY plane.
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const perpLen = Math.hypot(dx, dy);
  const leftX = -dy / perpLen;
  const leftY = dx / perpLen;

  // Arc bulges to the LEFT for bulge>0, so the centre sits on the RIGHT
  // (opposite side) at perpendicular distance r·cos(θ/2).
  const offset = radius * Math.cos(theta / 2);
  const sideSign = bulge > 0 ? -1 : 1;
  const center: Vec2 = [
    mid[0] + leftX * offset * sideSign,
    mid[1] + leftY * offset * sideSign
  ];

  const a1 = Math.atan2(p1[1] - center[1], p1[0] - center[0]);
  const a2 = Math.atan2(p2[1] - center[1], p2[0] - center[0]);

  // We want the MINOR arc (sweep = θ) from p1 to p2.
  // Positive bulge → centre is on the right, so CCW v1→v2 goes the LONG way.
  //   → sample CCW v2→v1 (which IS the short way) and reverse so the output
  //     runs from v1 toward v2.
  // Negative bulge → centre is on the left, and CCW v1→v2 is already short.
  let arc: Vec2[];
  if (bulge > 0) {
    arc = discretizeArc(center, radius, a2, a1, chordTolerance).slice().reverse();
  } else {
    arc = discretizeArc(center, radius, a1, a2, chordTolerance);
  }
  return arc.slice(0, -1);
}

/**
 * Evaluate a clamped or unclamped B-spline at parameter t using de Boor's
 * algorithm. Weights are not supported (rational splines degrade to their
 * polynomial control polygon); we flag this at the call site.
 */
export function deBoor(
  t: number,
  degree: number,
  knots: number[],
  controls: Vec2[]
): Vec2 {
  const n = controls.length;
  const tMin = knots[degree];
  const tMax = knots[n];
  let tt = Math.min(Math.max(t, tMin), tMax);

  // Find k such that knots[k] <= tt < knots[k+1], clamped at the upper end.
  let k = degree;
  while (k < n - 1 && knots[k + 1] <= tt) k++;
  if (tt === tMax) k = n - 1;

  const d: Vec2[] = [];
  for (let j = 0; j <= degree; j++) {
    const idx = Math.max(0, Math.min(n - 1, j + k - degree));
    const cp = controls[idx];
    d[j] = [cp[0], cp[1]];
  }

  for (let r = 1; r <= degree; r++) {
    for (let j = degree; j >= r; j--) {
      const i = j + k - degree;
      const denom = knots[i + degree - r + 1] - knots[i];
      const alpha = denom === 0 ? 0 : (tt - knots[i]) / denom;
      d[j] = [
        (1 - alpha) * d[j - 1][0] + alpha * d[j][0],
        (1 - alpha) * d[j - 1][1] + alpha * d[j][1]
      ];
    }
  }
  return d[degree];
}

export function discretizeSpline(
  controls: Vec2[],
  knots: number[],
  degree: number,
  samplesPerSpan: number
): Vec2[] {
  if (controls.length < 2 || knots.length < controls.length + degree + 1) {
    return controls.slice();
  }
  const tMin = knots[degree];
  const tMax = knots[controls.length];
  const samples: Vec2[] = [];
  const uniqueSpans: number[] = [tMin];
  for (let i = degree + 1; i <= controls.length; i++) {
    if (knots[i] > uniqueSpans[uniqueSpans.length - 1]) uniqueSpans.push(knots[i]);
  }
  if (uniqueSpans[uniqueSpans.length - 1] < tMax) uniqueSpans.push(tMax);

  for (let s = 0; s < uniqueSpans.length - 1; s++) {
    const a = uniqueSpans[s];
    const b = uniqueSpans[s + 1];
    const steps = Math.max(2, samplesPerSpan);
    const startAt = s === 0 ? 0 : 1;
    for (let i = startAt; i <= steps; i++) {
      const t = a + ((b - a) * i) / steps;
      samples.push(deBoor(t, degree, knots, controls));
    }
  }
  return samples;
}

/** Clone a point array as mutable Vec2[]. */
export function toVec2(points: ReadonlyArray<{ x: number; y: number }>): Vec2[] {
  return points.map((p) => [p.x, p.y] as Vec2);
}

export function numEq(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) <= eps;
}
