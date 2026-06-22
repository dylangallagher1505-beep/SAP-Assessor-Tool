# Ultimate SAP Takeoff Assistant — Technical Roadmap

_Last updated: June 2026_

---

## 1. Current State Assessment

### What exists today (`FloorPlanTool.tsx` + `UValueCalculator`)

The prototype is a **Next.js / React app** with three main pieces:

| Component | What it does |
|---|---|
| `FloorPlanTool.tsx` (1,577 lines) | SVG canvas for tracing building footprints; wall typing (external / party / internal); roof zone polygon drawing with ridge lines; pitch-corrected area calculation; north-offset compass; basic Three.js 3D viewer |
| `UValueCalculator.tsx` | BR443:2019 combined-method U-value calculator with a layered material stack |
| `lib/materials.ts` | Comprehensive material library (λ values, BR443 / ISO 10456 sourced) |
| `lib/uvalue.ts` | Calculation engine: bridged/unbridged layers, surface resistances by element type |

**Geometry data model (current)**

```
Storey {
  points: Point[]         // 2-D footprint polygon (metres, snapped to 0.1 m)
  storeyHeight: number    // m
  storeyBase: number      // m (above datum)
  walls: WallSegInfo[]    // derived: orientation, area, type per edge
  roofZones: RoofZone[]   // plan polygon + ridge line + pitch → actual area
  layer: 'floor' | 'roof'
}
```

**What it already gets right**
- Polygon area (Shoelace), wall lengths and orientations correct w.r.t. user-set north
- Ridge-line clipping to split a pitched zone into two slopes → per-slope actual area via `1/cos(pitch)`
- Five roof types (flat, pitched cold loft, pitched warm, room-in-roof, exposed floor/soffit) matching SAP zone categories
- Three.js extruded building preview with wall-face click selection
- Full U-value calc ready to attach to any element

**Current limitations / gaps**

| Gap | Impact on SAP takeoff |
|---|---|
| Single-storey only — no storey stack | Can't handle two-storey houses, flats, maisonettes |
| No openings (windows, doors) | Gross wall area only; net area (gross − openings) not available |
| No floor type assignment | No exposed/ground/intermediate floor distinction |
| Roof 3-D geometry is a visual approximation | Hipped roofs, dormers, mono-pitch not correctly modelled |
| North angle applies globally | Can't rotate individual elements |
| No junction / thermal bridging schedule | PSI values and Y-factor not calculated |
| No PDF / image underlay | All tracing is freehand on a blank canvas |
| No export | Areas live in the UI only; nothing written to CSV / JSON / SAP input |
| No multi-zone / room grouping | Can't separate heated from unheated zones |
| No validation against known geometry | No way to check output against a manual takeoff |

---

## 2. What SAP Surface-Area Takeoffs Actually Require

### 2.1 Element categories (SAP 10.2 / RdSAP)

| SAP element | Required data |
|---|---|
| **External walls** | Net area per orientation (gross − openings), U-value, construction type |
| **Party walls** | Area (treated as zero heat loss in SAP unless uninsulated) |
| **Roofs** | Area (plan × slope factor), type (cold loft / warm / room-in-roof / flat), U-value, pitch |
| **Ground floors** | Area, perimeter, floor type (solid / suspended timber / uninsulated), U-value or Ug via ISO 13370 |
| **Exposed floors / soffits** | Area, U-value |
| **Windows** | Area, orientation, frame type, glazing type, g-value, U-value (frame + centre-pane) |
| **Doors** | Area, type (opaque / half-glazed / fully glazed), U-value |
| **Rooflights** | Area, pitch, glazing spec |
| **Thermal bridges** | Linear metre per junction type × PSI value → Y-factor (W/m²K) |

### 2.2 Geometry a 3-D model must capture

```
Building
├── Zones[]              // heated / unheated / conservatory
│   └── Storeys[]        // ground floor, first floor, …
│       ├── Footprint polygon (vertices in metres)
│       ├── Storey height (floor-to-ceiling + floor build-up)
│       ├── Walls[]
│       │   ├── Type: external | party | internal
│       │   ├── Openings[]  { width, height, type, position along wall }
│       │   └── U-value reference
│       ├── Floor { type, U-value or Ug params }
│       ├── RoofZones[]
│       │   ├── Plan polygon
│       │   ├── Ridge line (for split-slope)
│       │   ├── Pitch (degrees)
│       │   └── Type: flat | cold-loft | warm-rafter | room-in-roof | exposed-soffit
│       └── Ceiling (for room-in-roof: insulated slope vs flat ceiling area)
└── ThermalBridgeSchedule[]
    └── { junctionType, lengthM, psiValue }
```

