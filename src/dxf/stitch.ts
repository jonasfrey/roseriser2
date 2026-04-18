import type { ParseIssue, PathComponent, Vec2, Vec3 } from '../types';
import { dist2, polylineLength3 } from '../lib/geometry';
import type { EntityPolyline } from './discretize';

export interface StitchResult {
  components: PathComponent[];
  issues: ParseIssue[];
}

/**
 * Greedy endpoint stitcher.
 *
 * Strategy: pop one polyline to seed a component, then repeatedly find any
 * remaining polyline whose start or end is within `tolerance` of the growing
 * component's tail. Reverse when needed. If the tail eventually meets the
 * head, mark the component closed. Inherently closed polylines (circle,
 * closed LWPOLYLINE) become their own component without any stitching.
 */
export function stitchPolylines(
  polylines: ReadonlyArray<EntityPolyline>,
  tolerance: number
): StitchResult {
  const issues: ParseIssue[] = [];
  const remaining: EntityPolyline[] = polylines.slice();
  const components: PathComponent[] = [];

  // Lift inherently closed polylines straight out as their own components.
  for (let i = remaining.length - 1; i >= 0; i--) {
    if (remaining[i].closed) {
      const poly = remaining[i];
      const points3 = lift(poly.points);
      components.push({
        points: points3,
        closed: true,
        length: polylineLength3(points3)
      });
      remaining.splice(i, 1);
    }
  }

  while (remaining.length > 0) {
    const seed = remaining.shift()!;
    const points: Vec2[] = seed.points.slice();

    let extended = true;
    while (extended && remaining.length > 0) {
      extended = false;
      const tail = points[points.length - 1];
      for (let i = 0; i < remaining.length; i++) {
        const cand = remaining[i];
        const candStart = cand.points[0];
        const candEnd = cand.points[cand.points.length - 1];
        if (dist2(tail, candStart) <= tolerance) {
          points.push(...cand.points.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
        if (dist2(tail, candEnd) <= tolerance) {
          const rev = cand.points.slice().reverse();
          points.push(...rev.slice(1));
          remaining.splice(i, 1);
          extended = true;
          break;
        }
      }

      if (!extended) {
        // Try the head as well — the seed's natural direction may be wrong.
        const head = points[0];
        for (let i = 0; i < remaining.length; i++) {
          const cand = remaining[i];
          const candStart = cand.points[0];
          const candEnd = cand.points[cand.points.length - 1];
          if (dist2(head, candEnd) <= tolerance) {
            points.unshift(...cand.points.slice(0, -1));
            remaining.splice(i, 1);
            extended = true;
            break;
          }
          if (dist2(head, candStart) <= tolerance) {
            const rev = cand.points.slice().reverse();
            points.unshift(...rev.slice(0, -1));
            remaining.splice(i, 1);
            extended = true;
            break;
          }
        }
      }
    }

    const closed = points.length >= 3 && dist2(points[0], points[points.length - 1]) <= tolerance;
    const finalPoints = closed ? points.slice(0, -1) : points;
    const points3 = lift(finalPoints);
    components.push({
      points: points3,
      closed,
      length: polylineLength3(points3)
    });
  }

  if (components.length > 1) {
    issues.push({
      message: `path has ${components.length} disconnected components after stitching — each will be swept and union()'d in the output. Raise the stitch tolerance if they should join into a single path.`,
      severity: 'warning'
    });
  }

  // Primary component = longest (by point count) so the UI shows the main loop.
  components.sort((a, b) => b.points.length - a.points.length);

  return { components, issues };
}

function lift(points: readonly Vec2[]): Vec3[] {
  return points.map((p) => [p[0], p[1], 0] as Vec3);
}
