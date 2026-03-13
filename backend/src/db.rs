use std::path::Path;

use rusqlite::{params, Connection, Result as SqlResult, Row};

use crate::error::AppError;
use crate::models::*;

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

pub fn init_db(path: &Path) -> Result<(), AppError> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS entities (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            entity_type TEXT NOT NULL DEFAULT 'concept',
            summary TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tags (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            color TEXT NOT NULL DEFAULT '#c4a35a'
        );

        CREATE TABLE IF NOT EXISTS entity_tags (
            entity_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
            tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (entity_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS relationships (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
            target_id TEXT NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
            rel_type TEXT NOT NULL DEFAULT 'related_to',
            description TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
        CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
        CREATE INDEX IF NOT EXISTS idx_rel_source ON relationships(source_id);
        CREATE INDEX IF NOT EXISTS idx_rel_target ON relationships(target_id);

        CREATE TABLE IF NOT EXISTS maps (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            width INTEGER NOT NULL DEFAULT 120,
            height INTEGER NOT NULL DEFAULT 80,
            hex_size REAL NOT NULL DEFAULT 12.0,
            terrain TEXT NOT NULL DEFAULT '[]',
            markers TEXT NOT NULL DEFAULT '[]',
            paths TEXT NOT NULL DEFAULT '[]',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        ",
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Connection helper — opens a connection with foreign keys enabled
// ---------------------------------------------------------------------------

pub fn open(path: &Path) -> Result<Connection, AppError> {
    let conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;
    Ok(conn)
}

// ---------------------------------------------------------------------------
// Row extraction helpers
// ---------------------------------------------------------------------------

pub fn row_to_entity(row: &Row<'_>) -> SqlResult<Entity> {
    Ok(Entity {
        id: row.get("id")?,
        name: row.get("name")?,
        entity_type: row.get("entity_type")?,
        summary: row.get("summary")?,
        content: row.get("content")?,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        tags: Vec::new(),
        relationships: Vec::new(),
    })
}

pub fn row_to_tag(row: &Row<'_>) -> SqlResult<Tag> {
    Ok(Tag {
        id: row.get("id")?,
        name: row.get("name")?,
        color: row.get("color")?,
        count: 0,
    })
}

pub fn row_to_relationship(row: &Row<'_>) -> SqlResult<RelationshipRow> {
    Ok(RelationshipRow {
        id: row.get("id")?,
        source_id: row.get("source_id")?,
        target_id: row.get("target_id")?,
        rel_type: row.get("rel_type")?,
        description: row.get("description")?,
        created_at: row.get("created_at")?,
        source_name: row.get("source_name").ok(),
        source_type: row.get("source_type").ok(),
        target_name: row.get("target_name").ok(),
        target_type: row.get("target_type").ok(),
    })
}

// ---------------------------------------------------------------------------
// Attach tags to an entity
// ---------------------------------------------------------------------------

pub fn attach_tags(conn: &Connection, entity_id: &str) -> Result<Vec<Tag>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT t.id, t.name, t.color FROM tags t
         JOIN entity_tags et ON et.tag_id = t.id
         WHERE et.entity_id = ?1",
    )?;
    let tags = stmt
        .query_map(params![entity_id], row_to_tag)?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(tags)
}

// ---------------------------------------------------------------------------
// Attach relationships to an entity
// ---------------------------------------------------------------------------

pub fn attach_relationships(
    conn: &Connection,
    entity_id: &str,
) -> Result<Vec<RelationshipRow>, AppError> {
    let mut stmt = conn.prepare(
        "SELECT r.id, r.source_id, r.target_id, r.rel_type, r.description, r.created_at,
                se.name as source_name, se.entity_type as source_type,
                te.name as target_name, te.entity_type as target_type
         FROM relationships r
         JOIN entities se ON se.id = r.source_id
         JOIN entities te ON te.id = r.target_id
         WHERE r.source_id = ?1 OR r.target_id = ?1",
    )?;
    let rels = stmt
        .query_map(params![entity_id], row_to_relationship)?
        .collect::<SqlResult<Vec<_>>>()?;
    Ok(rels)
}

// ---------------------------------------------------------------------------
// Full entity fetch with tags and relationships
// ---------------------------------------------------------------------------

pub fn get_full_entity(conn: &Connection, entity_id: &str) -> Result<Option<Entity>, AppError> {
    let mut stmt = conn.prepare("SELECT * FROM entities WHERE id = ?1")?;
    let mut rows = stmt.query_map(params![entity_id], row_to_entity)?;

    match rows.next() {
        Some(Ok(mut entity)) => {
            entity.tags = attach_tags(conn, entity_id)?;
            entity.relationships = attach_relationships(conn, entity_id)?;
            Ok(Some(entity))
        }
        Some(Err(e)) => Err(e.into()),
        None => Ok(None),
    }
}
