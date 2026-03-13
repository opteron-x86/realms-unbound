import { TYPE_COLORS } from '../types';
import type { Entity, Tag } from '../types';

interface Props {
  entities: Entity[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  filterType: string;
  onFilterType: (v: string) => void;
  filterTag: string;
  onFilterTag: (v: string) => void;
  searchTerm: string;
  onSearch: (v: string) => void;
  entityTypes: string[];
  tags: Tag[];
}

export default function EntityList({
  entities, selectedId, onSelect,
  filterType, onFilterType,
  filterTag, onFilterTag,
  searchTerm, onSearch,
  entityTypes, tags,
}: Props) {
  return (
    <>
      <div className="sidebar-controls">
        <div className="sidebar-search">
          <input
            type="text"
            placeholder="Search entities..."
            value={searchTerm}
            onChange={e => onSearch(e.target.value)}
            style={{ fontSize: 12 }}
          />
        </div>
        <div className="sidebar-filters">
          <select value={filterType} onChange={e => onFilterType(e.target.value)}>
            <option value="">All Types</option>
            {entityTypes.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select value={filterTag} onChange={e => onFilterTag(e.target.value)}>
            <option value="">All Tags</option>
            {tags.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="entity-list">
        {entities.length === 0 && (
          <div className="empty-state">
            {searchTerm || filterType || filterTag
              ? 'No matches found'
              : 'No entities yet — create one to get started'}
          </div>
        )}
        {entities.map(ent => (
          <div
            key={ent.id}
            className={`entity-list-item ${ent.id === selectedId ? 'active' : ''}`}
            onClick={() => onSelect(ent.id)}
          >
            <span
              className="type-dot"
              style={{ background: TYPE_COLORS[ent.entity_type] || '#888' }}
            />
            <span className="entity-name">{ent.name}</span>
            <span className="entity-type-label">{ent.entity_type}</span>
          </div>
        ))}
      </div>

      <div style={{
        padding: '6px 14px',
        borderTop: '1px solid var(--border)',
        fontSize: 11,
        color: 'var(--text-muted)',
      }}>
        {entities.length} {entities.length === 1 ? 'entity' : 'entities'}
      </div>
    </>
  );
}
