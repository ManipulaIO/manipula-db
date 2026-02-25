mod commands;
mod db;
mod models;

use commands::connection::{
    connect_db, delete_connection, disconnect_db, get_connection_password,
    load_connections, save_connection, test_connection,
};
use commands::query::{execute_query, execute_query_page, fetch_schema};
use db::pool_manager::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Register all sqlx drivers before any pool is created
    sqlx::any::install_default_drivers();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            test_connection,
            connect_db,
            disconnect_db,
            save_connection,
            load_connections,
            delete_connection,
            get_connection_password,
            execute_query,
            execute_query_page,
            fetch_schema,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
