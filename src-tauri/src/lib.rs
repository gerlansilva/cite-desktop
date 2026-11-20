mod attachments;
mod backup;
mod bibtex;
mod citations;
mod github;
mod menu;
mod net;
mod state;
mod store;
mod windows;
mod word;

use serde_json::{json, Value};
use state::AppState;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, RunEvent, State, WindowEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;

fn json_arg<'a>(payload: &'a Value, key: &str) -> Option<&'a str> {
    payload.get(key).and_then(Value::as_str)
}

fn text_arg<'a>(payload: &'a Value, key: &str) -> String {
    json_arg(payload, key).unwrap_or_default().to_string()
}

fn app_dir(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    Ok(runtime.library_dir.clone())
}

#[tauri::command]
fn data_call(state: State<'_, AppState>, method: String, args: Value) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    runtime.call(&method, &args)
}

#[tauri::command]
async fn doi_lookup(doi: String) -> Result<Value, String> {
    net::doi_lookup(&doi).await
}

#[tauri::command]
async fn doi_search(query: String) -> Result<Value, String> {
    Ok(Value::Array(net::search("crossref", &query, None, None).await?))
}

#[tauri::command]
async fn translation_translate(payload: Value) -> Result<String, String> {
    let text = text_arg(&payload, "text");
    let target = text_arg(&payload, "target");
    net::translate(&text, &target).await
}

#[tauri::command]
async fn metadata_search(payload: Value) -> Result<Value, String> {
    let source = text_arg(&payload, "source");
    let query = text_arg(&payload, "query");
    let offset = payload.get("offset").and_then(Value::as_i64);
    let limit = payload.get("limit").and_then(Value::as_i64);
    Ok(Value::Array(
        net::search(&source, &query, offset, limit).await?,
    ))
}

#[tauri::command]
async fn metadata_lookup(payload: Value) -> Result<Value, String> {
    net::metadata_lookup(&payload).await
}

#[tauri::command]
async fn pdf_download(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let library = app_dir(&state)?;
    net::pdf_download(&library, &payload).await
}

#[tauri::command]
fn attachments_read(path: String) -> Result<tauri::ipc::Response, String> {
    attachments::read(&path)
        .map(tauri::ipc::Response::new)
        .ok_or_else(|| "Anexo não encontrado".to_string())
}

#[tauri::command]
fn attachments_save(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let library = app_dir(&state)?;
    let name = text_arg(&payload, "name");
    let bytes: Vec<u8> = serde_json::from_value(
        payload
            .get("data")
            .cloned()
            .ok_or_else(|| "dados do anexo ausentes".to_string())?,
    )
    .map_err(|_| "dados do anexo inválidos".to_string())?;
    attachments::save(&library, &name, &bytes)
}

#[tauri::command]
fn attachments_list(state: State<'_, AppState>) -> Result<Value, String> {
    let library = app_dir(&state)?;
    Ok(Value::Array(attachments::list(&library)))
}

#[tauri::command]
fn attachments_delete(path: String) -> bool {
    attachments::delete(&path)
}

#[tauri::command]
fn attachments_dir(state: State<'_, AppState>) -> Result<String, String> {
    let library = app_dir(&state)?;
    Ok(attachments::dir(&library).to_string_lossy().to_string())
}