### 2.3 Derived SAP quantities

- **Net wall area** = Σ (wall edge length × storey height) − Σ (opening areas on that wall) — grouped by orientation
- **Roof actual area** = plan area × (1 / cos(pitch)) — per slope
- **Floor area** = Shoelace on footprint polygon — also used as TFA (treated floor area)
- **Exposed perimeter** (for ISO 13370 ground floor) = Σ external wall edge lengths
- **Total heat-loss area** = Σ all element areas
- **Y-factor** = Σ (PSI × junction length) / total heat-loss area
- **Fabric heat-loss** = Σ (U × A) + Y × total area

---

## 3. Target Architecture

### 3.1 Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Next.js)                        │
│                                                                 │
│  ┌──────────────────┐   ┌───────────────────────────────────┐   │
│  │  Input Layer     │   │  3-D Visualisation                │   │
│  │  ─────────────── │   │  ─────────────────────────────── │   │
│  │  • SVG canvas    │   │  Three.js scene                   │   │
│  │    (freehand +   │   │  • Extruded storeys               │   │
│  │    snap grid)    │   │  • Coloured wall faces            │   │
│  │  • Type-in dims  │   │  • Roof geometry                  │   │
│  │  • PDF/image     │   │  • Opening cut-outs               │   │
│  │    underlay      │   │  • Click → select element         │   │
│  └────────┬─────────┘   └────────────┬──────────────────────┘   │
│           │                          │                          │
│           ▼                          ▼                          │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               Building Data Model (Zustand store)       │    │
│  │  Building → Zones → Storeys → Walls / Floors / Roofs    │    │
│  └────────────────────────┬────────────────────────────────┘    │
│                           │                                     │
│           ┌───────────────┴───────────────┐                     │
│           ▼                               ▼                     │
│  ┌─────────────────┐             ┌────────────────────┐         │
│  │  Calc Engine    │             │  Export Engine     │         │
│  │  ─────────────  │             │  ──────────────── │         │
│  │  • Element      │             │  • SAP-ready CSV  │         │
│  │    areas        │             │  • JSON bundle    │         │
│  │  • U-values     │             │  • (future: XML)  │         │
│  │  • Y-factor     │             └────────────────────┘         │
│  │  • Fabric HLC   │                                            │
│  └─────────────────┘                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Core data model (TypeScript)

```ts
// Canonical building representation
interface Building {
  id: string;
  name: string;
  northDeg: number;           // canvas north offset (degrees CW)
  zones: Zone[];
  junctions: ThermalBridge[]; // linear bridges
}

interface Zone {
  id: string;
  label: string;              // "Main dwelling", "Garage", …
  type: 'heated' | 'unheated' | 'conservatory';
  storeys: Storey[];
}

interface Storey {
  id: string;
  level: number;              // 0 = ground, 1 = first, …
  label: string;
  floorToFloorHeight: number; // metres
  footprint: Point[];         // polygon, metres, global coords
  walls: Wall[];              // derived from footprint edges + manual overrides
  floor: FloorSpec;
  roofZones: RoofZone[];      // may be empty if above storey covers it
}

interface Wall {
  id: string;
  startIdx: number; endIdx: number; // footprint vertex indices
  type: WallType;             // external | party | internal
  openings: Opening[];
  uValueRef?: string;         // key into UValue library
  // derived
  grossArea: number;
  netArea: number;
  orientation: Orientation;
}

interface Opening {
  id: string;
  type: 'window' | 'door' | 'rooflight';
  widthM: number; heightM: number;
  frameType?: string;
  glazingSpec?: string;
  uValue?: number;
  gValue?: number;
}

interface FloorSpec {
  type: 'solid_ground' | 'suspended_timber' | 'intermediate' | 'exposed_soffit';
  uValueRef?: string;
  // ISO 13370 inputs (for ground floors)
  wallThicknessM?: number;
}

interface RoofZone {
  id: string; label: string;
  type: RoofType;
  pitch: number;
  points: Point[];
  ridge: { a: Point; b: Point } | null;
  uValueRef?: string;
}

interface ThermalBridge {
  id: string;
  junctionType: string;       // e.g. "E2 - Lintel (with insulation below)"
  lengthM: number;
  psiValue: number;           // W/mK
}
```

