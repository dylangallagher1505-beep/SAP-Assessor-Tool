'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Point { x: number; y: number; }

type Orientation = 'North' | 'East' | 'South' | 'West';
type Dir = 'N' | 'S' | 'E' | 'W';
type InputMode = 'draw' | 'type';
type WallType = 'external' | 'party' | 'internal';

const WALL_COLOR: Record<WallType, string> = {
  external: '#16a34a',
  party: '#f59e0b',
  internal: '#94a3b8',
};
const WALL_CYCLE: WallType[] = ['external', 'party', 'internal'];

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function wallOrientationWithNorth(a: Point, b: Point, northDeg: number): Orientation {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const normal = angle - 90; // correct for CW-on-screen polygon
  const n = ((normal - northDeg) % 360 + 360) % 360;
  if (n >= 315 || n < 45) return 'North';
  if (n >= 45 && n < 135) return 'East';
  if (n >= 135 && n < 225) return 'South';
  return 'West';
}

function polygonArea(pts: Point[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

function wallLength(a: Point, b: Point): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
}

function ptToSegDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return wallLength(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return wallLength(p, { x: a.x + t * dx, y: a.y + t * dy });
}

function applyDir(pt: Point, dir: Dir, len: number): Point {
  switch (dir) {
    case 'N': return { x: pt.x, y: pt.y - len };
    case 'S': return { x: pt.x, y: pt.y + len };
    case 'E': return { x: pt.x + len, y: pt.y };
    case 'W': return { x: pt.x - len, y: pt.y };
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID_SIZE = 600;
const METRES_VISIBLE = 20;
const PX_PER_M = GRID_SIZE / METRES_VISIBLE;
const SNAP = 0.5;

function snap(v: number) { return Math.round(v / SNAP) * SNAP; }
function toSVG(m: number) { return m * PX_PER_M; }
function toM(px: number) { return px / PX_PER_M; }

const ORIENT_ARROW: Record<Orientation, string> = { North: '↑', East: '→', South: '↓', West: '←' };

// ─── 3D Viewer ────────────────────────────────────────────────────────────────
function ThreeViewer({ points, storeyHeight, roofType }: {
  points: Point[];
  storeyHeight: number;
  roofType: 'flat' | 'pitched';
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current || points.length < 3) return;

    const el = mountRef.current;
    const W = el.clientWidth || 500;
    const H = el.clientHeight || 400;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#f0fdf4');

    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    el.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.0);
    sun.position.set(10, 20, 10);
    sun.castShadow = true;
    scene.add(sun);
    const sun2 = new THREE.DirectionalLight(0xffffff, 0.4);
    sun2.position.set(-10, 10, -5);
    scene.add(sun2);

    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const centred = points.map(p => ({ x: p.x - cx, y: p.y - cy }));

    const shape = new THREE.Shape();
    shape.moveTo(centred[0].x, -centred[0].y);
    for (let i = 1; i < centred.length; i++) shape.lineTo(centred[i].x, -centred[i].y);
    shape.closePath();

    const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: storeyHeight, bevelEnabled: false });
    const wallMesh = new THREE.Mesh(wallGeo, new THREE.MeshLambertMaterial({ color: '#d4edda', side: THREE.DoubleSide }));
    wallMesh.rotation.x = -Math.PI / 2;
    wallMesh.castShadow = true;
    scene.add(wallMesh);

    const wallWire = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: '#14532d', wireframe: true, opacity: 0.12, transparent: true }));
    wallWire.rotation.x = -Math.PI / 2;
    scene.add(wallWire);

    if (roofType === 'flat') {
      const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
      const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: '#86efac' }));
      roofMesh.rotation.x = -Math.PI / 2;
      roofMesh.position.y = storeyHeight;
      scene.add(roofMesh);
    } else {
      const xs = centred.map(p => p.x);
      const zs = centred.map(p => -p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minZ = Math.min(...zs), maxZ = Math.max(...zs);
      const spanX = maxX - minX;
      const spanZ = maxZ - minZ;
      const ridgeH = Math.min(spanX, spanZ) * 0.45;
      const ridgeY = storeyHeight + ridgeH;
      const ridgeAlongX = spanX >= spanZ;

      function projectToRidge(x: number, z: number): THREE.Vector3 {
        if (ridgeAlongX) {
          return new THREE.Vector3(Math.max(minX, Math.min(maxX, x)), ridgeY, (minZ + maxZ) / 2);
        } else {
          return new THREE.Vector3((minX + maxX) / 2, ridgeY, Math.max(minZ, Math.min(maxZ, z)));
        }
      }

      const eaveVerts = centred.map(p => new THREE.Vector3(p.x, storeyHeight, -p.y));
      const positions: number[] = [];
      for (let i = 0; i < eaveVerts.length; i++) {
        const a = eaveVerts[i];
        const b = eaveVerts[(i + 1) % eaveVerts.length];
        const ra = projectToRidge(a.x, a.z);
        const rb = projectToRidge(b.x, b.z);
        if (ra.distanceTo(rb) < 0.01) {
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z, ra.x, ra.y, ra.z);
        } else {
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z, rb.x, rb.y, rb.z);
          positions.push(a.x, a.y, a.z, rb.x, rb.y, rb.z, ra.x, ra.y, ra.z);
        }
      }
      const roofGeo = new THREE.BufferGeometry();
      roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      roofGeo.computeVertexNormals();
      scene.add(new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: '#4ade80', side: THREE.DoubleSide })));
      scene.add(new THREE.Mesh(roofGeo, new THREE.MeshBasicMaterial({ color: '#14532d', wireframe: true, opacity: 0.2, transparent: true })));
    }

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#dcfce7' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    const grid = new THREE.GridHelper(40, 40, '#86efac', '#86efac');
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    let isDragging = false;
    let prevMouse = { x: 0, y: 0 };
    const spherical = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 30 };

    function updateCamera() {
      camera.position.set(
        spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
        spherical.radius * Math.cos(spherical.phi),
        spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
      );
      camera.lookAt(0, storeyHeight / 2, 0);
    }
    updateCamera();

    const onMouseDown = (e: MouseEvent) => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; };
    const onMouseUp = () => { isDragging = false; };
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      spherical.theta -= (e.clientX - prevMouse.x) * 0.01;
      spherical.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, spherical.phi + (e.clientY - prevMouse.y) * 0.01));
      prevMouse = { x: e.clientX, y: e.clientY };
      updateCamera();
    };
    const onWheel = (e: WheelEvent) => {
      spherical.radius = Math.max(5, Math.min(80, spherical.radius + e.deltaY * 0.05));
      updateCamera();
    };

    el.addEventListener('mousedown', onMouseDown);
    el.addEventListener('mouseup', onMouseUp);
    el.addEventListener('mousemove', onMouseMove);
    el.addEventListener('wheel', onWheel);

    let animId = 0;
    function animate() { animId = requestAnimationFrame(animate); renderer.render(scene, camera); }
    animate();

    return () => {
      cancelAnimationFrame(animId);
      el.removeEventListener('mousedown', onMouseDown);
      el.removeEventListener('mouseup', onMouseUp);
      el.removeEventListener('mousemove', onMouseMove);
      el.removeEventListener('wheel', onWheel);
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [points, storeyHeight, roofType]);

  if (points.length < 3) {
    return (
      <div className="flex items-center justify-center h-full rounded-2xl" style={{ background: '#f0fdf4', border: '2px dashed #86efac' }}>
        <div className="text-center">
          <div className="text-4xl mb-3">🏗️</div>
          <div className="text-sm font-bold" style={{ color: '#16a34a' }}>Draw a floor plan on the left</div>
          <div className="text-xs mt-1" style={{ color: '#86efac' }}>3D model will appear here</div>
        </div>
      </div>
    );
  }

  return <div ref={mountRef} className="w-full h-full rounded-2xl overflow-hidden cursor-grab" style={{ border: '2px solid #dcfce7' }} />;
}

