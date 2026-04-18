export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

export type DxfUnitCode = number | undefined;

export interface DxfUnit {
  code: DxfUnitCode;
  name: string;
  isMm: boolean;
  isUnitless: boolean;
}

export interface BBox2 {
  min: Vec2;
  max: Vec2;
}

export interface BBox3 {
  min: Vec3;
  max: Vec3;
}

export interface ParseIssue {
  entityType?: string;
  handle?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ProfileResult {
  vertices: Vec2[];
  unit: DxfUnit;
  bbox: BBox2;
  closed: true;
  issues: ParseIssue[];
}

/**
 * A contiguous run of path points after stitching. Most files produce one
 * component; multi-component results indicate the path has disconnected
 * pieces, which we expose so the user can fix the source DXF.
 */
export interface PathComponent {
  points: Vec3[];
  closed: boolean;
  length: number;
}

export interface PathResult {
  /** Primary component used for OpenSCAD emission. */
  points: Vec3[];
  closed: boolean;
  length: number;

  /** All stitched components, primary first. */
  components: PathComponent[];

  unit: DxfUnit;
  bbox: BBox3;
  entityCount: number;
  issues: ParseIssue[];
}

export interface DiscretizationOptions {
  /** Maximum distance between chord and arc, in drawing units. */
  chordTolerance: number;
  /** Fallback sample count per spline knot span. */
  splineSamplesPerSpan: number;
}

export interface StitchOptions {
  /** Endpoint-match tolerance in drawing units. */
  tolerance: number;
}

export type EmitterMode = 'bosl2' | 'hull' | 'prism';
