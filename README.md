# Roseriser

Convert two DXF files — a closed cross-section profile and a sweep path — into
OpenSCAD code for a swept 3D solid. Aimed at hobbyist CAD designers working on
Gothic tracery, so the tool leans on BOSL2's `path_sweep()` with a tangent-
aligned profile by default and provides a BOSL2-free fallback for users who
can't install the library.

Everything runs client-side: drop two DXF files into the page, tune a couple
of discretisation sliders, and copy or download the resulting `.scad`.

## Why this stack

- **React + Vite + TypeScript**, as requested. Vite gives a static build that
  works offline once loaded (`base: './'` in `vite.config.ts`), React handles
  the UI, and strict TypeScript keeps the geometry code honest.
- **dxf-parser** for reading DXFs. Its output is a plain JSON-ish tree and the
  library is maintained. The arc/circle/spline discretisation math is written
  inline in `src/lib/geometry.ts` — no CAD kernel dependency.

## Install & run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + bundle into dist/
npm run preview    # serve the built bundle locally
npm test           # vitest unit tests
```

## Using the app

1. Drop (or click to select) two `.dxf` files: a **Profile** and a **Path**.
2. Inspect both in the 2D preview panes. The path pane draws direction arrows
   along the stitched order and marks the start vertex with a green dot.
3. Tweak:
   - **chord tolerance** — maximum distance between a linear segment and the
     true arc/circle it replaces. Lower → smoother curves → more path points.
   - **spline samples / span** — discretisation density for `SPLINE` entities,
     per knot-span.
   - **stitch tolerance** — distance within which two entity endpoints are
     treated as coincident. Leave blank for `1e-3 × bbox diagonal`.
4. Pick an emitter (see below) and copy or download the `.scad`.

Sample files live in [`examples/`](./examples) and are also served from the
app as "sample profile" / "sample path" download links.

## Emitter modes

### `path_sweep` (BOSL2)

The primary emitter. Output starts with:

```scad
include <BOSL2/std.scad>
```

BOSL2's `path_sweep(shape, path, closed=...)` keeps the profile orthogonal to
the path tangent, which is what Gothic tracery wants. Install BOSL2 once:

1. Download <https://github.com/BelfrySCAD/BOSL2/archive/refs/heads/master.zip>
   or `git clone https://github.com/BelfrySCAD/BOSL2`.
2. Rename the extracted folder to `BOSL2`.
3. Move it into your OpenSCAD libraries directory:
   - Linux/macOS: `~/.local/share/OpenSCAD/libraries/BOSL2`
   - Windows: `%USERPROFILE%\Documents\OpenSCAD\libraries\BOSL2`
4. Restart OpenSCAD.

### `hull()` chain (BOSL2-free fallback)

For users who can't install BOSL2. Renders the swept solid as a chain of
`hull()` calls between thin `linear_extrude`'d copies of the profile, each
rotated so its normal follows the local path tangent.

Known quality trade-offs:

- Tight curves facet visibly; raise the chord-tolerance slider for a denser
  path if you pick this emitter.
- Non-convex profiles may get unwanted fill from the `hull()` operation.
  Use BOSL2 when the profile is concave.

## Units

- The app targets **millimetres**. `$INSUNITS=4` (mm) or unitless files pass
  through cleanly; anything else produces a visible warning.
- If the two DXF files declare **different** `$INSUNITS`, Roseriser refuses to
  emit — the assumption is that both files come from the same source, and a
  mismatch almost certainly indicates an export mistake. Re-export both at
  the same unit.

## Product decisions baked into this build

- Profile orientation: **tangent-aligned** to the path (default BOSL2
  behaviour; the hull emitter replicates it).
- Path dimensionality: currently planar, `z = 0`. Data types (`Vec3`,
  `PathComponent`) already carry a Z component so 3D paths can be wired in
  later without reshaping the core types.
- Closed paths: **auto-close** when the stitched path topology is closed. No
  user toggle; the detected state is shown on the path preview.
- Unit mismatch: **warn and refuse** when `$INSUNITS` differs between files.

## Known limitations

- Profiles must be a single closed `LWPOLYLINE` or `POLYLINE`. Region
  boolean soups, multi-loop profiles, and LINE/ARC-composed profiles aren't
  supported — export as one closed polyline.
- Rational (weighted) splines degrade to their polynomial control polygon;
  `dxf-parser` does not currently surface weights and de Boor's algorithm in
  `src/lib/geometry.ts` does not apply them. A warning is emitted when
  `fitPoints` are used as a fallback.
- Paths are assumed planar at `z = 0`. 3D path entities (3D polylines, out-of-
  plane arcs via OCS) are accepted but may produce surprising output.
- The `hull()` emitter uses a 0.001-unit slab thickness for each station; very
  small profiles may require tweaking this constant before rendering.

## Repository layout

```
src/
  dxf/             parsing, discretisation, stitching, units
  lib/geometry.ts  arc / bulge / spline math
  openscad/        BOSL2 + hull emitters, syntax highlighter
  components/      FileDrop, SvgPreview, CodeView, ErrorPanel
  App.tsx          wires it all together
tests/             vitest unit coverage for the four core pipelines
examples/          sample profile + path DXFs
public/examples/   same files, served by Vite for the in-app download links
```
# roseriser2
