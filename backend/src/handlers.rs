use std::collections::HashMap;
use std::path::PathBuf;

use axum::extract::{Multipart, Path, Query, State};
use axum::Json;
use chrono::Utc;
use rusqlite::params;
use uuid::Uuid;

use crate::db;
use crate::error::AppError;
use crate::models::*;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct AppState {
    pub db_path: PathBuf,
    pub config_path: PathBuf,
}

fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

/// Run a blocking database operation on the tokio blocking pool.
async fn blocking_db<F, T>(state: &AppState, f: F) -> Result<T, AppError>
where
    F: FnOnce(&rusqlite::Connection) -> Result<T, AppError> + Send + 'static,
    T: Send + 'static,
{
    let path = state.db_path.clone();
    tokio::task::spawn_blocking(move || {
        let conn = db::open(&path)?;
        f(&conn)
    })
    .await?
}

// ===================================================================
// Entities
// ===================================================================

pub async fn list_entities(
    State(state): State<AppState>,
    Query(q): Query<EntityQuery>,
) -> Result<Json<Vec<Entity>>, AppError> {
    let entities = blocking_db(&state, move |conn| {
        let mut sql = String::from("SELECT * FROM entities WHERE 1=1");
        let mut param_values: Vec<String> = Vec::new();

        if let Some(ref et) = q.entity_type {
            sql.push_str(&format!(" AND entity_type = ?{}", param_values.len() + 1));
            param_values.push(et.clone());
        }
        if let Some(ref search) = q.search {
            let term = format!("%{search}%");
            let n = param_values.len();
            sql.push_str(&format!(
                " AND (name LIKE ?{} OR summary LIKE ?{} OR content LIKE ?{})",
                n + 1,
                n + 2,
                n + 3
            ));
            param_values.push(term.clone());
            param_values.push(term.clone());
            param_values.push(term);
        }
        sql.push_str(" ORDER BY name ASC");

        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();

        let mut entities: Vec<Entity> = stmt
            .query_map(param_refs.as_slice(), db::row_to_entity)?
            .collect::<Result<Vec<_>, _>>()?;

        // Filter by tag if needed
        if let Some(ref tag_id) = q.tag_id {
            let mut tag_stmt =
                conn.prepare("SELECT entity_id FROM entity_tags WHERE tag_id = ?1")?;
            let tagged_ids: Vec<String> = tag_stmt
                .query_map(params![tag_id], |row| row.get(0))?
                .collect::<Result<Vec<_>, _>>()?;
            entities.retain(|e| tagged_ids.contains(&e.id));
        }

        // Attach tags
        for ent in &mut entities {
            ent.tags = db::attach_tags(conn, &ent.id)?;
        }

        Ok(entities)
    })
    .await?;

    Ok(Json(entities))
}

pub async fn get_entity(
    State(state): State<AppState>,
    Path(entity_id): Path<String>,
) -> Result<Json<Entity>, AppError> {
    let entity = blocking_db(&state, move |conn| {
        db::get_full_entity(conn, &entity_id)?
            .ok_or_else(|| AppError::NotFound("Entity not found".into()))
    })
    .await?;

    Ok(Json(entity))
}

pub async fn create_entity(
    State(state): State<AppState>,
    Json(body): Json<EntityCreate>,
) -> Result<Json<Entity>, AppError> {
    let eid = new_id();
    let ts = now_iso();
    let id_clone = eid.clone();

    let entity = blocking_db(&state, move |conn| {
        conn.execute(
            "INSERT INTO entities (id, name, entity_type, summary, content, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![eid, body.name, body.entity_type, body.summary, body.content, ts, ts],
        )?;

        for tid in &body.tag_ids {
            conn.execute(
                "INSERT OR IGNORE INTO entity_tags (entity_id, tag_id) VALUES (?1, ?2)",
                params![eid, tid],
            )?;
        }

        db::get_full_entity(conn, &eid)?.ok_or_else(|| AppError::Internal("Insert failed".into()))
    })
    .await?;

    Ok(Json(entity))
}

