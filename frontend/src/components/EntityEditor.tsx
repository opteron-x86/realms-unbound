import { useState, useEffect, useRef, useCallback } from 'react';
import { Sparkles, X, Plus, Loader2 } from 'lucide-react';
import * as api from '../api';
import type { Entity, Tag, EntityUpdate } from '../types';

interface Props {
  entity: Entity;
  onSave: (data: EntityUpdate) => void;
  onNavigate: (id: string) => void;
  onRefresh: () => void;
  tags: Tag[];
  entityTypes: string[];
  relTypes: string[];
  allEntities: Entity[];
}

export default function EntityEditor({
  entity, onSave, onNavigate, onRefresh,
  tags, entityTypes, relTypes, allEntities,
}: Props) {
  const [name, setName] = useState('');
  const [entityType, setEntityType] = useState('concept');
  const [summary, setSummary] = useState('');
  const [content, setContent] = useState('');
  const [entityTags, setEntityTags] = useState<Tag[]>([]);
  const [showTagPicker, setShowTagPicker] = useState(false);
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [showAddRel, setShowAddRel] = useState(false);
  const [contentTab, setContentTab] = useState<'edit' | 'preview'>('edit');

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string | null>(null);

  // Load entity data
  useEffect(() => {
    if (!entity) return;
    setName(entity.name || '');
    setEntityType(entity.entity_type || 'concept');
    setSummary(entity.summary || '');
    setContent(entity.content || '');
    setEntityTags(entity.tags || []);
    lastSavedRef.current = JSON.stringify({
      name: entity.name, entity_type: entity.entity_type,
      summary: entity.summary, content: entity.content,
    });
  }, [entity?.id]);

  // Auto-save with debounce
  const debounceSave = useCallback((data: EntityUpdate) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const key = JSON.stringify(data);
      if (key !== lastSavedRef.current) {
        lastSavedRef.current = key;
        onSave(data);
      }
    }, 800);
  }, [onSave]);

  useEffect(() => {
    if (!entity) return;
    debounceSave({ name, entity_type: entityType, summary, content });
  }, [name, entityType, summary, content]);

  // --- Tags ---
  const addTag = (tagId: string) => {
    const newTagIds = [...entityTags.map(t => t.id), tagId];
    setEntityTags(tags.filter(t => newTagIds.includes(t.id)));
    onSave({ tag_ids: newTagIds });
    setShowTagPicker(false);
  };

  const removeTag = (tagId: string) => {
    const newTagIds = entityTags.filter(t => t.id !== tagId).map(t => t.id);
    setEntityTags(entityTags.filter(t => t.id !== tagId));
    onSave({ tag_ids: newTagIds });
  };

  const availableTags = tags.filter(t => !entityTags.some(et => et.id === t.id));

  // --- Inline AI ---
  const handleInlineAI = async (field: string, prompt?: string) => {
    if (!prompt) {
      prompt = window.prompt(`What should the AI generate for ${field}?`) ?? undefined;
      if (!prompt) return;
    }
    setAiLoading(prev => ({ ...prev, [field]: true }));
    try {
      const res = await api.aiInline({ prompt, entity_id: entity.id, field });
      if (field === 'summary') setSummary(res.content);
      else if (field === 'content') {
        setContent(prev => prev ? prev + '\n\n' + res.content : res.content);
      }
    } catch (err: unknown) {
      alert('AI error: ' + (err instanceof Error ? err.message : String(err)));
    }
    setAiLoading(prev => ({ ...prev, [field]: false }));
  };

  // --- Relationships ---
  const handleDeleteRel = async (relId: string) => {
    await api.deleteRelationship(relId);
    onRefresh();
  };

  const relationships = entity?.relationships || [];

  return (
    <div className="entity-editor">
      {/* Name + Type */}
      <div className="editor-section">
        <div className="editor-row">
          <div style={{ flex: 2 }}>
            <label>Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{ fontSize: 16, fontWeight: 600 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label>Type</label>
            <select value={entityType} onChange={e => setEntityType(e.target.value)}>
              {entityTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Tags */}
      <div className="editor-section">
        <label>Tags</label>
        <div className="tags-editor">
          {entityTags.map(tag => (
            <span key={tag.id} className="tag-chip">
              <span className="tag-dot" style={{ background: tag.color }} />
              {tag.name}
              <span className="tag-remove" onClick={() => removeTag(tag.id)}>×</span>
            </span>
          ))}
          <div className="tag-picker">
            <button className="add-tag-btn" onClick={() => setShowTagPicker(!showTagPicker)}>
              + Add Tag
            </button>
            {showTagPicker && (
              <div className="tag-picker-dropdown">
                {availableTags.length > 0 ? availableTags.map(tag => (
                  <div key={tag.id} className="tag-picker-item" onClick={() => addTag(tag.id)}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
                    {tag.name}
                  </div>
                )) : (
                  <div style={{ padding: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                    No more tags. Create new ones in Tag Manager.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="editor-section">
        <label>Summary</label>
        <div className="inline-ai-row">
          <textarea
            value={summary}
            onChange={e => setSummary(e.target.value)}
            placeholder="A brief description of this entity..."
            rows={2}
          />
          <button
            onClick={() => handleInlineAI('summary', 'Write a concise summary for this entity based on its content and relationships.')}
            disabled={aiLoading.summary}
            title="AI: Generate summary"
            style={{ alignSelf: 'flex-start' }}
          >
            {aiLoading.summary ? <Loader2 size={14} className="spinning" /> : <Sparkles size={14} />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="editor-section">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <label style={{ margin: 0 }}>Content</label>
          <div className="tab-bar" style={{ border: 'none', margin: 0 }}>
            <span className={`tab ${contentTab === 'edit' ? 'active' : ''}`}
              onClick={() => setContentTab('edit')}>Edit</span>
            <span className={`tab ${contentTab === 'preview' ? 'active' : ''}`}
              onClick={() => setContentTab('preview')}>Preview</span>
          </div>
          <div className="flex-spacer" />
          <button
            onClick={() => handleInlineAI('content')}
            disabled={aiLoading.content}
            title="AI: Generate or expand content"
          >
            {aiLoading.content ? <Loader2 size={14} className="spinning" /> : <Sparkles size={14} />}
            AI Expand
          </button>
        </div>
        {contentTab === 'edit' ? (
          <textarea
            className="content-editor"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your lore here... (Markdown supported)"
          />
        ) : (
          <div style={{
            padding: 16, background: 'var(--bg-surface)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius)',
            minHeight: 300, lineHeight: 1.7, fontSize: 13, whiteSpace: 'pre-wrap',
          }}>
            {content || <span style={{ color: 'var(--text-muted)' }}>No content yet</span>}
          </div>
        )}
      </div>

      {/* Relationships */}
      <div className="editor-section">
        <label>Relationships</label>
        <div className="relationships-list">
          {relationships.map(rel => {
            const isSource = rel.source_id === entity.id;
            const otherId = isSource ? rel.target_id : rel.source_id;
            const otherName = isSource ? rel.target_name : rel.source_name;
            const otherType = isSource ? rel.target_type : rel.source_type;

            return (
              <div key={rel.id} className="rel-item">
                {isSource ? (
                  <>
                    <span className="rel-type">{rel.rel_type}</span>
                    <span className="rel-entity" onClick={() => onNavigate(otherId)}>
                      {otherName}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({otherType})</span>
                  </>
                ) : (
                  <>
                    <span className="rel-entity" onClick={() => onNavigate(otherId)}>
                      {otherName}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({otherType})</span>
                    <span className="rel-type">{rel.rel_type}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>→ this</span>
                  </>
                )}
                {rel.description && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    — {rel.description}
                  </span>
                )}
                <span className="rel-delete" onClick={() => handleDeleteRel(rel.id)}>
                  <X size={14} />
                </span>
              </div>
            );
          })}
          {relationships.length === 0 && !showAddRel && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)', padding: 8 }}>
              No relationships yet
            </div>
          )}
        </div>
        {showAddRel ? (
          <AddRelationshipForm
            entityId={entity.id}
            entityName={entity.name}
            allEntities={allEntities}
            relTypes={relTypes}
            onCreated={() => { setShowAddRel(false); onRefresh(); }}
            onCancel={() => setShowAddRel(false)}
          />
        ) : (
          <button onClick={() => setShowAddRel(true)} style={{ marginTop: 8 }}>
            <Plus size={14} /> Add Relationship
          </button>
        )}
      </div>
    </div>
  );
}


// ============================
// Add Relationship Form
// ============================

interface AddRelProps {
  entityId: string;
  entityName: string;
  allEntities: Entity[];
  relTypes: string[];
  onCreated: () => void;
  onCancel: () => void;
}

function AddRelationshipForm({ entityId, entityName, allEntities, relTypes, onCreated, onCancel }: AddRelProps) {
  const [targetId, setTargetId] = useState('');
  const [relType, setRelType] = useState('related_to');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const targets = allEntities.filter(e => e.id !== entityId);

  const handleSubmit = async () => {
    if (!targetId) return;
    setSaving(true);
    try {
      await api.createRelationship({
        source_id: entityId,
        target_id: targetId,
        rel_type: relType,
        description,
      });
      onCreated();
    } catch (err: unknown) {
      alert('Failed: ' + (err instanceof Error ? err.message : String(err)));
    }
    setSaving(false);
  };

  return (
    <div className="add-rel-form" style={{ marginTop: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
        {entityName}
      </span>
      <select value={relType} onChange={e => setRelType(e.target.value)} style={{ width: 'auto' }}>
        {relTypes.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
      <select value={targetId} onChange={e => setTargetId(e.target.value)} style={{ flex: 1, minWidth: 150 }}>
        <option value="">Select entity...</option>
        {targets.map(e => (
          <option key={e.id} value={e.id}>{e.name} ({e.entity_type})</option>
        ))}
      </select>
      <input
        type="text"
        placeholder="Note (optional)"
        value={description}
        onChange={e => setDescription(e.target.value)}
        style={{ flex: 1, minWidth: 100 }}
      />
      <button className="primary" onClick={handleSubmit} disabled={!targetId || saving}>
        {saving ? '...' : 'Add'}
      </button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  );
}
