use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub const TABLES: [&str; 7] = [
    "Library",
    "Attachments",
    "Collections",
    "Notes",
    "Changes",
    "LocalSettings",
    "Files",
];

/// Armazenamento local em JSON. Substitui o IndexedDB/Dexie do Electron para
/// que a biblioteca inteira viva na pasta escolhida pelo usuário, sem depender
/// do armazenamento interno do WebView (que muda entre macOS e Windows).
pub struct Store {
    file: PathBuf,
    tables: Map<String, Value>,
}

fn text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        Some(Value::Bool(b)) => Some(b.to_string()),
        _ => None,
    }
}

fn field(row: &Value, key: &str) -> Option<String> {
    text(row.get(key))
}

fn id_of(row: &Value) -> Option<String> {
    field(row, "_id").filter(|s| !s.is_empty())
}

fn as_object(value: &Value) -> Result<&Map<String, Value>, String> {
    value.as_object().ok_or_else(|| "valor inválido".to_string())
}

impl Store {
    pub fn open(dir: &Path) -> Result<Self, String> {
        let file = dir.join("library.json");
        let mut tables = Map::new();
        for name in TABLES {
            tables.insert(name.to_string(), json!([]));
        }
        if file.exists() {
            let raw = fs::read(&file).map_err(|e| format!("Falha ao ler a biblioteca: {e}"))?;
            let value: Value = serde_json::from_slice(&raw)
                .map_err(|e| format!("Arquivo da biblioteca inválido: {e}"))?;
            let source = value.get("tables").cloned().unwrap_or(value);
            if let Some(object) = source.as_object() {
                for (key, rows) in object {
                    if let Some(list) = rows.as_array() {
                        tables.insert(key.clone(), Value::Array(list.clone()));
                    }
                }
            }
        }
        Ok(Self { file, tables })
    }

    fn save(&self) -> Result<(), String> {
        let payload = json!({ "version": 1, "tables": Value::Object(self.tables.clone()) });
        let bytes = serde_json::to_vec_pretty(&payload).map_err(|e| e.to_string())?;
        let tmp = self.file.with_extension("json.tmp");
        fs::write(&tmp, bytes).map_err(|e| format!("Falha ao gravar a biblioteca: {e}"))?;
        fs::rename(&tmp, &self.file).map_err(|e| format!("Falha ao gravar a biblioteca: {e}"))?;
        Ok(())
    }

    fn rows(&self, table: &str) -> Result<&Vec<Value>, String> {
        self.tables
            .get(table)
            .and_then(Value::as_array)
            .ok_or_else(|| format!("Tabela desconhecida: {table}"))
    }

    fn rows_mut(&mut self, table: &str) -> Result<&mut Vec<Value>, String> {
        self.tables
            .get_mut(table)
            .and_then(Value::as_array_mut)
            .ok_or_else(|| format!("Tabela desconhecida: {table}"))
    }

    fn find(&self, table: &str, id: &str) -> Result<Option<Value>, String> {
        Ok(self
            .rows(table)?
            .iter()
            .find(|row| id_of(row).as_deref() == Some(id))
            .cloned())
    }

    fn put(&mut self, table: &str, row: Value) -> Result<(), String> {
        let id = id_of(&row).ok_or_else(|| "Registro sem _id".to_string())?;
        {
            let rows = self.rows_mut(table)?;
            if let Some(slot) = rows
                .iter_mut()
                .find(|item| id_of(item).as_deref() == Some(id.as_str()))
            {
                *slot = row;
            } else {
                rows.push(row);
            }
        }
        self.save()
    }

    fn remove(&mut self, table: &str, id: &str) -> Result<bool, String> {
        let removed = {
            let rows = self.rows_mut(table)?;
            let before = rows.len();
            rows.retain(|row| id_of(row).as_deref() != Some(id));
            rows.len() != before
        };
        self.save()?;
        Ok(removed)
    }

