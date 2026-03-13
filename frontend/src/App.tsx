import { useState, useEffect, useCallback, useRef } from 'react';
import { Settings, Plus, Upload, ChevronRight, X, Trash2, PanelRightClose, PanelRightOpen, Map, BookOpen } from 'lucide-react';
import * as api from './api';
import type { Entity, Tag, EntityUpdate, Stats as StatsType, ConfigResponse, MapRecord, MapListItem } from './types';
import { TYPE_COLORS } from './types';
import EntityList from './components/EntityList';
import EntityEditor from './components/EntityEditor';
import AIPanel from './components/AIPanel';
import MapEditor from './components/MapEditor';

export default function App() {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [relTypes, setRelTypes] = useState<string[]>([]);
  const [stats, setStats] = useState<StatsType | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  const [showAI, setShowAI] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showTagManager, setShowTagManager] = useState(false);

  const [filterType, setFilterType] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // View mode: codex or map
  const [viewMode, setViewMode] = useState<'codex' | 'map'>('codex');
  const [maps, setMaps] = useState<MapListItem[]>([]);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [selectedMap, setSelectedMap] = useState<MapRecord | null>(null);

  // --- Load data ---
  const loadEntities = useCallback(async () => {
    try {
      setEntities(await api.getEntities({
        entity_type: filterType || undefined,
        tag_id: filterTag || undefined,
        search: searchTerm || undefined,
      }));
    } catch (err) { console.error('Failed to load entities:', err); }
  }, [filterType, filterTag, searchTerm]);

  const loadTags = useCallback(async () => {
    try { setTags(await api.getTags()); } catch (err) { console.error(err); }
  }, []);

  const loadMeta = useCallback(async () => {
    try {
      setEntityTypes(await api.getEntityTypes());
      setRelTypes(await api.getRelationshipTypes());
    } catch (err) { console.error(err); }
  }, []);

  const loadStats = useCallback(async () => {
    try { setStats(await api.getStats()); } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { loadMeta(); loadTags(); loadStats(); }, []);
  useEffect(() => { loadEntities(); }, [loadEntities]);

  useEffect(() => {
    if (!selectedId) { setSelectedEntity(null); return; }
    api.getEntity(selectedId).then(setSelectedEntity).catch(err => {
      console.error(err);
      setSelectedEntity(null);
    });
  }, [selectedId]);

  // Map loading
  const loadMaps = useCallback(async () => {
    try { setMaps(await api.getMaps()); } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { loadMaps(); }, []);

  useEffect(() => {
    if (!selectedMapId) { setSelectedMap(null); return; }
    api.getMap(selectedMapId).then(setSelectedMap).catch(err => {
      console.error(err);
      setSelectedMap(null);
    });
  }, [selectedMapId]);

  // --- Handlers ---
  const handleCreate = async () => {
    try {
      const ent = await api.createEntity({ name: 'New Entity', entity_type: 'concept' });
      await loadEntities();
      setSelectedId(ent.id);
      loadStats();
    } catch (err) { console.error(err); }
  };

  const handleSave = async (data: EntityUpdate) => {
    if (!selectedId) return;
    try {
      const updated = await api.updateEntity(selectedId, data);
      setSelectedEntity(updated);
      loadEntities();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async () => {
    if (!selectedId || !confirm('Delete this entity? This cannot be undone.')) return;
    try {
      await api.deleteEntity(selectedId);
      setSelectedId(null);
      loadEntities();
      loadStats();
    } catch (err) { console.error(err); }
  };

  const refreshEntity = async () => {
    if (selectedId) {
      setSelectedEntity(await api.getEntity(selectedId));
    }
  };

  // --- Map handlers ---
  const handleCreateMap = async () => {
    const name = prompt('Map name:', 'New Map');
    if (!name) return;
    try {
      const m = await api.createMap({ name });
      await loadMaps();
      setSelectedMapId(m.id);
    } catch (err) { console.error(err); }
  };

  const handleSaveMap = async (data: { terrain?: number[]; markers?: import('./types').MapMarker[]; paths?: import('./types').MapPath[] }) => {
    if (!selectedMapId) return;
    try {
      await api.updateMap(selectedMapId, data);
    } catch (err) { console.error(err); }
  };

  const handleDeleteMap = async () => {
    if (!selectedMapId || !confirm('Delete this map? This cannot be undone.')) return;
    try {
      await api.deleteMap(selectedMapId);
      setSelectedMapId(null);
      loadMaps();
    } catch (err) { console.error(err); }
  };

  // Navigate from map marker to entity in codex
  const handleMapNavigateEntity = (entityId: string) => {
    setViewMode('codex');
    setSelectedId(entityId);
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <div className="sidebar">
        <div className="sidebar-header">
          <h1>⚒ Realms Unbound</h1>
          <div className="subtitle">Worldbuilding Tool</div>
        </div>

        {/* View mode tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
        }}>
          <button
            onClick={() => setViewMode('codex')}
            className="ghost"
            style={{
              flex: 1, borderRadius: 0, padding: '8px 0', fontSize: 12,
              color: viewMode === 'codex' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: viewMode === 'codex' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <BookOpen size={13} /> Codex
          </button>
          <button
            onClick={() => setViewMode('map')}
            className="ghost"
            style={{
              flex: 1, borderRadius: 0, padding: '8px 0', fontSize: 12,
              color: viewMode === 'map' ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: viewMode === 'map' ? '2px solid var(--accent)' : '2px solid transparent',
            }}
          >
            <Map size={13} /> Maps
          </button>
        </div>

        {viewMode === 'codex' ? (
          <>
            <EntityList
              entities={entities}
              selectedId={selectedId}
              onSelect={setSelectedId}
              filterType={filterType}
              onFilterType={setFilterType}
              filterTag={filterTag}
              onFilterTag={setFilterTag}
              searchTerm={searchTerm}
              onSearch={setSearchTerm}
              entityTypes={entityTypes}
              tags={tags}
            />
            <div className="sidebar-footer">
              <button className="primary" onClick={handleCreate} style={{ flex: 1 }}>
                <Plus size={14} /> New Entity
              </button>
              <button onClick={() => setShowImport(true)} title="Import Markdown">
                <Upload size={14} />
              </button>
              <button onClick={() => setShowSettings(true)} title="Settings">
                <Settings size={14} />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="entity-list">
              {maps.length === 0 && (
                <div className="empty-state">No maps yet — create one to get started</div>
              )}
              {maps.map(m => (
                <div
                  key={m.id}
                  className={`entity-list-item ${m.id === selectedMapId ? 'active' : ''}`}
                  onClick={() => setSelectedMapId(m.id)}
                >
                  <span className="type-dot" style={{ background: '#5a9ac4' }} />
                  <span className="entity-name">{m.name}</span>
                  <span className="entity-type-label">{m.width}×{m.height}</span>
                </div>
              ))}
            </div>
            <div className="sidebar-footer">
              <button className="primary" onClick={handleCreateMap} style={{ flex: 1 }}>
                <Plus size={14} /> New Map
              </button>
              <button onClick={() => setShowSettings(true)} title="Settings">
                <Settings size={14} />
              </button>
            </div>
          </>
        )}
      </div>

      {/* Main */}
      <div className="main-content">
        {viewMode === 'codex' ? (
          <>
            <div className="main-toolbar">
              {selectedEntity ? (
                <>
                  <span style={{ color: TYPE_COLORS[selectedEntity.entity_type], fontWeight: 600 }}>
                    {selectedEntity.entity_type.toUpperCase()}
                  </span>
                  <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontWeight: 600 }}>{selectedEntity.name}</span>
                  <div className="flex-spacer" />
                  <button className="danger" onClick={handleDelete}>
                    <Trash2 size={14} /> Delete
                  </button>
                </>
              ) : (
                <>
                  <span style={{ color: 'var(--text-muted)' }}>Select or create an entity</span>
                  <div className="flex-spacer" />
                </>
              )}
              <button onClick={() => setShowTagManager(true)} className="ghost">Tags</button>
              <button onClick={() => setShowAI(!showAI)}>
                {showAI ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
                AI
              </button>
            </div>
            <div className="main-body">
              {selectedEntity ? (
                <EntityEditor
                  entity={selectedEntity}
                  onSave={handleSave}
                  onNavigate={setSelectedId}
                  onRefresh={refreshEntity}
                  tags={tags}
                  entityTypes={entityTypes}
                  relTypes={relTypes}
                  allEntities={entities}
                />
              ) : (
                <Welcome stats={stats} />
              )}
            </div>
          </>
        ) : (
          /* Map view */
          selectedMap ? (
            <MapEditor
              map={selectedMap}
              entities={entities}
              onSave={handleSaveMap}
              onNavigateEntity={handleMapNavigateEntity}
            />
          ) : (
            <div className="main-body">
              <div className="welcome">
                <h2>🗺 Maps</h2>
                <p>Create a map to start painting terrain, placing settlements, and drawing roads and borders.</p>
                <button className="primary" onClick={handleCreateMap} style={{ marginTop: 16 }}>
                  <Plus size={14} /> Create Your First Map
                </button>
              </div>
            </div>
          )
        )}
      </div>

      {/* AI Panel */}
      {showAI && viewMode === 'codex' && (
        <AIPanel
          entityId={selectedId}
          entityName={selectedEntity?.name}
          onClose={() => setShowAI(false)}
          onInsert={(text) => {
            if (selectedEntity) {
              const newContent = selectedEntity.content
                ? selectedEntity.content + '\n\n' + text
                : text;
              handleSave({ content: newContent });
            }
          }}
        />
      )}

      {/* Modals */}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showImport && (
        <ImportModal
          entityTypes={entityTypes}
          onClose={() => setShowImport(false)}
          onImported={() => { loadEntities(); loadStats(); setShowImport(false); }}
        />
      )}
      {showTagManager && (
        <TagManagerModal
          tags={tags}
          onClose={() => setShowTagManager(false)}
          onChanged={loadTags}
        />
      )}
    </div>
  );
}


// ============================
// Welcome
// ============================

function Welcome({ stats }: { stats: StatsType | null }) {
  return (
    <div className="welcome">
      <h2>⚒ Realms Unbound</h2>
      <p>
        Create entities to build your world. Add tags and relationships
        to connect them. Use the AI assistant to brainstorm and expand your lore.
      </p>
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.entities}</div>
            <div className="stat-label">Entities</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.tags}</div>
            <div className="stat-label">Tags</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.relationships}</div>
            <div className="stat-label">Relationships</div>
          </div>
        </div>
      )}
    </div>
  );
}


