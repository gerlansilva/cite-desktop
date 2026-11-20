use serde_json::json;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

const ASSET_VERSION: &str = env!("CARGO_PKG_VERSION");

fn page(path: &str) -> WebviewUrl {
    WebviewUrl::App(format!("{path}?v={ASSET_VERSION}").into())
}

fn init_script(language: &str, extra: &str) -> String {
    format!(
        "try{{localStorage.setItem('cite-language','{language}');}}catch(e){{}} {extra}"
    )
}

fn base(builder: WebviewWindowBuilder<'_, tauri::Wry, AppHandle>) -> WebviewWindowBuilder<'_, tauri::Wry, AppHandle> {
    builder.center()
}

pub fn create_home(app: &AppHandle, language: &str) -> tauri::Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window("home") {
        let _ = window.set_focus();
        return Ok(window);
    }
    base(WebviewWindowBuilder::new(
        app,
        "home",
        page("home.html"),
    ))
    .title("Cite")
    .inner_size(1120.0, 860.0)
    .min_inner_size(820.0, 620.0)
    .initialization_script(&init_script(language, ""))
    .build()
}

pub fn create_library(
    app: &AppHandle,
    language: &str,
    action: Option<String>,
    focus: Option<String>,
) -> tauri::Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window("library") {
        let _ = window.set_focus();
        return Ok(window);
    }
    let mut launch = serde_json::Map::new();
    if let Some(action) = action {
        launch.insert("action".into(), json!(action));
    }
    if let Some(focus) = focus {
        launch.insert("id".into(), json!(focus));
    }
    let extra = format!(
        "window.__CITE_LAUNCH__={};",
        serde_json::Value::Object(launch)
    );
    base(WebviewWindowBuilder::new(
        app,
        "library",
        page("ui.html"),
    ))
    .title("Cite")
    .inner_size(1440.0, 900.0)
    .min_inner_size(980.0, 620.0)
    .disable_drag_drop_handler()
    .initialization_script(&init_script(language, &extra))
    .build()
}

pub fn create_setup(app: &AppHandle, language: &str) -> tauri::Result<WebviewWindow> {
    if let Some(window) = app.get_webview_window("setup") {
        let _ = window.set_focus();
        return Ok(window);
    }
    base(WebviewWindowBuilder::new(
        app,
        "setup",
        page("setup.html"),
    ))
    .title("Cite")
    .inner_size(640.0, 700.0)
    .min_inner_size(520.0, 520.0)
    .initialization_script(&init_script(language, ""))
    .build()
}
