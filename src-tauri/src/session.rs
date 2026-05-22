use serde::{Deserialize, Serialize};
use tauri::Manager;

#[derive(Serialize, Deserialize, Default)]
pub struct SessionRecord {
    pub version: u32,
    pub tabs: Vec<SessionTabEntry>,
    pub active_index: Option<usize>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct SessionTabEntry {
    pub path: String,
}

fn empty_session() -> SessionRecord {
    SessionRecord {
        version: 1,
        tabs: Vec::new(),
        active_index: None,
    }
}

#[tauri::command]
pub async fn load_session(app: tauri::AppHandle) -> Result<SessionRecord, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app_data_dir: {err}"))?;
    let path = dir.join("session.json");
    let content = match std::fs::read_to_string(&path) {
        Ok(s) => s,
        Err(_) => return Ok(empty_session()),
    };
    match serde_json::from_str::<SessionRecord>(&content) {
        Ok(record) if record.version == 1 => Ok(record),
        _ => Ok(empty_session()),
    }
}

#[tauri::command]
pub async fn save_session(app: tauri::AppHandle, record: SessionRecord) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("failed to resolve app_data_dir: {err}"))?;
    std::fs::create_dir_all(&dir).map_err(|err| format!("failed to create app_data_dir: {err}"))?;
    let serialized = serde_json::to_string_pretty(&record)
        .map_err(|err| format!("failed to serialize session: {err}"))?;
    let tmp = dir.join("session.json.tmp");
    let final_path = dir.join("session.json");
    std::fs::write(&tmp, serialized)
        .map_err(|err| format!("failed to write session.json.tmp: {err}"))?;
    std::fs::rename(&tmp, &final_path)
        .map_err(|err| format!("failed to rename session.json.tmp: {err}"))?;
    Ok(())
}
