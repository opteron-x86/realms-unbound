mod db;
mod error;
mod handlers;
mod models;

use std::path::PathBuf;

use axum::routing::{delete, get, post, put};
use axum::Router;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

use handlers::AppState;

#[tokio::main]
async fn main() {
    let data_dir = PathBuf::from(
        std::env::var("TAMERA_DATA_DIR").unwrap_or_else(|_| {
            let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("data");
            dir.to_string_lossy().into_owned()
        }),
    );
    std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");

    let db_path = data_dir.join("tamera.db");
    let config_path = data_dir.join("config.json");

    // Initialize database
    db::init_db(&db_path).expect("Failed to initialize database");

    let state = AppState {
        db_path,
        config_path,
    };

    // API routes
    let api = Router::new()
        // Entities
        .route("/entities", get(handlers::list_entities))
        .route("/entities", post(handlers::create_entity))
        .route("/entities/:entity_id", get(handlers::get_entity))
        .route("/entities/:entity_id", put(handlers::update_entity))
        .route("/entities/:entity_id", delete(handlers::delete_entity))
        // Tags
        .route("/tags", get(handlers::list_tags))
        .route("/tags", post(handlers::create_tag))
        .route("/tags/:tag_id", put(handlers::update_tag))
        .route("/tags/:tag_id", delete(handlers::delete_tag))
        // Relationships
        .route("/relationships", get(handlers::list_relationships))
        .route("/relationships", post(handlers::create_relationship))
        .route("/relationships/:rel_id", delete(handlers::delete_relationship))
        // Meta
        .route("/meta/entity-types", get(handlers::get_entity_types))
        .route("/meta/relationship-types", get(handlers::get_relationship_types))
        // Config
        .route("/config", get(handlers::get_config))
        .route("/config", put(handlers::update_config))
        // AI
        .route("/ai/chat", post(handlers::ai_chat))
        .route("/ai/inline", post(handlers::ai_inline))
        // Import
        .route("/import/markdown", post(handlers::import_markdown))
        // Stats
        .route("/stats", get(handlers::get_stats))
        // Maps
        .route("/maps", get(handlers::list_maps))
        .route("/maps", post(handlers::create_map))
        .route("/maps/:map_id", get(handlers::get_map))
        .route("/maps/:map_id", put(handlers::update_map))
        .route("/maps/:map_id", delete(handlers::delete_map));

    // Serve frontend static files if dist directory exists
    let frontend_dist = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("frontend")
        .join("dist");

    let app = if frontend_dist.exists() {
        Router::new()
            .nest("/api", api)
            .fallback_service(ServeDir::new(frontend_dist).append_index_html_on_directories(true))
    } else {
        Router::new().nest("/api", api)
    }
    .layer(CorsLayer::permissive())
    .with_state(state);

    let bind = std::env::var("TAMERA_BIND").unwrap_or_else(|_| "0.0.0.0:8000".into());
    let listener = tokio::net::TcpListener::bind(&bind)
        .await
        .expect("Failed to bind");

    println!("⚒  Tamera Forge backend running on http://{bind}");
    println!("   Data directory: {}", data_dir.display());

    axum::serve(listener, app).await.unwrap();
}
