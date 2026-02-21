use tauri::State;
use sqlx::{Column, Row, TypeInfo};
use sqlx::any::AnyRow;
use sqlx::postgres::PgRow;
use std::time::Instant;

use crate::db::pool_manager::AppState;
use crate::models::result::{QueryResult, SchemaColumn, SchemaTable};

const MAX_ROWS: usize = 50_000;

fn is_select_like(sql: &str) -> bool {
    let t = sql.trim().to_lowercase();
    t.starts_with("select")
        || t.starts_with("with")
        || t.starts_with("explain")
        || t.starts_with("show")
        || t.starts_with("pragma")
        || t.starts_with("describe")
        || t.starts_with("desc ")
}

// ── Any-driver row decoder (MySQL / SQLite) ──────────────────────────────────

fn any_row_to_json(row: &AnyRow) -> serde_json::Value {
    let columns = row.columns();
    let mut map = serde_json::Map::with_capacity(columns.len());
    for col in columns {
        let idx = col.ordinal();
        let name = col.name().to_string();
        let value = any_extract_value(row, idx);
        map.insert(name, value);
    }
    serde_json::Value::Object(map)
}

fn any_extract_value(row: &AnyRow, idx: usize) -> serde_json::Value {
    if let Ok(v) = row.try_get::<Option<bool>, _>(idx) {
        return v.map(serde_json::Value::Bool).unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v
            .map(|n| serde_json::Value::Number(n.into()))
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v
            .and_then(|n| serde_json::Number::from_f64(n))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v
            .map(serde_json::Value::String)
            .unwrap_or(serde_json::Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|b| serde_json::Value::String(format!("<binary {} bytes>", b.len())))
            .unwrap_or(serde_json::Value::Null);
    }
    serde_json::Value::Null
}

// ── Native Postgres row decoder ───────────────────────────────────────────────

fn pg_row_to_json(row: &PgRow) -> serde_json::Value {
    let columns = row.columns();
    let mut map = serde_json::Map::with_capacity(columns.len());
    for col in columns {
        let idx = col.ordinal();
        let name = col.name().to_string();
        let value = pg_extract_value(row, idx, col.type_info().name());
        map.insert(name, value);
    }
    serde_json::Value::Object(map)
}

