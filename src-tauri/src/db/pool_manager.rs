use dashmap::DashMap;
use sqlx::AnyPool;
use sqlx::postgres::PgPool;

pub struct ConnectionEntry {
    pub pool: AnyPool,
    pub pg_pool: Option<PgPool>,
    pub driver: String,
}

pub struct AppState {
    pub connections: DashMap<String, ConnectionEntry>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            connections: DashMap::new(),
        }
    }
}