#[tauri::command]
fn attachments_cleanup_orphans(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let library = app_dir(&state)?;
    let keep: Vec<String> = payload
        .get("keep")
        .and_then(Value::as_array)
        .map(|rows| {
            rows.iter()
                .filter_map(|row| row.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    let max_age = payload
        .get("maxAgeMs")
        .and_then(Value::as_i64)
        .unwrap_or(0);
    Ok(attachments::cleanup_orphans(&library, &keep, max_age))
}

#[tauri::command]
async fn backup_create(
    app: AppHandle,
    state: State<'_, AppState>,
    target: Option<String>,
) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    backup::create(&app, &runtime, target)
}

#[tauri::command]
async fn backup_restore(
    app: AppHandle,
    state: State<'_, AppState>,
    source: Option<String>,
) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    backup::restore(&app, &runtime, source)
}

#[tauri::command]
async fn annotations_export(app: AppHandle, payload: Value) -> Result<Value, String> {
    let content = text_arg(&payload, "content");
    let name = {
        let value = text_arg(&payload, "defaultName");
        if value.is_empty() {
            "cite-anotacoes.md".to_string()
        } else {
            value
        }
    };
    backup::export_annotations(&app, &name, &content)
}

#[tauri::command]
async fn files_save_text(app: AppHandle, payload: Value) -> Result<Value, String> {
    let content = text_arg(&payload, "content");
    let name = text_arg(&payload, "name");
    let filter = {
        let value = text_arg(&payload, "filter");
        if value.is_empty() {
            "Arquivo".to_string()
        } else {
            value
        }
    };
    let extension = name
        .rsplit_once('.')
        .map(|(_, ext)| ext.to_string())
        .unwrap_or_else(|| "txt".to_string());
    let path = {
        let file = app
            .dialog()
            .file()
            .set_title("Exportar arquivo")
            .set_directory(
                app.path()
                    .document_dir()
                    .unwrap_or_else(|_| PathBuf::from(".")),
            )
            .set_file_name(name)
            .add_filter(filter, &[extension.as_str()])
            .blocking_save_file();
        file.and_then(|value| value.into_path().ok())
    };
    let Some(path) = path else {
        return Ok(json!({ "canceled": true }));
    };
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, content).map_err(|e| format!("Falha ao exportar: {e}"))?;
    Ok(json!({ "ok": true, "path": path.to_string_lossy() }))
}

#[tauri::command]
fn settings_get_language(state: State<'_, AppState>) -> Result<String, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    Ok(runtime.language.clone())
}

#[tauri::command]
fn settings_set_language(
    app: AppHandle,
    state: State<'_, AppState>,
    language: String,
) -> Result<String, String> {
    let next = if language == "tet" { "tet" } else { "pt" };
    let mut runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    runtime.language = next.to_string();
    runtime.write_language(next)?;
    let _ = menu::install(&app, next);
    Ok(next.to_string())
}

#[tauri::command]
fn github_get(state: State<'_, AppState>) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    Ok(github::get(&runtime))
}

#[tauri::command]
fn github_save(state: State<'_, AppState>, payload: Value) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    github::save(&runtime, &payload)
}

#[tauri::command]
async fn github_publish(state: State<'_, AppState>) -> Result<Value, String> {
    let (config, pubs) = {
        let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
        let config = github::config_for(&runtime);
        let store = runtime.store_arc()?;
        let guard = store.lock().map_err(|_| "Biblioteca bloqueada".to_string())?;
        (config, guard.all_published())
    };
    github::publish_with(&config, &pubs).await
}

#[tauri::command]
fn home_state(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    Ok(json!({
        "version": app.package_info().version.to_string(),
        "libraryPath": runtime.library_dir.to_string_lossy(),
        "word": runtime.word.status()
    }))
}

#[tauri::command]
fn home_open(app: AppHandle, payload: Value) -> Result<Value, String> {
    let language = {
        let state = app.state::<AppState>();
        let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
        runtime.language.clone()
    };
    let action = json_arg(&payload, "action").map(str::to_string);
    let focus = json_arg(&payload, "id").map(str::to_string);
    windows::create_library(&app, &language, action, focus).map_err(|e| e.to_string())?;
    if let Some(home) = app.get_webview_window("home") {
        let _ = home.close();
    }
    Ok(json!({ "ok": true }))
}

