use serde::{Deserialize, Serialize};

/// Configuration for a database connection.
/// The password is never stored here — it lives in the OS keyring.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct DbConnectionConfig {
    pub id: String,
    pub name: String,
    /// "postgres" | "mysql" | "sqlite"
    pub driver: String,
    pub host: Option<String>,
    pub port: Option<u16>,
    pub database: Option<String>,
    pub username: Option<String>,
}