### 3.3 Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js (App Router) — **already in use** | Keep; server components unused so far, easy to extend |
| State | **Zustand** | Lightweight, slices cleanly, easy undo/redo with `immer` |
| 2-D canvas | **SVG** (current) or migrate to **Fabric.js / Konva** | SVG is fine for Phase 1–2; Konva scales better with complex scenes |
| 3-D viewer | **Three.js** — **already imported** | Good browser support; existing code reusable |
| Geometry | **polygon-clipping** (martinez or polybool) | Needed for opening subtraction, zone overlaps |
| PDF underlay | **PDF.js** (Mozilla) | Render PDF page to canvas as background image |
| Export | CSV / JSON hand-rolled; XML for later | No external dependency needed for MVP |
| Styling | **Tailwind** — already in use | Keep |
| Testing | **Vitest** + known-area fixtures | Critical for geometry accuracy |

---

## 4. Phased Roadmap

### Phase 0 — Tidy & Stabilise _(now, ~1–2 weeks)_

**Goal:** make what exists solid before building on top of it.

- [ ] Extract geometry utilities (`polygonArea`, `wallLength`, `computeZoneSlopes`, etc.) from `FloorPlanTool.tsx` into `lib/geometry.ts` — currently buried in the component
- [ ] Add Vitest and write unit tests for every geometry helper against known-area fixtures (triangle, rectangle, L-shape, pentagon) — establish a baseline before any changes
- [ ] Replace the raw `useState`-in-component state with a **Zustand store** (`lib/store.ts`) so the data model is accessible outside the drawing canvas
- [ ] Split the 1,577-line component: `FloorPlanCanvas.tsx` (drawing), `RoofZonePanel.tsx`, `WallPanel.tsx`, `AreaSummaryPanel.tsx`
- [ ] Fix the 3-D viewer's pitched-roof approximation (current projection is purely visual; wrong for non-rectangular footprints)

**Milestone:** All existing functionality works identically; geometry tests pass; component < 400 lines each.

---

### Phase 1 — Net Wall Areas & Openings _(~3–4 weeks)_

**Goal:** produce the most commonly needed SAP quantity — net wall area by orientation with windows and doors deducted.

- [ ] Add an **Opening editor** per wall segment: click a wall → slide-out panel → add windows / doors with width × height inputs
- [ ] Render openings as white rectangles on the SVG wall edges
- [ ] Calculate: `netArea = grossArea − Σ openingAreas` per wall; surface remains split by orientation
- [ ] Add opening properties: glazing type, frame type, U-value, g-value (reuse `UValueCalculator` for frame-pane calculation)
- [ ] Area summary table: gross wall area | opening area | net wall area — per orientation, with totals
- [ ] First **CSV export**: one row per element type / orientation — copy-pasteable into any SAP tool

**Milestone:** Enter a simple rectangular house with windows and doors; export matches a manually measured schedule to < 0.1 m² tolerance.

---

### Phase 2 — Multi-Storey & Floor Types _(~4–5 weeks)_

**Goal:** handle real UK housing stock — two-storey semis, flats, maisonettes.

- [ ] Storey stack UI: "Add storey above / below" — each storey has its own footprint polygon and height
- [ ] Storeys can have **different footprint polygons** (e.g. rear extension only on ground floor)
- [ ] Automatic intermediate ceiling/floor detection: where two heated storeys share a boundary, mark as intermediate floor (zero heat loss in SAP unless unheated zone above/below)
- [ ] Floor type assignment per storey base: solid ground / suspended timber / intermediate / exposed soffit
- [ ] ISO 13370 ground floor U-value calculator (P/A method): exposed perimeter auto-derived from external walls, manual wall thickness input
- [ ] Party wall areas: length × storey height, separate from external walls in the schedule
- [ ] Update 3-D viewer to stack extruded storeys correctly

**Milestone:** Model a two-storey semi-detached house with party wall; area schedule matches a standard SAP worksheet.