pub async fn update_entity(
    State(state): State<AppState>,
    Path(entity_id): Path<String>,
    Json(body): Json<EntityUpdate>,
) -> Result<Json<Entity>, AppError> {
    let entity = blocking_db(&state, move |conn| {
        // Check entity exists
        let exists: bool = conn.query_row(
            "SELECT COUNT(*) FROM entities WHERE id = ?1",
            params![entity_id],
            |row| row.get::<_, i64>(0).map(|c| c > 0),
        )?;
        if !exists {
            return Err(AppError::NotFound("Entity not found".into()));
        }

        // Build dynamic UPDATE
        let mut sets = Vec::new();
        let mut values: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(ref name) = body.name {
            sets.push(format!("name = ?{}", values.len() + 1));
            values.push(Box::new(name.clone()));
        }
        if let Some(ref et) = body.entity_type {
            sets.push(format!("entity_type = ?{}", values.len() + 1));
            values.push(Box::new(et.clone()));
        }
        if let Some(ref summary) = body.summary {
            sets.push(format!("summary = ?{}", values.len() + 1));
            values.push(Box::new(summary.clone()));
        }
        if let Some(ref content) = body.content {
            sets.push(format!("content = ?{}", values.len() + 1));
            values.push(Box::new(content.clone()));
        }

        if !sets.is_empty() {
            sets.push(format!("updated_at = ?{}", values.len() + 1));
            values.push(Box::new(now_iso()));

            let idx = values.len() + 1;
            let sql = format!("UPDATE entities SET {} WHERE id = ?{}", sets.join(", "), idx);
            values.push(Box::new(entity_id.clone()));

            let params: Vec<&dyn rusqlite::types::ToSql> = values.iter().map(|v| v.as_ref()).collect();
            conn.execute(&sql, params.as_slice())?;
        }

        // Update tags if provided
        if let Some(ref tag_ids) = body.tag_ids {
            conn.execute(
                "DELETE FROM entity_tags WHERE entity_id = ?1",
                params![entity_id],
            )?;
            for tid in tag_ids {
                conn.execute(
                    "INSERT OR IGNORE INTO entity_tags (entity_id, tag_id) VALUES (?1, ?2)",
                    params![entity_id, tid],
                )?;
            }
        }

        db::get_full_entity(conn, &entity_id)?
            .ok_or_else(|| AppError::Internal("Update failed".into()))
    })
    .await?;

    Ok(Json(entity))
}

pub async fn delete_entity(
    State(state): State<AppState>,
    Path(entity_id): Path<String>,
) -> Result<Json<OkResponse>, AppError> {
    blocking_db(&state, move |conn| {
        conn.execute("DELETE FROM entities WHERE id = ?1", params![entity_id])?;
        Ok(())
    })
    .await?;

    Ok(Json(OkResponse { ok: true }))
}

// ===================================================================
// Tags
// ===================================================================

pub async fn list_tags(State(state): State<AppState>) -> Result<Json<Vec<Tag>>, AppError> {
    let tags = blocking_db(&state, |conn| {
        let mut stmt = conn.prepare("SELECT * FROM tags ORDER BY name ASC")?;
        let mut tags: Vec<Tag> = stmt
            .query_map([], db::row_to_tag)?
            .collect::<Result<Vec<_>, _>>()?;

        for tag in &mut tags {
            tag.count = conn.query_row(
                "SELECT COUNT(*) FROM entity_tags WHERE tag_id = ?1",
                params![tag.id],
                |row| row.get(0),
            )?;
        }
        Ok(tags)
    })
    .await?;

    Ok(Json(tags))
}

pub async fn create_tag(
    State(state): State<AppState>,
    Json(body): Json<TagCreate>,
) -> Result<Json<Tag>, AppError> {
    let tid = new_id();

    let tag = blocking_db(&state, move |conn| {
        conn.execute(
            "INSERT INTO tags (id, name, color) VALUES (?1, ?2, ?3)",
            params![tid, body.name, body.color],
        )
        .map_err(|e| match e {
            rusqlite::Error::SqliteFailure(_, _) => {
                AppError::Conflict("Tag already exists".into())
            }
            other => AppError::Database(other),
        })?;

        Ok(Tag {
            id: tid,
            name: body.name,
            color: body.color,
            count: 0,
        })
    })
    .await?;

    Ok(Json(tag))
}

