use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

pub const ENTITY_TYPES: &[&str] = &[
    "people",
    "place",
    "region",
    "creature",
    "event",
    "concept",
    "item",
    "organization",
    "religion",
    "magic",
];

pub const RELATIONSHIP_TYPES: &[&str] = &[
    "related_to",
    "inhabits",
    "located_in",
    "borders",
    "conflicts_with",
    "allied_with",
    "created_by",
    "member_of",
    "descended_from",
    "worships",
    "rules",
    "trades_with",
    "parent_of",
    "child_of",
    "contains",
    "part_of",
];

// ---------------------------------------------------------------------------
// Database row types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: String,
    pub name: String,
    pub entity_type: String,
    pub summary: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub tags: Vec<Tag>,
    #[serde(default)]
    pub relationships: Vec<RelationshipRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
    #[serde(default)]
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RelationshipRow {
    pub id: String,
    pub source_id: String,
    pub target_id: String,
    pub rel_type: String,
    pub description: String,
    pub created_at: String,
    #[serde(default)]
    pub source_name: Option<String>,
    #[serde(default)]
    pub source_type: Option<String>,
    #[serde(default)]
    pub target_name: Option<String>,
    #[serde(default)]
    pub target_type: Option<String>,
}

// ---------------------------------------------------------------------------
// Request types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct EntityCreate {
    pub name: String,
    #[serde(default = "default_entity_type")]
    pub entity_type: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub content: String,
    #[serde(default)]
    pub tag_ids: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct EntityUpdate {
    pub name: Option<String>,
    pub entity_type: Option<String>,
    pub summary: Option<String>,
    pub content: Option<String>,
    pub tag_ids: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
pub struct EntityQuery {
    pub entity_type: Option<String>,
    pub tag_id: Option<String>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RelQuery {
    pub entity_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TagCreate {
    pub name: String,
    #[serde(default = "default_tag_color")]
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct RelationshipCreate {
    pub source_id: String,
    pub target_id: String,
    #[serde(default = "default_rel_type")]
    pub rel_type: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Deserialize)]
pub struct AiChatRequest {
    pub message: String,
    pub entity_id: Option<String>,
    #[serde(default = "default_true")]
    pub include_related: bool,
}

#[derive(Debug, Deserialize)]
pub struct AiInlineRequest {
    pub prompt: String,
    pub entity_id: Option<String>,
    #[serde(default = "default_content_field")]
    pub field: String,
}

#[derive(Debug, Deserialize)]
pub struct ConfigUpdate {
    pub openrouter_api_key: Option<String>,
    pub ai_model: Option<String>,
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
pub struct AiChatResponse {
    pub reply: String,
}

#[derive(Debug, Serialize)]
pub struct AiInlineResponse {
    pub content: String,
}

#[derive(Debug, Serialize)]
pub struct ConfigResponse {
    pub openrouter_api_key_set: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub openrouter_api_key_masked: Option<String>,
    pub ai_model: String,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub imported: usize,
    pub entities: Vec<ImportedEntity>,
}

#[derive(Debug, Serialize)]
pub struct ImportedEntity {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct Stats {
    pub entities: i64,
    pub tags: i64,
    pub relationships: i64,
    pub by_type: std::collections::HashMap<String, i64>,
}

#[derive(Debug, Serialize)]
pub struct OkResponse {
    pub ok: bool,
}

// ---------------------------------------------------------------------------
// Config file
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    #[serde(default)]
    pub openrouter_api_key: Option<String>,
    #[serde(default = "default_model")]
    pub ai_model: String,
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

fn default_entity_type() -> String {
    "concept".into()
}

fn default_tag_color() -> String {
    "#c4a35a".into()
}

fn default_rel_type() -> String {
    "related_to".into()
}

fn default_true() -> bool {
    true
}

fn default_content_field() -> String {
    "content".into()
}

fn default_model() -> String {
    "anthropic/claude-sonnet-4".into()
}

// ---------------------------------------------------------------------------
// Map types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapRecord {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub hex_size: f64,
    pub terrain: Vec<u8>,
    pub markers: Vec<MapMarker>,
    pub paths: Vec<MapPath>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapMarker {
    pub id: String,
    pub q: i32,
    pub r: i32,
    pub label: String,
    #[serde(default)]
    pub entity_id: Option<String>,
    #[serde(default = "default_marker_type")]
    pub marker_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MapPath {
    pub id: String,
    pub points: Vec<HexCoord>,
    #[serde(default = "default_path_type")]
    pub path_type: String,
    #[serde(default)]
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HexCoord {
    pub q: i32,
    pub r: i32,
}

#[derive(Debug, Deserialize)]
pub struct MapCreate {
    pub name: String,
    #[serde(default = "default_map_width")]
    pub width: u32,
    #[serde(default = "default_map_height")]
    pub height: u32,
    #[serde(default = "default_hex_size")]
    pub hex_size: f64,
}

#[derive(Debug, Deserialize)]
pub struct MapUpdate {
    pub name: Option<String>,
    pub terrain: Option<Vec<u8>>,
    pub markers: Option<Vec<MapMarker>>,
    pub paths: Option<Vec<MapPath>>,
}

#[derive(Debug, Serialize)]
pub struct MapListItem {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub created_at: String,
    pub updated_at: String,
}

fn default_marker_type() -> String { "city".into() }
fn default_path_type() -> String { "road".into() }
fn default_map_width() -> u32 { 120 }
fn default_map_height() -> u32 { 80 }
fn default_hex_size() -> f64 { 12.0 }
