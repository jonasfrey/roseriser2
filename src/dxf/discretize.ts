import type { DxfEntity } from 'dxf-parser';
import type { ParseIssue, Vec2 } from '../types';
import {
  discretizeArc,
  discretizeBulge,
  discretizeCircle,
  discretizeSpline
} from '../lib/geometry';

/**
 * Converts a single DXF entity to a 2D polyline plus topology info.
 * `closed` means the entity itself is inherently closed (circle, closed LWPOLYLINE);
 * such entities will short-circuit path stitching.
 */
export interface EntityPolyline {
  handle: string;
  type: string;
  points: Vec2[];
  closed: boolean;
}

export interface DiscretizeResult {
  polylines: EntityPolyline[];
  issues: ParseIssue[];
}

export interface DiscretizeOptions {
  chordTolerance: number;
  splineSamplesPerSpan: number;
}

export function discretizeEntities(
  entities: ReadonlyArray<DxfEntity>,
  opts: DiscretizeOptions
): DiscretizeResult {
  const polylines: EntityPolyline[] = [];
  const issues: ParseIssue[] = [];

  for (const ent of entities) {
    const handle = (ent as { handle?: string }).handle ?? '(no handle)';
    try {
      switch (ent.type) {
        case 'LINE': {
          const e = ent as Extract<DxfEntity, { type: 'LINE' }>;
          if (!e.vertices || e.vertices.length < 2) {
            issues.push({ entityType: e.type, handle, message: 'LINE with fewer than 2 vertices', severity: 'warning' });
            break;
          }
          polylines.push({
            handle,
            type: 'LINE',
            points: [
              [e.vertices[0].x, e.vertices[0].y],
              [e.vertices[1].x, e.vertices[1].y]
            ],
            closed: false
          });
          break;
        }
        case 'ARC': {
          const e = ent as Extract<DxfEntity, { type: 'ARC' }>;
          const points = discretizeArc(
            [e.center.x, e.center.y],
            e.radius,
            e.startAngle,
            e.endAngle,
            opts.chordTolerance
          );
          polylines.push({ handle, type: 'ARC', points, closed: false });
          break;
        }
        case 'CIRCLE': {
          const e = ent as Extract<DxfEntity, { type: 'CIRCLE' }>;
          const pts = discretizeCircle([e.center.x, e.center.y], e.radius, opts.chordTolerance);
          polylines.push({ handle, type: 'CIRCLE', points: pts, closed: true });
          break;
        }
        case 'LWPOLYLINE':
        case 'POLYLINE': {
          const e = ent as Extract<DxfEntity, { type: 'LWPOLYLINE' } | { type: 'POLYLINE' }>;
          const { points, closed } = expandPolyline(e, opts.chordTolerance);
          if (points.length >= 2) {
            polylines.push({ handle, type: e.type, points, closed });
          } else {
            issues.push({ entityType: e.type, handle, message: 'polyline has fewer than 2 vertices', severity: 'warning' });
          }
          break;
        }
        case 'SPLINE': {
          const e = ent as Extract<DxfEntity, { type: 'SPLINE' }>;
          const pts = discretizeSplineEntity(e, opts.splineSamplesPerSpan, issues, handle);
          if (pts.length >= 2) {
            polylines.push({ handle, type: 'SPLINE', points: pts, closed: !!e.closed });
          }
          break;
        }
        default:
          issues.push({
            entityType: ent.type,
            handle,
            message: `unsupported entity type ${ent.type} in path — ignored`,
            severity: 'warning'
          });
      }
    } catch (err) {
      issues.push({
        entityType: ent.type,
        handle,
        message: `discretisation failed: ${err instanceof Error ? err.message : String(err)}`,
        severity: 'error'
      });
    }
  }

  return { polylines, issues };
}

export function expandPolyline(
  e: { vertices: { x: number; y: number; bulge?: number }[]; shape?: boolean; closed?: boolean },
  chordTolerance: number
): { points: Vec2[]; closed: boolean } {
  const closed = !!(e.shape || e.closed);
  const verts = e.vertices;
  if (verts.length < 2) return { points: verts.map((v) => [v.x, v.y] as Vec2), closed };

  const out: Vec2[] = [];
  const end = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < end; i++) {
    const v1 = verts[i];
    const v2 = verts[(i + 1) % verts.length];
    const p1: Vec2 = [v1.x, v1.y];
    const p2: Vec2 = [v2.x, v2.y];
    const bulge = v1.bulge ?? 0;
    if (Math.abs(bulge) > 1e-12) {
      out.push(...discretizeBulge(p1, p2, bulge, chordTolerance));
    } else {
      out.push(p1);
    }
  }
  if (!closed) {
    const last = verts[verts.length - 1];
    out.push([last.x, last.y]);
  } else {
    // Re-append first point to visualise closure; stitch layer relies on this.
    out.push([verts[0].x, verts[0].y]);
  }
  return { points: out, closed };
}

function discretizeSplineEntity(
  e: Extract<DxfEntity, { type: 'SPLINE' }>,
  samplesPerSpan: number,
  issues: ParseIssue[],
  handle: string
): Vec2[] {
  if (e.controlPoints && e.controlPoints.length >= 2 && e.knotValues && e.knotValues.length > 0) {
    const degree = e.degreeOfSplineCurve ?? 3;
    const cps: Vec2[] = e.controlPoints.map((p) => [p.x, p.y]);
    return discretizeSpline(cps, e.knotValues.slice(), degree, samplesPerSpan);
  }
  if (e.fitPoints && e.fitPoints.length >= 2) {
    issues.push({
      entityType: 'SPLINE',
      handle,
      message: 'SPLINE had fit points but no usable control-point/knot data; sampled fit points linearly',
      severity: 'warning'
    });
    return e.fitPoints.map((p) => [p.x, p.y]);
  }
  issues.push({
    entityType: 'SPLINE',
    handle,
    message: 'SPLINE had neither control points nor fit points; skipped',
    severity: 'warning'
  });
  return [];
}
