'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Point { x: number; y: number; } // metres

type Orientation = 'North' | 'East' | 'South' | 'West';
type InputMode = 'draw' | 'type';

function wallOrientation(a: Point, b: Point): Orientation {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const normal = angle + 90;
  const n = ((normal % 360) + 360) % 360;
  if (n >= 315 || n < 45) return 'East';
  if (n >= 45 && n < 135) return 'South';
  if (n >= 135 && n < 225) return 'West';
  return 'North';
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

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID_SIZE = 600;
const METRES_VISIBLE = 20;
const PX_PER_M = GRID_SIZE / METRES_VISIBLE;
const SNAP = 0.5;

function snap(v: number) { return Math.round(v / SNAP) * SNAP; }
function toSVG(m: number) { return m * PX_PER_M; }
function toM(px: number) { return px / PX_PER_M; }

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

    // Centre polygon
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
    const centred = points.map(p => ({ x: p.x - cx, y: p.y - cy }));

    // Build Three.js shape (SVG y flipped → Three.js z)
    const shape = new THREE.Shape();
    shape.moveTo(centred[0].x, -centred[0].y);
    for (let i = 1; i < centred.length; i++) shape.lineTo(centred[i].x, -centred[i].y);
    shape.closePath();

    // Walls
    const wallGeo = new THREE.ExtrudeGeometry(shape, { depth: storeyHeight, bevelEnabled: false });
    const wallMesh = new THREE.Mesh(wallGeo, new THREE.MeshLambertMaterial({ color: '#d4edda', side: THREE.DoubleSide }));
    wallMesh.rotation.x = -Math.PI / 2;
    wallMesh.castShadow = true;
    scene.add(wallMesh);

    // Wall wireframe
    const wallWire = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: '#14532d', wireframe: true, opacity: 0.12, transparent: true }));
    wallWire.rotation.x = -Math.PI / 2;
    scene.add(wallWire);

    // ── Roof ──────────────────────────────────────────────────────────────────
    if (roofType === 'flat') {
      const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false });
      const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: '#86efac' }));
      roofMesh.rotation.x = -Math.PI / 2;
      roofMesh.position.y = storeyHeight;
      scene.add(roofMesh);
    } else {
      // Pitched roof — build actual surface geometry
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
          const clampedX = Math.max(minX, Math.min(maxX, x));
          return new THREE.Vector3(clampedX, ridgeY, (minZ + maxZ) / 2);
        } else {
          const clampedZ = Math.max(minZ, Math.min(maxZ, z));
          return new THREE.Vector3((minX + maxX) / 2, ridgeY, clampedZ);
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
          // Gable triangle
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z, ra.x, ra.y, ra.z);
        } else {
          // Sloped panel (quad as 2 triangles)
          positions.push(a.x, a.y, a.z, b.x, b.y, b.z, rb.x, rb.y, rb.z);
          positions.push(a.x, a.y, a.z, rb.x, rb.y, rb.z, ra.x, ra.y, ra.z);
        }
      }

      const roofGeo = new THREE.BufferGeometry();
      roofGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      roofGeo.computeVertexNormals();

      const roofMat = new THREE.MeshLambertMaterial({ color: '#4ade80', side: THREE.DoubleSide });
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.castShadow = true;
      scene.add(roofMesh);

      const roofWire = new THREE.Mesh(roofGeo, new THREE.MeshBasicMaterial({ color: '#14532d', wireframe: true, opacity: 0.2, transparent: true }));
      scene.add(roofWire);
    }

    // Ground
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshLambertMaterial({ color: '#dcfce7' })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(40, 40, '#86efac', '#86efac');
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Orbit controls
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

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FloorPlanTool() {
  const [points, setPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [closed, setClosed] = useState(false);
  const [storeyHeight, setStoreyHeight] = useState(2.4);
  const [roofType, setRoofType] = useState<'flat' | 'pitched'>('flat');
  const [inputMode, setInputMode] = useState<InputMode>('draw');

  const [rectW, setRectW] = useState('');
  const [rectD, setRectD] = useState('');
  const [typeX, setTypeX] = useState('');
  const [typeY, setTypeY] = useState('');
  const [offsetDir, setOffsetDir] = useState<'N' | 'S' | 'E' | 'W'>('E');
  const [offsetLen, setOffsetLen] = useState('');

  const svgRef = useRef<SVGSVGElement>(null);

  const getSVGPoint = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: snap(toM(e.clientX - rect.left)), y: snap(toM(e.clientY - rect.top)) };
  }, []);

  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (closed || inputMode !== 'draw') return;
    const pt = getSVGPoint(e);
    if (points.length >= 3) {
      const first = points[0];
      if (Math.sqrt((pt.x - first.x) ** 2 + (pt.y - first.y) ** 2) < 0.6) {
        setClosed(true); return;
      }
    }
    setPoints(prev => [...prev, pt]);
  }, [closed, points, getSVGPoint, inputMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (closed || inputMode !== 'draw') return;
    setHoverPoint(getSVGPoint(e));
  }, [closed, getSVGPoint, inputMode]);

  const reset = () => { setPoints([]); setHoverPoint(null); setClosed(false); };

  const addRectangle = () => {
    const w = parseFloat(rectW);
    const d = parseFloat(rectD);
    if (!w || !d || w <= 0 || d <= 0) return;
    const ox = snap(10 - w / 2);
    const oy = snap(10 - d / 2);
    setPoints([
      { x: ox, y: oy },
      { x: ox + w, y: oy },
      { x: ox + w, y: oy + d },
      { x: ox, y: oy + d },
    ]);
    setClosed(true);
  };

  const addAbsolutePoint = () => {
    const x = parseFloat(typeX);
    const y = parseFloat(typeY);
    if (isNaN(x) || isNaN(y) || closed) return;
    const pt = { x: snap(x), y: snap(y) };
    if (points.length >= 3) {
      const first = points[0];
      if (Math.sqrt((pt.x - first.x) ** 2 + (pt.y - first.y) ** 2) < 0.3) {
        setClosed(true); return;
      }
    }
    setPoints(prev => [...prev, pt]);
    setTypeX('');
    setTypeY('');
  };

  const addOffsetPoint = () => {
    const len = parseFloat(offsetLen);
    if (!len || len <= 0 || closed) return;
    const last = points.length > 0 ? points[points.length - 1] : { x: 5, y: 5 };
    const offsets: Record<'N' | 'S' | 'E' | 'W', Point> = {
      N: { x: last.x, y: last.y - len },
      S: { x: last.x, y: last.y + len },
      E: { x: last.x + len, y: last.y },
      W: { x: last.x - len, y: last.y },
    };
    const pt = { x: snap(offsets[offsetDir].x), y: snap(offsets[offsetDir].y) };
    if (points.length >= 3) {
      const first = points[0];
      if (Math.sqrt((pt.x - first.x) ** 2 + (pt.y - first.y) ** 2) < 0.3) {
        setClosed(true); return;
      }
    }
    setPoints(prev => [...prev, pt]);
    setOffsetLen('');
  };

  const removeLastPoint = () => {
    if (closed) { setClosed(false); return; }
    setPoints(prev => prev.slice(0, -1));
  };

  const floorArea = closed && points.length >= 3 ? polygonArea(points) : 0;
  const effectiveRoofArea = roofType === 'pitched' ? floorArea * 1.2 : floorArea;
  const wallsByOrientation: Record<Orientation, number> = { North: 0, East: 0, South: 0, West: 0 };
  let totalWallArea = 0;
  if (closed && points.length >= 3) {
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const area = wallLength(a, b) * storeyHeight;
      wallsByOrientation[wallOrientation(a, b)] += area;
      totalWallArea += area;
    }
  }
  const perimeter = closed && points.length >= 3
    ? points.reduce((sum, p, i) => sum + wallLength(p, points[(i + 1) % points.length]), 0)
    : 0;

  const gridLines = [];
  for (let i = 0; i <= METRES_VISIBLE; i++) {
    const pos = toSVG(i);
    gridLines.push(<line key={`v${i}`} x1={pos} y1={0} x2={pos} y2={GRID_SIZE} stroke="#dcfce7" strokeWidth={i % 5 === 0 ? 1.5 : 0.5} />);
    gridLines.push(<line key={`h${i}`} x1={0} y1={pos} x2={GRID_SIZE} y2={pos} stroke="#dcfce7" strokeWidth={i % 5 === 0 ? 1.5 : 0.5} />);
  }

  const polyPoints = points.map(p => `${toSVG(p.x)},${toSVG(p.y)}`).join(' ');
  const previewPoints = hoverPoint && points.length > 0
    ? [...points, hoverPoint].map(p => `${toSVG(p.x)},${toSVG(p.y)}`).join(' ')
    : polyPoints;

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-6">
      <div style={{ borderTop: '4px solid #16a34a', paddingTop: '1rem' }}>
        <h1 className="text-3xl font-black" style={{ color: '#14532d' }}>FLOOR PLAN TOOL</h1>
        <p className="text-sm mt-1 font-medium" style={{ color: '#64748b' }}>
          Draw or type a floor plan · Auto-calculate SAP surface areas · 3D preview
        </p>
      </div>

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
          <label className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Input Mode</label>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '2px solid #dcfce7' }}>
            {(['draw', 'type'] as InputMode[]).map(m => (
              <button
                key={m}
                onClick={() => setInputMode(m)}
                className="px-4 py-2 text-xs font-black uppercase tracking-widest transition-all"
                style={{
                  background: inputMode === m ? '#14532d' : 'white',
                  color: inputMode === m ? 'white' : '#6b7280',
                }}
              >
                {m === 'draw' ? '✏️ Draw' : '⌨️ Type'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 ml-auto items-end">
          {!closed && points.length >= 3 && (
            <button onClick={() => setClosed(true)} className="px-4 py-2 rounded-xl text-sm font-black" style={{ background: '#14532d', color: 'white' }}>
              Close polygon
            </button>
          )}
          {points.length > 0 && (
            <button onClick={removeLastPoint} className="px-4 py-2 rounded-xl text-sm font-black" style={{ border: '2px solid #e2e8f0', color: '#64748b', background: 'white' }}>
              ↩ Undo
            </button>
          )}
          <button onClick={reset} className="px-4 py-2 rounded-xl text-sm font-black" style={{ border: '2px solid #fecaca', color: '#ef4444', background: 'white' }}>
            Clear
          </button>
        </div>

        <div className="w-full text-xs font-medium" style={{ color: '#94a3b8' }}>
          {inputMode === 'draw'
            ? closed
              ? 'Plan complete. Drag to rotate 3D view. Scroll to zoom.'
              : points.length === 0
                ? 'Click on the grid to place corners. Snap: 0.5m. Click near the first point (●) to close.'
                : `${points.length} point${points.length !== 1 ? 's' : ''} placed — click near the first point or press Close polygon.`
            : 'Use the measurement panels below the grid to enter exact dimensions.'}
        </div>
      </div>

      <div className="grid grid-cols-[600px_1fr_280px] gap-6" style={{ height: 620 }}>

        <div className="rounded-2xl overflow-hidden flex flex-col" style={{ border: '2px solid #dcfce7', background: 'white' }}>
          <div className="px-4 py-2 flex items-center justify-between shrink-0" style={{ borderBottom: '1px solid #f0fdf4' }}>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#14532d' }}>2D PLAN VIEW</span>
            <span className="text-xs font-medium" style={{ color: '#86efac' }}>grid: 1m · snap: 0.5m</span>
          </div>

          <div className="flex-1 overflow-hidden relative">
            <svg
              ref={svgRef}
              width={GRID_SIZE}
              height={GRID_SIZE}
              onClick={handleClick}
              onMouseMove={handleMouseMove}
              className={inputMode === 'draw' && !closed ? 'cursor-crosshair' : 'cursor-default'}
              style={{ userSelect: 'none' }}
            >
              {gridLines}
              {!closed && points.length > 0 && hoverPoint && inputMode === 'draw' && (
                <polyline points={previewPoints} fill="none" stroke="#86efac" strokeWidth={1.5} strokeDasharray="4 3" />
              )}
              {closed && points.length >= 3 && (
                <polygon points={polyPoints} fill="#f0fdf4" stroke="#16a34a" strokeWidth={2} />
              )}
              {!closed && points.length >= 2 && (
                <polyline points={polyPoints} fill="none" stroke="#14532d" strokeWidth={2} />
              )}
              {closed && points.map((p, i) => {
                const b = points[(i + 1) % points.length];
                const mx = (toSVG(p.x) + toSVG(b.x)) / 2;
                const my = (toSVG(p.y) + toSVG(b.y)) / 2;
                return (
                  <text key={i} x={mx} y={my - 5} textAnchor="middle" fontSize={10} fill="#14532d" fontWeight="700">
                    {wallLength(p, b).toFixed(1)}m
                  </text>
                );
              })}
              {points.map((p, i) => (
                <circle key={i} cx={toSVG(p.x)} cy={toSVG(p.y)} r={i === 0 ? 6 : 4} fill={i === 0 ? '#16a34a' : '#14532d'} stroke="white" strokeWidth={2} />
              ))}
              {!closed && hoverPoint && inputMode === 'draw' && (
                <circle cx={toSVG(hoverPoint.x)} cy={toSVG(hoverPoint.y)} r={3} fill="none" stroke="#86efac" strokeWidth={1.5} />
              )}
              {[0, 5, 10, 15, 20].map(m => (
                <g key={m}>
                  <text x={toSVG(m) + 2} y={10} fontSize={9} fill="#94a3b8">{m}m</text>
                  <text x={2} y={toSVG(m) + 10} fontSize={9} fill="#94a3b8">{m}m</text>
                </g>
              ))}
            </svg>
          </div>

          {inputMode === 'type' && !closed && (
            <div className="shrink-0 p-3 space-y-3" style={{ borderTop: '2px solid #f0fdf4', background: '#fafff8' }}>

              <div>
                <div className="text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#94a3b8' }}>QUICK RECTANGLE</div>
                <div className="flex gap-2 items-center">
                  <input
                    type="number" step="0.5" min="0.5" placeholder="Width (m)"
                    value={rectW} onChange={e => setRectW(e.target.value)}
                    className="rounded-lg px-2 py-1.5 text-xs font-mono w-24 focus:outline-none"
                    style={{ border: '2px solid #dcfce7' }}
                  />
                  <span className="text-xs font-black" style={{ color: '#86efac' }}>×</span>
                  <input
                    type="number" step="0.5" min="0.5" placeholder="Depth (m)"
                    value={rectD} onChange={e => setRectD(e.target.value)}
                    className="rounded-lg px-2 py-1.5 text-xs font-mono w-24 focus:outline-none"
                    style={{ border: '2px solid #dcfce7' }}
                  />
                  <button
                    onClick={addRectangle}
                    disabled={!rectW || !rectD}
                    className="px-3 py-1.5 rounded-lg text-xs font-black disabled:opacity-40"
                    style={{ background: '#14532d', color: 'white' }}
                  >
                    Create
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#94a3b8' }}>
                  ADD WALL — {points.length > 0 ? `from (${points[points.length - 1].x}, ${points[points.length - 1].y})` : 'start point'}
                </div>
                <div className="flex gap-2 items-center flex-wrap">
                  <div className="flex rounded-lg overflow-hidden" style={{ border: '2px solid #dcfce7' }}>
                    {(['N', 'S', 'E', 'W'] as const).map(d => (
                      <button
                        key={d}
                        onClick={() => setOffsetDir(d)}
                        className="w-8 h-8 text-xs font-black"
                        style={{
                          background: offsetDir === d ? '#14532d' : 'white',
                          color: offsetDir === d ? 'white' : '#6b7280',
                        }}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number" step="0.5" min="0.5" placeholder="Length (m)"
                    value={offsetLen} onChange={e => setOffsetLen(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addOffsetPoint()}
                    className="rounded-lg px-2 py-1.5 text-xs font-mono w-28 focus:outline-none"
                    style={{ border: '2px solid #dcfce7' }}
                  />
                  <button
                    onClick={addOffsetPoint}
                    disabled={!offsetLen}
                    className="px-3 py-1.5 rounded-lg text-xs font-black disabled:opacity-40"
                    style={{ background: '#14532d', color: 'white' }}
                  >
                    Add wall
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs font-black uppercase tracking-widest mb-1.5" style={{ color: '#94a3b8' }}>OR ADD POINT BY COORDINATE</div>
                <div className="flex gap-2 items-center">
                  <input
                    type="number" step="0.5" placeholder="X (m)"
                    value={typeX} onChange={e => setTypeX(e.target.value)}
                    className="rounded-lg px-2 py-1.5 text-xs font-mono w-20 focus:outline-none"
                    style={{ border: '2px solid #dcfce7' }}
                  />
                  <input
                    type="number" step="0.5" placeholder="Y (m)"
                    value={typeY} onChange={e => setTypeY(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addAbsolutePoint()}
                    className="rounded-lg px-2 py-1.5 text-xs font-mono w-20 focus:outline-none"
                    style={{ border: '2px solid #dcfce7' }}
                  />
                  <button
                    onClick={addAbsolutePoint}
                    disabled={!typeX || !typeY}
                    className="px-3 py-1.5 rounded-lg text-xs font-black disabled:opacity-40"
                    style={{ background: '#14532d', color: 'white' }}
                  >
                    Add point
                  </button>
                </div>
              </div>

              {points.length >= 3 && (
                <button onClick={() => setClosed(true)} className="w-full py-2 rounded-lg text-xs font-black" style={{ background: '#f0fdf4', color: '#16a34a', border: '2px solid #86efac' }}>
                  ✓ Close polygon & calculate
                </button>
              )}
            </div>
          )}
        </div>

        <ThreeViewer points={closed ? points : []} storeyHeight={storeyHeight} roofType={roofType} />

        <div className="rounded-2xl flex flex-col overflow-hidden" style={{ background: 'white', border: '2px solid #dcfce7' }}>
          <div className="px-4 py-3 shrink-0" style={{ borderBottom: '2px solid #f0fdf4', background: '#f0fdf4' }}>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#14532d' }}>SAP TAKEOFF</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!closed ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">📐</div>
                <div className="text-xs font-bold" style={{ color: '#86efac' }}>Close the polygon to see areas</div>
              </div>
            ) : (
              <>
                <TakeoffRow label="Total Floor Area (TFA)" value={floorArea} unit="m²" highlight />
                <TakeoffRow label="Perimeter" value={perimeter} unit="m" />
                <TakeoffRow label="Roof Area" value={effectiveRoofArea} unit="m²" note={roofType === 'pitched' ? '+20% for pitch' : undefined} />
                <div style={{ borderTop: '1px dashed #dcfce7', paddingTop: 12 }}>
                  <div className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#94a3b8' }}>EXTERNAL WALLS</div>
                  <TakeoffRow label="Total wall area" value={totalWallArea} unit="m²" />
                  {(Object.entries(wallsByOrientation) as [Orientation, number][]).map(([dir, area]) => (
                    area > 0 && <TakeoffRow key={dir} label={`↑ ${dir}`} value={area} unit="m²" indent />
                  ))}
                </div>
                <div style={{ borderTop: '1px dashed #dcfce7', paddingTop: 12 }}>
                  <div className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#94a3b8' }}>NOTES</div>
                  <div className="text-xs space-y-1" style={{ color: '#94a3b8' }}>
                    <div>• Deduct window/door openings from wall areas manually</div>
                    <div>• Party walls not included (single dwelling assumed)</div>
                    <div>• Roof area: footprint {roofType === 'pitched' ? '× 1.2 for pitch' : '(flat)'}</div>
                    <div>• Heights based on {storeyHeight}m storey</div>
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

function TakeoffRow({ label, value, unit, highlight, indent, note }: {
  label: string; value: number; unit: string; highlight?: boolean; indent?: boolean; note?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-2 ${indent ? 'pl-3' : ''}`}>
      <span className="text-xs font-semibold flex-1" style={{ color: indent ? '#94a3b8' : '#475569' }}>{label}</span>
      <div className="text-right">
        <span className="text-sm font-black font-mono" style={{ color: highlight ? '#14532d' : '#334155' }}>
          {value.toFixed(1)}
        </span>
        <span className="text-xs ml-1" style={{ color: '#94a3b8' }}>{unit}</span>
        {note && <div className="text-xs" style={{ color: '#86efac' }}>{note}</div>}
      </div>
    </div>
  );
}