// ─── Wall History Row ─────────────────────────────────────────────────────────
function WallHistoryRow({ index, dir, len, onDelete }: { index: number; dir: Dir; len: number; onDelete: () => void }) {
  const arrow: Record<Dir, string> = { N: '↑', S: '↓', E: '→', W: '←' };
  return (
    <div className="flex items-center justify-between gap-2 py-1 px-2 rounded-lg" style={{ background: '#f0fdf4' }}>
      <span className="text-xs font-black" style={{ color: '#86efac' }}>#{index + 1}</span>
      <span className="text-sm font-black" style={{ color: '#14532d' }}>{arrow[dir]} {dir}</span>
      <span className="text-sm font-mono font-bold" style={{ color: '#334155' }}>{len.toFixed(1)} m</span>
      <button onClick={onDelete} className="text-xs px-1.5 py-0.5 rounded" style={{ color: '#ef4444', background: '#fef2f2' }}>✕</button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FloorPlanTool() {
  const [points, setPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [closed, setClosed] = useState(false);
  const [storeyHeight, setStoreyHeight] = useState(2.4);
  const [roofType, setRoofType] = useState<'flat' | 'pitched'>('flat');
  const [inputMode, setInputMode] = useState<InputMode>('draw');
  const [northAngle, setNorthAngle] = useState(0); // degrees CW from top = North

  // Wall type state (one per wall segment, initialised when shape closes)
  const [wallTypes, setWallTypes] = useState<WallType[]>([]);

  // Type mode state
  const [dir, setDir] = useState<Dir>('E');
  const [lenInput, setLenInput] = useState('');
  const [walls, setWalls] = useState<{ dir: Dir; len: number }[]>([]);
  const lenRef = useRef<HTMLInputElement>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // Derive points from walls list (start at 5,5 in type mode)
  const START: Point = { x: 5, y: 5 };
  const typePoints: Point[] = (() => {
    const pts: Point[] = [START];
    for (const w of walls) {
      pts.push(applyDir(pts[pts.length - 1], w.dir, w.len));
    }
    return pts;
  })();

  const activePoints = inputMode === 'type' ? typePoints : points;

  // Distance from current tip back to start (type mode)
  const tip = typePoints[typePoints.length - 1];
  const distToStart = walls.length >= 2 ? wallLength(tip, START) : Infinity;
  const canClose = walls.length >= 2 && distToStart < 50;

  // ── Wall segments (computed from closed polygon) ────────────────────────────
  const wallSegs = closed && activePoints.length >= 3
    ? activePoints.map((p, i) => {
        const b = activePoints[(i + 1) % activePoints.length];
        return {
          i,
          a: p,
          b,
          len: wallLength(p, b),
          orientation: wallOrientationWithNorth(p, b, northAngle),
          area: wallLength(p, b) * storeyHeight,
          type: (wallTypes[i] ?? 'external') as WallType,
        };
      })
    : [];

  // ── Aggregated SAP values ───────────────────────────────────────────────────
  const floorArea = closed && activePoints.length >= 3 ? polygonArea(activePoints) : 0;
  const effectiveRoofArea = roofType === 'pitched' ? floorArea * 1.2 : floorArea;
  const perimeter = closed && activePoints.length >= 3
    ? activePoints.reduce((sum, p, i) => sum + wallLength(p, activePoints[(i + 1) % activePoints.length]), 0)
    : 0;

  const extWallsByOrientation: Record<Orientation, number> = { North: 0, East: 0, South: 0, West: 0 };
  let partyWallTotal = 0;
  for (const seg of wallSegs) {
    if (seg.type === 'external') extWallsByOrientation[seg.orientation] += seg.area;
    if (seg.type === 'party') partyWallTotal += seg.area;
  }
  const totalExtWallArea = Object.values(extWallsByOrientation).reduce((a, b) => a + b, 0);

  // ── Draw mode handlers ──────────────────────────────────────────────────────
  const getSVGPoint = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: snap(toM(e.clientX - rect.left)), y: snap(toM(e.clientY - rect.top)) };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (inputMode === 'draw' && !closed) {
      const pt = getSVGPoint(e);
      if (points.length >= 3) {
        const first = points[0];
        if (Math.sqrt((pt.x - first.x) ** 2 + (pt.y - first.y) ** 2) < 0.6) {
          setWallTypes(new Array(points.length).fill('external'));
          setClosed(true);
          return;
        }
      }
      setPoints(prev => [...prev, pt]);
      return;
    }

    // Click on wall to cycle type when closed
    if (closed && wallSegs.length > 0) {
      const rect = svgRef.current!.getBoundingClientRect();
      const clickPt: Point = { x: toM(e.clientX - rect.left), y: toM(e.clientY - rect.top) };
      let bestIdx = -1;
      let bestDist = 0.5; // 0.5m threshold
      for (const seg of wallSegs) {
        const d = ptToSegDist(clickPt, seg.a, seg.b);
        if (d < bestDist) { bestDist = d; bestIdx = seg.i; }
      }
      if (bestIdx >= 0) {
        setWallTypes(prev => {
          const next = [...prev];
          const cur = next[bestIdx] ?? 'external';
          next[bestIdx] = WALL_CYCLE[(WALL_CYCLE.indexOf(cur) + 1) % WALL_CYCLE.length];
          return next;
        });
      }
    }
  }, [closed, points, getSVGPoint, inputMode, wallSegs]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (closed || inputMode !== 'draw') return;
    setHoverPoint(getSVGPoint(e));
  }, [closed, getSVGPoint, inputMode]);

  // ── Type mode: add wall ─────────────────────────────────────────────────────
  const addWall = useCallback(() => {
    const len = parseFloat(lenInput);
    if (!len || len <= 0 || closed) return;
    const snapped = Math.round(len * 10) / 10;
    setWalls(prev => [...prev, { dir, len: snapped }]);
    setLenInput('');
    setTimeout(() => lenRef.current?.focus(), 0);
  }, [lenInput, dir, closed]);

  const deleteWall = (index: number) => {
    setWalls(prev => prev.filter((_, i) => i !== index));
    setClosed(false);
  };

  const closeShape = () => {
    const n = inputMode === 'type' ? typePoints.length - 1 : points.length;
    setWallTypes(new Array(n).fill('external'));
    setClosed(true);
  };

  const reset = () => {
    setPoints([]);
    setWalls([]);
    setHoverPoint(null);
    setClosed(false);
    setWallTypes([]);
    setLenInput('');
  };

  // ── Grid lines ─────────────────────────────────────────────────────────────
  const gridLines = [];
  for (let i = 0; i <= METRES_VISIBLE; i++) {
    const pos = toSVG(i);
    gridLines.push(<line key={`v${i}`} x1={pos} y1={0} x2={pos} y2={GRID_SIZE} stroke="#dcfce7" strokeWidth={i % 5 === 0 ? 1.5 : 0.5} />);
    gridLines.push(<line key={`h${i}`} x1={0} y1={pos} x2={GRID_SIZE} y2={pos} stroke="#dcfce7" strokeWidth={i % 5 === 0 ? 1.5 : 0.5} />);
  }

  const polyPts = (pts: Point[]) => pts.map(p => `${toSVG(p.x)},${toSVG(p.y)}`).join(' ');
  const previewPoints = hoverPoint && points.length > 0
    ? [...points, hoverPoint].map(p => `${toSVG(p.x)},${toSVG(p.y)}`).join(' ')
    : polyPts(points);

  // ── North arrow ─────────────────────────────────────────────────────────────
  const NA = northAngle * Math.PI / 180;
  const naCx = 30, naCy = 30, naLen = 18;
  const naTipX = naCx + naLen * Math.sin(NA);
  const naTipY = naCy - naLen * Math.cos(NA);
  const naTailX = naCx - (naLen * 0.6) * Math.sin(NA);
  const naTailY = naCy + (naLen * 0.6) * Math.cos(NA);
  const naLabelX = naCx + (naLen + 8) * Math.sin(NA);
  const naLabelY = naCy - (naLen + 8) * Math.cos(NA);

  // Direction cycling
  const DIRS: Dir[] = ['N', 'E', 'S', 'W'];
  const handleLenKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { addWall(); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setDir('N'); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setDir('S'); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setDir('E'); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setDir('W'); }
    if (e.key === 'Tab') {
      e.preventDefault();
      setDir(d => DIRS[(DIRS.indexOf(d) + (e.shiftKey ? 3 : 1)) % 4]);
    }
  };

  const dirArrow: Record<Dir, string> = { N: '↑', S: '↓', E: '→', W: '←' };
  const dirLabel: Record<Dir, string> = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' };

  const cursorClass = closed
    ? 'cursor-pointer'
    : inputMode === 'draw' ? 'cursor-crosshair' : 'cursor-default';

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div style={{ borderTop: '4px solid #16a34a', paddingTop: '1rem' }}>
        <h1 className="text-3xl font-black" style={{ color: '#14532d' }}>FLOOR PLAN TOOL</h1>
        <p className="text-sm mt-1 font-medium" style={{ color: '#64748b' }}>
          Draw or type a floor plan · Classify walls · Auto-calculate SAP surface areas · 3D preview
        </p>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap gap-4 items-end p-4 rounded-2xl" style={{ background: 'white', border: '2px solid #dcfce7' }}>
        <div>
          <label className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Storey Height (m)</label>
          <input
            type="number" step="0.05" min="2" max="6"
            value={storeyHeight}
            onChange={e => setStoreyHeight(parseFloat(e.target.value) || 2.4)}
            className="rounded-xl px-3 py-2 text-sm font-mono font-semibold w-24 focus:outline-none"
            style={{ border: '2px solid #e2e8f0' }}
          />
        </div>
        <div>
          <label className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Roof Type</label>
          <select
            value={roofType}
            onChange={e => setRoofType(e.target.value as 'flat' | 'pitched')}
            className="rounded-xl px-3 py-2 text-sm font-semibold focus:outline-none"
            style={{ border: '2px solid #e2e8f0', color: '#14532d' }}
          >
            <option value="flat">Flat roof</option>
            <option value="pitched">Pitched roof</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>North Angle (°)</label>
          <div className="flex items-center gap-1">
            <input
              type="number" step="1" min="0" max="359"
              value={northAngle}
              onChange={e => setNorthAngle(((parseInt(e.target.value) ?? 0) % 360 + 360) % 360)}
              className="rounded-xl px-3 py-2 text-sm font-mono font-semibold w-20 focus:outline-none"
              style={{ border: '2px solid #e2e8f0' }}
            />
            <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>CW from up</span>
          </div>
        </div>

        {/* Mode toggle */}
        <div>
          <label className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Input Mode</label>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '2px solid #dcfce7' }}>
            {(['draw', 'type'] as InputMode[]).map(m => (
              <button key={m} onClick={() => { setInputMode(m); setClosed(false); reset(); }}
                className="px-4 py-2 text-xs font-black uppercase tracking-widest transition-all"
                style={{ background: inputMode === m ? '#14532d' : 'white', color: inputMode === m ? 'white' : '#6b7280' }}
              >
                {m === 'draw' ? '✏️ Draw' : '⌨️ Type'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 ml-auto items-end">
          {inputMode === 'draw' && !closed && points.length >= 3 && (
            <button onClick={closeShape} className="px-4 py-2 rounded-xl text-sm font-black" style={{ background: '#14532d', color: 'white' }}>
              Close polygon
            </button>
          )}
          {inputMode === 'draw' && points.length > 0 && (
            <button onClick={() => { if (closed) { setClosed(false); setWallTypes([]); } else { setPoints(p => p.slice(0, -1)); } }}
              className="px-4 py-2 rounded-xl text-sm font-black"
              style={{ border: '2px solid #e2e8f0', color: '#64748b', background: 'white' }}>
              ↩ Undo
            </button>
          )}
          <button onClick={reset} className="px-4 py-2 rounded-xl text-sm font-black" style={{ border: '2px solid #fecaca', color: '#ef4444', background: 'white' }}>
            Clear
          </button>
        </div>
      </div>

      {/* Wall type legend */}
      {closed && (
        <div className="flex items-center gap-4 px-4 py-2 rounded-xl text-xs font-semibold" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <span style={{ color: '#64748b' }}>Click a wall to cycle type:</span>
          {WALL_CYCLE.map(wt => (
            <span key={wt} className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-1.5 rounded-full" style={{ background: WALL_COLOR[wt] }} />
              <span style={{ color: '#475569', textTransform: 'capitalize' }}>{wt}</span>
            </span>
          ))}
        </div>
      )}

      {/* Three-panel layout */}
      <div className="grid gap-6" style={{ gridTemplateColumns: '600px 1fr 320px', height: 660 }}>

        {/* 2D Canvas */}
        <div className="rounded-2xl overflow-hidden flex flex-col" style={{ border: '2px solid #dcfce7', background: 'white' }}>
          <div className="px-4 py-2 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid #f0fdf4' }}>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#14532d' }}>2D PLAN VIEW</span>
            <span className="text-xs font-medium" style={{ color: '#86efac' }}>grid: 1m · snap: 0.5m</span>
          </div>

          <div className="relative flex-1 overflow-hidden">
            <svg
              ref={svgRef}
              width={GRID_SIZE} height={GRID_SIZE}
              onClick={handleClick}
              onMouseMove={handleMouseMove}
              className={cursorClass}
              style={{ userSelect: 'none' }}
            >
              {gridLines}

              {/* Draw mode preview */}
              {inputMode === 'draw' && !closed && points.length > 0 && hoverPoint && (
                <polyline points={previewPoints} fill="none" stroke="#86efac" strokeWidth={1.5} strokeDasharray="4 3" />
              )}

              {/* Closed polygon fill */}
              {closed && activePoints.length >= 3 && (
                <polygon points={polyPts(activePoints)} fill="#f0fdf4" stroke="none" />
              )}

              {/* Coloured wall segments */}
              {closed && wallSegs.map(seg => (
                <line
                  key={seg.i}
                  x1={toSVG(seg.a.x)} y1={toSVG(seg.a.y)}
                  x2={toSVG(seg.b.x)} y2={toSVG(seg.b.y)}
                  stroke={WALL_COLOR[seg.type]}
                  strokeWidth={3.5}
                  strokeLinecap="round"
                />
              ))}

              {/* Open polyline */}
              {!closed && activePoints.length >= 2 && (
                <polyline points={polyPts(activePoints)} fill="none" stroke="#14532d" strokeWidth={2} />
              )}

              {/* Type mode: dashed closing line back to start */}
              {inputMode === 'type' && !closed && walls.length >= 2 && (
                <line
                  x1={toSVG(tip.x)} y1={toSVG(tip.y)}
                  x2={toSVG(START.x)} y2={toSVG(START.y)}
                  stroke="#86efac" strokeWidth={1.5} strokeDasharray="5 4"
                />
              )}

              {/* Wall labels: length + orientation (closed only) */}
              {closed && wallSegs.map(seg => {
                const mx = (toSVG(seg.a.x) + toSVG(seg.b.x)) / 2;
                const my = (toSVG(seg.a.y) + toSVG(seg.b.y)) / 2;
                const dx = seg.b.x - seg.a.x;
                const dy = seg.b.y - seg.a.y;
                const len2 = Math.sqrt(dx * dx + dy * dy);
                // Normal offset (inward)
                const nx = -(dy / len2) * 14;
                const ny = (dx / len2) * 14;
                return (
                  <g key={seg.i}>
                    <text x={mx + nx} y={my + ny} textAnchor="middle" fontSize={9} fill={WALL_COLOR[seg.type]} fontWeight="700">
                      {ORIENT_ARROW[seg.orientation]} {seg.len.toFixed(1)}m
                    </text>
                  </g>
                );
              })}

              {/* Open mode length labels (type mode, not closed) */}
              {!closed && inputMode === 'type' && walls.map((w, i) => {
                const a = typePoints[i], b = typePoints[i + 1];
                const mx = (toSVG(a.x) + toSVG(b.x)) / 2;
                const my = (toSVG(a.y) + toSVG(b.y)) / 2;
                return (
                  <text key={i} x={mx} y={my - 6} textAnchor="middle" fontSize={9} fill="#14532d" fontWeight="700">
                    {w.len.toFixed(1)}m
                  </text>
                );
              })}

              {/* Points */}
              {activePoints.map((p, i) => (
                <circle key={i} cx={toSVG(p.x)} cy={toSVG(p.y)} r={i === 0 ? 6 : 4}
                  fill={i === 0 ? '#16a34a' : '#14532d'} stroke="white" strokeWidth={2} />
              ))}

              {/* Draw mode hover point */}
              {inputMode === 'draw' && !closed && hoverPoint && (
                <circle cx={toSVG(hoverPoint.x)} cy={toSVG(hoverPoint.y)} r={3} fill="none" stroke="#86efac" strokeWidth={1.5} />
              )}

              {/* Axis labels */}
              {[0, 5, 10, 15, 20].map(m => (
                <g key={m}>
                  <text x={toSVG(m) + 2} y={10} fontSize={9} fill="#94a3b8">{m}m</text>
                  <text x={2} y={toSVG(m) + 10} fontSize={9} fill="#94a3b8">{m}m</text>
                </g>
              ))}

              {/* North arrow */}
              <g>
                <circle cx={naCx} cy={naCy} r={22} fill="white" fillOpacity={0.85} stroke="#dcfce7" strokeWidth={1} />
                <line x1={naTailX} y1={naTailY} x2={naTipX} y2={naTipY} stroke="#14532d" strokeWidth={2} strokeLinecap="round" />
                <polygon
                  points={`${naTipX},${naTipY} ${naCx + 5 * Math.cos(NA)},${naCy - 5 * Math.sin(NA)} ${naCx - 5 * Math.cos(NA)},${naCy + 5 * Math.sin(NA)}`}
                  fill="#14532d"
                />
                <text x={naLabelX} y={naLabelY + 3} textAnchor="middle" fontSize={9} fill="#14532d" fontWeight="900">N</text>
              </g>
            </svg>
          </div>

          {/* Type mode input strip */}
          {inputMode === 'type' && !closed && (
            <div className="shrink-0 p-3" style={{ borderTop: '2px solid #f0fdf4', background: '#fafff8' }}>
              <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>
                {walls.length === 0 ? 'WALL 1 — starting at (5, 5)' : `WALL ${walls.length + 1} — from (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)})`}
              </div>

              <div className="flex gap-2 items-center">
                <div className="grid grid-cols-3 gap-0.5" style={{ width: 72 }}>
                  <div />
                  <button onClick={() => { setDir('N'); lenRef.current?.focus(); }}
                    className="h-8 rounded text-xs font-black transition-all"
                    style={{ background: dir === 'N' ? '#14532d' : '#f0fdf4', color: dir === 'N' ? 'white' : '#6b7280' }}>↑</button>
                  <div />
                  <button onClick={() => { setDir('W'); lenRef.current?.focus(); }}
                    className="h-8 rounded text-xs font-black transition-all"
                    style={{ background: dir === 'W' ? '#14532d' : '#f0fdf4', color: dir === 'W' ? 'white' : '#6b7280' }}>←</button>
                  <div className="h-8 rounded flex items-center justify-center text-xs font-black" style={{ background: '#e2e8f0', color: '#94a3b8' }}>
                    {dirArrow[dir]}
                  </div>
                  <button onClick={() => { setDir('E'); lenRef.current?.focus(); }}
                    className="h-8 rounded text-xs font-black transition-all"
                    style={{ background: dir === 'E' ? '#14532d' : '#f0fdf4', color: dir === 'E' ? 'white' : '#6b7280' }}>→</button>
                  <div />
                  <button onClick={() => { setDir('S'); lenRef.current?.focus(); }}
                    className="h-8 rounded text-xs font-black transition-all"
                    style={{ background: dir === 'S' ? '#14532d' : '#f0fdf4', color: dir === 'S' ? 'white' : '#6b7280' }}>↓</button>
                  <div />
                </div>

                <div className="flex-1 flex flex-col gap-1">
                  <div className="text-xs font-bold" style={{ color: '#14532d' }}>{dirArrow[dir]} {dirLabel[dir]}</div>
                  <div className="flex gap-2 items-center">
                    <input
                      ref={lenRef}
                      type="number" step="0.1" min="0.1"
                      placeholder="Length in metres"
                      value={lenInput}
                      onChange={e => setLenInput(e.target.value)}
                      onKeyDown={handleLenKeyDown}
                      autoFocus={inputMode === 'type'}
                      className="flex-1 rounded-lg px-3 py-2 text-sm font-mono font-bold focus:outline-none"
                      style={{ border: '2px solid #16a34a' }}
                    />
                    <span className="text-sm font-black" style={{ color: '#86efac' }}>m</span>
                    <button
                      onClick={addWall}
                      disabled={!lenInput}
                      className="px-4 py-2 rounded-lg text-sm font-black disabled:opacity-40"
                      style={{ background: '#14532d', color: 'white' }}
                    >
                      Enter
                    </button>
                  </div>
                  <div className="text-xs" style={{ color: '#94a3b8' }}>
                    Arrow keys or click compass to change direction · Enter to add wall
                  </div>
                </div>
              </div>

              {canClose && (
                <button
                  onClick={closeShape}
                  className="mt-2 w-full py-2 rounded-lg text-sm font-black"
                  style={{ background: '#14532d', color: 'white' }}
                >
                  ✓ Close shape — back to start ({distToStart.toFixed(1)}m remaining)
                </button>
              )}
            </div>
          )}

          {/* Type mode wall history */}
          {inputMode === 'type' && walls.length > 0 && (
            <div className="shrink-0 overflow-y-auto" style={{ maxHeight: 140, borderTop: '1px solid #f0fdf4', background: 'white' }}>
              <div className="px-3 pt-2 pb-1 text-xs font-black uppercase tracking-widest" style={{ color: '#94a3b8' }}>
                WALLS ENTERED
              </div>
              <div className="px-3 pb-2 space-y-1">
                {walls.map((w, i) => (
                  <WallHistoryRow key={i} index={i} dir={w.dir} len={w.len} onDelete={() => deleteWall(i)} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 3D View */}
        <ThreeViewer points={closed ? activePoints : []} storeyHeight={storeyHeight} roofType={roofType} />

        {/* SAP Takeoff */}
        <div className="rounded-2xl flex flex-col overflow-hidden" style={{ background: 'white', border: '2px solid #dcfce7' }}>
          <div className="px-4 py-3 shrink-0" style={{ borderBottom: '2px solid #f0fdf4', background: '#f0fdf4' }}>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#14532d' }}>SAP TAKEOFF</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!closed ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">📐</div>
                <div className="text-xs font-bold" style={{ color: '#86efac' }}>Close the shape to see areas</div>
              </div>
            ) : (
              <>
                {/* Key metrics */}
                <TakeoffRow label="Total Floor Area (TFA)" value={floorArea} unit="m²" highlight />
                <TakeoffRow label="Perimeter" value={perimeter} unit="m" />
                <TakeoffRow label="Roof Area" value={effectiveRoofArea} unit="m²" note={roofType === 'pitched' ? '+20% pitch' : undefined} />

                {/* Individual wall breakdown */}
                <div style={{ borderTop: '1px dashed #dcfce7', paddingTop: 12 }}>
                  <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>ALL WALLS</div>
                  <div className="space-y-1">
                    {wallSegs.map(seg => (
                      <div key={seg.i} className="flex items-center gap-1 text-xs">
                        <span className="font-black w-6 shrink-0" style={{ color: '#94a3b8' }}>W{seg.i + 1}</span>
                        <span className="w-4 shrink-0" style={{ color: WALL_COLOR[seg.type] }}>{ORIENT_ARROW[seg.orientation]}</span>
                        <span className="font-semibold w-12 shrink-0" style={{ color: '#475569' }}>{seg.orientation.slice(0, 1)}</span>
                        <span className="font-mono w-14 shrink-0" style={{ color: '#334155' }}>{seg.len.toFixed(2)}m</span>
                        <span className="font-mono w-16 shrink-0" style={{ color: '#334155' }}>{seg.area.toFixed(1)}m²</span>
                        <span
                          className="text-xs px-1 py-0.5 rounded font-black uppercase shrink-0"
                          style={{
                            background: seg.type === 'external' ? '#dcfce7' : seg.type === 'party' ? '#fef3c7' : '#f1f5f9',
                            color: WALL_COLOR[seg.type],
                            fontSize: 9,
                          }}
                        >
                          {seg.type === 'external' ? 'Ext' : seg.type === 'party' ? 'Pty' : 'Int'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Aggregated external by orientation */}
                <div style={{ borderTop: '1px dashed #dcfce7', paddingTop: 12 }}>
                  <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>EXTERNAL WALLS</div>
                  <TakeoffRow label="Total external wall area" value={totalExtWallArea} unit="m²" />
                  {(Object.entries(extWallsByOrientation) as [Orientation, number][]).map(([d, area]) =>
                    area > 0 && (
                      <TakeoffRow key={d} label={`${ORIENT_ARROW[d]} ${d}`} value={area} unit="m²" indent />
                    )
                  )}
                  {partyWallTotal > 0 && (
                    <TakeoffRow label="Party wall area" value={partyWallTotal} unit="m²" party />
                  )}
                </div>

                {/* Notes */}
                <div style={{ borderTop: '1px dashed #dcfce7', paddingTop: 12 }}>
                  <div className="text-xs space-y-1" style={{ color: '#94a3b8' }}>
                    <div>• North = {northAngle}° CW from canvas up</div>
                    <div>• Storey height: {storeyHeight}m</div>
                    <div>• Roof: {roofType === 'pitched' ? 'pitched (×1.2)' : 'flat'}</div>
                    <div>• Click walls on plan to change type</div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function TakeoffRow({ label, value, unit, highlight, indent, party, note }: {
  label: string; value: number; unit: string; highlight?: boolean; indent?: boolean; party?: boolean; note?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${indent ? 'pl-3' : ''}`}>
      <span className="text-xs font-semibold flex-1" style={{ color: party ? '#f59e0b' : indent ? '#94a3b8' : '#475569' }}>{label}</span>
      <div className="text-right">
        <span className="text-sm font-black font-mono" style={{ color: highlight ? '#14532d' : party ? '#f59e0b' : '#334155' }}>
          {value.toFixed(1)}
        </span>
        <span className="text-xs ml-1" style={{ color: '#94a3b8' }}>{unit}</span>
        {note && <div className="text-xs" style={{ color: '#86efac' }}>{note}</div>}
      </div>
    </div>
  );
}