// ============================
// Settings Modal
// ============================

function SettingsModal({ onClose }: { onClose: () => void }) {
  const PRESET_MODELS = [
    'anthropic/claude-sonnet-4',
    'anthropic/claude-opus-4',
    'anthropic/claude-haiku-4',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'google/gemini-2.0-flash-001',
    'google/gemini-2.5-pro-preview',
    'meta-llama/llama-3.3-70b-instruct',
  ];

  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('anthropic/claude-sonnet-4');
  const [customModel, setCustomModel] = useState('');
  const [useCustom, setUseCustom] = useState(false);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getConfig().then(c => {
      setConfig(c);
      const m = c.ai_model || 'anthropic/claude-sonnet-4';
      if (PRESET_MODELS.includes(m)) {
        setModel(m);
        setUseCustom(false);
      } else {
        setModel('__custom__');
        setCustomModel(m);
        setUseCustom(true);
      }
    });
  }, []);

  const effectiveModel = useCustom ? customModel : model;

  const handleSelectChange = (value: string) => {
    if (value === '__custom__') {
      setModel('__custom__');
      setUseCustom(true);
    } else {
      setModel(value);
      setUseCustom(false);
      setCustomModel('');
    }
  };

  const handleSave = async () => {
    const finalModel = useCustom ? customModel.trim() : model;
    if (!finalModel) {
      alert('Please enter a model identifier.');
      return;
    }
    setSaving(true);
    try {
      const data: { ai_model: string; openrouter_api_key?: string } = { ai_model: finalModel };
      if (apiKey) data.openrouter_api_key = apiKey;
      await api.updateConfig(data);
      setConfig(await api.getConfig());
      setApiKey('');
    } catch (err: unknown) {
      alert('Failed to save: ' + (err instanceof Error ? err.message : String(err)));
    }
    setSaving(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Settings</h2>
        <div className="modal-section">
          <label>OpenRouter API Key</label>
          {config?.openrouter_api_key_set && (
            <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 4 }}>
              ✓ Key set: {config.openrouter_api_key_masked}
            </div>
          )}
          <input
            type="password"
            placeholder={config?.openrouter_api_key_set ? 'Enter new key to replace' : 'sk-or-...'}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
          />
          <div className="help-text">
            Get your key at{' '}
            <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer"
              style={{ color: 'var(--accent)' }}>openrouter.ai/keys</a>
          </div>
        </div>
        <div className="modal-section">
          <label>AI Model</label>
          <select value={useCustom ? '__custom__' : model} onChange={e => handleSelectChange(e.target.value)}>
            <optgroup label="Anthropic">
              <option value="anthropic/claude-sonnet-4">Claude Sonnet 4</option>
              <option value="anthropic/claude-opus-4">Claude Opus 4</option>
              <option value="anthropic/claude-haiku-4">Claude Haiku 4</option>
            </optgroup>
            <optgroup label="OpenAI">
              <option value="openai/gpt-4o">GPT-4o</option>
              <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
            </optgroup>
            <optgroup label="Google">
              <option value="google/gemini-2.0-flash-001">Gemini 2.0 Flash</option>
              <option value="google/gemini-2.5-pro-preview">Gemini 2.5 Pro</option>
            </optgroup>
            <optgroup label="Meta">
              <option value="meta-llama/llama-3.3-70b-instruct">Llama 3.3 70B</option>
            </optgroup>
            <optgroup label="Other">
              <option value="__custom__">Custom model...</option>
            </optgroup>
          </select>
          {useCustom && (
            <input
              type="text"
              placeholder="e.g. mistralai/mistral-large or deepseek/deepseek-r1"
              value={customModel}
              onChange={e => setCustomModel(e.target.value)}
              style={{ marginTop: 6 }}
            />
          )}
          <div className="help-text">
            {useCustom
              ? <>Enter any model ID from <a href="https://openrouter.ai/models" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>openrouter.ai/models</a></>
              : <>Choose a preset or select "Custom model" to enter any OpenRouter model ID</>}
          </div>
          {effectiveModel && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
              Active: {effectiveModel}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleSave} disabled={saving || (useCustom && !customModel.trim())}>
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================
// Import Modal
// ============================

