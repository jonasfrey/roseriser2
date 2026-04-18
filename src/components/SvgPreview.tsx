import { useEffect, useMemo, useRef, useState } from 'react';
import type { Vec2 } from '../types';

interface SvgPreviewProps {
  title: string;
  /** Polyline(s) to render. Each line is drawn as an SVG path. */
  lines: { points: Vec2[]; closed: boolean; arrows?: boolean; stroke?: string }[];
  /** Optional points drawn as small markers. */
  markers?: { point: Vec2; color?: string }[];
  emptyText?: string;
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * SVG viewer with wheel zoom and drag pan. Y is flipped so CAD-positive-Y
 * renders "up" on screen.
 */
export function SvgPreview({ title, lines, markers, emptyText }: SvgPreviewProps) {
  const [view, setView] = useState<View | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; view: View } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const baseView = useMemo(() => deriveBaseView(lines), [lines]);

  useEffect(() => {
    setView(baseView);
  }, [baseView]);

  const onWheel = (e: React.WheelEvent) => {
    if (!view) return;
    e.preventDefault();
    const scale = Math.exp(e.deltaY * 0.0015);
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const cx = view.x + px * view.w;
    const cy = view.y + py * view.h;
    const nw = view.w * scale;
    const nh = view.h * scale;
    setView({ x: cx - px * nw, y: cy - py * nh, w: nw, h: nh });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!view) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDragStart({ x: e.clientX, y: e.clientY, view });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart || !svgRef.current || !view) return;
    const rect = svgRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragStart.x) / rect.width) * dragStart.view.w;
    const dy = ((e.clientY - dragStart.y) / rect.height) * dragStart.view.h;
    setView({ ...dragStart.view, x: dragStart.view.x - dx, y: dragStart.view.y - dy });
  };
  const onPointerUp = () => setDragStart(null);

  const reset = () => setView(baseView);

  if (!view || !baseView) {
    return (
      <div className="svgprev">
        <div className="svgprev__header">
          <span>{title}</span>
        </div>
        <div className="svgprev__empty">{emptyText ?? 'No data'}</div>
      </div>
    );
  }

  return (
    <div className="svgprev">
      <div className="svgprev__header">
        <span>{title}</span>
        <button type="button" onClick={reset} className="svgprev__reset">
          fit
        </button>
      </div>
      <svg
        ref={svgRef}
        className="svgprev__svg"
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        // CAD convention: +Y up. SVG Y is down, so flip with a transform.
        style={{ transform: 'scaleY(-1)' }}
      >
        <rect x={view.x} y={view.y} width={view.w} height={view.h} className="svgprev__bg" />
        {lines.map((line, idx) => (
          <Polyline key={idx} line={line} view={view} />
        ))}
        {markers?.map((m, idx) => (
          <circle
            key={idx}
            cx={m.point[0]}
            cy={m.point[1]}
            r={Math.max(view.w, view.h) * 0.005}
            fill={m.color ?? 'var(--accent)'}
          />
        ))}
      </svg>
    </div>
  );
}

function Polyline({ line, view }: { line: SvgPreviewProps['lines'][number]; view: View }) {
  if (line.points.length < 2) return null;
  const d = line.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`)
    .join(' ');
  const stroke = line.stroke ?? 'var(--fg)';
  const strokeWidth = Math.max(view.w, view.h) * 0.0025;
  const path = (
    <path d={`${d}${line.closed ? ' Z' : ''}`} fill="none" stroke={stroke} strokeWidth={strokeWidth} />
  );
  if (!line.arrows) return path;

  const arrowStep = Math.max(1, Math.floor(line.points.length / 12));
  const arrowSize = Math.max(view.w, view.h) * 0.012;
  const arrows: JSX.Element[] = [];
  for (let i = 0; i + 1 < line.points.length; i += arrowStep) {
    const a = line.points[i];
    const b = line.points[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const perpX = -uy;
    const perpY = ux;
    const tipX = mx + ux * arrowSize;
    const tipY = my + uy * arrowSize;
    const baseLX = mx - ux * arrowSize * 0.5 + perpX * arrowSize * 0.5;
    const baseLY = my - uy * arrowSize * 0.5 + perpY * arrowSize * 0.5;
    const baseRX = mx - ux * arrowSize * 0.5 - perpX * arrowSize * 0.5;
    const baseRY = my - uy * arrowSize * 0.5 - perpY * arrowSize * 0.5;
    arrows.push(
      <polygon
        key={i}
        points={`${tipX},${tipY} ${baseLX},${baseLY} ${baseRX},${baseRY}`}
        fill={stroke}
        opacity={0.75}
      />
    );
  }
  return (
    <g>
      {path}
      {arrows}
    </g>
  );
}

function deriveBaseView(lines: SvgPreviewProps['lines']): View | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (const l of lines) {
    for (const p of l.points) {
      any = true;
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  if (!any) return null;
  const w = Math.max(1e-6, maxX - minX);
  const h = Math.max(1e-6, maxY - minY);
  const pad = Math.max(w, h) * 0.1;
  return { x: minX - pad, y: minY - pad, w: w + pad * 2, h: h + pad * 2 };
}