---

### Phase 3 — Accurate Roof Geometry _(~3–4 weeks)_

**Goal:** correctly derive actual (slope) area for hipped, gable, mono-pitch, and dormer roofs.

- [ ] **Hipped roof**: user places four eave points + ridge line segment; geometric solver calculates hip lengths and slopes automatically
- [ ] **Mono-pitch**: single slope across the full footprint; pitch + eave height inputs
- [ ] **Dormers**: define as a rectangular protrusion from a main slope — wall faces (2 sides + front), flat or pitched roof, floor (if habitable)
- [ ] **Room-in-roof refined**: insulated slope area vs. flat ceiling area correctly separated (knee-wall calculation)
- [ ] Slope-area validation: sum of all slope plan projections must equal footprint plan area — show a visual indicator if they don't
- [ ] Render correct roof surfaces in Three.js viewer

**Milestone:** Trace a hipped-roof bungalow; slope areas match a hand-calculated takeoff to < 1%.

---

### Phase 4 — U-Values & Thermal Bridging _(~3–4 weeks)_

**Goal:** attach thermal properties to geometry and produce a full fabric heat-loss schedule.

- [ ] **Construction library**: save named constructions (e.g. "Cavity wall — 100mm PIR full fill") with layered U-value — already half-built in `UValueCalculator`
- [ ] Assign a construction reference to any wall / roof / floor element in the model
- [ ] **Thermal bridge schedule**: add linear junction types (SAP Table K1 — E1–E9, P1–P3, R1–R3, etc.) with length and PSI value; auto-suggest junction lengths from the geometry (e.g. window perimeters, eaves length)
- [ ] **Y-factor** = Σ(PSI × L) / total heat-loss area
- [ ] **Fabric HLC** = Σ(U × A) + Y × A_total
- [ ] Highlight elements without a U-value assigned (red badge) so nothing is missed

**Milestone:** Full fabric energy calculation for a test house; output matches a hand-checked SAP worksheet within rounding.

---

### Phase 5 — Export & Integration _(~2–3 weeks)_

**Goal:** make the output useful beyond the tool itself.

