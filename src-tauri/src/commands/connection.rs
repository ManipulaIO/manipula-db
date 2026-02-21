use tauri::{Manager, State};
use crate::db::pool_manager::{AppState, ConnectionEntry};
use crate::db::drivers::{build_connection_url, create_pool};
use crate::models::config::DbConnectionConfig;
use sqlx::postgres::PgPoolOptions;

const KEYRING_SERVICE: &str = "manipuladb";

fn keyring_key(connection_id: &str) -> String {
    format!("connection-{}", connection_id)
}

#[tauri::command]
pub async fn test_connection(
    config: DbConnectionConfig,
    password: String,
) -> Result<(), String> {
    let url = build_connection_url(&config, &password);
    let pool = create_pool(&url).await.map_err(|e| e.to_string())?;
    pool.close().await;
    Ok(())
}

#[tauri::command]
pub async fn connect_db(
    config: DbConnectionConfig,
    password: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let url = build_connection_url(&config, &password);
    let pool = create_pool(&url).await.map_err(|e| e.to_string())?;
    let driver = config.driver.clone();

    let pg_pool = if driver == "postgres" {
        Some(
            PgPoolOptions::new()
                .max_connections(5)
                .connect(&url)
                .await
                .map_err(|e| e.to_string())?,
        )
    } else {
        None
    };

    state.connections.insert(
        config.id.clone(),
        ConnectionEntry { pool, pg_pool, driver },
    );
    Ok(())
}

#[tauri::command]
pub async fn disconnect_db(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    if let Some((_, entry)) = state.connections.remove(&connection_id) {
        entry.pool.close().await;
    }
    Ok(())
}

#[tauri::command]
pub async fn save_connection(
    config: DbConnectionConfig,
    password: String,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Store password in OS keyring
    let entry = keyring::Entry::new(KEYRING_SERVICE, &keyring_key(&config.id))
        .map_err(|e| e.to_string())?;
    entry.set_password(&password).map_err(|e| e.to_string())?;

    // Persist config (sans password) to disk
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    let connections_file = data_dir.join("connections.json");
    let mut connections: Vec<DbConnectionConfig> = if connections_file.exists() {
        let content =
            std::fs::read_to_string(&connections_file).map_err(|e| e.to_string())?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    if let Some(pos) = connections.iter().position(|c| c.id == config.id) {
        connections[pos] = config;
    } else {
        connections.push(config);
    }

    let content =
        serde_json::to_string_pretty(&connections).map_err(|e| e.to_string())?;
    std::fs::write(&connections_file, content).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn load_connections(
    app: tauri::AppHandle,
) -> Result<Vec<DbConnectionConfig>, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let connections_file = data_dir.join("connections.json");

    if !connections_file.exists() {
        return Ok(Vec::new());
    }

    let content =
        std::fs::read_to_string(&connections_file).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_connection(
    connection_id: String,
    app: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Close pool if active
    if let Some((_, entry)) = state.connections.remove(&connection_id) {
        entry.pool.close().await;
    }

    // Delete from keyring
    if let Ok(entry) =
        keyring::Entry::new(KEYRING_SERVICE, &keyring_key(&connection_id))
    {
        let _ = entry.delete_credential();
    }

    // Remove from connections file
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let connections_file = data_dir.join("connections.json");

    if connections_file.exists() {
        let content =
            std::fs::read_to_string(&connections_file).map_err(|e| e.to_string())?;
        let mut connections: Vec<DbConnectionConfig> =
            serde_json::from_str(&content).unwrap_or_default();
        connections.retain(|c| c.id != connection_id);
        let content =
            serde_json::to_string_pretty(&connections).map_err(|e| e.to_string())?;
        std::fs::write(&connections_file, content).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Retrieve the password for a saved connection from the OS keyring.
/// Used by the frontend when reconnecting without re-entering the password.
#[tauri::command]
pub async fn get_connection_password(connection_id: String) -> Result<String, String> {
    let entry = keyring::Entry::new(KEYRING_SERVICE, &keyring_key(&connection_id))
        .map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}