#[tauri::command]
async fn home_change_folder(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let (current, default_dir) = {
        let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
        (
            runtime.library_dir.clone(),
            runtime.library_dir.parent().unwrap_or(&runtime.library_dir).to_path_buf(),
        )
    };
    let picked = app
        .dialog()
        .file()
        .set_title("Escolha uma pasta para o Cite")
        .set_directory(default_dir)
        .blocking_pick_folder();
    let Some(picked) = picked.and_then(|value| value.into_path().ok()) else {
        return Ok(json!({ "canceled": true }));
    };
    let target = picked;
    if target == current {
        return Ok(json!({ "ok": true, "path": target.to_string_lossy(), "same": true }));
    }
    if !state::is_writable(&target) {
        return Ok(json!({ "ok": false, "error": "sem permissão de escrita" }));
    }
    if !backup::has_library_data(&target) {
        let proceed = app
            .dialog()
            .message("A pasta está vazia")
            .title("Cite")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Usar esta pasta".to_string(),
                "Cancelar".to_string(),
            ))
            .blocking_show();
        if !proceed {
            return Ok(json!({ "canceled": true }));
        }
    }
    {
        let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
        runtime.write_storage_config(&target, None)?;
    }
    app.restart();
}

#[tauri::command]
fn home_word_help(app: AppHandle) -> Result<Value, String> {
    let url = "https://github.com/gerlansilva/cite-desktop/blob/main/integrations/word/README.md";
    let _ = app.opener().open_url(url, None::<&str>);
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn word_status(state: State<'_, AppState>) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    Ok(runtime.word.status())
}

#[tauri::command]
fn word_install(state: State<'_, AppState>) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    Ok(runtime.word.install())
}

#[tauri::command]
fn word_uninstall(state: State<'_, AppState>) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    Ok(runtime.word.uninstall())
}

#[tauri::command]
fn storage_state(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
    Ok(json!({
        "issue": runtime.issue.as_ref().map(state::setup_issue_json),
        "defaultPath": state::default_library(&app).to_string_lossy()
    }))
}

fn apply_storage_choice(app: &AppHandle, dir: PathBuf) -> Value {
    if !state::is_writable(&dir) {
        return json!({ "ok": false, "error": "sem permissão de escrita" });
    }
    let state = app.state::<AppState>();
    let wrote = {
        let runtime = match state.rt.lock() {
            Ok(runtime) => runtime,
            Err(_) => return json!({ "ok": false, "error": "estado indisponível" }),
        };
        runtime.write_storage_config(&dir, None)
    };
    if let Err(error) = wrote {
        return json!({ "ok": false, "error": error });
    }
    app.restart();
}

#[tauri::command]
async fn storage_choose(app: AppHandle, state: State<'_, AppState>) -> Result<Value, String> {
    let default_dir = {
        let runtime = state.rt.lock().map_err(|_| "estado indisponível".to_string())?;
        runtime
            .issue
            .as_ref()
            .and_then(|issue| PathBuf::from(&issue.path).parent().map(Path::to_path_buf))
            .unwrap_or_else(|| state::default_library(&app))
    };
    let picked = app
        .dialog()
        .file()
        .set_title("Escolha uma pasta para o Cite")
        .set_directory(default_dir)
        .blocking_pick_folder();
    let Some(picked) = picked.and_then(|value| value.into_path().ok()) else {
        return Ok(json!({ "canceled": true }));
    };
    Ok(apply_storage_choice(&app, picked))
}

#[tauri::command]
async fn storage_use_default(app: AppHandle) -> Result<Value, String> {
    Ok(apply_storage_choice(&app, state::default_library(&app)))
}

#[tauri::command]
fn storage_quit(app: AppHandle) -> Result<Value, String> {
    app.exit(0);
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn shell_open_path(app: AppHandle, path: String) -> Result<Value, String> {
    app.opener()
        .open_path(path, None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(json!({ "ok": true }))
}

#[tauri::command]
fn shell_open_external(app: AppHandle, url: String) -> Result<Value, String> {
    if std::env::var("CITE_NO_OPEN").as_deref() == Ok("1")
        || std::env::var("REFDESK_NO_OPEN").as_deref() == Ok("1")
    {
        return Ok(json!({ "opened": false, "url": url }));
    }
    app.opener()
        .open_url(url.clone(), None::<&str>)
        .map_err(|e| e.to_string())?;
    Ok(json!({ "opened": true, "url": url }))
}

#[tauri::command]
fn app_info(app: AppHandle) -> Value {
    json!({
        "version": app.package_info().version.to_string(),
        "platform": std::env::consts::OS,
        "name": app.package_info().name
    })
}

fn focused_window(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false))
}

fn show_about(app: &AppHandle) {
    let version = app.package_info().version.to_string();
    app.dialog()
        .message(format!("Cite {version}"))
        .title("Cite")
        .kind(MessageDialogKind::Info)
        .show(|_| {});
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let handle = app.handle().clone();
            let app_state = state::init(&handle);
            let (language, has_issue) = {
                let runtime = app_state.rt.lock().unwrap();
                (runtime.language.clone(), runtime.issue.is_some())
            };
            app.manage(app_state);
            menu::install(&handle, &language)?;
            if has_issue {
                windows::create_setup(&handle, &language)?;
            } else if std::env::var("CITE_SKIP_HOME").as_deref() == Ok("1") {
                windows::create_library(&handle, &language, None, None)?;
            } else {
                windows::create_home(&handle, &language)?;
            }
            let word_handle = handle.clone();
            std::thread::spawn(move || {
                let state = word_handle.state::<AppState>();
                let guard = state.rt.lock();
                if let Ok(runtime) = guard {
                    runtime.word.ensure_installed();
                }
            });
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open-home" => {
                let language = app
                    .state::<AppState>()
                    .rt
                    .lock()
                    .map(|runtime| runtime.language.clone())
                    .unwrap_or_else(|_| "pt".to_string());
                let _ = windows::create_home(app, &language);
                if let Some(library) = app.get_webview_window("library") {
                    let _ = library.close();
                }
            }
            "open-library" => {
                let language = app
                    .state::<AppState>()
                    .rt
                    .lock()
                    .map(|runtime| runtime.language.clone())
                    .unwrap_or_else(|_| "pt".to_string());
                let _ = windows::create_library(app, &language, None, None);
                if let Some(home) = app.get_webview_window("home") {
                    let _ = home.close();
                }
            }
            "reload" => {
                if let Some(window) = focused_window(app) {
                    let _ = window.eval("location.reload()");
                }
            }
            "devtools" => {
                #[cfg(debug_assertions)]
                if let Some(window) = focused_window(app) {
                    window.open_devtools();
                }
            }
            "about" => show_about(app),
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            data_call,
            doi_lookup,
            doi_search,
            translation_translate,
            metadata_search,
            metadata_lookup,
            pdf_download,
            attachments_read,
            attachments_save,
            attachments_list,
            attachments_delete,
            attachments_dir,
            attachments_cleanup_orphans,
            backup_create,
            backup_restore,
            annotations_export,
            files_save_text,
            settings_get_language,
            settings_set_language,
            github_get,
            github_save,
            github_publish,
            home_state,
            home_open,
            home_change_folder,
            home_word_help,
            word_status,
            word_install,
            word_uninstall,
            storage_state,
            storage_choose,
            storage_use_default,
            storage_quit,
            shell_open_path,
            shell_open_external,
            app_info
        ])
        .build(tauri::generate_context!())
        .expect("erro ao iniciar o Cite")
        .run(|app, event| match event {
            RunEvent::WindowEvent {
                event: WindowEvent::Destroyed,
                ..
            } => {
                if app.webview_windows().is_empty() {
                    app.exit(0);
                }
            }
            RunEvent::Exit => {
                if let Ok(runtime) = app.state::<AppState>().rt.lock() {
                    runtime.word.stop();
                }
            }
            #[cfg(target_os = "macos")]
            RunEvent::Reopen { .. } => {
                if app.webview_windows().is_empty() {
                    let language = app
                        .state::<AppState>()
                        .rt
                        .lock()
                        .map(|runtime| runtime.language.clone())
                        .unwrap_or_else(|_| "pt".to_string());
                    let _ = windows::create_home(app, &language);
                }
            }
            _ => {}
        });
}