fn pg_extract_value(row: &PgRow, idx: usize, type_name: &str) -> serde_json::Value {
    // Check for NULL first using a type we know works
    // We rely on try_get returning Err only for type mismatch, not for NULL
    // (sqlx returns Ok(None) for NULL regardless of type when using Option)

    let tn = type_name.to_ascii_lowercase();

    // Boolean
    if tn == "bool" {
        return row.try_get::<Option<bool>, _>(idx)
            .ok()
            .flatten()
            .map(serde_json::Value::Bool)
            .unwrap_or(serde_json::Value::Null);
    }

    // Integers
    if tn == "int2" {
        return row.try_get::<Option<i16>, _>(idx).ok().flatten()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null);
    }
    if tn == "int4" {
        return row.try_get::<Option<i32>, _>(idx).ok().flatten()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null);
    }
    if tn == "int8" || tn == "oid" {
        return row.try_get::<Option<i64>, _>(idx).ok().flatten()
            .map(|v| serde_json::Value::Number(v.into()))
            .unwrap_or(serde_json::Value::Null);
    }

    // Floats
    if tn == "float4" {
        return row.try_get::<Option<f32>, _>(idx).ok().flatten()
            .and_then(|v| serde_json::Number::from_f64(v as f64))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }
    if tn == "float8" {
        return row.try_get::<Option<f64>, _>(idx).ok().flatten()
            .and_then(|v| serde_json::Number::from_f64(v))
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null);
    }

    // Binary
    if tn == "bytea" {
        return row.try_get::<Option<Vec<u8>>, _>(idx).ok().flatten()
            .map(|b| serde_json::Value::String(format!("<binary {} bytes>", b.len())))
            .unwrap_or(serde_json::Value::Null);
    }

    // JSON / JSONB — decode as raw serde_json::Value
    if tn == "json" || tn == "jsonb" {
        return row.try_get::<Option<serde_json::Value>, _>(idx).ok().flatten()
            .unwrap_or(serde_json::Value::Null);
    }

    // Everything else (text, varchar, uuid, timestamp, date, time, numeric,
    // inet, cidr, interval, xml, arrays, etc.) — decode as String
    row.try_get::<Option<String>, _>(idx).ok().flatten()
        .map(serde_json::Value::String)
        .unwrap_or(serde_json::Value::Null)
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn execute_query(
    connection_id: String,
    sql: String,
    state: State<'_, AppState>,
) -> Result<QueryResult, String> {
    let (pool, pg_pool, driver) = {
        let entry = state
            .connections
            .get(&connection_id)
            .ok_or_else(|| "Connection not found. Please reconnect.".to_string())?;
        (entry.pool.clone(), entry.pg_pool.clone(), entry.driver.clone())
    };

    let start = Instant::now();

    if is_select_like(&sql) {
        // Use native PgPool for Postgres to avoid Any-driver type limitations
        if driver == "postgres" {
            if let Some(pg) = pg_pool {
                return execute_query_postgres(&pg, &sql, start).await;
            }
        }

        let fetch_result = sqlx::query(&sql).fetch_all(&pool).await;
        let rows: Vec<AnyRow> = match fetch_result {
            Ok(rows) => rows,
            Err(e) => {
                let err_str = e.to_string();
                if driver == "mysql" && err_str.contains("Any driver does not support MySql type") {
                    mysql_type_cast_fallback(&pool, &sql)
                        .await
                        .map_err(|_| err_str)?
                } else {
                    return Err(err_str);
                }
            }
        };

        let elapsed = start.elapsed().as_millis() as u64;
        let truncated = rows.len() > MAX_ROWS;
        let rows_to_use = if truncated { &rows[..MAX_ROWS] } else { &rows[..] };

        let columns: Vec<String> = if let Some(first) = rows_to_use.first() {
            first.columns().iter().map(|c| c.name().to_string()).collect()
        } else {
            Vec::new()
        };

        let json_rows: Vec<serde_json::Value> = rows_to_use.iter().map(any_row_to_json).collect();

        Ok(QueryResult {
            columns,
            rows: json_rows,
            rows_affected: None,
            execution_time_ms: elapsed,
            truncated,
        })
    } else {
        // For non-SELECT, use native PgPool too so DDL/DML works correctly
        if driver == "postgres" {
            if let Some(pg) = pg_pool {
                let result = sqlx::query(&sql)
                    .execute(&pg)
                    .await
                    .map_err(|e| e.to_string())?;
                let elapsed = start.elapsed().as_millis() as u64;
                return Ok(QueryResult {
                    columns: Vec::new(),
                    rows: Vec::new(),
                    rows_affected: Some(result.rows_affected()),
                    execution_time_ms: elapsed,
                    truncated: false,
                });
            }
        }

        let result = sqlx::query(&sql)
            .execute(&pool)
            .await
            .map_err(|e| e.to_string())?;

        let elapsed = start.elapsed().as_millis() as u64;

        Ok(QueryResult {
            columns: Vec::new(),
            rows: Vec::new(),
            rows_affected: Some(result.rows_affected()),
            execution_time_ms: elapsed,
            truncated: false,
        })
    }
}

async fn execute_query_postgres(
    pg: &sqlx::postgres::PgPool,
    sql: &str,
    start: Instant,
) -> Result<QueryResult, String> {
    let rows: Vec<PgRow> = sqlx::query(sql)
        .fetch_all(pg)
        .await
        .map_err(|e| e.to_string())?;

    let elapsed = start.elapsed().as_millis() as u64;
    let truncated = rows.len() > MAX_ROWS;
    let rows_to_use = if truncated { &rows[..MAX_ROWS] } else { &rows[..] };

    let columns: Vec<String> = if let Some(first) = rows_to_use.first() {
        first.columns().iter().map(|c| c.name().to_string()).collect()
    } else {
        Vec::new()
    };

    let json_rows: Vec<serde_json::Value> = rows_to_use.iter().map(pg_row_to_json).collect();

    Ok(QueryResult {
        columns,
        rows: json_rows,
        rows_affected: None,
        execution_time_ms: elapsed,
        truncated,
    })
}

