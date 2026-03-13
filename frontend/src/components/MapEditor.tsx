import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Paintbrush, MapPin, Route, Move, Plus, Minus, Save, Trash2, Link,
} from 'lucide-react';
import * as api from '../api';
import type {
  MapRecord, MapMarker, MapPath, HexCoord, Entity,
} from '../types';
import {
  TERRAIN_TYPES, MARKER_TYPES, PATH_TYPES, PATH_COLORS, MARKER_ICONS,
} from '../types';

// ---------------------------------------------------------------------------
// Hex math — pointy-top, even-row offset
// ---------------------------------------------------------------------------

const SQRT3 = Math.sqrt(3);

function hexCenter(col: number, row: number, size: number): [number, number] {
  const x = size * SQRT3 * (col + 0.5 * (row & 1));
  const y = size * 1.5 * row;
  return [x, y];
}

function hexCorners(cx: number, cy: number, size: number): [number, number][] {
  const corners: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
  }
  return corners;
}

function pixelToHex(px: number, py: number, size: number): [number, number] {
  // Convert to fractional axial coords then round
  const q = (SQRT3 / 3 * px - 1 / 3 * py) / size;
  const r = (2 / 3 * py) / size;
  // Round axial
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(-q - r);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - (-q - r));
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  // Axial to even-row offset
  const col = rq + (rr - (rr & 1)) / 2;
  return [col, rr];
}

function hexDistance(c1: number, r1: number, c2: number, r2: number): number {
  // Convert offset to axial then cube distance
  const q1 = c1 - (r1 - (r1 & 1)) / 2;
  const q2 = c2 - (r2 - (r2 & 1)) / 2;
  const s1 = -q1 - r1;
  const s2 = -q2 - r2;
  return Math.max(Math.abs(q1 - q2), Math.abs(r1 - r2), Math.abs(s1 - s2));
}

