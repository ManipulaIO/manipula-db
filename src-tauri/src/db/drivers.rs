use sqlx::{AnyPool, any::AnyPoolOptions};
use crate::models::config::DbConnectionConfig;

pub fn build_connection_url(config: &DbConnectionConfig, password: &str) -> String {
    match config.driver.as_str() {
        "postgres" => {
            let host = config.host.as_deref().unwrap_or("localhost");
            let port = config.port.unwrap_or(5432);
            let database = config.database.as_deref().unwrap_or("postgres");
            let username = config.username.as_deref().unwrap_or("postgres");
            // URL-encode the password to handle special characters
            let encoded_password = urlencoding::encode(password);
            format!(
                "postgres://{}:{}@{}:{}/{}",
                username, encoded_password, host, port, database
            )
        }
        "mysql" => {
            let host = config.host.as_deref().unwrap_or("localhost");
            let port = config.port.unwrap_or(3306);
            let database = config.database.as_deref().unwrap_or("");
            let username = config.username.as_deref().unwrap_or("root");
            let encoded_password = urlencoding::encode(password);
            format!(
                "mysql://{}:{}@{}:{}/{}",
                username, encoded_password, host, port, database
            )
        }
        "sqlite" => {
            let database = config.database.as_deref().unwrap_or("");
            format!("sqlite://{}", database)
        }
        _ => String::new(),
    }
}

pub async fn create_pool(url: &str) -> Result<AnyPool, sqlx::Error> {
    AnyPoolOptions::new()
        .max_connections(5)
        .connect(url)
        .await
}
