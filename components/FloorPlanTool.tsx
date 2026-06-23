'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Point { x: number; y: number; }

type Orientation = 'North' | 'East' | 'South' | 'West';
type Dir = 'N' | 'S' | 'E' | 'W';
type InputMode = 'draw' | 'type';
type WallType = 'external' | 'party' | 'internal';
type Layer = 'floor' | 'roof';
type RoofType = 'flat' | 'pitched_cold' | 'pitched_warm' | 'room_in_roof' | 'exposed_floor';
type RoofPhase = 'idle' | 'polygon' | 'ridge';

interface RoofZone {
  id: number;
  label: string;
  type: RoofType;
  pitch: number;
  points: Point[];
  ridge: { a: Point; b: Point } | null;
}

// ─── Per-storey model ─────────────────────────────────────────────────────────
interface StoreyState {
  id: number;
  label: string;
  storeyBase: number;   // floor level above datum (m)
  storeyHeight: number; // floor-to-ceiling (m)
  roofType: 'flat' | 'pitched'; // for 3-D viewer
  // Floor plan drawing
  points: Point[];
  closed: boolean;
  wallTypes: WallType[];
  // Type-mode walls
  walls: { dir: Dir; len: number }[];
  // Roof zones
  roofZones: RoofZone[];
  nextZoneId: number;
}

function makeStorey(id: number, base: number): StoreyState {
  return {
    id,
    label: id === 0 ? 'Ground Floor' : id === 1 ? 'First Floor' : id === 2 ? 'Second Floor' : `Floor ${id}`,
    storeyBase: base,
    storeyHeight: 2.4,
    roofType: 'flat',
    points: [],
    closed: false,
    wallTypes: [],
    walls: [],
    roofZones: [],
    nextZoneId: 1,
  };
}

const WALL_COLOR: Record<WallType, string> = {
  external: '#16a34a',
  party: '#f59e0b',
  internal: '#94a3b8',
};
const WALL_CYCLE: WallType[] = ['external', 'party', 'internal'];

const ROOF_TYPE_LABEL: Record<RoofType, string> = {
  flat: 'Flat Roof',
  pitched_cold: 'Pitched — Cold Loft',
  pitched_warm: 'Pitched — Warm (Rafter)',
  room_in_roof: 'Room in Roof',
  exposed_floor: 'Exposed Floor/Soffit',
};

const ROOF_TYPE_COLOR: Record<RoofType, string> = {
  flat: '#6366f1',
  pitched_cold: '#0ea5e9',
  pitched_warm: '#f97316',
  room_in_roof: '#ec4899',
  exposed_floor: '#84cc16',
};

const NEEDS_RIDGE: RoofType[] = ['pitched_warm', 'room_in_roof'];