#[tauri::command]
pub async fn fetch_schema(
    connection_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<SchemaTable>, String> {
    let (pool, pg_pool, driver) = {
        let entry = state
            .connections
            .get(&connection_id)
            .ok_or_else(|| "Connection not found.".to_string())?;
        (entry.pool.clone(), entry.pg_pool.clone(), entry.driver.clone())
    };

    match driver.as_str() {
        "postgres" => {
            if let Some(pg) = pg_pool {
                fetch_schema_postgres_native(&pg).await
            } else {
                fetch_schema_postgres_any(&pool).await
            }
        }
        "mysql" => fetch_schema_mysql(&pool).await,
        "sqlite" => fetch_schema_sqlite(&pool).await,
        _ => Err(format!("Unsupported driver: {}", driver)),
    }
}

async fn fetch_schema_postgres_native(pg: &sqlx::postgres::PgPool) -> Result<Vec<SchemaTable>, String> {
    let sql = "
        SELECT
            t.table_name,
            t.table_type,
            c.column_name,
            c.data_type,
            c.is_nullable
        FROM information_schema.tables t
        JOIN information_schema.columns c
            ON t.table_name = c.table_name
            AND t.table_schema = c.table_schema
        WHERE t.table_schema = 'public'
        ORDER BY t.table_name, c.ordinal_position
    ";

    let rows: Vec<PgRow> = sqlx::query(sql)
        .fetch_all(pg)
        .await
        .map_err(|e| e.to_string())?;

    let mut tables: Vec<SchemaTable> = Vec::new();
    for row in &rows {
        let table_name: String = row.try_get("table_name").unwrap_or_default();
        let raw_table_type: String = row.try_get("table_type").unwrap_or_default();
        let table_type = if raw_table_type.to_uppercase().contains("VIEW") {
            "view".to_string()
        } else {
            "table".to_string()
        };
        let column_name: String = row.try_get("column_name").unwrap_or_default();
        let data_type: String = row.try_get("data_type").unwrap_or_default();
        let is_nullable_str: String = row.try_get("is_nullable").unwrap_or_default();
        let is_nullable = is_nullable_str.to_uppercase() == "YES";

        let col = SchemaColumn { column_name, data_type, is_nullable };

        if let Some(t) = tables.iter_mut().find(|t| t.table_name == table_name) {
            t.columns.push(col);
        } else {
            tables.push(SchemaTable { table_name, table_type, columns: vec![col] });
        }
    }
    Ok(tables)
}

async fn fetch_schema_postgres_any(pool: &sqlx::AnyPool) -> Result<Vec<SchemaTable>, String> {
    let sql = "
        SELECT
            t.table_name::text,
            t.table_type::text,
            c.column_name::text,
            c.data_type::text,
            c.is_nullable::text
        FROM information_schema.tables t
        JOIN information_schema.columns c
            ON t.table_name = c.table_name
            AND t.table_schema = c.table_schema
        WHERE t.table_schema = 'public'
        ORDER BY t.table_name, c.ordinal_position
    ";

    let rows: Vec<AnyRow> = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(build_schema_from_rows(&rows))
}

async fn fetch_schema_mysql(pool: &sqlx::AnyPool) -> Result<Vec<SchemaTable>, String> {
    let sql = "
        SELECT
            t.table_name,
            t.table_type,
            c.column_name,
            c.data_type,
            c.is_nullable
        FROM information_schema.tables t
        JOIN information_schema.columns c
            ON t.table_name = c.table_name
            AND t.table_schema = c.table_schema
        WHERE t.table_schema = DATABASE()
        ORDER BY t.table_name, c.ordinal_position
    ";

    let rows: Vec<AnyRow> = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(build_schema_from_rows(&rows))
}

fn build_schema_from_rows(rows: &[AnyRow]) -> Vec<SchemaTable> {
    let mut tables: Vec<SchemaTable> = Vec::new();

    for row in rows {
        let table_name: String = row.try_get("table_name").unwrap_or_default();
        let raw_table_type: String = row.try_get("table_type").unwrap_or_default();
        let table_type = if raw_table_type.to_uppercase().contains("VIEW") {
            "view".to_string()
        } else {
            "table".to_string()
        };
        let column_name: String = row.try_get("column_name").unwrap_or_default();
        let data_type: String = row.try_get("data_type").unwrap_or_default();
        let is_nullable_str: String = row.try_get("is_nullable").unwrap_or_default();
        let is_nullable = is_nullable_str.to_uppercase() == "YES";

        let col = SchemaColumn { column_name, data_type, is_nullable };

        if let Some(t) = tables.iter_mut().find(|t| t.table_name == table_name) {
            t.columns.push(col);
        } else {
            tables.push(SchemaTable { table_name, table_type, columns: vec![col] });
        }
    }

    tables
}

/// Extracts the first table name from a SQL statement by locating the FROM clause.
fn extract_first_table_from_sql(sql: &str) -> Option<String> {
    let lower = sql.to_lowercase();
    let from_pos = lower.find(" from ")?;
    let after_from = sql[from_pos + 6..].trim_start();
    let table = if after_from.starts_with('`') {
        let end = after_from[1..].find('`')?;
        after_from[1..end + 1].to_string()
    } else {
        let end = after_from
            .find(|c: char| c.is_whitespace() || c == ',' || c == ';' || c == ')')
            .unwrap_or(after_from.len());
        after_from[..end].to_string()
    };
    if table.is_empty() { None } else { Some(table) }
}

/// Returns the CAST target type for MySQL types not supported by the Any driver, or None if
/// the type passes through fine on its own.
fn mysql_cast_type(data_type: &str) -> Option<&'static str> {
    match data_type.to_ascii_lowercase().as_str() {
        "tinyint" => Some("SIGNED"),
        "bit" | "year" => Some("UNSIGNED"),
        "datetime" | "date" | "time" | "timestamp" => Some("CHAR"),
        "decimal" | "numeric" => Some("CHAR"),
        "json" => Some("CHAR"),
        _ => None,
    }
}