pub async fn update_tag(
    State(state): State<AppState>,
    Path(tag_id): Path<String>,
    Json(body): Json<TagCreate>,
) -> Result<Json<Tag>, AppError> {
    blocking_db(&state, move |conn| {
        conn.execute(
            "UPDATE tags SET name = ?1, color = ?2 WHERE id = ?3",
            params![body.name, body.color, tag_id],
        )?;
        Ok(Tag {
            id: tag_id,
            name: body.name,
            color: body.color,
            count: 0,
        })
    })
    .await
    .map(Json)
}

pub async fn delete_tag(
    State(state): State<AppState>,
    Path(tag_id): Path<String>,
) -> Result<Json<OkResponse>, AppError> {
    blocking_db(&state, move |conn| {
        conn.execute("DELETE FROM tags WHERE id = ?1", params![tag_id])?;
        Ok(())
    })
    .await?;
    Ok(Json(OkResponse { ok: true }))
}

// ===================================================================
// Relationships
// ===================================================================

pub async fn list_relationships(
    State(state): State<AppState>,
    Query(q): Query<RelQuery>,
) -> Result<Json<Vec<RelationshipRow>>, AppError> {
    let rels = blocking_db(&state, move |conn| {
        let (sql, param_values): (String, Vec<String>) = if let Some(ref eid) = q.entity_id {
            (
                "SELECT r.*, se.name as source_name, se.entity_type as source_type,
                        te.name as target_name, te.entity_type as target_type
                 FROM relationships r
                 JOIN entities se ON se.id = r.source_id
                 JOIN entities te ON te.id = r.target_id
                 WHERE r.source_id = ?1 OR r.target_id = ?1
                 ORDER BY r.created_at DESC"
                    .into(),
                vec![eid.clone()],
            )
        } else {
            (
                "SELECT r.*, se.name as source_name, se.entity_type as source_type,
                        te.name as target_name, te.entity_type as target_type
                 FROM relationships r
                 JOIN entities se ON se.id = r.source_id
                 JOIN entities te ON te.id = r.target_id
                 ORDER BY r.created_at DESC"
                    .into(),
                vec![],
            )
        };

        let mut stmt = conn.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            param_values.iter().map(|v| v as &dyn rusqlite::types::ToSql).collect();

        let rels = stmt
            .query_map(param_refs.as_slice(), db::row_to_relationship)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rels)
    })
    .await?;

    Ok(Json(rels))
}

pub async fn create_relationship(
    State(state): State<AppState>,
    Json(body): Json<RelationshipCreate>,
) -> Result<Json<RelationshipRow>, AppError> {
    let rid = new_id();
    let ts = now_iso();

    let rel = blocking_db(&state, move |conn| {
        conn.execute(
            "INSERT INTO relationships (id, source_id, target_id, rel_type, description, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![rid, body.source_id, body.target_id, body.rel_type, body.description, ts],
        )?;

        let mut stmt = conn.prepare(
            "SELECT r.*, se.name as source_name, se.entity_type as source_type,
                    te.name as target_name, te.entity_type as target_type
             FROM relationships r
             JOIN entities se ON se.id = r.source_id
             JOIN entities te ON te.id = r.target_id
             WHERE r.id = ?1",
        )?;
        let rel = stmt.query_row(params![rid], db::row_to_relationship)?;
        Ok(rel)
    })
    .await?;

    Ok(Json(rel))
}

pub async fn delete_relationship(
    State(state): State<AppState>,
    Path(rel_id): Path<String>,
) -> Result<Json<OkResponse>, AppError> {
    blocking_db(&state, move |conn| {
        conn.execute("DELETE FROM relationships WHERE id = ?1", params![rel_id])?;
        Ok(())
    })
    .await?;
    Ok(Json(OkResponse { ok: true }))
}

