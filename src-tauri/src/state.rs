use crate::store::Store;
use crate::word::Word;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager};

pub const APP_NAME: &str = "Cite";

pub struct SetupIssue {
    pub kind: String,
    pub path: String,
    pub error: String,
}

pub struct Runtime {
    pub config_dir: PathBuf,
    pub library_dir: PathBuf,
    pub store: Option<Arc<Mutex<Store>>>,
    pub issue: Option<SetupIssue>,
    pub language: String,
    pub word: Word,
}

pub struct AppState {
    pub rt: Mutex<Runtime>,
}

impl Runtime {
    pub fn store_arc(&self) -> Result<Arc<Mutex<Store>>, String> {
        self.store
            .clone()
            .ok_or_else(|| "Biblioteca indisponível".to_string())
    }

    pub fn call(&self, method: &str, args: &Value) -> Result<Value, String> {
        let store = self.store_arc()?;
        let mut guard = store.lock().map_err(|_| "Biblioteca bloqueada".to_string())?;
        guard.handle(method, args)
    }

    pub fn storage_config_path(&self) -> PathBuf {
        std::env::var("CITE_STORAGE_CONFIG")
            .map(PathBuf::from)
            .unwrap_or_else(|_| self.config_dir.join("storage.json"))
    }

    pub fn write_storage_config(&self, dir: &Path, rebase_from: Option<&Path>) -> Result<(), String> {
        let path = self.storage_config_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut payload = read_json(&path).unwrap_or_else(|| json!({}));
        if !payload.is_object() {
            payload = json!({});
        }
        if let Some(object) = payload.as_object_mut() {
            object.insert("storageDir".into(), json!(dir.to_string_lossy()));
            match rebase_from {
                Some(from) => {
                    object.insert("rebaseFrom".into(), json!(from.to_string_lossy()));
                }
                None => {
                    object.remove("rebaseFrom");
                }
            }
        }
        fs::write(&path, serde_json::to_vec_pretty(&payload).unwrap_or_default())
            .map_err(|e| e.to_string())
    }

    pub fn read_integrations(&self) -> Value {
        read_json(&self.config_dir.join("integrations.json")).unwrap_or_else(|| json!({}))
    }

    pub fn write_integrations(&self, value: &Value) -> Result<(), String> {
        fs::create_dir_all(&self.config_dir).map_err(|e| e.to_string())?;
        fs::write(
            self.config_dir.join("integrations.json"),
            serde_json::to_vec_pretty(value).unwrap_or_default(),
        )
        .map_err(|e| e.to_string())
    }

    pub fn write_language(&self, language: &str) -> Result<(), String> {
        let next = if language == "tet" { "tet" } else { "pt" };
        let path = self.library_dir.join("settings.json");
        let mut settings = read_json(&path).unwrap_or_else(|| json!({}));
        if let Some(object) = settings.as_object_mut() {
            object.insert("language".into(), json!(next));
        }
        fs::create_dir_all(&self.library_dir).map_err(|e| e.to_string())?;
        fs::write(&path, serde_json::to_vec_pretty(&settings).unwrap_or_default())
            .map_err(|e| e.to_string())
    }
}

pub fn read_json(path: &Path) -> Option<Value> {
    let raw = fs::read(path).ok()?;
    serde_json::from_slice(&raw).ok()
}

pub fn config_root(app: &AppHandle) -> PathBuf {
    app.path()
        .config_dir()
        .map(|dir| dir.join(APP_NAME))
        .unwrap_or_else(|_| PathBuf::from("."))
}

pub fn default_library(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = std::env::var("CITE_DEFAULT_STORAGE_DIR") {
        return PathBuf::from(dir);
    }
    // No macOS, resolver a pasta Documentos dispara o pedido de permissão do sistema.
    // Monta o caminho pelo HOME para não pedir acesso só para exibir o padrão.
    #[cfg(target_os = "macos")]
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join("Documents").join(APP_NAME);
    }
    app.path()
        .document_dir()
        .map(|dir| dir.join(APP_NAME))
        .unwrap_or_else(|_| PathBuf::from("Cite"))
}

pub fn is_writable(dir: &Path) -> bool {
    if fs::create_dir_all(dir).is_err() {
        return false;
    }
    let probe = dir.join(format!(".cite-write-{}", uuid::Uuid::new_v4()));
    match fs::write(&probe, b"ok") {
        Ok(_) => {
            let _ = fs::remove_file(&probe);
            true
        }
        Err(_) => false,
    }
}

fn read_language(library: &Path) -> String {
    let value = read_json(&library.join("settings.json")).unwrap_or_else(|| json!({}));
    match value.get("language").and_then(Value::as_str) {
        Some("tet") => "tet".to_string(),
        _ => "pt".to_string(),
    }
}

pub fn init(app: &AppHandle) -> AppState {
    let config_dir = config_root(app);
    let _ = fs::create_dir_all(&config_dir);

    let config_path = std::env::var("CITE_STORAGE_CONFIG")
        .map(PathBuf::from)
        .unwrap_or_else(|_| config_dir.join("storage.json"));
    let config = read_json(&config_path).unwrap_or_else(|| json!({}));

    let mut issue: Option<SetupIssue> = None;
    let library_dir;

    if let Ok(env_dir) = std::env::var("CITE_STORAGE_DIR") {
        library_dir = PathBuf::from(env_dir);
        if fs::create_dir_all(&library_dir).is_err() {
            issue = Some(SetupIssue {
                kind: "first-run".into(),
                path: library_dir.to_string_lossy().to_string(),
                error: "sem permissão de escrita".into(),
            });
        }
    } else if let Some(dir) = config.get("storageDir").and_then(Value::as_str) {
        library_dir = PathBuf::from(dir);
        if !library_dir.is_dir() {
            issue = Some(SetupIssue {
                kind: "missing".into(),
                path: library_dir.to_string_lossy().to_string(),
                error: "pasta não encontrada".into(),
            });
        } else if !is_writable(&library_dir) {
            issue = Some(SetupIssue {
                kind: "unwritable".into(),
                path: library_dir.to_string_lossy().to_string(),
                error: "sem permissão de escrita".into(),
            });
        }
    } else {
        library_dir = default_library(app);
        if !is_writable(&library_dir) {
            issue = Some(SetupIssue {
                kind: "first-run".into(),
                path: library_dir.to_string_lossy().to_string(),
                error: "não foi possível criar a biblioteca".into(),
            });
        }
    }

    let language = read_language(&library_dir);
    let store = if issue.is_none() {
        match Store::open(&library_dir) {
            Ok(store) => Some(Arc::new(Mutex::new(store))),
            Err(error) => {
                issue = Some(SetupIssue {
                    kind: "unwritable".into(),
                    path: library_dir.to_string_lossy().to_string(),
                    error,
                });
                None
            }
        }
    } else {
        None
    };

    let word = Word::new(app, config_dir.clone(), library_dir.clone());

    AppState {
        rt: Mutex::new(Runtime {
            config_dir,
            library_dir,
            store,
            issue,
            language,
            word,
        }),
    }
}

pub fn setup_issue_json(issue: &SetupIssue) -> Value {
    json!({ "type": issue.kind, "path": issue.path, "error": issue.error })
}
