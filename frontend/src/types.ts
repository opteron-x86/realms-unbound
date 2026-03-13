// ---------------------------------------------------------------------------
// Database entities
// ---------------------------------------------------------------------------

export interface Entity {
  id: string;
  name: string;
  entity_type: EntityType;
  summary: string;
  content: string;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  relationships: Relationship[];
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  count?: number;
}

export interface Relationship {
  id: string;
  source_id: string;
  target_id: string;
  rel_type: RelationshipType;
  description: string;
  created_at: string;
  source_name?: string;
  source_type?: string;
  target_name?: string;
  target_type?: string;
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

export interface EntityCreate {
  name: string;
  entity_type?: EntityType;
  summary?: string;
  content?: string;
  tag_ids?: string[];
}

export interface EntityUpdate {
  name?: string;
  entity_type?: string;
  summary?: string;
  content?: string;
  tag_ids?: string[];
}

export interface EntityQuery {
  entity_type?: string;
  tag_id?: string;
  search?: string;
}

export interface TagCreate {
  name: string;
  color?: string;
}

export interface RelationshipCreate {
  source_id: string;
  target_id: string;
  rel_type?: string;
  description?: string;
}

export interface AiChatRequest {
  message: string;
  entity_id?: string | null;
  include_related?: boolean;
}

export interface AiInlineRequest {
  prompt: string;
  entity_id?: string | null;
  field?: string;
}

export interface ConfigUpdate {
  openrouter_api_key?: string;
  ai_model?: string;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface AiChatResponse {
  reply: string;
}

export interface AiInlineResponse {
  content: string;
}

export interface ConfigResponse {
  openrouter_api_key_set: boolean;
  openrouter_api_key_masked?: string;
  ai_model: string;
}

export interface ImportResult {
  imported: number;
  entities: { id: string; name: string }[];
}

export interface Stats {
  entities: number;
  tags: number;
  relationships: number;
  by_type: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export type EntityType =
  | 'people'
  | 'place'
  | 'region'
  | 'creature'
  | 'event'
  | 'concept'
  | 'item'
  | 'organization'
  | 'religion'
  | 'magic';

export type RelationshipType =
  | 'related_to'
  | 'inhabits'
  | 'located_in'
  | 'borders'
  | 'conflicts_with'
  | 'allied_with'
  | 'created_by'
  | 'member_of'
  | 'descended_from'
  | 'worships'
  | 'rules'
  | 'trades_with'
  | 'parent_of'
  | 'child_of'
  | 'contains'
  | 'part_of';

export const TYPE_COLORS: Record<string, string> = {
  people: '#c4825a',
  place: '#5a9ac4',
  region: '#5a9ac4',
  creature: '#8a5ac4',
  event: '#c45a8a',
  concept: '#5ac4a3',
  item: '#c4c45a',
  organization: '#c4705a',
  religion: '#aa8ac4',
  magic: '#5ac4c4',
};

// ---------------------------------------------------------------------------
// AI Chat message
// ---------------------------------------------------------------------------

export interface ChatMessage {
  role: 'user' | 'assistant' | 'error';
  text: string;
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

export interface MapRecord {
  id: string;
  name: string;
  width: number;
  height: number;
  hex_size: number;
  terrain: number[];
  markers: MapMarker[];
  paths: MapPath[];
  created_at: string;
  updated_at: string;
}

export interface MapMarker {
  id: string;
  q: number;
  r: number;
  label: string;
  entity_id?: string | null;
  marker_type: string;
}

export interface MapPath {
  id: string;
  points: HexCoord[];
  path_type: string;
  label: string;
}

export interface HexCoord {
  q: number;
  r: number;
}

export interface MapCreate {
  name: string;
  width?: number;
  height?: number;
  hex_size?: number;
}

export interface MapUpdate {
  name?: string;
  terrain?: number[];
  markers?: MapMarker[];
  paths?: MapPath[];
}

export interface MapListItem {
  id: string;
  name: string;
  width: number;
  height: number;
  created_at: string;
  updated_at: string;
}

export const TERRAIN_TYPES = [
  { id: 0, name: 'Void',         color: '#0a0a14' },
  { id: 1, name: 'Deep Ocean',   color: '#1a3050' },
  { id: 2, name: 'Ocean',        color: '#2a4a70' },
  { id: 3, name: 'Coastal',      color: '#3a6a90' },
  { id: 4, name: 'Beach',        color: '#c4b480' },
  { id: 5, name: 'Plains',       color: '#7a9a50' },
  { id: 6, name: 'Forest',       color: '#3a6a30' },
  { id: 7, name: 'Dense Forest', color: '#2a4a25' },
  { id: 8, name: 'Taiga',        color: '#3a5a3a' },
  { id: 9, name: 'Hills',        color: '#8a7a5a' },
  { id: 10, name: 'Mountains',   color: '#6a6a70' },
  { id: 11, name: 'Peaks',       color: '#9a9aaa' },
  { id: 12, name: 'Snow',        color: '#c8ccd8' },
  { id: 13, name: 'Tundra',      color: '#7a8a6a' },
  { id: 14, name: 'Swamp',       color: '#4a5a3a' },
  { id: 15, name: 'Ice',         color: '#a8b8c8' },
  { id: 16, name: 'Lake',        color: '#3a6a8a' },
  { id: 17, name: 'River',       color: '#4a7a9a' },
] as const;

export const MARKER_TYPES = ['city', 'town', 'village', 'fortress', 'ruins', 'landmark', 'dungeon', 'camp'] as const;
export const PATH_TYPES = ['road', 'river', 'border', 'trail'] as const;

export const PATH_COLORS: Record<string, string> = {
  road: '#a09070',
  river: '#4a8aba',
  border: '#c45a5a',
  trail: '#908060',
};

export const MARKER_ICONS: Record<string, string> = {
  city: '◆',
  town: '●',
  village: '•',
  fortress: '▣',
  ruins: '△',
  landmark: '★',
  dungeon: '▼',
  camp: '⌂',
};