// ─── Geometry helpers ─────────────────────────────────────────────────────────
function wallOrientationWithNorth(a: Point, b: Point, northDeg: number): Orientation {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const normal = angle - 90;
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

// ─── Roof geometry helpers ────────────────────────────────────────────────────
function sideOfLine(p: Point, a: Point, b: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function segIntersect(p1: Point, p2: Point, lineA: Point, lineB: Point): Point | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = lineB.x - lineA.x, d2y = lineB.y - lineA.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-10) return null;
  const t = ((lineA.x - p1.x) * d2y - (lineA.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

function clipPolygon(poly: Point[], lineA: Point, lineB: Point, keepLeft: boolean): Point[] {
  if (poly.length < 3) return [];
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const curr = poly[i];
    const next = poly[(i + 1) % poly.length];
    const currInside = keepLeft ? sideOfLine(curr, lineA, lineB) >= 0 : sideOfLine(curr, lineA, lineB) < 0;
    const nextInside = keepLeft ? sideOfLine(next, lineA, lineB) >= 0 : sideOfLine(next, lineA, lineB) < 0;
    if (currInside) out.push(curr);
    if (currInside !== nextInside) {
      const inter = segIntersect(curr, next, lineA, lineB);
      if (inter) out.push(inter);
    }
  }
  return out;
}

function extendLine(a: Point, b: Point, dist = 100): [Point, Point] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return [a, b];
  return [
    { x: a.x - (dx / len) * dist, y: a.y - (dy / len) * dist },
    { x: b.x + (dx / len) * dist, y: b.y + (dy / len) * dist },
  ];
}

function slopeOrientation(ridgeA: Point, ridgeB: Point, isLeft: boolean, northDeg: number): Orientation {
  const dx = ridgeB.x - ridgeA.x, dy = ridgeB.y - ridgeA.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return 'North';
  const nx = isLeft ? dy / len : -dy / len;
  const ny = isLeft ? -dx / len : dx / len;
  const compassAngle = Math.atan2(nx, -ny) * (180 / Math.PI);
  const n = ((compassAngle - northDeg) % 360 + 360) % 360;
  if (n >= 315 || n < 45) return 'North';
  if (n >= 45 && n < 135) return 'East';
  if (n >= 135 && n < 225) return 'South';
  return 'West';
}

function polygonCentroid(pts: Point[]): Point {
  if (pts.length === 0) return { x: 0, y: 0 };
  let cx = 0, cy = 0, area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    const cross = pts[i].x * pts[j].y - pts[j].x * pts[i].y;
    area2 += cross;
    cx += (pts[i].x + pts[j].x) * cross;
    cy += (pts[i].y + pts[j].y) * cross;
  }
  if (Math.abs(area2) < 1e-10) {
    return { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
  }
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

interface RoofSlope { orientation: Orientation; planArea: number; actualArea: number; halfPoly?: Point[]; }

function computeZoneSlopes(zone: RoofZone, northDeg: number): RoofSlope[] {
  const pitchRad = zone.pitch * Math.PI / 180;
  const slopeFactor = zone.pitch > 0 ? 1 / Math.cos(pitchRad) : 1;

  if (!zone.ridge || !NEEDS_RIDGE.includes(zone.type)) {
    const planArea = polygonArea(zone.points);
    const actualArea = (zone.type === 'pitched_warm' || zone.type === 'room_in_roof')
      ? planArea * slopeFactor : planArea;
    return [{ orientation: 'North', planArea, actualArea, halfPoly: zone.points }];
  }

  const [extA, extB] = extendLine(zone.ridge.a, zone.ridge.b);
  const leftPoly = clipPolygon(zone.points, extA, extB, true);
  const rightPoly = clipPolygon(zone.points, extA, extB, false);
  const leftPlan = polygonArea(leftPoly);
  const rightPlan = polygonArea(rightPoly);
  const slopes: RoofSlope[] = [];
  if (leftPlan > 0.01) slopes.push({ orientation: slopeOrientation(zone.ridge.a, zone.ridge.b, true, northDeg), planArea: leftPlan, actualArea: leftPlan * slopeFactor, halfPoly: leftPoly });
  if (rightPlan > 0.01) slopes.push({ orientation: slopeOrientation(zone.ridge.a, zone.ridge.b, false, northDeg), planArea: rightPlan, actualArea: rightPlan * slopeFactor, halfPoly: rightPoly });
  return slopes;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const GRID_SIZE = 600;
const METRES_VISIBLE = 20;
const PX_PER_M = GRID_SIZE / METRES_VISIBLE;
const SNAP = 0.1;

function snap(v: number) { return Math.round(v / SNAP) * SNAP; }
function snap2dp(v: number) { return Math.round(v * 100) / 100; }
function toSVG(m: number) { return m * PX_PER_M; }
function toM(px: number) { return px / PX_PER_M; }

const ORIENT_ARROW: Record<Orientation, string> = { North: '↑', East: '→', South: '↓', West: '←' };

// ─── Wall segment type ────────────────────────────────────────────────────────
interface WallSegInfo {
  i: number;
  a: Point; b: Point;
  len: number;
  orientation: Orientation;
  area: number;
  type: WallType;
}

const WALL_3D_COLOR: Record<WallType, number> = {
  external: 0x16a34a,
  party: 0xf59e0b,
  internal: 0x94a3b8,
};

// Storey colours for 3D (subtle variation so you can tell them apart)
const STOREY_COLORS = ['#d4edda', '#c8e6f5', '#fde8c8', '#f0d4f5', '#fde8e8'];
const STOREY_WIRE   = ['#14532d', '#1e4d7a', '#7a4a1e', '#5a1e7a', '#7a1e1e'];

// ─── 3D Viewer ────────────────────────────────────────────────────────────────
type StoreyForViewer = Pick<StoreyState, 'id' | 'points' | 'closed' | 'storeyBase' | 'storeyHeight' | 'roofType'>;

function ThreeViewer({
  storeys,
  activeStoreyId,
  wallSegs,
  selectedWallIdx,
  onWallClick,
}: {
  storeys: StoreyForViewer[];
  activeStoreyId: number;
  wallSegs: WallSegInfo[];
  selectedWallIdx: number | null;
  onWallClick: (idx: number | null) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);

  const validStoreys = storeys.filter(s => s.closed && s.points.length >= 3);

  useEffect(() => {
    if (!mountRef.current || validStoreys.length === 0) return;

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

    // Compute a shared centroid from the ground floor (or first valid storey)
    const ref = validStoreys[0];
    const cx = ref.points.reduce((s, p) => s + p.x, 0) / ref.points.length;
    const cy = ref.points.reduce((s, p) => s + p.y, 0) / ref.points.length;

    // Find the topmost storey for the roof
    const topmostStorey = [...validStoreys].sort((a, b) => (b.storeyBase + b.storeyHeight) - (a.storeyBase + a.storeyHeight))[0];
    let buildingMeshForRaycasting: THREE.Mesh | null = null;
    const activeStorey = validStoreys.find(s => s.id === activeStoreyId) ?? topmostStorey;

    validStoreys.forEach((storey, si) => {
      const centred = storey.points.map(p => ({ x: p.x - cx, y: p.y - cy }));
      const shape = new THREE.Shape();
      shape.moveTo(centred[0].x, -centred[0].y);
      for (let i = 1; i < centred.length; i++) shape.lineTo(centred[i].x, -centred[i].y);
      shape.closePath();

      const colorIdx = si % STOREY_COLORS.length;
      const isActive = storey.id === activeStoreyId;

      const buildingGeo = new THREE.ExtrudeGeometry(shape, { depth: storey.storeyHeight, bevelEnabled: false });
      const buildingMesh = new THREE.Mesh(
        buildingGeo,
        new THREE.MeshLambertMaterial({
          color: STOREY_COLORS[colorIdx],
          side: THREE.DoubleSide,
          opacity: isActive ? 1 : 0.75,
          transparent: !isActive,
        })
      );
      buildingMesh.rotation.x = -Math.PI / 2;
      buildingMesh.position.y = storey.storeyBase;
      buildingMesh.castShadow = true;
      scene.add(buildingMesh);

      const wireColor = STOREY_WIRE[colorIdx];
      const buildingWire = new THREE.Mesh(
        buildingGeo,
        new THREE.MeshBasicMaterial({ color: wireColor, wireframe: true, opacity: 0.15, transparent: true })
      );
      buildingWire.rotation.x = -Math.PI / 2;
      buildingWire.position.y = storey.storeyBase;
      scene.add(buildingWire);

      // Store the active storey's mesh for raycasting
      if (storey.id === activeStoreyId) buildingMeshForRaycasting = buildingMesh;

      // Selected wall highlight on active storey
      if (isActive && selectedWallIdx !== null) {
        const sel = wallSegs.find(s => s.i === selectedWallIdx);
        if (sel) {
          const midX = (sel.a.x + sel.b.x) / 2 - cx;
          const midZ = -((sel.a.y + sel.b.y) / 2 - cy);
          const angle = Math.atan2(sel.b.y - sel.a.y, sel.b.x - sel.a.x);
          const hlGeo = new THREE.PlaneGeometry(sel.len, storey.storeyHeight);
          const hlMat = new THREE.MeshBasicMaterial({ color: WALL_3D_COLOR[sel.type], side: THREE.DoubleSide, transparent: true, opacity: 0.55 });
          const hlMesh = new THREE.Mesh(hlGeo, hlMat);
          hlMesh.position.set(midX, storey.storeyBase + storey.storeyHeight / 2, midZ);
          hlMesh.rotation.y = -angle;
          scene.add(hlMesh);
        }
      }

      // Roof — only on topmost storey
      if (storey.id === topmostStorey.id) {
        const topCentred = storey.points.map(p => ({ x: p.x - cx, y: p.y - cy }));
        const topShape = new THREE.Shape();
        topShape.moveTo(topCentred[0].x, -topCentred[0].y);
        for (let i = 1; i < topCentred.length; i++) topShape.lineTo(topCentred[i].x, -topCentred[i].y);
        topShape.closePath();

        const roofBase = storey.storeyBase + storey.storeyHeight;

        if (storey.roofType === 'flat') {
          const roofGeo = new THREE.ExtrudeGeometry(topShape, { depth: 0.2, bevelEnabled: false });
          const roofMesh = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: '#86efac' }));
          roofMesh.rotation.x = -Math.PI / 2;
          roofMesh.position.y = roofBase;
          scene.add(roofMesh);
        } else {
          const xs = topCentred.map(p => p.x);
          const zs = topCentred.map(p => -p.y);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minZ = Math.min(...zs), maxZ = Math.max(...zs);
          const spanX = maxX - minX;
          const spanZ = maxZ - minZ;
          const ridgeH = Math.min(spanX, spanZ) * 0.45;
          const ridgeY = roofBase + ridgeH;
          const ridgeAlongX = spanX >= spanZ;

          function projectToRidge(x: number, z: number): THREE.Vector3 {
            if (ridgeAlongX) {
              return new THREE.Vector3(Math.max(minX, Math.min(maxX, x)), ridgeY, (minZ + maxZ) / 2);
            } else {
              return new THREE.Vector3((minX + maxX) / 2, ridgeY, Math.max(minZ, Math.min(maxZ, z)));
            }
          }

          const eaveVerts = topCentred.map(p => new THREE.Vector3(p.x, roofBase, -p.y));
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
      }

      // Storey separator line (slab line between floors)
      if (si > 0) {
        const edgePts = centred;
        const linePositions: number[] = [];
        for (let i = 0; i < edgePts.length; i++) {
          const a = edgePts[i];
          const b = edgePts[(i + 1) % edgePts.length];
          linePositions.push(a.x, storey.storeyBase, -a.y, b.x, storey.storeyBase, -b.y);
        }
        const lineGeo = new THREE.BufferGeometry();
        lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
        scene.add(new THREE.LineSegments(lineGeo, new THREE.LineBasicMaterial({ color: '#64748b', opacity: 0.6, transparent: true })));
      }
    });

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshLambertMaterial({ color: '#dcfce7' }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    scene.add(ground);

    const grid = new THREE.GridHelper(40, 40, '#86efac', '#86efac');
    (grid.material as THREE.Material).opacity = 0.25;
    (grid.material as THREE.Material).transparent = true;
    scene.add(grid);

    // Compute camera target height
    const maxTop = Math.max(...validStoreys.map(s => s.storeyBase + s.storeyHeight));
    const targetY = maxTop / 2;

    let isDragging = false;
    let mouseDownPos = { x: 0, y: 0 };
    let prevMouse = { x: 0, y: 0 };
    const spherical = { theta: Math.PI / 4, phi: Math.PI / 3, radius: 30 };
    const raycaster = new THREE.Raycaster();
    const mouse2D = new THREE.Vector2();

    function updateCamera() {
      camera.position.set(
        spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta),
        spherical.radius * Math.cos(spherical.phi),
        spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta),
      );
      camera.lookAt(0, targetY, 0);
    }
    updateCamera();

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      mouseDownPos = { x: e.clientX, y: e.clientY };
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = (e: MouseEvent) => {
      const ddx = e.clientX - mouseDownPos.x;
      const ddy = e.clientY - mouseDownPos.y;
      const wasDrag = Math.sqrt(ddx * ddx + ddy * ddy) > 4;
      isDragging = false;
      if (!wasDrag && buildingMeshForRaycasting && wallSegs.length > 0) {
        const rect = el.getBoundingClientRect();
        mouse2D.x = ((e.clientX - rect.left) / W) * 2 - 1;
        mouse2D.y = -((e.clientY - rect.top) / H) * 2 + 1;
        raycaster.setFromCamera(mouse2D, camera);
        const hits = raycaster.intersectObject(buildingMeshForRaycasting);
        if (hits.length > 0 && hits[0].face) {
          const fn = hits[0].face.normal.clone().applyQuaternion(buildingMeshForRaycasting.quaternion);
          if (Math.abs(fn.y) < 0.2) {
            let bestIdx = -1, bestDot = -1;
            for (const seg of wallSegs) {
              const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y;
              const enx = dy / seg.len, enz = -dx / seg.len;
              const dot = Math.abs(fn.x * enx + fn.z * enz);
              if (dot > bestDot) { bestDot = dot; bestIdx = seg.i; }
            }
            if (bestDot > 0.85) { onWallClick(bestIdx); return; }
          }
        }
        onWallClick(null);
      }
    };
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeys, activeStoreyId, wallSegs, selectedWallIdx]);

  if (validStoreys.length === 0) {
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
      <span className="text-sm font-mono font-bold" style={{ color: '#334155' }}>{len.toFixed(2)} m</span>
      <button onClick={onDelete} className="text-xs px-1.5 py-0.5 rounded" style={{ color: '#ef4444', background: '#fef2f2' }}>✕</button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function FloorPlanTool() {
  // ── Storey model ────────────────────────────────────────────────────────────
  const [storeys, setStoreys] = useState<StoreyState[]>([makeStorey(0, 0)]);
  const [activeStoreyId, setActiveStoreyId] = useState(0);
  const [nextStoreyId, setNextStoreyId] = useState(1);

  // Derived active storey
  const activeStorey = storeys.find(s => s.id === activeStoreyId) ?? storeys[0];

  // Helper to update the active storey immutably
  const updateActive = useCallback((updater: (s: StoreyState) => StoreyState) => {
    setStoreys(prev => prev.map(s => s.id === activeStoreyId ? updater(s) : s));
  }, [activeStoreyId]);

  // Destructure active storey for convenience
  const { points, closed, wallTypes, walls, storeyHeight, storeyBase, roofType, roofZones, nextZoneId } = activeStorey;

  // Setters that delegate to updateActive
  const setPoints       = (v: Point[] | ((p: Point[]) => Point[])) => updateActive(s => ({ ...s, points: typeof v === 'function' ? v(s.points) : v }));
  const setClosed       = (v: boolean) => updateActive(s => ({ ...s, closed: v }));
  const setWallTypes    = (v: WallType[] | ((p: WallType[]) => WallType[])) => updateActive(s => ({ ...s, wallTypes: typeof v === 'function' ? v(s.wallTypes) : v }));
  const setWalls        = (v: { dir: Dir; len: number }[] | ((p: { dir: Dir; len: number }[]) => { dir: Dir; len: number }[])) => updateActive(s => ({ ...s, walls: typeof v === 'function' ? v(s.walls) : v }));
  const setStoreyHeight = (v: number) => updateActive(s => ({ ...s, storeyHeight: v }));
  const setStoreyBase   = (v: number) => updateActive(s => ({ ...s, storeyBase: v }));
  const setRoofType     = (v: 'flat' | 'pitched') => updateActive(s => ({ ...s, roofType: v }));
  const setRoofZones    = (v: RoofZone[] | ((p: RoofZone[]) => RoofZone[])) => updateActive(s => ({ ...s, roofZones: typeof v === 'function' ? v(s.roofZones) : v }));
  const setNextZoneId   = (v: number) => updateActive(s => ({ ...s, nextZoneId: v }));

  // ── Global / transient state ─────────────────────────────────────────────────
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [northAngle, setNorthAngle] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>('draw');
  const [layer, setLayer] = useState<Layer>('floor');

  const [newZoneLabel, setNewZoneLabel] = useState('Zone 1');
  const [newZoneType, setNewZoneType] = useState<RoofType>('pitched_cold');
  const [newZonePitch, setNewZonePitch] = useState(35);

  const [roofPhase, setRoofPhase] = useState<RoofPhase>('idle');
  const [roofPolyPoints, setRoofPolyPoints] = useState<Point[]>([]);
  const [ridgePoints, setRidgePoints] = useState<Point[]>([]);
  const [roofHover, setRoofHover] = useState<Point | null>(null);

  const [selectedWallIdx, setSelectedWallIdx] = useState<number | null>(null);

  const [dir, setDir] = useState<Dir>('E');
  const [lenInput, setLenInput] = useState('');
  const lenRef = useRef<HTMLInputElement>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  // ── Type mode points ────────────────────────────────────────────────────────
  const START: Point = { x: 5, y: 5 };
  const typePoints: Point[] = (() => {
    const pts: Point[] = [START];
    for (const w of walls) pts.push(applyDir(pts[pts.length - 1], w.dir, w.len));
    return pts;
  })();

  const activePoints = inputMode === 'type' ? typePoints : points;

  const tip = typePoints[typePoints.length - 1];
  const distToStart = walls.length >= 2 ? wallLength(tip, START) : Infinity;
  const canClose = walls.length >= 2 && distToStart < 50;

  // ── Wall segments ────────────────────────────────────────────────────────────
  const wallSegs: WallSegInfo[] = closed && activePoints.length >= 3
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

  // ── Aggregated SAP values (active storey) ────────────────────────────────────
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
  const totalRoofActualArea = roofZones.reduce((sum, zone) => {
    return sum + computeZoneSlopes(zone, northAngle).reduce((s, sl) => s + sl.actualArea, 0);
  }, 0);

  // ── Total floor area across all storeys ──────────────────────────────────────
  const totalTFA = storeys
    .filter(s => s.closed && s.points.length >= 3)
    .reduce((sum, s) => {
      const pts = s.walls.length > 0 ? (() => {
        const tp: Point[] = [START];
        for (const w of s.walls) tp.push(applyDir(tp[tp.length - 1], w.dir, w.len));
        return tp;
      })() : s.points;
      return sum + polygonArea(pts);
    }, 0);

  // ── SVG helpers ──────────────────────────────────────────────────────────────
  const getSVGPoint = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: snap(toM(e.clientX - rect.left)), y: snap(toM(e.clientY - rect.top)) };
  }, []);

  // ── Click handler ────────────────────────────────────────────────────────────
  const handleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (layer === 'roof') {
      if (roofPhase === 'polygon') {
        const pt = getSVGPoint(e);
        if (roofPolyPoints.length >= 3) {
          const first = roofPolyPoints[0];
          if (Math.sqrt((pt.x - first.x) ** 2 + (pt.y - first.y) ** 2) < 0.6) {
            if (NEEDS_RIDGE.includes(newZoneType)) {
              setRoofPhase('ridge');
            } else {
              const newZone: RoofZone = { id: nextZoneId, label: newZoneLabel, type: newZoneType, pitch: newZonePitch, points: roofPolyPoints, ridge: null };
              setRoofZones(prev => [...prev, newZone]);
              setRoofPolyPoints([]);
              setRidgePoints([]);
              setRoofPhase('idle');
              const newId = nextZoneId + 1;
              setNextZoneId(newId);
              setNewZoneLabel(`Zone ${newId}`);
            }
            return;
          }
        }
        setRoofPolyPoints(prev => [...prev, pt]);
        return;
      }
      if (roofPhase === 'ridge') {
        const pt = getSVGPoint(e);
        if (ridgePoints.length === 0) {
          setRidgePoints([pt]);
        } else {
          const newZone: RoofZone = { id: nextZoneId, label: newZoneLabel, type: newZoneType, pitch: newZonePitch, points: roofPolyPoints, ridge: { a: ridgePoints[0], b: pt } };
          setRoofZones(prev => [...prev, newZone]);
          setRoofPolyPoints([]);
          setRidgePoints([]);
          setRoofPhase('idle');
          const newId = nextZoneId + 1;
          setNextZoneId(newId);
          setNewZoneLabel(`Zone ${newId}`);
        }
        return;
      }
      return;
    }

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

    if (closed && wallSegs.length > 0) {
      const rect = svgRef.current!.getBoundingClientRect();
      const clickPt: Point = { x: toM(e.clientX - rect.left), y: toM(e.clientY - rect.top) };
      let bestIdx = -1;
      let bestDist = 0.5;
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
  }, [closed, points, getSVGPoint, inputMode, wallSegs, layer, roofPhase, roofPolyPoints, ridgePoints, newZoneType, newZoneLabel, newZonePitch, nextZoneId]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (layer === 'roof') {
      if (roofPhase === 'polygon' || roofPhase === 'ridge') setRoofHover(getSVGPoint(e));
      return;
    }
    if (closed || inputMode !== 'draw') return;
    setHoverPoint(getSVGPoint(e));
  }, [closed, getSVGPoint, inputMode, layer, roofPhase]);

  // ── Type mode ────────────────────────────────────────────────────────────────
  const addWall = useCallback(() => {
    const len = parseFloat(lenInput);
    if (!len || len <= 0 || closed) return;
    setWalls(prev => [...prev, { dir, len: snap2dp(len) }]);
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

  // ── Storey management ────────────────────────────────────────────────────────
  const addStorey = () => {
    const top = [...storeys].sort((a, b) => (b.storeyBase + b.storeyHeight) - (a.storeyBase + a.storeyHeight))[0];
    const newBase = top.storeyBase + top.storeyHeight;
    const newStorey = makeStorey(nextStoreyId, newBase);
    setStoreys(prev => [...prev, newStorey]);
    setNextStoreyId(id => id + 1);
    setActiveStoreyId(nextStoreyId);
    // Reset transient drawing state for the new storey
    setHoverPoint(null);
    setSelectedWallIdx(null);
    setLayer('floor');
    setRoofPhase('idle');
    setRoofPolyPoints([]);
    setRidgePoints([]);
  };

  const removeStorey = (id: number) => {
    if (storeys.length <= 1) return;
    setStoreys(prev => prev.filter(s => s.id !== id));
    if (activeStoreyId === id) {
      setActiveStoreyId(storeys.find(s => s.id !== id)?.id ?? 0);
    }
  };

  const switchStorey = (id: number) => {
    setActiveStoreyId(id);
    setSelectedWallIdx(null);
    setRoofPhase('idle');
    setRoofPolyPoints([]);
    setRidgePoints([]);
    setHoverPoint(null);
  };

  // ── Grid ────────────────────────────────────────────────────────────────────
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

  // ── North arrow ──────────────────────────────────────────────────────────────
  const NA = northAngle * Math.PI / 180;
  const naCx = 30, naCy = 30, naLen = 18;
  const naTipX = naCx + naLen * Math.sin(NA);
  const naTipY = naCy - naLen * Math.cos(NA);
  const naTailX = naCx - (naLen * 0.6) * Math.sin(NA);
  const naTailY = naCy + (naLen * 0.6) * Math.cos(NA);
  const naLabelX = naCx + (naLen + 8) * Math.sin(NA);
  const naLabelY = naCy - (naLen + 8) * Math.cos(NA);

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
  const pitchNeedsDisplay = (rt: RoofType) => rt !== 'flat' && rt !== 'pitched_cold' && rt !== 'exposed_floor';

  const cursorClass = layer === 'roof'
    ? (roofPhase !== 'idle' ? 'cursor-crosshair' : 'cursor-default')
    : closed
      ? 'cursor-pointer'
      : inputMode === 'draw' ? 'cursor-crosshair' : 'cursor-default';

  // Other storeys' points for faint overlay on 2D canvas
  const otherClosedStoreys = storeys.filter(s => s.id !== activeStoreyId && s.closed && s.points.length >= 3);

  // Sort storeys by base for display
  const sortedStoreys = [...storeys].sort((a, b) => a.storeyBase - b.storeyBase);

  return (
    <div className="max-w-[1600px] mx-auto p-6 space-y-6">
      {/* Header */}
      <div style={{ borderTop: '4px solid #16a34a', paddingTop: '1rem' }}>
        <h1 className="text-3xl font-black" style={{ color: '#14532d' }}>BUILDING MODELLER</h1>
        <p className="text-sm mt-1 font-medium" style={{ color: '#64748b' }}>
          Draw floor plans per storey · Classify walls · 3D preview · SAP surface areas
        </p>
      </div>

      {/* ── Storey stack bar ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center p-3 rounded-2xl" style={{ background: 'white', border: '2px solid #dcfce7' }}>
        <span className="text-xs font-black uppercase tracking-widest shrink-0" style={{ color: '#94a3b8' }}>Storeys:</span>
        {sortedStoreys.map((s, si) => {
          const isActive = s.id === activeStoreyId;
          const colorIdx = storeys.indexOf(s) % STOREY_COLORS.length;
          return (
            <button
              key={s.id}
              onClick={() => switchStorey(s.id)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black transition-all"
              style={{
                background: isActive ? STOREY_COLORS[colorIdx] : '#f8fafc',
                border: `2px solid ${isActive ? STOREY_WIRE[colorIdx] : '#e2e8f0'}`,
                color: isActive ? STOREY_WIRE[colorIdx] : '#64748b',
              }}
            >
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: STOREY_WIRE[colorIdx] }} />
              <span>{s.label}</span>
              <span className="font-mono font-normal opacity-70">
                +{s.storeyBase.toFixed(1)}m → +{(s.storeyBase + s.storeyHeight).toFixed(1)}m
              </span>
              {s.closed && <span style={{ color: '#16a34a' }}>✓</span>}
              {storeys.length > 1 && (
                <span
                  onClick={e => { e.stopPropagation(); removeStorey(s.id); }}
                  className="ml-1 opacity-50 hover:opacity-100"
                  title="Remove storey"
                  style={{ color: '#ef4444' }}
                >✕</span>
              )}
            </button>
          );
        })}
        <button
          onClick={addStorey}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all"
          style={{ background: '#14532d', color: 'white', border: '2px solid #14532d' }}
        >
          + Add Storey
        </button>
        {totalTFA > 0 && (
          <span className="ml-auto text-xs font-mono font-bold" style={{ color: '#64748b' }}>
            Total TFA: <span style={{ color: '#14532d' }}>{totalTFA.toFixed(1)} m²</span>
          </span>
        )}
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap gap-4 items-end p-4 rounded-2xl" style={{ background: 'white', border: '2px solid #dcfce7' }}>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Layer</label>
          <div className="flex rounded-xl overflow-hidden" style={{ border: '2px solid #6366f1' }}>
            {(['floor', 'roof'] as Layer[]).map(l => (
              <button key={l} onClick={() => setLayer(l)}
                className="px-5 py-2 text-xs font-black uppercase tracking-widest transition-all"
                style={{ background: layer === l ? '#6366f1' : 'white', color: layer === l ? 'white' : '#6366f1' }}
              >
                {l === 'floor' ? '🟩 FLOOR' : '🔷 ROOF'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Floor Level (m)</label>
          <input type="number" step="0.01" min="0" max="30"
            value={storeyBase}
            onChange={e => setStoreyBase(parseFloat(e.target.value) || 0)}
            className="rounded-xl px-3 py-2 text-sm font-mono font-semibold w-24 focus:outline-none"
            style={{ border: '2px solid #e2e8f0' }}
          />
        </div>
        <div>
          <label className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Storey Height (m)</label>
          <input type="number" step="0.01" min="0.5" max="6"
            value={storeyHeight}
            onChange={e => setStoreyHeight(parseFloat(e.target.value) || 2.4)}
            className="rounded-xl px-3 py-2 text-sm font-mono font-semibold w-24 focus:outline-none"
            style={{ border: '2px solid #e2e8f0' }}
          />
        </div>
        <div>
          <label className="block text-xs font-black uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>Roof Type (3D)</label>
          <select value={roofType} onChange={e => setRoofType(e.target.value as 'flat' | 'pitched')}
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
            <input type="number" step="1" min="0" max="359"
              value={northAngle}
              onChange={e => setNorthAngle(((parseInt(e.target.value) ?? 0) % 360 + 360) % 360)}
              className="rounded-xl px-3 py-2 text-sm font-mono font-semibold w-20 focus:outline-none"
              style={{ border: '2px solid #e2e8f0' }}
            />
            <span className="text-xs font-semibold" style={{ color: '#94a3b8' }}>CW from up</span>
          </div>
        </div>

        {layer === 'floor' && (
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
        )}

        {layer === 'floor' && (
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
        )}
      </div>

      {/* Wall type legend */}
      {layer === 'floor' && closed && (
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
        <div className="rounded-2xl overflow-hidden flex flex-col" style={{ border: `2px solid ${layer === 'roof' ? '#6366f1' : '#dcfce7'}`, background: 'white' }}>
          <div className="px-4 py-2 flex items-center justify-between shrink-0" style={{ borderBottom: `1px solid ${layer === 'roof' ? '#e0e7ff' : '#f0fdf4'}` }}>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: layer === 'roof' ? '#6366f1' : '#14532d' }}>
              {layer === 'roof' ? '2D ROOF PLAN' : '2D PLAN VIEW'}
            </span>
            <span className="text-xs font-medium" style={{ color: '#86efac' }}>
              {activeStorey.label} · grid: 1m · snap: 0.1m
            </span>
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

              {/* ── Other storeys faint overlay ── */}
              {layer === 'floor' && otherClosedStoreys.map((s, si) => (
                <polygon
                  key={s.id}
                  points={polyPts(s.points)}
                  fill={STOREY_COLORS[storeys.indexOf(s) % STOREY_COLORS.length]}
                  fillOpacity={0.15}
                  stroke={STOREY_WIRE[storeys.indexOf(s) % STOREY_WIRE.length]}
                  strokeOpacity={0.3}
                  strokeWidth={1.5}
                  strokeDasharray="5 3"
                />
              ))}

              {/* ── ROOF LAYER rendering ── */}
              {layer === 'roof' && (
                <>
                  {closed && activePoints.length >= 3 && (
                    <polygon points={polyPts(activePoints)} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={1} opacity={0.5} />
                  )}

                  {roofZones.map(zone => {
                    const color = ROOF_TYPE_COLOR[zone.type];
                    const slopes = computeZoneSlopes(zone, northAngle);
                    const centroid = polygonCentroid(zone.points);
                    return (
                      <g key={zone.id}>
                        <polygon points={polyPts(zone.points)} fill={color} fillOpacity={0.3} stroke={color} strokeOpacity={0.8} strokeWidth={2} />
                        {zone.ridge && (
                          <>
                            <line x1={toSVG(zone.ridge.a.x)} y1={toSVG(zone.ridge.a.y)} x2={toSVG(zone.ridge.b.x)} y2={toSVG(zone.ridge.b.y)} stroke="white" strokeWidth={2.5} strokeDasharray="6 4" />
                            <line x1={toSVG(zone.ridge.a.x)} y1={toSVG(zone.ridge.a.y)} x2={toSVG(zone.ridge.b.x)} y2={toSVG(zone.ridge.b.y)} stroke={color} strokeWidth={1} strokeDasharray="6 4" opacity={0.5} />
                            <text x={(toSVG(zone.ridge.a.x) + toSVG(zone.ridge.b.x)) / 2} y={(toSVG(zone.ridge.a.y) + toSVG(zone.ridge.b.y)) / 2 - 5} textAnchor="middle" fontSize={8} fill="white" fontWeight="800" stroke={color} strokeWidth={2} paintOrder="stroke">ridge</text>
                          </>
                        )}
                        {slopes.map((sl, si) => {
                          const halfCentroid = sl.halfPoly ? polygonCentroid(sl.halfPoly) : centroid;
                          return <text key={si} x={toSVG(halfCentroid.x)} y={toSVG(halfCentroid.y) + 4} textAnchor="middle" fontSize={14} fill={color} fontWeight="900" opacity={0.9}>{ORIENT_ARROW[sl.orientation]}</text>;
                        })}
                        <text x={toSVG(centroid.x)} y={toSVG(centroid.y) - 6} textAnchor="middle" fontSize={9} fill={color} fontWeight="800" stroke="white" strokeWidth={2.5} paintOrder="stroke">{zone.label}</text>
                      </g>
                    );
                  })}

                  {roofPhase === 'polygon' && roofPolyPoints.length > 0 && (
                    <>
                      {roofPolyPoints.length >= 2 && (
                        <polyline points={[...roofPolyPoints, ...(roofHover ? [roofHover] : [])].map(p => `${toSVG(p.x)},${toSVG(p.y)}`).join(' ')} fill="none" stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" />
                      )}
                      {roofPolyPoints.length === 1 && roofHover && (
                        <line x1={toSVG(roofPolyPoints[0].x)} y1={toSVG(roofPolyPoints[0].y)} x2={toSVG(roofHover.x)} y2={toSVG(roofHover.y)} stroke="#6366f1" strokeWidth={1.5} strokeDasharray="4 3" />
                      )}
                      {roofPolyPoints.map((p, i) => <circle key={i} cx={toSVG(p.x)} cy={toSVG(p.y)} r={i === 0 ? 6 : 4} fill={i === 0 ? '#6366f1' : '#818cf8'} stroke="white" strokeWidth={2} />)}
                      {roofHover && <circle cx={toSVG(roofHover.x)} cy={toSVG(roofHover.y)} r={3} fill="none" stroke="#6366f1" strokeWidth={1.5} />}
                    </>
                  )}

                  {roofPhase === 'ridge' && (
                    <>
                      <polygon points={polyPts(roofPolyPoints)} fill={ROOF_TYPE_COLOR[newZoneType]} fillOpacity={0.2} stroke={ROOF_TYPE_COLOR[newZoneType]} strokeOpacity={0.6} strokeWidth={2} />
                      {ridgePoints.length >= 1 && (
                        <>
                          <circle cx={toSVG(ridgePoints[0].x)} cy={toSVG(ridgePoints[0].y)} r={5} fill={ROOF_TYPE_COLOR[newZoneType]} stroke="white" strokeWidth={2} />
                          {roofHover && <line x1={toSVG(ridgePoints[0].x)} y1={toSVG(ridgePoints[0].y)} x2={toSVG(roofHover.x)} y2={toSVG(roofHover.y)} stroke="white" strokeWidth={2} strokeDasharray="6 4" />}
                        </>
                      )}
                      {roofHover && <circle cx={toSVG(roofHover.x)} cy={toSVG(roofHover.y)} r={3} fill="none" stroke={ROOF_TYPE_COLOR[newZoneType]} strokeWidth={1.5} />}
                    </>
                  )}
                </>
              )}

              {/* ── FLOOR LAYER rendering ── */}
              {layer === 'floor' && (
                <>
                  {roofZones.map(zone => (
                    <polygon key={zone.id} points={polyPts(zone.points)} fill={ROOF_TYPE_COLOR[zone.type]} fillOpacity={0.15} stroke={ROOF_TYPE_COLOR[zone.type]} strokeOpacity={0.3} strokeWidth={1} />
                  ))}

                  {inputMode === 'draw' && !closed && points.length > 0 && hoverPoint && (
                    <polyline points={previewPoints} fill="none" stroke="#86efac" strokeWidth={1.5} strokeDasharray="4 3" />
                  )}

                  {closed && activePoints.length >= 3 && (
                    <polygon points={polyPts(activePoints)} fill="#f0fdf4" stroke="none" />
                  )}

                  {closed && wallSegs.map(seg => (
                    <line key={seg.i} x1={toSVG(seg.a.x)} y1={toSVG(seg.a.y)} x2={toSVG(seg.b.x)} y2={toSVG(seg.b.y)} stroke={WALL_COLOR[seg.type]} strokeWidth={3.5} strokeLinecap="round" />
                  ))}

                  {!closed && activePoints.length >= 2 && (
                    <polyline points={polyPts(activePoints)} fill="none" stroke="#14532d" strokeWidth={2} />
                  )}

                  {inputMode === 'type' && !closed && walls.length >= 2 && (
                    <line x1={toSVG(tip.x)} y1={toSVG(tip.y)} x2={toSVG(START.x)} y2={toSVG(START.y)} stroke="#86efac" strokeWidth={1.5} strokeDasharray="5 4" />
                  )}

                  {closed && wallSegs.map(seg => {
                    const mx = (toSVG(seg.a.x) + toSVG(seg.b.x)) / 2;
                    const my = (toSVG(seg.a.y) + toSVG(seg.b.y)) / 2;
                    const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y;
                    const len2 = Math.sqrt(dx * dx + dy * dy);
                    const nx = -(dy / len2) * 14, ny = (dx / len2) * 14;
                    return (
                      <g key={seg.i}>
                        <text x={mx + nx} y={my + ny} textAnchor="middle" fontSize={9} fill={WALL_COLOR[seg.type]} fontWeight="700">
                          {ORIENT_ARROW[seg.orientation]} {seg.len.toFixed(2)}m
                        </text>
                      </g>
                    );
                  })}

                  {!closed && inputMode === 'type' && walls.map((w, i) => {
                    const a = typePoints[i], b = typePoints[i + 1];
                    return <text key={i} x={(toSVG(a.x) + toSVG(b.x)) / 2} y={(toSVG(a.y) + toSVG(b.y)) / 2 - 6} textAnchor="middle" fontSize={9} fill="#14532d" fontWeight="700">{w.len.toFixed(2)}m</text>;
                  })}

                  {activePoints.map((p, i) => (
                    <circle key={i} cx={toSVG(p.x)} cy={toSVG(p.y)} r={i === 0 ? 6 : 4} fill={i === 0 ? '#16a34a' : '#14532d'} stroke="white" strokeWidth={2} />
                  ))}

                  {inputMode === 'draw' && !closed && hoverPoint && (
                    <circle cx={toSVG(hoverPoint.x)} cy={toSVG(hoverPoint.y)} r={3} fill="none" stroke="#86efac" strokeWidth={1.5} />
                  )}
                </>
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
                <polygon points={`${naTipX},${naTipY} ${naCx + 5 * Math.cos(NA)},${naCy - 5 * Math.sin(NA)} ${naCx - 5 * Math.cos(NA)},${naCy + 5 * Math.sin(NA)}`} fill="#14532d" />
                <text x={naLabelX} y={naLabelY + 3} textAnchor="middle" fontSize={9} fill="#14532d" fontWeight="900">N</text>
              </g>
            </svg>
          </div>

          {/* Floor layer bottom strips */}
          {layer === 'floor' && inputMode === 'type' && !closed && (
            <div className="shrink-0 p-3" style={{ borderTop: '2px solid #f0fdf4', background: '#fafff8' }}>
              <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>
                {walls.length === 0 ? 'WALL 1 — starting at (5, 5)' : `WALL ${walls.length + 1} — from (${tip.x.toFixed(1)}, ${tip.y.toFixed(1)})`}
              </div>
              <div className="flex gap-2 items-center">
                <div className="grid grid-cols-3 gap-0.5" style={{ width: 72 }}>
                  <div />
                  <button onClick={() => { setDir('N'); lenRef.current?.focus(); }} className="h-8 rounded text-xs font-black transition-all" style={{ background: dir === 'N' ? '#14532d' : '#f0fdf4', color: dir === 'N' ? 'white' : '#6b7280' }}>↑</button>
                  <div />
                  <button onClick={() => { setDir('W'); lenRef.current?.focus(); }} className="h-8 rounded text-xs font-black transition-all" style={{ background: dir === 'W' ? '#14532d' : '#f0fdf4', color: dir === 'W' ? 'white' : '#6b7280' }}>←</button>
                  <div className="h-8 rounded flex items-center justify-center text-xs font-black" style={{ background: '#e2e8f0', color: '#94a3b8' }}>{dirArrow[dir]}</div>
                  <button onClick={() => { setDir('E'); lenRef.current?.focus(); }} className="h-8 rounded text-xs font-black transition-all" style={{ background: dir === 'E' ? '#14532d' : '#f0fdf4', color: dir === 'E' ? 'white' : '#6b7280' }}>→</button>
                  <div />
                  <button onClick={() => { setDir('S'); lenRef.current?.focus(); }} className="h-8 rounded text-xs font-black transition-all" style={{ background: dir === 'S' ? '#14532d' : '#f0fdf4', color: dir === 'S' ? 'white' : '#6b7280' }}>↓</button>
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
                    <button onClick={addWall} disabled={!lenInput} className="px-4 py-2 rounded-lg text-sm font-black disabled:opacity-40" style={{ background: '#14532d', color: 'white' }}>Enter</button>
                  </div>
                  <div className="text-xs" style={{ color: '#94a3b8' }}>Arrow keys or click compass to change direction · Enter to add wall</div>
                </div>
              </div>
              {canClose && (
                <button onClick={closeShape} className="mt-2 w-full py-2 rounded-lg text-sm font-black" style={{ background: '#14532d', color: 'white' }}>
                  ✓ Close shape — back to start ({distToStart.toFixed(2)}m remaining)
                </button>
              )}
            </div>
          )}

          {layer === 'floor' && inputMode === 'type' && walls.length > 0 && (
            <div className="shrink-0 overflow-y-auto" style={{ maxHeight: 140, borderTop: '1px solid #f0fdf4', background: 'white' }}>
              <div className="px-3 pt-2 pb-1 text-xs font-black uppercase tracking-widest" style={{ color: '#94a3b8' }}>WALLS ENTERED</div>
              <div className="px-3 pb-2 space-y-1">
                {walls.map((w, i) => <WallHistoryRow key={i} index={i} dir={w.dir} len={w.len} onDelete={() => deleteWall(i)} />)}
              </div>
            </div>
          )}

          {/* Roof layer bottom strip */}
          {layer === 'roof' && roofPhase === 'idle' && (
            <div className="shrink-0 p-3 space-y-2" style={{ borderTop: '2px solid #e0e7ff', background: '#f5f3ff' }}>
              <div className="text-xs font-black uppercase tracking-widest" style={{ color: '#6366f1' }}>ADD ROOF ZONE</div>
              <div className="flex flex-wrap gap-2 items-end">
                <input type="text" value={newZoneLabel} onChange={e => setNewZoneLabel(e.target.value)} placeholder="Label" className="rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none w-20" style={{ border: '2px solid #c7d2fe' }} />
                <select value={newZoneType} onChange={e => setNewZoneType(e.target.value as RoofType)} className="rounded-lg px-2 py-1.5 text-xs font-semibold focus:outline-none" style={{ border: '2px solid #c7d2fe', color: '#4338ca' }}>
                  {(Object.entries(ROOF_TYPE_LABEL) as [RoofType, string][]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {pitchNeedsDisplay(newZoneType) && (
                  <div className="flex items-center gap-1">
                    <input type="number" min="1" max="90" step="1" value={newZonePitch} onChange={e => setNewZonePitch(parseInt(e.target.value) || 35)} className="rounded-lg px-2 py-1.5 text-xs font-mono font-semibold w-14 focus:outline-none" style={{ border: '2px solid #c7d2fe' }} />
                    <span className="text-xs font-semibold" style={{ color: '#818cf8' }}>° pitch</span>
                  </div>
                )}
                <button onClick={() => { setRoofPhase('polygon'); setRoofPolyPoints([]); setRidgePoints([]); }} className="px-3 py-1.5 rounded-lg text-xs font-black" style={{ background: '#6366f1', color: 'white' }}>Draw Zone</button>
              </div>
              {roofZones.length > 0 && (
                <div className="space-y-1 mt-1 max-h-28 overflow-y-auto">
                  {roofZones.map(zone => (
                    <div key={zone.id} className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: 'white', border: `1px solid ${ROOF_TYPE_COLOR[zone.type]}40` }}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROOF_TYPE_COLOR[zone.type] }} />
                      <span className="text-xs font-bold flex-1 truncate" style={{ color: '#334155' }}>{zone.label}</span>
                      <span className="text-xs" style={{ color: '#94a3b8' }}>{ROOF_TYPE_LABEL[zone.type]}</span>
                      <button onClick={() => setRoofZones(prev => prev.filter(z => z.id !== zone.id))} className="text-xs px-1 py-0.5 rounded shrink-0" style={{ color: '#ef4444', background: '#fef2f2' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {layer === 'roof' && roofPhase === 'polygon' && (
            <div className="shrink-0 px-4 py-3 text-xs font-semibold" style={{ borderTop: '2px solid #e0e7ff', background: '#f5f3ff', color: '#4338ca' }}>
              Drawing polygon — click to place corners, click near start (within 0.6m) to close
            </div>
          )}

          {layer === 'roof' && roofPhase === 'ridge' && (
            <div className="shrink-0 px-4 py-3 text-xs font-semibold" style={{ borderTop: '2px solid #e0e7ff', background: '#f5f3ff', color: '#4338ca' }}>
              Draw ridge line — click to place point {ridgePoints.length + 1} of 2
            </div>
          )}
        </div>

        {/* 3D View */}
        <div className="relative">
          <ThreeViewer
            storeys={storeys}
            activeStoreyId={activeStoreyId}
            wallSegs={wallSegs}
            selectedWallIdx={selectedWallIdx}
            onWallClick={(idx) => setSelectedWallIdx(prev => prev === idx ? null : idx)}
          />
          {/* Wall info overlay */}
          {selectedWallIdx !== null && (() => {
            const seg = wallSegs.find(s => s.i === selectedWallIdx);
            if (!seg) return null;
            return (
              <div className="absolute top-3 left-3 rounded-xl shadow-lg p-3 z-10 min-w-[200px]"
                style={{ background: 'white', border: `2px solid ${WALL_COLOR[seg.type]}`, maxWidth: 240 }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black uppercase tracking-widest" style={{ color: WALL_COLOR[seg.type] }}>Wall {seg.i + 1}</span>
                  <button onClick={() => setSelectedWallIdx(null)} className="text-xs px-1.5 py-0.5 rounded" style={{ color: '#94a3b8', background: '#f1f5f9' }}>✕</button>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span style={{ color: '#94a3b8' }}>Type</span>
                    <span className="px-1.5 py-0.5 rounded font-black uppercase cursor-pointer"
                      style={{ background: seg.type === 'external' ? '#dcfce7' : seg.type === 'party' ? '#fef3c7' : '#f1f5f9', color: WALL_COLOR[seg.type], fontSize: 9 }}
                      onClick={() => setWallTypes(prev => { const next = [...prev]; next[seg.i] = WALL_CYCLE[(WALL_CYCLE.indexOf(seg.type) + 1) % WALL_CYCLE.length]; return next; })}
                      title="Click to change type"
                    >
                      {seg.type === 'external' ? 'External' : seg.type === 'party' ? 'Party' : 'Internal'} ▾
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#94a3b8' }}>Orientation</span>
                    <span className="font-bold" style={{ color: '#334155' }}>{ORIENT_ARROW[seg.orientation]} {seg.orientation}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#94a3b8' }}>Length</span>
                    <span className="font-mono font-bold" style={{ color: '#334155' }}>{seg.len.toFixed(2)} m</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: '#94a3b8' }}>Height</span>
                    <span className="font-mono font-bold" style={{ color: '#334155' }}>{storeyHeight.toFixed(2)} m</span>
                  </div>
                  <div className="flex justify-between pt-1" style={{ borderTop: '1px solid #f1f5f9' }}>
                    <span style={{ color: '#94a3b8' }}>Area</span>
                    <span className="font-mono font-black text-sm" style={{ color: WALL_COLOR[seg.type] }}>{seg.area.toFixed(2)} m²</span>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* SAP Takeoff */}
        <div className="rounded-2xl flex flex-col overflow-hidden" style={{ background: 'white', border: '2px solid #dcfce7' }}>
          <div className="px-4 py-3 shrink-0" style={{ borderBottom: '2px solid #f0fdf4', background: '#f0fdf4' }}>
            <span className="text-xs font-black uppercase tracking-widest" style={{ color: '#14532d' }}>SAP TAKEOFF</span>
            <div className="text-xs mt-0.5 font-medium" style={{ color: '#64748b' }}>{activeStorey.label}</div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!closed ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">📐</div>
                <div className="text-xs font-bold" style={{ color: '#86efac' }}>Close the shape to see areas</div>
              </div>
            ) : (
              <>
                <TakeoffRow label="Floor Area (TFA)" value={floorArea} unit="m²" highlight />
                <TakeoffRow label="Perimeter" value={perimeter} unit="m" />
                <TakeoffRow label="Floor level" value={storeyBase} unit="m" />
                <TakeoffRow label="Ceiling level" value={storeyBase + storeyHeight} unit="m" />

                {/* Roof area */}
                {roofZones.length === 0 ? (
                  <TakeoffRow label="Roof Area" value={effectiveRoofArea} unit="m²" note={roofType === 'pitched' ? '+20% pitch' : undefined} />
                ) : (
                  <div style={{ borderTop: '1px dashed #dcfce7', paddingTop: 12 }}>
                    <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>ROOF ELEMENTS</div>
                    <div className="space-y-2">
                      {roofZones.map(zone => {
                        const slopes = computeZoneSlopes(zone, northAngle);
                        const zoneTotal = slopes.reduce((s, sl) => s + sl.actualArea, 0);
                        const hasRidge = zone.ridge && NEEDS_RIDGE.includes(zone.type);
                        return (
                          <div key={zone.id}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="flex items-center gap-1.5 text-xs font-bold" style={{ color: '#334155' }}>
                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ROOF_TYPE_COLOR[zone.type] }} />
                                {zone.label}
                              </span>
                              <div className="text-right">
                                <span className="text-sm font-black font-mono" style={{ color: '#334155' }}>{zoneTotal.toFixed(1)}</span>
                                <span className="text-xs ml-1" style={{ color: '#94a3b8' }}>m²</span>
                              </div>
                            </div>
                            <div className="text-xs pl-3.5 mb-0.5" style={{ color: '#94a3b8' }}>{ROOF_TYPE_LABEL[zone.type]}{zone.pitch > 0 && pitchNeedsDisplay(zone.type) ? ` · ${zone.pitch}°` : ''}</div>
                            {hasRidge && slopes.map((sl, si) => (
                              <div key={si} className="flex items-center justify-between gap-1 pl-5 text-xs" style={{ color: '#64748b' }}>
                                <span>{ORIENT_ARROW[sl.orientation]} {sl.orientation}</span>
                                <span className="font-mono">{sl.planArea.toFixed(1)}m² plan → {sl.actualArea.toFixed(1)}m² actual</span>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-2 pt-2" style={{ borderTop: '1px solid #f0fdf4' }}>
                      <TakeoffRow label="Total roof area" value={totalRoofActualArea} unit="m²" highlight />
                    </div>
                  </div>
                )}

                {/* Walls */}
                <div style={{ borderTop: '1px dashed #dcfce7', paddingTop: 12 }}>
                  <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>ALL WALLS</div>
                  <div className="text-xs mb-1" style={{ color: '#94a3b8' }}>Click type badge to change · Click row to highlight in 3D</div>
                  <div className="space-y-1">
                    {wallSegs.map(seg => (
                      <div key={seg.i}
                        className="flex items-center gap-1 text-xs rounded-lg px-1 py-0.5 cursor-pointer transition-all"
                        style={{
                          background: selectedWallIdx === seg.i ? (seg.type === 'external' ? '#dcfce7' : seg.type === 'party' ? '#fef3c7' : '#f1f5f9') : 'transparent',
                          outline: selectedWallIdx === seg.i ? `2px solid ${WALL_COLOR[seg.type]}` : 'none',
                        }}
                        onClick={() => setSelectedWallIdx(prev => prev === seg.i ? null : seg.i)}
                      >
                        <span className="font-black w-6 shrink-0" style={{ color: '#94a3b8' }}>W{seg.i + 1}</span>
                        <span className="w-4 shrink-0" style={{ color: WALL_COLOR[seg.type] }}>{ORIENT_ARROW[seg.orientation]}</span>
                        <span className="font-semibold w-10 shrink-0" style={{ color: '#475569' }}>{seg.orientation.slice(0, 1)}</span>
                        <span className="font-mono w-14 shrink-0" style={{ color: '#334155' }}>{seg.len.toFixed(2)}m</span>
                        <span className="font-mono w-14 shrink-0" style={{ color: '#334155' }}>{seg.area.toFixed(1)}m²</span>
                        <span className="text-xs px-1 py-0.5 rounded font-black uppercase shrink-0 cursor-pointer hover:opacity-75"
                          title="Click to change type"
                          style={{ background: seg.type === 'external' ? '#dcfce7' : seg.type === 'party' ? '#fef3c7' : '#f1f5f9', color: WALL_COLOR[seg.type], fontSize: 9 }}
                          onClick={e => {
                            e.stopPropagation();
                            setWallTypes(prev => { const next = [...prev]; next[seg.i] = WALL_CYCLE[(WALL_CYCLE.indexOf(seg.type) + 1) % WALL_CYCLE.length]; return next; });
                          }}
                        >
                          {seg.type === 'external' ? 'Ext ▾' : seg.type === 'party' ? 'Pty ▾' : 'Int ▾'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* External by orientation */}
                <div style={{ borderTop: '1px dashed #dcfce7', paddingTop: 12 }}>
                  <div className="text-xs font-black uppercase tracking-widest mb-2" style={{ color: '#94a3b8' }}>EXTERNAL WALLS</div>
                  <TakeoffRow label="Total external wall area" value={totalExtWallArea} unit="m²" />
                  {(Object.entries(extWallsByOrientation) as [Orientation, number][]).map(([d, area]) =>
                    area > 0 && <TakeoffRow key={d} label={`${ORIENT_ARROW[d]} ${d}`} value={area} unit="m²" indent />
                  )}
                  {partyWallTotal > 0 && <TakeoffRow label="Party wall area" value={partyWallTotal} unit="m²" party />}
                </div>

                <div style={{ borderTop: '1px dashed #dcfce7', paddingTop: 12 }}>
                  <div className="text-xs space-y-1" style={{ color: '#94a3b8' }}>
                    <div>• North = {northAngle}° CW from canvas up</div>
                    <div>• Floor level: +{storeyBase.toFixed(2)}m · Height: {storeyHeight.toFixed(2)}m</div>
                    <div>• Ceiling at +{(storeyBase + storeyHeight).toFixed(2)}m</div>
                    <div>• Roof (3D): {roofType === 'pitched' ? 'pitched (×1.2)' : 'flat'}</div>
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
        <span className="text-sm font-black font-mono" style={{ color: highlight ? '#14532d' : party ? '#f59e0b' : '#334155' }}>{value.toFixed(1)}</span>
        <span className="text-xs ml-1" style={{ color: '#94a3b8' }}>{unit}</span>
        {note && <div className="text-xs" style={{ color: '#86efac' }}>{note}</div>}
      </div>
    </div>
  );
}
