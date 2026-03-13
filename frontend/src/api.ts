import type {
  Entity,
  EntityCreate,
  EntityUpdate,
  EntityQuery,
  Tag,
  TagCreate,
  Relationship,
  RelationshipCreate,
  AiChatRequest,
  AiChatResponse,
  AiInlineRequest,
  AiInlineResponse,
  ConfigResponse,
  ConfigUpdate,
  ImportResult,
  Stats,
  MapRecord,
  MapCreate,
  MapUpdate,
  MapListItem,
} from './types';

const BASE = '/api';

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    let msg: string;
    try {
      msg = JSON.parse(text).detail;
    } catch {
      msg = text;
    }
    throw new Error(msg || `Request failed: ${res.status}`);
  }
  return res.json();
}

// --- Entities ---

export function getEntities(params: EntityQuery = {}): Promise<Entity[]> {
  const qs = new URLSearchParams();
  if (params.entity_type) qs.set('entity_type', params.entity_type);
  if (params.tag_id) qs.set('tag_id', params.tag_id);
  if (params.search) qs.set('search', params.search);
  const q = qs.toString();
  return req<Entity[]>(`/entities${q ? '?' + q : ''}`);
}

export function getEntity(id: string): Promise<Entity> {
  return req<Entity>(`/entities/${id}`);
}

export function createEntity(data: EntityCreate): Promise<Entity> {
  return req<Entity>('/entities', { method: 'POST', body: JSON.stringify(data) });
}

export function updateEntity(id: string, data: EntityUpdate): Promise<Entity> {
  return req<Entity>(`/entities/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteEntity(id: string): Promise<{ ok: boolean }> {
  return req(`/entities/${id}`, { method: 'DELETE' });
}

// --- Tags ---

export function getTags(): Promise<Tag[]> {
  return req<Tag[]>('/tags');
}

export function createTag(data: TagCreate): Promise<Tag> {
  return req<Tag>('/tags', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteTag(id: string): Promise<{ ok: boolean }> {
  return req(`/tags/${id}`, { method: 'DELETE' });
}

// --- Relationships ---

export function getRelationships(entityId?: string): Promise<Relationship[]> {
  const q = entityId ? `?entity_id=${entityId}` : '';
  return req<Relationship[]>(`/relationships${q}`);
}

export function createRelationship(data: RelationshipCreate): Promise<Relationship> {
  return req<Relationship>('/relationships', { method: 'POST', body: JSON.stringify(data) });
}

export function deleteRelationship(id: string): Promise<{ ok: boolean }> {
  return req(`/relationships/${id}`, { method: 'DELETE' });
}

// --- Meta ---

export function getEntityTypes(): Promise<string[]> {
  return req<string[]>('/meta/entity-types');
}

export function getRelationshipTypes(): Promise<string[]> {
  return req<string[]>('/meta/relationship-types');
}

// --- Config ---

export function getConfig(): Promise<ConfigResponse> {
  return req<ConfigResponse>('/config');
}

export function updateConfig(data: ConfigUpdate): Promise<ConfigResponse> {
  return req<ConfigResponse>('/config', { method: 'PUT', body: JSON.stringify(data) });
}

// --- AI ---

export function aiChat(data: AiChatRequest): Promise<AiChatResponse> {
  return req<AiChatResponse>('/ai/chat', { method: 'POST', body: JSON.stringify(data) });
}

export function aiInline(data: AiInlineRequest): Promise<AiInlineResponse> {
  return req<AiInlineResponse>('/ai/inline', { method: 'POST', body: JSON.stringify(data) });
}

// --- Import ---

export async function importMarkdown(
  file: File,
  entityType: string,
  autoSplit: boolean,
): Promise<ImportResult> {
  const form = new FormData();
  form.append('file', file);
  form.append('entity_type', entityType);
  form.append('auto_split', String(autoSplit));
  const res = await fetch(`${BASE}/import/markdown`, { method: 'POST', body: form });
  if (!res.ok) throw new Error('Import failed');
  return res.json();
}

// --- Stats ---

export function getStats(): Promise<Stats> {
  return req<Stats>('/stats');
}

// --- Maps ---

export function getMaps(): Promise<MapListItem[]> {
  return req<MapListItem[]>('/maps');
}

export function getMap(id: string): Promise<MapRecord> {
  return req<MapRecord>(`/maps/${id}`);
}

export function createMap(data: MapCreate): Promise<MapRecord> {
  return req<MapRecord>('/maps', { method: 'POST', body: JSON.stringify(data) });
}

export function updateMap(id: string, data: MapUpdate): Promise<{ ok: boolean }> {
  return req(`/maps/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteMap(id: string): Promise<{ ok: boolean }> {
  return req(`/maps/${id}`, { method: 'DELETE' });
}
