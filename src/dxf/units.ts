import type { DxfUnit } from '../types';

/**
 * Maps AutoCAD $INSUNITS integer codes to our internal unit descriptor.
 * We surface mm and unitless as first-class; everything else is flagged so
 * the UI can refuse to mix units across the two input files.
 */
const UNIT_NAMES: Record<number, string> = {
  0: 'unitless',
  1: 'in',
  2: 'ft',
  4: 'mm',
  5: 'cm',
  6: 'm',
  8: 'microinch',
  9: 'mil',
  10: 'yd',
  14: 'dm',
  21: 'AU'
};

export function describeUnit(code: number | undefined): DxfUnit {
  if (code === undefined) {
    return { code: undefined, name: 'unspecified', isMm: false, isUnitless: true };
  }
  const name = UNIT_NAMES[code] ?? `code-${code}`;
  return {
    code,
    name,
    isMm: code === 4,
    isUnitless: code === 0
  };
}

export interface UnitCompatibility {
  ok: boolean;
  reason?: string;
}

/**
 * Reject files with mismatched $INSUNITS. Unitless (0) and unspecified are
 * treated as "caller promises millimetres" per the v1 product decision.
 */
export function checkUnitsCompatible(a: DxfUnit, b: DxfUnit): UnitCompatibility {
  const aLoose = a.isUnitless || a.code === undefined;
  const bLoose = b.isUnitless || b.code === undefined;
  if (aLoose && bLoose) return { ok: true };
  if (aLoose !== bLoose) {
    return {
      ok: true // one is declared, other is loose: accept but caller may warn
    };
  }
  if (a.code === b.code) return { ok: true };
  return {
    ok: false,
    reason: `Profile is in ${a.name}, path is in ${b.name}. Re-export both files in the same unit.`
  };
}

export function isNonMillimetre(unit: DxfUnit): boolean {
  return !unit.isMm && !unit.isUnitless && unit.code !== undefined;
}