- [ ] **CSV export** (extend Phase 1): full schedule — element, area, U-value, heat loss — ready to paste into any SAP software's element table
- [ ] **JSON export**: complete building model (geometry + constructions + bridges) — portable, version-controllable
- [ ] **PDF report**: one-page summary — floor plan diagram, area schedule, element table, TFA, fabric HLC
- [ ] **Clipboard copy**: single-click copy of any row/column for manual entry into Elmhurst / NHER / SAP-Pro
- [ ] Consider a **SAP-XML schema** (RdSAP XML or Elmhurst's import format) — research required; may be proprietary

**Milestone:** Complete a full takeoff for a real house; import or copy-paste into SAP software without re-measuring anything.

---

### Phase 6 — PDF / Image Underlay & Scale Calibration _(~4–6 weeks)_

**Goal:** replace freehand tracing with plan-accurate tracing from real drawings.

- [ ] Drag-and-drop PDF or image (JPG/PNG) into the canvas as a background layer (PDF.js to rasterise; `<img>` for rasters)
- [ ] **Scale calibration**: user clicks two known points and types the real distance → all subsequent snapping is in calibrated metres
- [ ] **Trace mode**: click polygon vertices over the plan; existing snap/grid still active
- [ ] Multiple plan pages: ground floor plan, first floor plan, roof plan — each becomes a storey layer
- [ ] Opacity/toggle controls so the underlay doesn't obscure the traced geometry
- [ ] Store underlay metadata (source file, scale factor, calibration points) in the JSON export

**Milestone:** Upload a builder's DXF-exported PDF; trace and calibrate; area schedule within ±2% of CAD-measured areas.

---

### Phase 7 — Automation Layer _(research / future)_

**Goal:** reduce manual tracing effort through semi-automatic detection.

- [ ] **DXF/DWG import**: parse CAD layers (walls, windows, doors) directly — use `dxf-parser` library; far more accurate than tracing over a PDF
- [ ] **Room detection**: once walls form closed polygons, auto-detect rooms and assign floor areas
- [ ] **Computer-vision assist** (experimental): ML model to suggest wall outlines from an uploaded plan image — treat as a snapping hint, not ground truth; user confirms every suggestion
- [ ] **Dimension text OCR**: detect dimension strings in plan images to auto-suggest wall lengths

**Milestone (DXF):** Import an Archicad DXF export; building model populated with < 5 minutes of user correction.

---

## 5. Hard Problems & Risks

### 5.1 Accuracy validation

The toughest non-technical challenge. There is no SAP-official geometry oracle to test against. Mitigation:

- Build a test suite of **synthetic buildings** (rectangle, L-shape, T-shape, hipped roof) where areas can be computed analytically
- Cross-check against manual takeoffs on 3–5 real projects before trusting the tool for live assessments
- Display a prominent **"unvalidated — check before use"** warning until the test suite is mature
- Consider a "manual override" field per element so surveyors can correct individual areas without losing the rest of the model

### 5.2 Irregular geometry

- Non-right-angle walls: the Shoelace formula handles arbitrary polygons correctly — no special case needed
- Hipped roofs with non-rectangular footprints: the geometric solver (hip-line intersection) becomes complex; use a robust polygon-clipping library rather than hand-rolled maths
- Roof overhangs: SAP measures to the internal face of the wall; the footprint should be the internal building outline, not the external cladding face — document this convention clearly
- Curved walls (bay windows, circular towers): approximate as multi-segment polygons; SAP assessors do the same

### 5.3 Multi-slope roofs with valleys

- A valley between two roof planes is the inverse of a ridge; the clip-polygon approach in the current code can be extended, but needs careful sign handling
- For complex roofs (e.g. intersecting gables), consider switching to a half-edge mesh representation rather than independent zone polygons

### 5.4 Thermal bridging junction attribution

- Junction lengths depend on the geometry (e.g. perimeter of each window opening, eaves length, party-wall length) — most can be auto-derived, but some require the user to confirm the construction type at each junction
- PSI values depend on construction details the tool doesn't know; provide a table of SAP default PSI values (Appendix K) as a starting point

### 5.5 PDF scale and distortion

- Scanned drawings may not be perfectly rectilinear; a single scale factor is insufficient — consider a two-point calibration (scale + rotation) as a minimum
- CAD-exported PDFs are vector and scale perfectly; scans do not — flag to the user which type they appear to have uploaded

---

## 6. Implementation Notes & Decisions

### Keep browser-only

No server required through Phase 5 at minimum. All geometry, U-value calc, and export runs client-side. This keeps deployment trivial (static export / Vercel free tier) and means no data leaves the browser — important for client confidentiality.

### Undo / redo from the start

Implement Zustand with `immer` middleware and a history stack before Phase 1. Undo is cheap to add early and expensive to retrofit later; accidental polygon deletions during complex takeoffs are extremely frustrating.

### One source of truth for geometry

All areas must derive from the Zustand store polygon data. Never store a computed area directly — always recompute from vertices. This avoids stale data bugs as the model evolves.

### Testing is non-negotiable for geometry

Every geometry helper must have a Vitest test before it is trusted in production. The failure mode (wrong area → wrong SAP rating → non-compliant building) is serious. Aim for a test fixture library covering: axis-aligned rectangles, L-shapes, T-shapes, irregular pentagons, buildings with roof valleys.

### Defer DXF import until Phase 7

`dxf-parser` is a well-maintained library but DXF layer conventions vary enormously between CAD packages. Attempting this too early adds complexity without clear payoff; PDF underlay (Phase 6) covers 90% of practical use cases first.

---

## 7. Quick Reference: Geometry Formulas Used

| Quantity | Formula | Notes |
|---|---|---|
| Floor / roof plan area | Shoelace (Gauss) | Works for any simple polygon |
| Wall gross area | edge length × storey height | Edge from footprint vertices |
| Net wall area | gross − Σ opening areas | Per wall segment |
| Roof actual area (pitched) | plan area / cos(pitch°) | Applies per slope |
| Exposed perimeter (ground floor) | Σ external wall edge lengths | Ground floor only |
| Y-factor | Σ(ψᵢ × Lᵢ) / A_total | A_total = all heat-loss elements |
| Fabric HLC | Σ(Uᵢ × Aᵢ) + Y × A_total | W/K |

---

_This document is the living design reference for the SAP Takeoff Assistant. Update it as decisions are made and phases are completed._