function hexesInRadius(
  centerCol: number, centerRow: number, radius: number,
  width: number, height: number,
): [number, number][] {
  const results: [number, number][] = [];
  for (let r = Math.max(0, centerRow - radius); r <= Math.min(height - 1, centerRow + radius); r++) {
    for (let c = Math.max(0, centerCol - radius); c <= Math.min(width - 1, centerCol + radius); c++) {
      if (hexDistance(centerCol, centerRow, c, r) <= radius) {
        results.push([c, r]);
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Component props
// ---------------------------------------------------------------------------

interface Props {
  map: MapRecord;
  entities: Entity[];
  onSave: (data: { terrain?: number[]; markers?: MapMarker[]; paths?: MapPath[] }) => void;
  onNavigateEntity: (id: string) => void;
}

type Tool = 'paint' | 'marker' | 'path' | 'pan' | 'erase';

// ---------------------------------------------------------------------------
// MapEditor component
// ---------------------------------------------------------------------------

export default function MapEditor({ map, entities, onSave, onNavigateEntity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // View state
  const [pan, setPan] = useState({ x: 50, y: 50 });
  const [zoom, setZoom] = useState(1.0);

  // Tool state
  const [tool, setTool] = useState<Tool>('paint');
  const [selectedTerrain, setSelectedTerrain] = useState(5);
  const [brushSize, setBrushSize] = useState(1);
  const [markerType, setMarkerType] = useState('city');
  const [pathType, setPathType] = useState('road');

  // Data state (local working copies)
  const [terrain, setTerrain] = useState<number[]>([]);
  const [markers, setMarkers] = useState<MapMarker[]>([]);
  const [paths, setPaths] = useState<MapPath[]>([]);
  const [dirty, setDirty] = useState(false);

  // Interaction state
  const [isPainting, setIsPainting] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [currentPath, setCurrentPath] = useState<HexCoord[]>([]);
  const [selectedMarker, setSelectedMarker] = useState<string | null>(null);
  const [hoverHex, setHoverHex] = useState<[number, number] | null>(null);

  // Marker editing
  const [editingMarker, setEditingMarker] = useState<MapMarker | null>(null);

  // Load map data
  useEffect(() => {
    setTerrain([...map.terrain]);
    setMarkers([...map.markers]);
    setPaths([...map.paths]);
    setDirty(false);
  }, [map.id]);

  // ---------------------------------------------------------------------------
  // Coordinate conversion
  // ---------------------------------------------------------------------------

  const screenToWorld = useCallback((sx: number, sy: number): [number, number] => {
    return [(sx - pan.x) / zoom, (sy - pan.y) / zoom];
  }, [pan, zoom]);

  const screenToHex = useCallback((sx: number, sy: number): [number, number] => {
    const [wx, wy] = screenToWorld(sx, sy);
    return pixelToHex(wx, wy, map.hex_size);
  }, [screenToWorld, map.hex_size]);

  const isValidHex = useCallback((col: number, row: number) => {
    return col >= 0 && col < map.width && row >= 0 && row < map.height;
  }, [map.width, map.height]);

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    // Clear
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const size = map.hex_size;

    // Determine visible range
    const [tlCol, tlRow] = pixelToHex(-pan.x / zoom - size * 2, -pan.y / zoom - size * 2, size);
    const [brCol, brRow] = pixelToHex(
      (rect.width - pan.x) / zoom + size * 2,
      (rect.height - pan.y) / zoom + size * 2,
      size,
    );

    const minR = Math.max(0, tlRow - 1);
    const maxR = Math.min(map.height - 1, brRow + 1);
    const minC = Math.max(0, tlCol - 1);
    const maxC = Math.min(map.width - 1, brCol + 1);

    // Draw terrain hexes
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const tIdx = terrain[r * map.width + c] || 0;
        const tt = TERRAIN_TYPES[tIdx] || TERRAIN_TYPES[0];
        const [cx, cy] = hexCenter(c, r, size);
        const corners = hexCorners(cx, cy, size);

        ctx.beginPath();
        ctx.moveTo(corners[0][0], corners[0][1]);
        for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1]);
        ctx.closePath();
        ctx.fillStyle = tt.color;
        ctx.fill();

        // Subtle grid line
        if (zoom > 0.6) {
          ctx.strokeStyle = 'rgba(255,255,255,0.06)';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    // Draw paths
    for (const path of paths) {
      if (path.points.length < 2) continue;
      ctx.beginPath();
      const color = PATH_COLORS[path.path_type] || '#888';
      ctx.strokeStyle = color;
      ctx.lineWidth = path.path_type === 'river' ? 3 : 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (path.path_type === 'border') {
        ctx.setLineDash([6, 4]);
      }

      const [fx, fy] = hexCenter(path.points[0].q, path.points[0].r, size);
      ctx.moveTo(fx, fy);
      for (let i = 1; i < path.points.length; i++) {
        const [px, py] = hexCenter(path.points[i].q, path.points[i].r, size);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw current path being built
    if (currentPath.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = PATH_COLORS[pathType] || '#888';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.globalAlpha = 0.6;
      const [fx, fy] = hexCenter(currentPath[0].q, currentPath[0].r, size);
      ctx.moveTo(fx, fy);
      for (let i = 1; i < currentPath.length; i++) {
        const [px, py] = hexCenter(currentPath[i].q, currentPath[i].r, size);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;
    }

    // Draw markers
    for (const marker of markers) {
      const [mx, my] = hexCenter(marker.q, marker.r, size);
      const isSelected = selectedMarker === marker.id;
      const icon = MARKER_ICONS[marker.marker_type] || '●';

      // Background circle
      ctx.beginPath();
      ctx.arc(mx, my, size * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = isSelected ? 'rgba(196, 163, 90, 0.5)' : 'rgba(10, 10, 20, 0.7)';
      ctx.fill();
      ctx.strokeStyle = marker.entity_id ? '#c4a35a' : '#888';
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.stroke();

      // Icon
      ctx.fillStyle = marker.entity_id ? '#c4a35a' : '#d8d8e8';
      ctx.font = `${size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, mx, my);

      // Label
      if (zoom > 0.5 && marker.label) {
        ctx.fillStyle = '#d8d8e8';
        ctx.font = `${Math.max(8, size * 0.7)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(marker.label, mx, my + size * 1.2);
      }
    }

    // Hover hex highlight
    if (hoverHex && isValidHex(hoverHex[0], hoverHex[1])) {
      if (tool === 'paint' || tool === 'erase') {
        const hexes = hexesInRadius(hoverHex[0], hoverHex[1], brushSize - 1, map.width, map.height);
        for (const [hc, hr] of hexes) {
          const [hx, hy] = hexCenter(hc, hr, size);
          const corners = hexCorners(hx, hy, size);
          ctx.beginPath();
          ctx.moveTo(corners[0][0], corners[0][1]);
          for (let i = 1; i < 6; i++) ctx.lineTo(corners[i][0], corners[i][1]);
          ctx.closePath();
          ctx.strokeStyle = tool === 'erase' ? 'rgba(196,90,90,0.6)' : 'rgba(196,163,90,0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else if (tool === 'marker' || tool === 'path') {
        const [hx, hy] = hexCenter(hoverHex[0], hoverHex[1], size);
        ctx.beginPath();
        ctx.arc(hx, hy, size * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(196,163,90,0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [pan, zoom, terrain, markers, paths, currentPath, hoverHex, tool,
      brushSize, pathType, selectedMarker, map]);

  // Render on every state change
  useEffect(() => {
    requestAnimationFrame(render);
  }, [render]);

  // Resize handler
  useEffect(() => {
    const handleResize = () => requestAnimationFrame(render);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [render]);

  // ---------------------------------------------------------------------------
  // Painting
  // ---------------------------------------------------------------------------

  const paintAt = useCallback((sx: number, sy: number) => {
    const [col, row] = screenToHex(sx, sy);
    if (!isValidHex(col, row)) return;

    const hexes = hexesInRadius(col, row, brushSize - 1, map.width, map.height);
    setTerrain(prev => {
      const next = [...prev];
      const val = tool === 'erase' ? 0 : selectedTerrain;
      for (const [hc, hr] of hexes) {
        next[hr * map.width + hc] = val;
      }
      return next;
    });
    setDirty(true);
  }, [screenToHex, isValidHex, brushSize, selectedTerrain, tool, map.width, map.height]);

  // ---------------------------------------------------------------------------
  // Mouse handlers
  // ---------------------------------------------------------------------------

  const getCanvasPos = (e: React.MouseEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const [sx, sy] = getCanvasPos(e);

    // Middle mouse or space: always pan
    if (e.button === 1 || tool === 'pan') {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    if (e.button !== 0) return;

    if (tool === 'paint' || tool === 'erase') {
      setIsPainting(true);
      paintAt(sx, sy);
    } else if (tool === 'marker') {
      const [col, row] = screenToHex(sx, sy);
      if (!isValidHex(col, row)) return;
      // Check if clicking existing marker
      const existing = markers.find(m => m.q === col && m.r === row);
      if (existing) {
        setSelectedMarker(existing.id);
        setEditingMarker({ ...existing });
      } else {
        const newMarker: MapMarker = {
          id: crypto.randomUUID(),
          q: col, r: row,
          label: 'New Marker',
          entity_id: null,
          marker_type: markerType,
        };
        setMarkers(prev => [...prev, newMarker]);
        setSelectedMarker(newMarker.id);
        setEditingMarker({ ...newMarker });
        setDirty(true);
      }
    } else if (tool === 'path') {
      const [col, row] = screenToHex(sx, sy);
      if (!isValidHex(col, row)) return;
      setCurrentPath(prev => [...prev, { q: col, r: row }]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const [sx, sy] = getCanvasPos(e);
    setHoverHex(screenToHex(sx, sy));

    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    if (isPainting && (tool === 'paint' || tool === 'erase')) {
      paintAt(sx, sy);
    }
  };

  const handleMouseUp = () => {
    setIsPainting(false);
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const [sx, sy] = getCanvasPos(e);
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.15, Math.min(5, zoom * delta));

    // Zoom toward cursor
    const wx = (sx - pan.x) / zoom;
    const wy = (sy - pan.y) / zoom;
    setPan({
      x: sx - wx * newZoom,
      y: sy - wy * newZoom,
    });
    setZoom(newZoom);
  };

  // Finish path on right-click or double-click
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (tool === 'path' && currentPath.length >= 2) {
      const newPath: MapPath = {
        id: crypto.randomUUID(),
        points: [...currentPath],
        path_type: pathType,
        label: '',
      };
      setPaths(prev => [...prev, newPath]);
      setCurrentPath([]);
      setDirty(true);
    } else {
      setCurrentPath([]);
    }
  };

  const handleDoubleClick = () => {
    if (tool === 'path' && currentPath.length >= 2) {
      const newPath: MapPath = {
        id: crypto.randomUUID(),
        points: [...currentPath],
        path_type: pathType,
        label: '',
      };
      setPaths(prev => [...prev, newPath]);
      setCurrentPath([]);
      setDirty(true);
    }
  };

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  const handleSave = () => {
    onSave({ terrain, markers, paths });
    setDirty(false);
  };

  // ---------------------------------------------------------------------------
  // Marker editing
  // ---------------------------------------------------------------------------

  const updateMarker = (updated: MapMarker) => {
    setMarkers(prev => prev.map(m => m.id === updated.id ? updated : m));
    setEditingMarker(updated);
    setDirty(true);
  };

  const deleteMarker = (id: string) => {
    setMarkers(prev => prev.filter(m => m.id !== id));
    setSelectedMarker(null);
    setEditingMarker(null);
    setDirty(true);
  };

  const deletePath = (id: string) => {
    setPaths(prev => prev.filter(p => p.id !== id));
    setDirty(true);
  };

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      switch (e.key) {
        case 'b': setTool('paint'); break;
        case 'm': setTool('marker'); break;
        case 'p': setTool('path'); break;
        case ' ': setTool('pan'); e.preventDefault(); break;
        case 'x': setTool('erase'); break;
        case 'Escape': setCurrentPath([]); setSelectedMarker(null); setEditingMarker(null); break;
        case 's': if (e.ctrlKey || e.metaKey) { e.preventDefault(); handleSave(); } break;
        case '[': setBrushSize(s => Math.max(1, s - 1)); break;
        case ']': setBrushSize(s => Math.min(6, s + 1)); break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') setTool('paint');
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKey); window.removeEventListener('keyup', handleKeyUp); };
  }, [handleSave]);

  // ---------------------------------------------------------------------------
  // Render UI
  // ---------------------------------------------------------------------------

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px',
        background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)',
        flexShrink: 0, flexWrap: 'wrap',
      }}>
        <span style={{ fontWeight: 600, marginRight: 8 }}>{map.name}</span>

        <ToolBtn icon={<Paintbrush size={14} />} label="Paint (B)" active={tool === 'paint'} onClick={() => setTool('paint')} />
        <ToolBtn icon={<span style={{ fontSize: 14 }}>✕</span>} label="Erase (X)" active={tool === 'erase'} onClick={() => setTool('erase')} />
        <ToolBtn icon={<MapPin size={14} />} label="Marker (M)" active={tool === 'marker'} onClick={() => setTool('marker')} />
        <ToolBtn icon={<Route size={14} />} label="Path (P)" active={tool === 'path'} onClick={() => setTool('path')} />
        <ToolBtn icon={<Move size={14} />} label="Pan (Space)" active={tool === 'pan'} onClick={() => setTool('pan')} />

        <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

        {(tool === 'paint' || tool === 'erase') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Brush:</span>
            <button className="icon-btn" onClick={() => setBrushSize(s => Math.max(1, s - 1))}><Minus size={12} /></button>
            <span style={{ minWidth: 16, textAlign: 'center' }}>{brushSize}</span>
            <button className="icon-btn" onClick={() => setBrushSize(s => Math.min(6, s + 1))}><Plus size={12} /></button>
          </div>
        )}

        {tool === 'marker' && (
          <select value={markerType} onChange={e => setMarkerType(e.target.value)}
            style={{ fontSize: 12, width: 'auto' }}>
            {MARKER_TYPES.map(t => <option key={t} value={t}>{MARKER_ICONS[t]} {t}</option>)}
          </select>
        )}

        {tool === 'path' && (
          <>
            <select value={pathType} onChange={e => setPathType(e.target.value)}
              style={{ fontSize: 12, width: 'auto' }}>
              {PATH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            {currentPath.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {currentPath.length} pts — right-click to finish
              </span>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />

        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {hoverHex ? `(${hoverHex[0]}, ${hoverHex[1]})` : ''} {Math.round(zoom * 100)}%
        </span>
        <button onClick={handleSave} className={dirty ? 'primary' : ''} style={{ fontSize: 12 }}>
          <Save size={12} /> {dirty ? 'Save*' : 'Saved'}
        </button>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Terrain palette (when paint tool active) */}
        {(tool === 'paint') && (
          <div style={{
            width: 140, flexShrink: 0, borderRight: '1px solid var(--border)',
            overflowY: 'auto', padding: 6, background: 'var(--bg-deep)',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: 0.5, marginBottom: 6, padding: '0 4px' }}>Terrain</div>
            {TERRAIN_TYPES.map(tt => (
              <div
                key={tt.id}
                onClick={() => setSelectedTerrain(tt.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '4px 6px', cursor: 'pointer', borderRadius: 4,
                  background: selectedTerrain === tt.id ? 'var(--bg-hover)' : 'transparent',
                  border: selectedTerrain === tt.id ? '1px solid var(--accent-dim)' : '1px solid transparent',
                  fontSize: 12, marginBottom: 2,
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: 3,
                  background: tt.color, flexShrink: 0,
                  border: '1px solid rgba(255,255,255,0.1)',
                }} />
                <span>{tt.name}</span>
              </div>
            ))}
          </div>
        )}

        {/* Marker/path properties panel */}
        {(editingMarker && tool === 'marker') && (
          <div style={{
            width: 220, flexShrink: 0, borderRight: '1px solid var(--border)',
            padding: 12, background: 'var(--bg-deep)', overflowY: 'auto',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: 0.5, marginBottom: 8 }}>Marker Properties</div>

            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Label
            </label>
            <input
              type="text"
              value={editingMarker.label}
              onChange={e => updateMarker({ ...editingMarker, label: e.target.value })}
              style={{ fontSize: 12, marginBottom: 8 }}
            />

            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              Type
            </label>
            <select
              value={editingMarker.marker_type}
              onChange={e => updateMarker({ ...editingMarker, marker_type: e.target.value })}
              style={{ fontSize: 12, marginBottom: 8 }}
            >
              {MARKER_TYPES.map(t => <option key={t} value={t}>{MARKER_ICONS[t]} {t}</option>)}
            </select>

            <label style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
              <Link size={10} style={{ marginRight: 4 }} />
              Linked Entity
            </label>
            <select
              value={editingMarker.entity_id || ''}
              onChange={e => updateMarker({ ...editingMarker, entity_id: e.target.value || null })}
              style={{ fontSize: 12, marginBottom: 8 }}
            >
              <option value="">None</option>
              {entities.map(ent => (
                <option key={ent.id} value={ent.id}>{ent.name} ({ent.entity_type})</option>
              ))}
            </select>

            {editingMarker.entity_id && (
              <button
                onClick={() => onNavigateEntity(editingMarker.entity_id!)}
                style={{ fontSize: 11, marginBottom: 8, width: '100%' }}
              >
                Open Entity →
              </button>
            )}

            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
              Position: ({editingMarker.q}, {editingMarker.r})
            </div>

            <button className="danger" onClick={() => deleteMarker(editingMarker.id)}
              style={{ fontSize: 11, width: '100%' }}>
              <Trash2 size={11} /> Delete Marker
            </button>
          </div>
        )}

        {/* Path list panel */}
        {(tool === 'path' && paths.length > 0) && (
          <div style={{
            width: 200, flexShrink: 0, borderRight: '1px solid var(--border)',
            padding: 12, background: 'var(--bg-deep)', overflowY: 'auto',
          }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase',
              letterSpacing: 0.5, marginBottom: 8 }}>Paths</div>
            {paths.map(path => (
              <div key={path.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 6px', fontSize: 12, marginBottom: 4,
                background: 'var(--bg-surface)', borderRadius: 4,
              }}>
                <span style={{
                  width: 10, height: 3, borderRadius: 2,
                  background: PATH_COLORS[path.path_type] || '#888',
                }} />
                <span style={{ flex: 1 }}>{path.path_type} ({path.points.length} pts)</span>
                <button className="icon-btn" onClick={() => deletePath(path.id)}
                  style={{ color: 'var(--danger)', opacity: 0.5, padding: 2 }}>
                  <Trash2 size={11} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Canvas */}
        <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: getCursor(tool, isPanning) }}>
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            style={{ display: 'block' }}
          />
          {/* Keyboard hints overlay */}
          <div style={{
            position: 'absolute', bottom: 8, left: 8,
            fontSize: 10, color: 'var(--text-muted)',
            background: 'rgba(10,10,20,0.8)', padding: '4px 8px', borderRadius: 4,
            pointerEvents: 'none',
          }}>
            B Paint · X Erase · M Marker · P Path · Space Pan · [ ] Brush · Scroll Zoom · Ctrl+S Save
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function ToolBtn({ icon, label, active, onClick }: {
  icon: React.ReactNode; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        background: active ? 'var(--accent-bg)' : undefined,
        borderColor: active ? 'var(--accent-dim)' : undefined,
        color: active ? 'var(--accent)' : undefined,
        padding: '5px 8px', fontSize: 12,
      }}
    >
      {icon}
    </button>
  );
}

function getCursor(tool: Tool, isPanning: boolean): string {
  if (isPanning) return 'grabbing';
  switch (tool) {
    case 'pan': return 'grab';
    case 'paint': return 'crosshair';
    case 'erase': return 'crosshair';
    case 'marker': return 'crosshair';
    case 'path': return 'crosshair';
    default: return 'default';
  }
}
