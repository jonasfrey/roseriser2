import DxfParser, { type Dxf, type DxfEntity } from 'dxf-parser';
import type { DiscretizationOptions, ParseIssue, PathResult, StitchOptions } from '../types';
import { bbox3, bboxDiagonal2 } from '../lib/geometry';
import { discretizeEntities } from './discretize';
import { stitchPolylines } from './stitch';
import { describeUnit } from './units';

const SUPPORTED_ENTITY_TYPES = new Set([
  'LINE', 'ARC', 'CIRCLE', 'LWPOLYLINE', 'POLYLINE', 'SPLINE'
]);

export class PathParseError extends Error {
  readonly issues: ParseIssue[];
  constructor(message: string, issues: ParseIssue[] = []) {
    super(message);
    this.name = 'PathParseError';
    this.issues = issues;
  }
}

export interface PathParseOptions {
  discretization: DiscretizationOptions;
  /**
   * Stitch tolerance. `null` means "derive from 1e-3 × bbox diagonal".
   */
  stitch: StitchOptions | null;
}

export function parsePathDxf(text: string, opts: PathParseOptions): PathResult {
  const parser = new DxfParser();
  let dxf: Dxf;
  try {
    dxf = parser.parseSync(text);
  } catch (err) {
    throw new PathParseError(`failed to parse path DXF: ${err instanceof Error ? err.message : String(err)}`);
  }

  const issues: ParseIssue[] = [];
  const allEntities = (dxf.entities ?? []) as DxfEntity[];
  const pathEntities = allEntities.filter((e) => SUPPORTED_ENTITY_TYPES.has(e.type));

  if (pathEntities.length === 0) {
    throw new PathParseError('path DXF has no supported entities (LINE, ARC, CIRCLE, LWPOLYLINE, POLYLINE, SPLINE)');
  }

  for (const ent of allEntities) {
    if (!SUPPORTED_ENTITY_TYPES.has(ent.type)) {
      issues.push({
        entityType: ent.type,
        handle: (ent as { handle?: string }).handle,
        message: `unsupported entity type ${ent.type} ignored`,
        severity: 'warning'
      });
    }
  }

  const disc = discretizeEntities(pathEntities, opts.discretization);
  issues.push(...disc.issues);

  // Derive stitch tolerance from bbox if caller didn't supply one.
  let stitchTol = opts.stitch?.tolerance;
  if (stitchTol === undefined || stitchTol === null || stitchTol <= 0) {
    const allPts = disc.polylines.flatMap((p) => p.points);
    const flatBbox = {
      min: [Math.min(...allPts.map((p) => p[0])), Math.min(...allPts.map((p) => p[1]))] as const,
      max: [Math.max(...allPts.map((p) => p[0])), Math.max(...allPts.map((p) => p[1]))] as const
    };
    const diag = bboxDiagonal2({ min: [flatBbox.min[0], flatBbox.min[1]], max: [flatBbox.max[0], flatBbox.max[1]] });
    stitchTol = Math.max(1e-6, diag * 1e-3);
  }

  const stitched = stitchPolylines(disc.polylines, stitchTol);
  issues.push(...stitched.issues);

  if (stitched.components.length === 0) {
    throw new PathParseError('path produced zero components — no stitchable entities were found', issues);
  }

  const primary = stitched.components[0];
  return {
    points: primary.points,
    closed: primary.closed,
    length: primary.length,
    components: stitched.components,
    unit: describeUnit(dxf.header?.$INSUNITS),
    bbox: bbox3(primary.points),
    entityCount: pathEntities.length,
    issues
  };
}
