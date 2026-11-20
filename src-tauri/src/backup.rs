use crate::attachments;
use crate::state::Runtime;
use base64::Engine;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde_json::{json, Value};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use tauri_plugin_dialog::DialogExt;

fn default_name() -> String {
    format!("cite-backup-{}.json.gz", chrono::Utc::now().format("%Y-%m-%d"))
}

fn documents(app: &AppHandle) -> PathBuf {
    app.path()
        .document_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn pick_save(app: &AppHandle, title: &str, name: &str, label: &str, extensions: &[&str]) -> Result<PathBuf, String> {
    let file = app
        .dialog()
        .file()
        .set_title(title)
        .set_directory(documents(app))
        .set_file_name(name)
        .add_filter(label, extensions)
        .blocking_save_file();
    file.and_then(|path| path.into_path().ok())
        .ok_or_else(|| "cancelado".to_string())
}

fn pick_open(app: &AppHandle, title: &str, label: &str, extensions: &[&str]) -> Result<PathBuf, String> {
    let file = app
        .dialog()
        .file()
        .set_title(title)
        .add_filter(label, extensions)
        .blocking_pick_file();
    file.and_then(|path| path.into_path().ok())
        .ok_or_else(|| "cancelado".to_string())
}

pub fn create(app: &AppHandle, runtime: &Runtime, target: Option<String>) -> Result<Value, String> {
    let path = match target {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => match std::env::var("CITE_BACKUP_PATH") {
            Ok(path) if !path.trim().is_empty() => PathBuf::from(path),
            _ => match pick_save(
                app,
                "Fazer backup da biblioteca",
                &default_name(),
                "Backup do Cite",
                &["gz"],
            ) {
                Ok(path) => path,
                Err(_) => return Ok(json!({ "canceled": true })),
            },
        },
    };

    let data = {
        let store = runtime.store_arc()?;
        let guard = store.lock().map_err(|_| "Biblioteca bloqueada".to_string())?;
        guard.export()
    };
    let folder = attachments::dir(&runtime.library_dir);
    let mut files = serde_json::Map::new();
    if let Ok(entries) = fs::read_dir(&folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Ok(bytes) = fs::read(&path) {
                    let name = entry.file_name().to_string_lossy().to_string();
                    files.insert(
                        name,
                        json!(base64::engine::general_purpose::STANDARD.encode(bytes)),
                    );
                }
            }
        }
    }
    let references = data
        .get("Library")
        .and_then(Value::as_array)
        .map(|rows| rows.len())
        .unwrap_or(0);
    let payload = json!({
        "version": 1,
        "createdAt": chrono::Utc::now().to_rfc3339(),
        "data": data,
        "attachments": files
    });
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let bytes = serde_json::to_vec(&payload).map_err(|e| e.to_string())?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder.write_all(&bytes).map_err(|e| e.to_string())?;
    let compressed = encoder.finish().map_err(|e| e.to_string())?;
    fs::write(&path, compressed).map_err(|e| format!("Falha ao gravar o backup: {e}"))?;
    Ok(json!({
        "ok": true,
        "path": path.to_string_lossy(),
        "references": references,
        "attachments": files.len()
    }))
}

pub fn restore(app: &AppHandle, runtime: &Runtime, source: Option<String>) -> Result<Value, String> {
    let path = match source {
        Some(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => match std::env::var("CITE_RESTORE_PATH") {
            Ok(path) if !path.trim().is_empty() => PathBuf::from(path),
            _ => match pick_open(
                app,
                "Restaurar biblioteca do Cite",
                "Backup do Cite",
                &["gz", "json"],
            ) {
                Ok(path) => path,
                Err(_) => return Ok(json!({ "canceled": true })),
            },
        },
    };
    let raw = fs::read(&path).map_err(|e| format!("Falha ao ler o backup: {e}"))?;
    let decoded = if path.to_string_lossy().ends_with(".gz") {
        let mut decoder = GzDecoder::new(&raw[..]);
        let mut out = Vec::new();
        decoder
            .read_to_end(&mut out)
            .map_err(|e| format!("Backup inválido: {e}"))?;
        out
    } else {
        raw
    };
    let payload: Value =
        serde_json::from_slice(&decoded).map_err(|e| format!("Backup inválido: {e}"))?;
    let data = payload
        .get("data")
        .cloned()
        .ok_or_else(|| "Arquivo de backup inválido".to_string())?;

    let folder = attachments::dir(&runtime.library_dir);
    if let Ok(entries) = fs::read_dir(&folder) {
        for entry in entries.flatten() {
            let _ = fs::remove_file(entry.path());
        }
    }
    let files = payload
        .get("attachments")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    for (name, value) in &files {
        if let Some(encoded) = value.as_str() {
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) {
                let safe = attachments::safe_name(name);
                let _ = fs::write(folder.join(safe), bytes);
            }
        }
    }

    let references = data
        .get("Library")
        .and_then(Value::as_array)
        .map(|rows| rows.len())
        .unwrap_or(0);
    {
        let store = runtime.store_arc()?;
        let mut guard = store.lock().map_err(|_| "Biblioteca bloqueada".to_string())?;
        guard.import(&data)?;
    }
    Ok(json!({
        "ok": true,
        "path": path.to_string_lossy(),
        "references": references,
        "attachments": files.len()
    }))
}

pub fn export_annotations(
    app: &AppHandle,
    default_name: &str,
    content: &str,
) -> Result<Value, String> {
    let path = match std::env::var("CITE_EXPORT_PATH") {
        Ok(path) if !path.trim().is_empty() => PathBuf::from(path),
        _ => match pick_save(
            app,
            "Exportar anotações",
            default_name,
            "Markdown",
            &["md", "txt"],
        ) {
            Ok(path) => path,
            Err(_) => return Ok(json!({ "canceled": true })),
        },
    };
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    fs::write(&path, content).map_err(|e| format!("Falha ao exportar: {e}"))?;
    Ok(json!({ "ok": true, "path": path.to_string_lossy() }))
}

pub fn has_library_data(dir: &Path) -> bool {
    dir.join("library.json").exists() || dir.join("attachments").exists()
}