// ===================================================================
// Meta
// ===================================================================

pub async fn get_entity_types() -> Json<Vec<&'static str>> {
    Json(ENTITY_TYPES.to_vec())
}

pub async fn get_relationship_types() -> Json<Vec<&'static str>> {
    Json(RELATIONSHIP_TYPES.to_vec())
}

// ===================================================================
// Stats
// ===================================================================

pub async fn get_stats(State(state): State<AppState>) -> Result<Json<Stats>, AppError> {
    let stats = blocking_db(&state, |conn| {
        let entities: i64 =
            conn.query_row("SELECT COUNT(*) FROM entities", [], |r| r.get(0))?;
        let tags: i64 = conn.query_row("SELECT COUNT(*) FROM tags", [], |r| r.get(0))?;
        let relationships: i64 =
            conn.query_row("SELECT COUNT(*) FROM relationships", [], |r| r.get(0))?;

        let mut by_type = HashMap::new();
        let mut stmt =
            conn.prepare("SELECT entity_type, COUNT(*) FROM entities GROUP BY entity_type")?;
        let rows = stmt.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        for row in rows {
            let (k, v) = row?;
            by_type.insert(k, v);
        }

        Ok(Stats {
            entities,
            tags,
            relationships,
            by_type,
        })
    })
    .await?;

    Ok(Json(stats))
}

// ===================================================================
// Config
// ===================================================================

