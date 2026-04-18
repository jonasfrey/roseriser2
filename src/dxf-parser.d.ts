declare module 'dxf-parser' {
  export interface DxfVertex {
    x: number;
    y: number;
    z?: number;
    bulge?: number;
  }

  export interface DxfPoint3 {
    x: number;
    y: number;
    z?: number;
  }

  export interface DxfHeader {
    $INSUNITS?: number;
    [key: string]: unknown;
  }

  export interface DxfEntityBase {
    type: string;
    handle?: string;
    layer?: string;
  }

  export interface DxfLwPolyline extends DxfEntityBase {
    type: 'LWPOLYLINE';
    vertices: DxfVertex[];
    shape?: boolean;
    closed?: boolean;
  }

  export interface DxfPolyline extends DxfEntityBase {
    type: 'POLYLINE';
    vertices: DxfVertex[];
    shape?: boolean;
    includesCurveFitVertices?: boolean;
    is3dPolyline?: boolean;
  }

  export interface DxfLine extends DxfEntityBase {
    type: 'LINE';
    vertices: DxfPoint3[];
  }

  export interface DxfArc extends DxfEntityBase {
    type: 'ARC';
    center: DxfPoint3;
    radius: number;
    startAngle: number;
    endAngle: number;
    angleLength?: number;
  }

  export interface DxfCircle extends DxfEntityBase {
    type: 'CIRCLE';
    center: DxfPoint3;
    radius: number;
  }

  export interface DxfSpline extends DxfEntityBase {
    type: 'SPLINE';
    controlPoints?: DxfPoint3[];
    fitPoints?: DxfPoint3[];
    knotValues?: number[];
    degreeOfSplineCurve?: number;
    numberOfControlPoints?: number;
    numberOfFitPoints?: number;
    closed?: boolean;
  }

  export type DxfEntity =
    | DxfLwPolyline
    | DxfPolyline
    | DxfLine
    | DxfArc
    | DxfCircle
    | DxfSpline
    | DxfEntityBase;

  export interface Dxf {
    header?: DxfHeader;
    entities: DxfEntity[];
  }

  export default class DxfParser {
    constructor();
    parseSync(text: string): Dxf;
    parse(text: string, cb: (err: Error | null, dxf?: Dxf) => void): void;
  }
}
