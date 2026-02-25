use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct QueryResult {
    pub columns: Vec<String>,
    pub rows: Vec<serde_json::Value>,
    pub rows_affected: Option<u64>,
    pub execution_time_ms: u64,
    pub truncated: bool,
    pub total_rows: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
pub struct SchemaColumn {
    pub column_name: String,
    pub data_type: String,
    pub is_nullable: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct SchemaTable {
    pub table_name: String,
    pub table_type: String,
    pub columns: Vec<SchemaColumn>,
}
