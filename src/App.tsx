import { useEffect, useMemo, useState } from 'react';
import { FileDrop } from './components/FileDrop';
import { SvgPreview } from './components/SvgPreview';
import { CodeView } from './components/CodeView';
import { ErrorPanel } from './components/ErrorPanel';
import {
  ProfileParseError,
  PathParseError,
  parseProfileDxf,
  parsePathDxf,
  checkUnitsCompatible,
  isNonMillimetre
} from './dxf';
import { emitBosl2, emitHull, emitPrism } from './openscad';
import type {
  EmitterMode,
  ParseIssue,
  PathResult,
  ProfileResult,
  Vec2
} from './types';

interface Options {
  chordTolerance: number;
  splineSamplesPerSpan: number;
  stitchTolerance: number | null; // null → auto
}

const DEFAULT_OPTIONS: Options = {
  chordTolerance: 0.1,
  splineSamplesPerSpan: 20,
  stitchTolerance: null
};

export function App() {
  const [profileFile, setProfileFile] = useState<File | null>(null);
  const [pathFile, setPathFile] = useState<File | null>(null);
  const [profileText, setProfileText] = useState<string | null>(null);
  const [pathText, setPathText] = useState<string | null>(null);

  const [profile, setProfile] = useState<ProfileResult | null>(null);
  const [path, setPath] = useState<PathResult | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  const [profileIssues, setProfileIssues] = useState<ParseIssue[]>([]);
  const [pathIssues, setPathIssues] = useState<ParseIssue[]>([]);
  const [unitMismatch, setUnitMismatch] = useState<string | null>(null);

  const [opts, setOpts] = useState<Options>(DEFAULT_OPTIONS);
  const [emitter, setEmitter] = useState<EmitterMode>('bosl2');
  const [dark, setDark] = useState<boolean>(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }, [dark]);

  // Read dropped files as text.
  useEffect(() => {
    if (!profileFile) return;
    profileFile.text().then(setProfileText).catch((e) => setProfileError(String(e)));
  }, [profileFile]);
  useEffect(() => {
    if (!pathFile) return;
    pathFile.text().then(setPathText).catch((e) => setPathError(String(e)));
  }, [pathFile]);

  // Parse profile whenever its text or the relevant option changes.
  useEffect(() => {
    if (!profileText) return;
    try {
      const r = parseProfileDxf(profileText, {
        chordTolerance: opts.chordTolerance,
        stitchTolerance: opts.stitchTolerance
      });
      setProfile(r);
      setProfileError(null);
      setProfileIssues(r.issues);
    } catch (err) {
      setProfile(null);
      if (err instanceof ProfileParseError) {
        setProfileError(err.message);
        setProfileIssues(err.issues);
      } else {
        setProfileError(err instanceof Error ? err.message : String(err));
        setProfileIssues([]);
      }
    }
  }, [profileText, opts.chordTolerance, opts.stitchTolerance]);

  // Parse path whenever its text or discretization options change.
  useEffect(() => {
    if (!pathText) return;
    try {
      const r = parsePathDxf(pathText, {
        discretization: {
          chordTolerance: opts.chordTolerance,
          splineSamplesPerSpan: opts.splineSamplesPerSpan
        },
        stitch: opts.stitchTolerance !== null ? { tolerance: opts.stitchTolerance } : null
      });
      setPath(r);
      setPathError(null);
      setPathIssues(r.issues);
    } catch (err) {
      setPath(null);
      if (err instanceof PathParseError) {
        setPathError(err.message);
        setPathIssues(err.issues);
      } else {
        setPathError(err instanceof Error ? err.message : String(err));
        setPathIssues([]);
      }
    }
  }, [pathText, opts.chordTolerance, opts.splineSamplesPerSpan, opts.stitchTolerance]);

  // Unit compatibility check (refuse on mismatch per product spec).
  useEffect(() => {
    if (!profile || !path) {
      setUnitMismatch(null);
      return;
    }
    const compat = checkUnitsCompatible(profile.unit, path.unit);
    if (!compat.ok) {
      setUnitMismatch(compat.reason ?? 'unit mismatch');
    } else {
      setUnitMismatch(null);
    }
  }, [profile, path]);

  const canEmit = profile !== null && path !== null && unitMismatch === null;

  const scadCode = useMemo(() => {
    if (!profile || !path || unitMismatch) return '';
    const baseName = (pathFile?.name ?? 'sweep').replace(/\.[Dd][Xx][Ff]$/, '');
    switch (emitter) {
      case 'bosl2':
        return emitBosl2(profile, path, { name: baseName });
      case 'hull':
        return emitHull(profile, path);
      case 'prism':
        return emitPrism(profile, path);
    }
  }, [profile, path, emitter, pathFile, unitMismatch]);

  const profileLines = profile
    ? [{ points: profile.vertices as Vec2[], closed: true, stroke: 'var(--accent)' }]
    : [];

  const pathLines = path
    ? path.components.map((c, idx) => ({
        points: c.points.map((p) => [p[0], p[1]] as Vec2),
        closed: c.closed,
        arrows: idx === 0,
        stroke: idx === 0 ? 'var(--accent)' : 'var(--warn)'
      }))
    : [];

  const pathMarkers =
    path && path.points.length > 0
      ? [{ point: [path.points[0][0], path.points[0][1]] as Vec2, color: 'var(--ok)' }]
      : [];

  const unitWarnings: ParseIssue[] = [];
  if (profile && isNonMillimetre(profile.unit)) {
    unitWarnings.push({
      severity: 'warning',
      message: `profile declares ${profile.unit.name}; Roseriser targets millimetres — verify the output scale`
    });
  }
  if (path && isNonMillimetre(path.unit)) {
    unitWarnings.push({
      severity: 'warning',
      message: `path declares ${path.unit.name}; Roseriser targets millimetres — verify the output scale`
    });
  }

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>Roseriser</h1>
          <p className="app__tagline">Sweep a DXF profile along a DXF path into OpenSCAD.</p>
        </div>
        <div className="app__toolbar">
          <a href="./examples/profile.dxf" download>
            sample profile
          </a>
          <a href="./examples/path.dxf" download>
            sample path
          </a>
          <button type="button" onClick={() => setDark((d) => !d)}>
            {dark ? '☀' : '☾'} {dark ? 'light' : 'dark'}
          </button>
        </div>
      </header>

      <section className="app__drops">
        <FileDrop
          label="Profile DXF"
          file={profileFile}
          onFile={setProfileFile}
          helpText="single closed 2D polyline (LWPOLYLINE/POLYLINE)"
        />
        <FileDrop
          label="Path DXF"
          file={pathFile}
          onFile={setPathFile}
          helpText="LINE / ARC / CIRCLE / POLYLINE / SPLINE"
        />
      </section>

      <section className="app__options">
        <label>
          chord tolerance (mm)
          <input
            type="range"
            min={0.001}
            max={1.0}
            step={0.001}
            value={opts.chordTolerance}
            onChange={(e) => setOpts({ ...opts, chordTolerance: Number(e.target.value) })}
          />
          <span>{opts.chordTolerance.toFixed(3)}</span>
        </label>
        <label>
          spline samples / span
          <input
            type="range"
            min={4}
            max={64}
            step={1}
            value={opts.splineSamplesPerSpan}
            onChange={(e) => setOpts({ ...opts, splineSamplesPerSpan: Number(e.target.value) })}
          />
          <span>{opts.splineSamplesPerSpan}</span>
        </label>
        <label>
          stitch tolerance (mm)
          <input
            type="number"
            step="any"
            placeholder="auto"
            value={opts.stitchTolerance ?? ''}
            onChange={(e) =>
              setOpts({
                ...opts,
                stitchTolerance: e.target.value === '' ? null : Number(e.target.value)
              })
            }
          />
        </label>
        <fieldset className="app__emitter">
          <legend>Emitter</legend>
          <label>
            <input
              type="radio"
              name="emitter"
              checked={emitter === 'bosl2'}
              onChange={() => setEmitter('bosl2')}
            />
            BOSL2 path_sweep — smooth arcs
          </label>
          <label>
            <input
              type="radio"
              name="emitter"
              checked={emitter === 'hull'}
              onChange={() => setEmitter('hull')}
            />
            hull() chain — mitered corners, no BOSL2
          </label>
          <label>
            <input
              type="radio"
              name="emitter"
              checked={emitter === 'prism'}
              onChange={() => setEmitter('prism')}
            />
            prism per segment — sharp tracery, no BOSL2
          </label>
        </fieldset>
      </section>

      <section className="app__previews">
        <SvgPreview
          title={`Profile${profile ? ` · ${profile.vertices.length} vertices` : ''}`}
          lines={profileLines}
          emptyText="Drop a profile DXF to preview."
        />
        <SvgPreview
          title={path ? pathTitle(path) : 'Path'}
          lines={pathLines}
          markers={pathMarkers}
          emptyText="Drop a path DXF to preview."
        />
      </section>

      {unitMismatch && (
        <ErrorPanel
          title="Unit mismatch — refusing to emit"
          fatal={unitMismatch}
          issues={[]}
        />
      )}
      <ErrorPanel title="Profile" fatal={profileError} issues={profileIssues} />
      <ErrorPanel title="Path" fatal={pathError} issues={pathIssues} />
      {unitWarnings.length > 0 && <ErrorPanel title="Units" issues={unitWarnings} />}

      {canEmit && (
        <section className="app__output">
          <CodeView code={scadCode} filename={(pathFile?.name ?? 'sweep').replace(/\.[Dd][Xx][Ff]$/, '') + '.scad'} />
        </section>
      )}

      <footer className="app__footer">
        <span>
          All processing runs locally in your browser — no files are uploaded.
        </span>
      </footer>
    </div>
  );
}

function pathTitle(path: PathResult): string {
  const total = path.components.reduce((s, c) => s + c.length, 0);
  const n = path.components.length;
  const topo = n === 1 ? (path.closed ? 'closed' : 'open') : `${n} components`;
  return `Path · ${path.entityCount} entities · length ${total.toFixed(2)} · ${topo}`;
}