    fn record(&mut self, collection: &str, action: &str, id: &str, data: Option<Value>) -> Result<Value, String> {
        let mut entry = Map::new();
        entry.insert("_id".into(), json!(Uuid::new_v4().to_string()));
        entry.insert("mcollection".into(), json!(collection));
        entry.insert("action".into(), json!(action));
        entry.insert("id".into(), json!(id));
        entry.insert(
            "timestamp".into(),
            json!(chrono::Utc::now().timestamp_millis()),
        );
        if let Some(data) = data {
            entry.insert("data".into(), data);
        }
        let value = Value::Object(entry);
        self.rows_mut("Changes")?.push(value.clone());
        self.save()?;
        Ok(value)
    }

    pub fn export(&self) -> Value {
        Value::Object(self.tables.clone())
    }

    pub fn import(&mut self, data: &Value) -> Result<(), String> {
        if let Some(object) = data.as_object() {
            for name in TABLES {
                if let Some(rows) = object.get(name).and_then(Value::as_array) {
                    self.tables.insert(name.to_string(), Value::Array(rows.clone()));
                }
            }
        }
        self.save()
    }

    pub fn all_published(&self) -> Vec<Value> {
        self.rows("Library")
            .map(|rows| {
                rows.iter()
                    .filter(|row| row.get("trashed").and_then(Value::as_bool) != Some(true))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn handle(&mut self, method: &str, args: &Value) -> Result<Value, String> {
        match method {
            "library:put" => {
                let mut row = args.clone();
                if !row.is_object() {
                    return Err("referência inválida".to_string());
                }
                let id = id_of(&row).unwrap_or_else(|| Uuid::new_v4().to_string());
                if let Some(object) = row.as_object_mut() {
                    object.insert("_id".into(), json!(&id));
                }
                let existed = self.find("Library", &id)?.is_some();
                self.put("Library", row.clone())?;
                self.record(
                    "Library",
                    if existed { "update" } else { "insert" },
                    &id,
                    Some(row.clone()),
                )?;
                Ok(row)
            }
            "library:get" => {
                let id = args.as_str().ok_or_else(|| "id inválido".to_string())?;
                Ok(self.find("Library", id)?.unwrap_or(Value::Null))
            }
            "library:count" => Ok(json!(self.rows("Library")?.len())),
            "library:all" => Ok(Value::Array(self.rows("Library")?.clone())),
            "library:delete" => {
                let id = args.as_str().ok_or_else(|| "id inválido".to_string())?;
                self.remove("Library", id)?;
                self.record("Library", "remove", id, None)?;
                Ok(json!({ "ok": true }))
            }
            "change:record" => {
                let object = as_object(args)?;
                let collection = field(args, "mcollection").ok_or_else(|| "coleção inválida".to_string())?;
                let action = field(args, "action").unwrap_or_else(|| "update".into());
                let id = match object.get("id") {
                    Some(Value::Array(ids)) => ids
                        .iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join(","),
                    _ => field(args, "id").unwrap_or_default(),
                };
                let data = object.get("data").cloned();
                self.record(&collection, &action, &id, data)
            }
            "changes:count" => Ok(json!(self.rows("Changes")?.len())),
            "changes:all" => {
                let mut rows = self.rows("Changes")?.clone();
                rows.sort_by(|a, b| {
                    let ta = a.get("timestamp").and_then(Value::as_i64).unwrap_or(0);
                    let tb = b.get("timestamp").and_then(Value::as_i64).unwrap_or(0);
                    ta.cmp(&tb)
                });
                Ok(Value::Array(rows))
            }
            "changes:clear" => {
                self.rows_mut("Changes")?.clear();
                self.save()?;
                Ok(json!({ "ok": true }))
            }
            "changes:apply" => {
                let changes = args.as_array().cloned().unwrap_or_default();
                self.apply_changes(&changes)?;
                self.save()?;
                Ok(json!({ "ok": true }))
            }
            "duplicates:find" => {
                let groups = self.duplicate_groups()?;
                Ok(Value::Array(
                    groups
                        .into_iter()
                        .filter(|group| group.len() > 1)
                        .map(Value::Array)
                        .collect(),
                ))
            }
            "duplicates:mergeAll" => {
                let groups = self.duplicate_groups()?;
                let mut merged = 0;
                let mut group_count = 0;
                for group in groups.into_iter().filter(|group| group.len() > 1) {
                    group_count += 1;
                    let mut keep = group[0].clone();
                    for other in &group[1..] {
                        for key in ["journal", "year", "doi", "url", "abstract", "publisher"] {
                            let empty = keep.get(key).map(|v| v.is_null()).unwrap_or(true);
                            if empty {
                                if let Some(value) = other.get(key).cloned() {
                                    if !value.is_null() {
                                        if let Some(object) = keep.as_object_mut() {
                                            object.insert(key.to_string(), value);
                                        }
                                    }
                                }
                            }
                        }
                        let mut folders: Vec<Value> = keep
                            .get("folders")
                            .and_then(Value::as_array)
                            .cloned()
                            .unwrap_or_default();
                        if let Some(list) = other.get("folders").and_then(Value::as_array) {
                            for item in list {
                                if !folders.contains(item) {
                                    folders.push(item.clone());
                                }
                            }
                        }
                        if let Some(object) = keep.as_object_mut() {
                            object.insert("folders".into(), Value::Array(folders));
                        }
                    }
                    let keep_id = id_of(&keep).unwrap_or_default();
                    self.put("Library", keep.clone())?;
                    self.record("Library", "update", &keep_id, Some(keep))?;
                    for other in &group[1..] {
                        if let Some(id) = id_of(other) {
                            self.remove("Library", &id)?;
                            self.record("Library", "remove", &id, None)?;
                            merged += 1;
                        }
                    }
                }
                Ok(json!({ "merged": merged, "groupCount": group_count }))
            }
            "notes:add" => {
                let mut row = args.clone();
                if !row.is_object() {
                    return Err("nota inválida".to_string());
                }
                let id = field(args, "_id")
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| Uuid::new_v4().to_string());
                if let Some(object) = row.as_object_mut() {
                    object.insert("_id".into(), json!(&id));
                }
                self.put("Notes", row.clone())?;
                self.record("Notes", "insert", &id, Some(row.clone()))?;
                Ok(row)
            }
            "notes:update" => {
                let id = field(args, "_id").ok_or_else(|| "nota inválida".to_string())?;
                let existing = self
                    .find("Notes", &id)?
                    .ok_or_else(|| "Note not found".to_string())?;
                let updated = merge_objects(&existing, args);
                self.put("Notes", updated.clone())?;
                self.record("Notes", "update", &id, Some(updated.clone()))?;
                Ok(updated)
            }
            "notes:list" => {
                let id = args.as_str().unwrap_or_default().to_string();
                Ok(Value::Array(
                    self.rows("Notes")?
                        .iter()
                        .filter(|row| field(row, "attachment_id").as_deref() == Some(id.as_str()))
                        .cloned()
                        .collect(),
                ))
            }
            "notes:all" => Ok(Value::Array(self.rows("Notes")?.clone())),
            "notes:delete" => {
                let id = args.as_str().ok_or_else(|| "id inválido".to_string())?;
                self.remove("Notes", id)?;
                self.record("Notes", "remove", id, None)?;
                Ok(json!({ "ok": true }))
            }
            "collections:all" => Ok(Value::Array(self.rows("Collections")?.clone())),
            "collections:save" => {
                let mut row = args.clone();
                if !row.is_object() {
                    return Err("coleção inválida".to_string());
                }
                let id = field(args, "_id")
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| Uuid::new_v4().to_string());
                if let Some(object) = row.as_object_mut() {
                    object.insert("_id".into(), json!(&id));
                }
                let existed = self.find("Collections", &id)?.is_some();
                self.put("Collections", row.clone())?;
                self.record(
                    "Collections",
                    if existed { "update" } else { "insert" },
                    &id,
                    Some(row.clone()),
                )?;
                Ok(row)
            }
            "collections:delete" => {
                let id = args.as_str().ok_or_else(|| "id inválido".to_string())?;
                self.remove("Collections", id)?;
                self.record("Collections", "remove", id, None)?;
                Ok(json!({ "ok": true }))
            }
            "attachments:add" => {
                let mut row = args.clone();
                if !row.is_object() {
                    return Err("anexo inválido".to_string());
                }
                let id = field(args, "_id")
                    .filter(|s| !s.is_empty())
                    .unwrap_or_else(|| Uuid::new_v4().to_string());
                if let Some(object) = row.as_object_mut() {
                    object.insert("_id".into(), json!(&id));
                    if object.get("created_at").is_none() {
                        object.insert(
                            "created_at".into(),
                            json!(chrono::Utc::now().timestamp_millis()),
                        );
                    }
                }
                self.put("Attachments", row.clone())?;
                self.record("Attachments", "insert", &id, Some(row.clone()))?;
                Ok(row)
            }
            "attachments:all" => Ok(Value::Array(self.rows("Attachments")?.clone())),
            "attachments:forPub" => {
                let id = args.as_str().unwrap_or_default().to_string();
                Ok(Value::Array(
                    self.rows("Attachments")?
                        .iter()
                        .filter(|row| field(row, "pub_id").as_deref() == Some(id.as_str()))
                        .cloned()
                        .collect(),
                ))
            }
            "attachments:update" => {
                let id = field(args, "_id").ok_or_else(|| "anexo inválido".to_string())?;
                let existing = self
                    .find("Attachments", &id)?
                    .ok_or_else(|| "Attachment not found".to_string())?;
                let updated = merge_objects(&existing, args);
                self.put("Attachments", updated.clone())?;
                self.record("Attachments", "update", &id, Some(updated.clone()))?;
                Ok(updated)
            }
            "attachments:delete" => {
                let id = args.as_str().ok_or_else(|| "id inválido".to_string())?;
                self.remove("Attachments", id)?;
                self.record("Attachments", "remove", id, None)?;
                Ok(json!({ "ok": true }))
            }
            "attachments:rebasePaths" => {
                let from = field(args, "from").unwrap_or_default();
                let to = field(args, "to").unwrap_or_default();
                if from.is_empty() || to.is_empty() {
                    return Ok(json!(0));
                }
                let mut updated = 0;
                for row in self.rows_mut("Attachments")?.iter_mut() {
                    if let Some(path) = field(row, "path") {
                        if path.starts_with(&from) {
                            let next = format!("{to}{}", &path[from.len()..]);
                            if let Some(object) = row.as_object_mut() {
                                object.insert("path".into(), json!(next));
                                updated += 1;
                            }
                        }
                    }
                }
                if updated > 0 {
                    self.save()?;
                }
                Ok(json!(updated))
            }
            "settings:get" => Ok(self.find("LocalSettings", "main")?.unwrap_or_else(|| json!({}))),
            "settings:set" => {
                let mut row = merge_objects(&json!({ "_id": "main" }), args);
                if let Some(object) = row.as_object_mut() {
                    object.insert("_id".into(), json!("main"));
                }
                self.put("LocalSettings", row)?;
                Ok(json!({ "ok": true }))
            }
            "db:delete" => {
                for name in TABLES {
                    self.rows_mut(name)?.clear();
                }
                self.save()?;
                Ok(json!({ "ok": true }))
            }
            "db:export" => Ok(self.export()),
            "db:import" => {
                self.import(args)?;
                Ok(json!({ "ok": true }))
            }
            other => Err(format!("Unknown method: {other}")),
        }
    }

    fn duplicate_groups(&self) -> Result<Vec<Vec<Value>>, String> {
        let mut order: Vec<String> = Vec::new();
        let mut groups: HashMap<String, Vec<Value>> = HashMap::new();
        for row in self.rows("Library")? {
            let key = field(row, "doi")
                .or_else(|| field(row, "title"))
                .unwrap_or_default()
                .to_lowercase()
                .split_whitespace()
                .collect::<Vec<_>>()
                .join(" ");
            if key.is_empty() {
                continue;
            }
            if !groups.contains_key(&key) {
                order.push(key.clone());
            }
            groups.entry(key).or_default().push(row.clone());
        }
        Ok(order
            .into_iter()
            .filter_map(|key| groups.remove(&key))
            .collect())
    }

    fn apply_changes(&mut self, changes: &[Value]) -> Result<(), String> {
        for change in changes {
            let collection = field(change, "mcollection").unwrap_or_default();
            let action = field(change, "action").unwrap_or_default();
            let ids: Vec<String> = match change.get("id") {
                Some(Value::Array(list)) => list
                    .iter()
                    .filter_map(|value| value.as_str().map(str::to_string))
                    .collect(),
                Some(Value::String(id)) => vec![id.clone()],
                _ => Vec::new(),
            };
            if !TABLES.contains(&collection.as_str()) {
                continue;
            }
            for id in ids {
                match action.as_str() {
                    "insert" => {
                        if let Some(data) = change.get("data") {
                            let mut row = data.clone();
                            if let Some(object) = row.as_object_mut() {
                                object.insert("_id".into(), json!(&id));
                            }
                            self.put(&collection, row)?;
                        }
                    }
                    "update" => {
                        if let Some(data) = change.get("data") {
                            let mut data = data.clone();
                            if collection == "Notes" {
                                let local = self.find("Notes", &id)?;
                                if let Some(local_text) =
                                    local.as_ref().and_then(|row| field(row, "text"))
                                {
                                    let remote_text = field(&data, "text").unwrap_or_default();
                                    if !local_text.is_empty()
                                        && local_text != remote_text
                                        && !local_text.contains("[merged]")
                                    {
                                        if let Some(object) = data.as_object_mut() {
                                            object.insert(
                                                "text".into(),
                                                json!(format!("{local_text}\n\n[merged] {remote_text}")),
                                            );
                                            object.insert("merged".into(), json!(true));
                                        }
                                    }
                                }
                            }
                            if let Some(existing) = self.find(&collection, &id)? {
                                let updated = merge_objects(&existing, &data);
                                self.put(&collection, updated)?;
                            }
                        }
                    }
                    "remove" => {
                        self.remove(&collection, &id)?;
                    }
                    _ => {}
                }
            }
        }
        Ok(())
    }
}

pub fn merge_objects(base: &Value, patch: &Value) -> Value {
    let mut out = base.as_object().cloned().unwrap_or_default();
    if let Some(object) = patch.as_object() {
        for (key, value) in object {
            if value.is_null() {
                out.remove(key);
            } else {
                out.insert(key.clone(), value.clone());
            }
        }
    }
    Value::Object(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_store(name: &str) -> (Store, PathBuf) {
        let dir = std::env::temp_dir().join(format!("cite-test-{name}-{}", Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        let store = Store::open(&dir).unwrap();
        (store, dir)
    }

    #[test]
    fn puts_and_persists() {
        let (mut store, dir) = temp_store("put");
        store
            .handle("library:put", &json!({ "_id": "p1", "title": "Paper" }))
            .unwrap();
        assert_eq!(
            store.handle("library:get", &json!("p1")).unwrap()["title"],
            "Paper"
        );
        assert_eq!(store.handle("changes:count", &json!(null)).unwrap(), 1);
        drop(store);
        let reopened = Store::open(&dir).unwrap();
        assert_eq!(reopened.export()["Library"].as_array().unwrap().len(), 1);
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn merges_duplicates() {
        let (mut store, dir) = temp_store("dup");
        for (id, title) in [("a", "Same"), ("b", "same")] {
            store
                .handle("library:put", &json!({ "_id": id, "title": title, "doi": "10.1/x" }))
                .unwrap();
        }
        let result = store
            .handle("duplicates:mergeAll", &json!(null))
            .unwrap();
        assert_eq!(result["merged"], 1);
        assert_eq!(
            store.handle("library:all", &json!(null)).unwrap()[0]["folders"],
            json!([])
        );
        fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn applies_note_changes_with_merge() {
        let (mut store, dir) = temp_store("notes");
        store
            .handle("notes:add", &json!({ "_id": "n1", "text": "local", "attachment_id": "a1" }))
            .unwrap();
        store
            .handle(
                "changes:apply",
                &json!([
                    { "mcollection": "Notes", "action": "update", "id": "n1", "data": { "text": "remote" } }
                ]),
            )
            .unwrap();
        let notes = store.handle("notes:all", &json!(null)).unwrap();
        assert!(notes[0]["text"].as_str().unwrap().contains("[merged] remote"));
        fs::remove_dir_all(dir).unwrap();
    }
}