fn load_config(path: &std::path::Path) -> AppConfig {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_config(path: &std::path::Path, cfg: &AppConfig) -> Result<(), AppError> {
    let json = serde_json::to_string_pretty(cfg)?;
    std::fs::write(path, json)?;
    Ok(())
}

pub async fn get_config(State(state): State<AppState>) -> Json<ConfigResponse> {
    let cfg = load_config(&state.config_path);

    let (set, masked) = match cfg.openrouter_api_key {
        Some(ref key) if key.len() > 12 => {
            let m = format!("{}...{}", &key[..8], &key[key.len() - 4..]);
            (true, Some(m))
        }
        Some(_) => (true, Some("***".into())),
        None => (false, None),
    };

    Json(ConfigResponse {
        openrouter_api_key_set: set,
        openrouter_api_key_masked: masked,
        ai_model: cfg.ai_model,
    })
}

pub async fn update_config(
    State(state): State<AppState>,
    Json(body): Json<ConfigUpdate>,
) -> Result<Json<ConfigResponse>, AppError> {
    let mut cfg = load_config(&state.config_path);
    if let Some(key) = body.openrouter_api_key {
        cfg.openrouter_api_key = Some(key);
    }
    if let Some(model) = body.ai_model {
        cfg.ai_model = model;
    }
    save_config(&state.config_path, &cfg)?;

    // Return updated view
    Ok(get_config(State(state)).await.into())
}

// ===================================================================
// AI Integration
// ===================================================================

const SYSTEM_PROMPT: &str = r#"You are a worldbuilding assistant for a dark fantasy tabletop setting called Tamera. 
The world features cosmic horror elements, moral ambiguity, and mythic strangeness. Key influences 
include Elder Scrolls, Warhammer 40k, Bloodborne, and Lovecraft.

The setting is post-apocalyptic, shaped by the Spellbreak — a magical catastrophe 1500-2000 years ago 
that shattered the ancient Kyn empire and destabilized magic across the world. The world features 
complex theology involving divine emanations, failed cosmic cycles, and tension between creation and entropy.

When helping with worldbuilding:
- Maintain consistency with established lore provided in context
- Embrace moral ambiguity — no faction is purely good or evil
- Prefer "soft worldbuilding" where lore emerges through fragments and context rather than exposition
- Use grounded, culturally specific details over generic fantasy tropes
- Write in natural, flowing prose — avoid choppy "Not X but Y" constructions
- Respect that fragmentary knowledge and unreliable narration are features, not bugs
- Multiple valid interpretations of cosmic/theological questions create richer storytelling

You'll receive context about the current entity being worked on and its related entities. 
Use this context to inform your responses while maintaining consistency."#;

fn build_context(conn: &rusqlite::Connection, entity_id: &str, include_related: bool) -> Result<String, AppError> {
    let entity = match db::get_full_entity(conn, entity_id)? {
        Some(e) => e,
        None => return Ok(String::new()),
    };

    let mut parts = vec![format!(
        "## Current Entity: {} ({})\n",
        entity.name, entity.entity_type
    )];

    if !entity.summary.is_empty() {
        parts.push(format!("Summary: {}\n", entity.summary));
    }
    if !entity.content.is_empty() {
        let content = if entity.content.len() > 3000 {
            format!("{}\n[... content truncated ...]", &entity.content[..3000])
        } else {
            entity.content.clone()
        };
        parts.push(format!("Content:\n{}\n", content));
    }

    if !entity.tags.is_empty() {
        let tag_names: Vec<_> = entity.tags.iter().map(|t| t.name.as_str()).collect();
        parts.push(format!("Tags: {}\n", tag_names.join(", ")));
    }

    if include_related && !entity.relationships.is_empty() {
        parts.push("\n## Related Entities\n".into());
        for rel in &entity.relationships {
            let (other_name, other_type, other_summary, direction) = if rel.source_id == entity.id {
                (
                    rel.target_name.as_deref().unwrap_or("?"),
                    rel.target_type.as_deref().unwrap_or("?"),
                    // Fetch summary of related entity
                    {
                        conn.query_row(
                            "SELECT summary FROM entities WHERE id = ?1",
                            params![rel.target_id],
                            |r| r.get::<_, String>(0),
                        )
                        .unwrap_or_default()
                    },
                    format!(
                        "{} —[{}]→ {}",
                        entity.name,
                        rel.rel_type,
                        rel.target_name.as_deref().unwrap_or("?")
                    ),
                )
            } else {
                (
                    rel.source_name.as_deref().unwrap_or("?"),
                    rel.source_type.as_deref().unwrap_or("?"),
                    {
                        conn.query_row(
                            "SELECT summary FROM entities WHERE id = ?1",
                            params![rel.source_id],
                            |r| r.get::<_, String>(0),
                        )
                        .unwrap_or_default()
                    },
                    format!(
                        "{} —[{}]→ {}",
                        rel.source_name.as_deref().unwrap_or("?"),
                        rel.rel_type,
                        entity.name
                    ),
                )
            };

            parts.push(format!("- {} ({})", direction, other_type));
            if !other_summary.is_empty() {
                parts.push(format!("  {}", other_summary));
            }
            if !rel.description.is_empty() {
                parts.push(format!("  Note: {}", rel.description));
            }
            parts.push(String::new());
        }
    }

    Ok(parts.join("\n"))
}

async fn call_openrouter(
    messages: Vec<serde_json::Value>,
    cfg: &AppConfig,
) -> Result<String, AppError> {
    let api_key = cfg
        .openrouter_api_key
        .as_deref()
        .filter(|k| !k.is_empty())
        .ok_or_else(|| {
            AppError::BadRequest("OpenRouter API key not configured. Go to Settings to add it.".into())
        })?;

    let client = reqwest::Client::new();
    let resp = client
        .post("https://openrouter.ai/api/v1/chat/completions")
        .header("Authorization", format!("Bearer {api_key}"))
        .header("HTTP-Referer", "http://localhost:5173")
        .header("X-Title", "Tamera Forge")
        .json(&serde_json::json!({
            "model": cfg.ai_model,
            "messages": messages,
            "max_tokens": 2000,
            "temperature": 0.8,
        }))
        .timeout(std::time::Duration::from_secs(120))
        .send()
        .await
        .map_err(|e| AppError::External(format!("OpenRouter request failed: {e}")))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp
            .text()
            .await
            .unwrap_or_else(|_| "unknown error".into());
        return Err(AppError::External(format!(
            "OpenRouter error ({status}): {}",
            &text[..text.len().min(500)]
        )));
    }

    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| AppError::External(format!("Failed to parse response: {e}")))?;

    data["choices"][0]["message"]["content"]
        .as_str()
        .map(String::from)
        .ok_or_else(|| AppError::External("No content in AI response".into()))
}