function ImportModal({
  entityTypes,
  onClose,
  onImported,
}: {
  entityTypes: string[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [entityType, setEntityType] = useState('concept');
  const [autoSplit, setAutoSplit] = useState(true);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const res = await api.importMarkdown(file, entityType, autoSplit);
      setResult(res);
      setTimeout(onImported, 1500);
    } catch (err: unknown) {
      alert('Import failed: ' + (err instanceof Error ? err.message : String(err)));
    }
    setImporting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Import Markdown</h2>
        <div className="modal-section">
          <div
            className={`import-zone ${file ? 'has-file' : ''}`}
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".md,.markdown,.txt"
              style={{ display: 'none' }}
              onChange={e => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <span style={{ color: 'var(--success)' }}>✓ {file.name}</span>
            ) : (
              <span>Click to select a .md file</span>
            )}
          </div>
        </div>
        <div className="modal-section">
          <label>Default Entity Type</label>
          <select value={entityType} onChange={e => setEntityType(e.target.value)}>
            {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="modal-section">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={autoSplit} onChange={e => setAutoSplit(e.target.checked)} />
            Split on H2 headers (create one entity per section)
          </label>
        </div>
        {result && (
          <div style={{ padding: 10, background: 'var(--accent-bg)', borderRadius: 'var(--radius)', fontSize: 13 }}>
            ✓ Imported {result.imported} entities
          </div>
        )}
        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={handleImport} disabled={importing || !file}>
            {importing ? 'Importing...' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}


// ============================
// Tag Manager Modal
// ============================

function TagManagerModal({
  tags,
  onClose,
  onChanged,
}: {
  tags: Tag[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('#c4a35a');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await api.createTag({ name: newName.trim(), color: newColor });
      setNewName('');
      onChanged();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this tag?')) return;
    await api.deleteTag(id);
    onChanged();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>Manage Tags</h2>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="New tag name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            style={{ flex: 1 }}
          />
          <input
            type="color"
            value={newColor}
            onChange={e => setNewColor(e.target.value)}
            style={{ width: 38, padding: 2, cursor: 'pointer' }}
          />
          <button className="primary" onClick={handleAdd}>Add</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {tags.map(tag => (
            <div key={tag.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 8px', background: 'var(--bg-surface)',
              borderRadius: 'var(--radius)', fontSize: 13,
            }}>
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{tag.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{tag.count} uses</span>
              <button className="icon-btn" onClick={() => handleDelete(tag.id)}
                style={{ color: 'var(--danger)', opacity: 0.5 }}>
                <X size={14} />
              </button>
            </div>
          ))}
          {tags.length === 0 && <div className="empty-state">No tags yet</div>}
        </div>
        <div className="modal-actions">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
