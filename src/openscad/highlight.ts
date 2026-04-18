export type TokenKind = 'comment' | 'string' | 'number' | 'keyword' | 'builtin' | 'ident' | 'text';
export interface Token {
  kind: TokenKind;
  text: string;
}

const KEYWORDS = new Set([
  'module', 'function', 'if', 'else', 'for', 'let', 'include', 'use',
  'true', 'false', 'undef', 'each', 'assert', 'echo'
]);

const BUILTINS = new Set([
  'translate', 'rotate', 'scale', 'mirror', 'resize', 'multmatrix',
  'linear_extrude', 'rotate_extrude', 'offset', 'projection',
  'hull', 'minkowski', 'union', 'difference', 'intersection',
  'polygon', 'square', 'circle', 'text',
  'cube', 'sphere', 'cylinder', 'polyhedron',
  'path_sweep', 'path_sweep2d', 'skin', 'vnf_polyhedron'
]);

/**
 * Minimal OpenSCAD tokenizer. Not a full parser — just enough to apply
 * colour classes. Safe to render via React because we never produce HTML.
 */
export function tokenizeScad(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      tokens.push({ kind: 'comment', text: code.slice(i, stop) });
      i = stop;
      continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      tokens.push({ kind: 'comment', text: code.slice(i, stop) });
      i = stop;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n && code[j] !== '"') {
        if (code[j] === '\\' && j + 1 < n) j++;
        j++;
      }
      j = Math.min(n, j + 1);
      tokens.push({ kind: 'string', text: code.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === '-' && i + 1 < n && /[0-9.]/.test(code[i + 1]) && prevIsOperator(tokens))) {
      let j = i + 1;
      while (j < n && /[0-9.eE+\-]/.test(code[j])) {
        // don't eat the '-' that starts the next expression
        if ((code[j] === '+' || code[j] === '-') && code[j - 1] !== 'e' && code[j - 1] !== 'E') break;
        j++;
      }
      tokens.push({ kind: 'number', text: code.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(code[j])) j++;
      const text = code.slice(i, j);
      let kind: TokenKind = 'ident';
      if (KEYWORDS.has(text)) kind = 'keyword';
      else if (BUILTINS.has(text)) kind = 'builtin';
      tokens.push({ kind, text });
      i = j;
      continue;
    }
    tokens.push({ kind: 'text', text: c });
    i++;
  }
  return tokens;
}

function prevIsOperator(tokens: Token[]): boolean {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const t = tokens[i];
    if (t.kind !== 'text') return false;
    const last = t.text.trim();
    if (last.length === 0) continue;
    return /[=,;(+\-*/[%<>!&|?:]/.test(last[last.length - 1]);
  }
  return true;
}
