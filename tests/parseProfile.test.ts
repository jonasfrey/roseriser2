import { describe, it, expect } from 'vitest';
import { parseProfileDxf, ProfileParseError } from '../src/dxf/parseProfile';

function lwpolyDxf(closed: boolean, verts: [number, number][]): string {
  const body = verts
    .map(([x, y]) => `10\n${x}\n20\n${y}`)
    .join('\n');
  return [
    '0', 'SECTION', '2', 'HEADER',
    '9', '$INSUNITS', '70', '4',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE',
    '5', '2A',
    '8', '0',
    '90', String(verts.length),
    '70', closed ? '1' : '0',
    body,
    '0', 'ENDSEC',
    '0', 'EOF'
  ].join('\n');
}

describe('parseProfileDxf', () => {
  it('parses a closed rectangle profile', () => {
    const dxf = lwpolyDxf(true, [
      [-1, -0.25],
      [1, -0.25],
      [1, 0.25],
      [-1, 0.25]
    ]);
    const r = parseProfileDxf(dxf, { chordTolerance: 0.01 });
    expect(r.vertices).toHaveLength(4);
    expect(r.vertices[0]).toEqual([-1, -0.25]);
    expect(r.closed).toBe(true);
    expect(r.unit.isMm).toBe(true);
    expect(r.bbox.min).toEqual([-1, -0.25]);
    expect(r.bbox.max).toEqual([1, 0.25]);
  });

  it('rejects a non-closed profile', () => {
    const dxf = lwpolyDxf(false, [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1]
    ]);
    expect(() => parseProfileDxf(dxf, { chordTolerance: 0.01 })).toThrow(ProfileParseError);
  });

  it('rejects a DXF whose entities do not form a closed loop', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LINE', '5', '1', '8', '0',
      '10', '0', '20', '0', '30', '0',
      '11', '1', '21', '1', '31', '0',
      '0', 'ENDSEC', '0', 'EOF'
    ].join('\n');
    expect(() => parseProfileDxf(dxf, { chordTolerance: 0.01 })).toThrow(/closed loop/);
  });

  it('rejects a DXF with no supported 2D entities', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'POINT', '5', 'A', '8', '0',
      '10', '0', '20', '0', '30', '0',
      '0', 'ENDSEC', '0', 'EOF'
    ].join('\n');
    expect(() => parseProfileDxf(dxf, { chordTolerance: 0.01 })).toThrow(/no supported 2D geometry/);
  });

  it('rejects a DXF with multiple closed polylines', () => {
    const a = lwpolyDxf(true, [[0, 0], [1, 0], [1, 1]]);
    const merged = a.replace(
      /0\nENDSEC\n0\nEOF/,
      '0\nLWPOLYLINE\n5\n2B\n8\n0\n90\n3\n70\n1\n10\n5\n20\n5\n10\n6\n20\n5\n10\n6\n20\n6\n0\nENDSEC\n0\nEOF'
    );
    expect(() => parseProfileDxf(merged, { chordTolerance: 0.01 })).toThrow(/closed loops/);
  });

  it('stitches LINE entities into a closed profile (Onshape-style export)', () => {
    // Four LINEs forming a closed rectangle.
    const lines: string[] = [];
    const addLine = (h: string, x1: number, y1: number, x2: number, y2: number) => {
      lines.push(
        '0', 'LINE', '5', h, '8', '0',
        '10', String(x1), '20', String(y1), '30', '0.0',
        '11', String(x2), '21', String(y2), '31', '0.0'
      );
    };
    addLine('A', 0, 0, 2, 0);
    addLine('B', 2, 0, 2, 1);
    addLine('C', 2, 1, 0, 1);
    addLine('D', 0, 1, 0, 0);
    const dxf = [
      '0', 'SECTION', '2', 'HEADER',
      '9', '$INSUNITS', '70', '4',
      '0', 'ENDSEC',
      '0', 'SECTION', '2', 'ENTITIES',
      ...lines,
      '0', 'ENDSEC', '0', 'EOF'
    ].join('\n');
    const r = parseProfileDxf(dxf, { chordTolerance: 0.01 });
    expect(r.closed).toBe(true);
    expect(r.vertices.length).toBeGreaterThanOrEqual(4);
    // The corners (0,0), (2,0), (2,1), (0,1) must all appear.
    const hasCorner = (x: number, y: number) =>
      r.vertices.some((v) => Math.abs(v[0] - x) < 1e-6 && Math.abs(v[1] - y) < 1e-6);
    expect(hasCorner(0, 0)).toBe(true);
    expect(hasCorner(2, 0)).toBe(true);
    expect(hasCorner(2, 1)).toBe(true);
    expect(hasCorner(0, 1)).toBe(true);
  });

  it('errors helpfully when LINEs do not close into a loop', () => {
    const dxf = [
      '0', 'SECTION', '2', 'ENTITIES',
      '0', 'LINE', '5', 'A', '8', '0',
      '10', '0', '20', '0', '30', '0',
      '11', '1', '21', '0', '31', '0',
      '0', 'LINE', '5', 'B', '8', '0',
      '10', '1', '20', '0', '30', '0',
      '11', '1', '21', '1', '31', '0',
      '0', 'ENDSEC', '0', 'EOF'
    ].join('\n');
    expect(() => parseProfileDxf(dxf, { chordTolerance: 0.01 })).toThrow(/closed loop/);
  });
});
