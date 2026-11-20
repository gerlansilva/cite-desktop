use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};

pub fn dir(library: &Path) -> PathBuf {
    let dir = library.join("attachments");
    if !dir.exists() {
        let _ = fs::create_dir_all(&dir);
    }
    dir
}

pub fn safe_name(name: &str) -> String {
    name.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '_' | '-') {
                ch
            } else {
                '_'
            }
        })
        .collect()
}

pub fn save(library: &Path, name: &str, data: &[u8]) -> Result<Value, String> {
    let folder = dir(library);
    let hash = format!("{:x}", Sha256::digest(data));
    if let Ok(entries) = fs::read_dir(&folder) {
        for entry in entries.flatten() {
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with(&format!("{hash}-")) {
                return Ok(json!({
                    "path": entry.path().to_string_lossy(),
                    "hash": hash,
                    "size": data.len(),
                    "deduped": true
                }));
            }
        }
    }
    let file_name = format!("{hash}-{}", safe_name(if name.is_empty() { "file" } else { name }));
    let path = folder.join(&file_name);
    fs::write(&path, data).map_err(|e| format!("Falha ao salvar o anexo: {e}"))?;
    Ok(json!({
        "path": path.to_string_lossy(),
        "hash": hash,
        "size": data.len(),
        "deduped": false
    }))
}

pub fn list(library: &Path) -> Vec<Value> {
    let folder = dir(library);
    let mut out = Vec::new();
    if let Ok(entries) = fs::read_dir(&folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);
            out.push(json!({
                "name": entry.file_name().to_string_lossy(),
                "path": path.to_string_lossy(),
                "size": size
            }));
        }
    }
    out.sort_by(|a, b| {
        a["name"]
            .as_str()
            .unwrap_or_default()
            .cmp(b["name"].as_str().unwrap_or_default())
    });
    out
}

pub fn cleanup_orphans(library: &Path, keep: &[String], max_age_ms: i64) -> Value {
    let folder = dir(library);
    let cutoff = if max_age_ms > 0 {
        Some(
            std::time::SystemTime::now()
                - std::time::Duration::from_millis(max_age_ms as u64),
        )
    } else {
        None
    };
    let mut removed = 0;
    if let Ok(entries) = fs::read_dir(&folder) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path.to_string_lossy().to_string();
            if keep.iter().any(|item| item == &name) {
                continue;
            }
            if let (Some(cutoff), Ok(meta)) = (cutoff, entry.metadata()) {
                if let Ok(modified) = meta.modified() {
                    if modified > cutoff {
                        continue;
                    }
                }
            }
            if fs::remove_file(&path).is_ok() {
                removed += 1;
            }
        }
    }
    json!({ "removed": removed })
}

pub fn read(path: &str) -> Option<Vec<u8>> {
    fs::read(path).ok()
}

pub fn delete(path: &str) -> bool {
    fs::remove_file(path).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn dedupes_by_content() {
        let dir = std::env::temp_dir().join(format!("cite-att-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let first = save(&dir, "a.pdf", b"%PDF-1").unwrap();
        let second = save(&dir, "b.pdf", b"%PDF-1").unwrap();
        assert_eq!(first["path"], second["path"]);
        assert_eq!(second["deduped"], true);
        fs::remove_dir_all(dir).unwrap();
    }
}