pub async fn ai_chat(
    State(state): State<AppState>,
    Json(body): Json<AiChatRequest>,
) -> Result<Json<AiChatResponse>, AppError> {
    let cfg = load_config(&state.config_path);

    // Build context on blocking thread
    let context = if let Some(ref eid) = body.entity_id {
        let eid = eid.clone();
        let include = body.include_related;
        blocking_db(&state, move |conn| build_context(conn, &eid, include)).await?
    } else {
        String::new()
    };

    let mut messages = vec![serde_json::json!({
        "role": "system",
        "content": SYSTEM_PROMPT,
    })];

    if !context.is_empty() {
        messages.push(serde_json::json!({
            "role": "system",
            "content": format!("Here is context about the entity the user is currently working on:\n\n{context}"),
        }));
    }

    messages.push(serde_json::json!({
        "role": "user",
        "content": body.message,
    }));

    let reply = call_openrouter(messages, &cfg).await?;
    Ok(Json(AiChatResponse { reply }))
}

pub async fn ai_inline(
    State(state): State<AppState>,
    Json(body): Json<AiInlineRequest>,
) -> Result<Json<AiInlineResponse>, AppError> {
    let cfg = load_config(&state.config_path);

    let context = if let Some(ref eid) = body.entity_id {
        let eid = eid.clone();
        blocking_db(&state, move |conn| build_context(conn, &eid, true)).await?
    } else {
        String::new()
    };

    let field_instruction = match body.field.as_str() {
        "summary" => "Write a concise 1-3 sentence summary for this entity. Be specific and evocative.",
        "content" => "Write or expand the lore content for this entity. Use natural flowing prose with rich detail.",
        "name" => "Suggest a fitting name for this entity given the context.",
        _ => "Help with this field for the entity.",
    };

    let mut messages = vec![serde_json::json!({
        "role": "system",
        "content": SYSTEM_PROMPT,
    })];

    if !context.is_empty() {
        messages.push(serde_json::json!({
            "role": "system",
            "content": format!("Entity context:\n\n{context}"),
        }));
    }

    messages.push(serde_json::json!({
        "role": "user",
        "content": format!(
            "{field_instruction}\n\nUser's request: {}\n\nRespond with ONLY the requested content — no preamble, no explanation, no markdown code fences. Just the content itself.",
            body.prompt
        ),
    }));

    let content = call_openrouter(messages, &cfg).await?;
    Ok(Json(AiInlineResponse { content }))
}

// ===================================================================
// Markdown Import
// ===================================================================