/// Retries a failing MySQL SELECT by casting columns whose types the Any driver can't decode.
async fn mysql_type_cast_fallback(pool: &sqlx::AnyPool, sql: &str) -> Result<Vec<AnyRow>, String> {
    let table_name = extract_first_table_from_sql(sql)
        .ok_or_else(|| "Cannot determine table name for MySQL type-cast fallback".to_string())?;

    let safe_name = table_name.replace('\'', "\\'");
    let meta_sql = format!(
        "SELECT column_name, data_type FROM information_schema.columns \
         WHERE table_schema = DATABASE() AND table_name = '{}' \
         ORDER BY ordinal_position",
        safe_name
    );

    let meta_rows: Vec<AnyRow> = sqlx::query(&meta_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    if meta_rows.is_empty() {
        return Err(format!("No schema found for table '{}'", table_name));
    }

    let select_parts: Vec<String> = meta_rows
        .iter()
        .map(|row| {
            let col_name: String = row.try_get("column_name").unwrap_or_default();
            let data_type: String = row.try_get("data_type").unwrap_or_default();
            if let Some(cast_target) = mysql_cast_type(&data_type) {
                format!("CAST(`{}` AS {}) AS `{}`", col_name, cast_target, col_name)
            } else {
                format!("`{}`", col_name)
            }
        })
        .collect();

    let lower = sql.to_lowercase();
    let from_pos = lower.find(" from ").unwrap();
    let from_clause = &sql[from_pos..];
    let new_sql = format!("SELECT {}{}", select_parts.join(", "), from_clause);

    sqlx::query(&new_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())
}

async fn fetch_schema_sqlite(pool: &sqlx::AnyPool) -> Result<Vec<SchemaTable>, String> {
    let table_rows: Vec<AnyRow> = sqlx::query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut tables: Vec<SchemaTable> = Vec::new();

    for row in &table_rows {
        let table_name: String = row.try_get(0).unwrap_or_default();
        let raw_type: String = row.try_get(1).unwrap_or_default();
        let table_type = if raw_type == "view" {
            "view".to_string()
        } else {
            "table".to_string()
        };

        let pragma_sql = format!("PRAGMA table_info(\"{}\")", table_name);
        let col_rows: Vec<AnyRow> = sqlx::query(&pragma_sql)
            .fetch_all(pool)
            .await
            .unwrap_or_default();

        let columns: Vec<SchemaColumn> = col_rows
            .iter()
            .map(|cr| {
                let col_name: String = cr.try_get("name").unwrap_or_default();
                let col_type: String = cr.try_get("type").unwrap_or_default();
                let not_null: i64 = cr.try_get("notnull").unwrap_or(0);
                SchemaColumn {
                    column_name: col_name,
                    data_type: col_type,
                    is_nullable: not_null == 0,
                }
            })
            .collect();

        tables.push(SchemaTable { table_name, table_type, columns });
    }

    Ok(tables)
}
