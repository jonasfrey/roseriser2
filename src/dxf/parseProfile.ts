import DxfParser, { type Dxf, type DxfEntity } from 'dxf-parser';
import type { ParseIssue, ProfileResult, Vec2 } from '../types';
import { bbox2, bboxDiagonal2 } from '../lib/geometry';
import { discretizeEntities, expandPolyline } from './discretize';
import { stitchPolylines } from './stitch';
import { describeUnit } from './units';

export class ProfileParseError extends Error {
  readonly issues: ParseIssue[];
  constructor(message: string, issues: ParseIssue[] = []) {
    super(message);
    this.name = 'ProfileParseError';
    this.issues = issues;
  }
}

export interface ProfileParseOptions {
  /** Absolute chord tolerance used when the profile contains bulges (arcs). */
  chordTolerance: number;
  /**
   * Endpoint-match tolerance when stitching LINE/ARC-composed profiles.
   * Null = derive from 1e-3 × bbox diagonal.
   */
  stitchTolerance?: number | null;
}

const SUPPORTED_TYPES = new Set([
  'LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE'
]);

/**
 * Profile DXFs must describe exactly one closed 2D loop. We accept two shapes
 * of input:
 *   1. A single closed LWPOLYLINE or POLYLINE (preferred, zero ambiguity).
 *   2. A collection of LINE/ARC/CIRCLE/SPLINE entities that stitch into
 *      exactly one closed loop — this is what Onshape, Fusion 360 and many
 *      browser CAD tools produce when exporting a sketch region as DXF.
 */
export function parseProfileDxf(text: string, opts: ProfileParseOptions): ProfileResult {
  const parser = new DxfParser();
  let dxf: Dxf;
  try {
    dxf = parser.parseSync(text);
  } catch (err) {
    throw new ProfileParseError(
      `failed to parse profile DXF: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const allEntities = (dxf.entities ?? []) as DxfEntity[];
  const entityTypeCounts = countTypes(allEntities);
  const unit = describeUnit(dxf.header?.$INSUNITS);

  // Fast path: a single closed LWPOLYLINE/POLYLINE is unambiguous.
  const closedPolylines = allEntities.filter(
    (e) =>
      (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') &&
      ((e as { shape?: boolean }).shape === true ||
        (e as { closed?: boolean }).closed === true)
  );
  if (closedPolylines.length === 1 && countSupported(allEntities) === 1) {
    const entity = closedPolylines[0] as Extract<
      DxfEntity,
      { type: 'LWPOLYLINE' } | { type: 'POLYLINE' }
    >;
    const { points } = expandPolyline(entity, opts.chordTolerance);
    const verts = trimClosingDuplicate(points);
    if (verts.length < 3) {
      throw new ProfileParseError('profile polyline has fewer than 3 distinct vertices');
    }
    return { vertices: verts, unit, bbox: bbox2(verts), closed: true, issues: [] };
  }

  // General path: discretise every supported entity then stitch.
  const supported = allEntities.filter((e) => SUPPORTED_TYPES.has(e.type));
  if (supported.length === 0) {
    throw new ProfileParseError(
      `profile DXF has no supported 2D geometry — found: ${formatTypeCounts(entityTypeCounts)}. Export the cross-section as a closed sketch region.`
    );
  }

  const disc = discretizeEntities(supported, {
    chordTolerance: opts.chordTolerance,
    splineSamplesPerSpan: 32
  });
  const issues: ParseIssue[] = [...disc.issues];

  // Derive stitch tolerance from bbox unless caller specifies.
  let stitchTol = opts.stitchTolerance ?? null;
  if (stitchTol === null || stitchTol <= 0) {
    const allPts = disc.polylines.flatMap((p) => p.points);
    if (allPts.length === 0) {
      throw new ProfileParseError(
        'profile entities produced no geometry after discretisation',
        issues
      );
    }
    const diag = bboxDiagonal2(bbox2(allPts));
    stitchTol = Math.max(1e-6, diag * 1e-3);
  }

  const stitched = stitchPolylines(disc.polylines, stitchTol);
  issues.push(...stitched.issues);

  const closedComponents = stitched.components.filter((c) => c.closed);

  if (stitched.components.length === 0) {
    throw new ProfileParseError('profile stitched to zero components', issues);
  }
  if (closedComponents.length === 0) {
    const openEnds = stitched.components
      .map((c, i) => `#${i + 1}: ${c.points.length} points, ends ${fmtPoint(c.points[0])} → ${fmtPoint(c.points[c.points.length - 1])}`)
      .join('; ');
    throw new ProfileParseError(
      `profile does not form a closed loop — got ${stitched.components.length} open component(s): ${openEnds}. Check that your sketch region is closed, or increase the stitch tolerance.`,
      issues
    );
  }
  if (closedComponents.length > 1) {
    throw new ProfileParseError(
      `profile has ${closedComponents.length} closed loops — Roseriser expects exactly one closed cross-section. Export only the outer boundary of your region.`,
      issues
    );
  }
  if (stitched.components.length > closedComponents.length) {
    issues.push({
      severity: 'warning',
      message: `profile has extra open entities alongside the closed loop; they were ignored`
    });
  }

  const verts: Vec2[] = closedComponents[0].points.map((p) => [p[0], p[1]]);
  if (verts.length < 3) {
    throw new ProfileParseError('profile closed loop has fewer than 3 distinct vertices', issues);
  }

  return {
    vertices: verts,
    unit,
    bbox: bbox2(verts),
    closed: true,
    issues
  };
}

function countTypes(entities: ReadonlyArray<DxfEntity>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of entities) counts[e.type] = (counts[e.type] ?? 0) + 1;
  return counts;
}

function countSupported(entities: ReadonlyArray<DxfEntity>): number {
  let n = 0;
  for (const e of entities) if (SUPPORTED_TYPES.has(e.type)) n++;
  return n;
}

function formatTypeCounts(counts: Record<string, number>): string {
  const parts = Object.entries(counts).map(([t, n]) => `${t}×${n}`);
  return parts.length > 0 ? parts.join(', ') : '(none)';
}

function trimClosingDuplicate(points: ReadonlyArray<Vec2>): Vec2[] {
  if (points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]) {
    return points.slice(0, -1);
  }
  return points.slice();
}

function fmtPoint(p: readonly number[] | undefined): string {
  if (!p) return '(?)';
  return `(${(p[0] ?? 0).toFixed(3)}, ${(p[1] ?? 0).toFixed(3)})`;
}