pub async fn import_markdown(
    State(state): State<AppState>,
    mut multipart: Multipart,
) -> Result<Json<ImportResult>, AppError> {
    let mut file_content: Option<String> = None;
    let mut entity_type = "concept".to_string();
    let mut auto_split = true;
    let mut filename = "imported".to_string();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Multipart error: {e}")))?
    {
        let name = field.name().unwrap_or("").to_string();
        match name.as_str() {
            "file" => {
                filename = field
                    .file_name()
                    .unwrap_or("imported")
                    .to_string();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Read error: {e}")))?;
                file_content = Some(String::from_utf8_lossy(&bytes).into_owned());
            }
            "entity_type" => {
                entity_type = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Read error: {e}")))?;
            }
            "auto_split" => {
                let val = field
                    .text()
                    .await
                    .map_err(|e| AppError::BadRequest(format!("Read error: {e}")))?;
                auto_split = val == "true";
            }
            _ => {}
        }
    }

    let raw = file_content.ok_or_else(|| AppError::BadRequest("No file provided".into()))?;
    let base_name = std::path::Path::new(&filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported")
        .replace('_', " ")
        .replace('-', " ");

    let result = blocking_db(&state, move |conn| {
        let ts = now_iso();
        let mut created = Vec::new();

        if auto_split {
            // Split on "## " at line start
            let sections: Vec<&str> = raw.split("\n## ").collect();
            let preamble = sections[0].trim();

            // Extract doc title from H1
            let mut doc_title = base_name.clone();
            let preamble_content = if let Some(rest) = preamble.strip_prefix("# ") {
                if let Some((title, rest)) = rest.split_once('\n') {
                    doc_title = title.trim().to_string();
                    rest.trim()
                } else {
                    doc_title = rest.trim().to_string();
                    ""
                }
            } else {
                preamble
            };

            // Create entities from H2 sections
            for section in &sections[1..] {
                let (name, content) = section
                    .split_once('\n')
                    .map(|(n, c)| (n.trim().to_string(), c.trim().to_string()))
                    .unwrap_or_else(|| (section.trim().to_string(), String::new()));

                let summary = content
                    .split("\n\n")
                    .next()
                    .unwrap_or("")
                    .chars()
                    .take(300)
                    .collect::<String>();

                let eid = new_id();
                conn.execute(
                    "INSERT INTO entities (id, name, entity_type, summary, content, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![eid, name, entity_type, summary, content, ts, ts],
                )?;
                created.push(ImportedEntity {
                    id: eid,
                    name,
                });
            }

            // Preamble as its own entity if substantial
            if preamble_content.len() > 50 {
                let summary = preamble_content
                    .split("\n\n")
                    .next()
                    .unwrap_or("")
                    .chars()
                    .take(300)
                    .collect::<String>();
                let eid = new_id();
                conn.execute(
                    "INSERT INTO entities (id, name, entity_type, summary, content, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![eid, doc_title, entity_type, summary, preamble_content, ts, ts],
                )?;
                created.insert(
                    0,
                    ImportedEntity {
                        id: eid,
                        name: doc_title,
                    },
                );
            }
        } else {
            // Single entity
            let (name, content) = if let Some(rest) = raw.strip_prefix("# ") {
                rest.split_once('\n')
                    .map(|(n, c)| (n.trim().to_string(), c.trim().to_string()))
                    .unwrap_or_else(|| (rest.trim().to_string(), String::new()))
            } else {
                (base_name, raw)
            };

            let summary = content
                .split("\n\n")
                .next()
                .unwrap_or("")
                .chars()
                .take(300)
                .collect::<String>();

            let eid = new_id();
            conn.execute(
                "INSERT INTO entities (id, name, entity_type, summary, content, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![eid, name, entity_type, summary, content, ts, ts],
            )?;
            created.push(ImportedEntity { id: eid, name });
        }

        Ok(ImportResult {
            imported: created.len(),
            entities: created,
        })
    })
    .await?;

    Ok(Json(result))
}

// ===================================================================
// Maps
// ===================================================================

pub async fn list_maps(State(state): State<AppState>) -> Result<Json<Vec<MapListItem>>, AppError> {
    let maps = blocking_db(&state, |conn| {
        let mut stmt =
            conn.prepare("SELECT id, name, width, height, created_at, updated_at FROM maps ORDER BY updated_at DESC")?;
        let rows = stmt
            .query_map([], |row| {
                Ok(MapListItem {
                    id: row.get("id")?,
                    name: row.get("name")?,
                    width: row.get("width")?,
                    height: row.get("height")?,
                    created_at: row.get("created_at")?,
                    updated_at: row.get("updated_at")?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(rows)
    })
    .await?;
    Ok(Json(maps))
}

pub async fn get_map(
    State(state): State<AppState>,
    Path(map_id): Path<String>,
) -> Result<Json<MapRecord>, AppError> {
    let map = blocking_db(&state, move |conn| {
        let row = conn.query_row(
            "SELECT * FROM maps WHERE id = ?1",
            params![map_id],
            |row| {
                let terrain_json: String = row.get("terrain")?;
                let markers_json: String = row.get("markers")?;
                let paths_json: String = row.get("paths")?;
                Ok((
                    row.get::<_, String>("id")?,
                    row.get::<_, String>("name")?,
                    row.get::<_, u32>("width")?,
                    row.get::<_, u32>("height")?,
                    row.get::<_, f64>("hex_size")?,
                    terrain_json,
                    markers_json,
                    paths_json,
                    row.get::<_, String>("created_at")?,
                    row.get::<_, String>("updated_at")?,
                ))
            },
        ).map_err(|_| AppError::NotFound("Map not found".into()))?;

        let terrain: Vec<u8> = serde_json::from_str(&row.5).unwrap_or_default();
        let markers: Vec<MapMarker> = serde_json::from_str(&row.6).unwrap_or_default();
        let paths: Vec<MapPath> = serde_json::from_str(&row.7).unwrap_or_default();

        Ok(MapRecord {
            id: row.0,
            name: row.1,
            width: row.2,
            height: row.3,
            hex_size: row.4,
            terrain,
            markers,
            paths,
            created_at: row.8,
            updated_at: row.9,
        })
    })
    .await?;

    Ok(Json(map))
}

pub async fn create_map(
    State(state): State<AppState>,
    Json(body): Json<MapCreate>,
) -> Result<Json<MapRecord>, AppError> {
    let mid = new_id();
    let ts = now_iso();
    let w = body.width;
    let h = body.height;
    let total = (w as usize) * (h as usize);
    let terrain = vec![0u8; total];
    let terrain_json = serde_json::to_string(&terrain)?;

    let record = blocking_db(&state, move |conn| {
        conn.execute(
            "INSERT INTO maps (id, name, width, height, hex_size, terrain, markers, paths, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, '[]', '[]', ?7, ?8)",
            params![mid, body.name, w, h, body.hex_size, terrain_json, ts, ts],
        )?;

        Ok(MapRecord {
            id: mid,
            name: body.name,
            width: w,
            height: h,
            hex_size: body.hex_size,
            terrain,
            markers: Vec::new(),
            paths: Vec::new(),
            created_at: ts.clone(),
            updated_at: ts,
        })
    })
    .await?;

    Ok(Json(record))
}

pub async fn update_map(
    State(state): State<AppState>,
    Path(map_id): Path<String>,
    Json(body): Json<MapUpdate>,
) -> Result<Json<OkResponse>, AppError> {
    blocking_db(&state, move |conn| {
        let ts = now_iso();
        if let Some(ref name) = body.name {
            conn.execute(
                "UPDATE maps SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![name, ts, map_id],
            )?;
        }
        if let Some(ref terrain) = body.terrain {
            let json = serde_json::to_string(terrain)
                .map_err(|e| AppError::Internal(e.to_string()))?;
            conn.execute(
                "UPDATE maps SET terrain = ?1, updated_at = ?2 WHERE id = ?3",
                params![json, ts, map_id],
            )?;
        }
        if let Some(ref markers) = body.markers {
            let json = serde_json::to_string(markers)
                .map_err(|e| AppError::Internal(e.to_string()))?;
            conn.execute(
                "UPDATE maps SET markers = ?1, updated_at = ?2 WHERE id = ?3",
                params![json, ts, map_id],
            )?;
        }
        if let Some(ref paths) = body.paths {
            let json = serde_json::to_string(paths)
                .map_err(|e| AppError::Internal(e.to_string()))?;
            conn.execute(
                "UPDATE maps SET paths = ?1, updated_at = ?2 WHERE id = ?3",
                params![json, ts, map_id],
            )?;
        }
        Ok(OkResponse { ok: true })
    })
    .await
    .map(Json)
}

pub async fn delete_map(
    State(state): State<AppState>,
    Path(map_id): Path<String>,
) -> Result<Json<OkResponse>, AppError> {
    blocking_db(&state, move |conn| {
        conn.execute("DELETE FROM maps WHERE id = ?1", params![map_id])?;
        Ok(OkResponse { ok: true })
    })
    .await
    .map(Json)
}
