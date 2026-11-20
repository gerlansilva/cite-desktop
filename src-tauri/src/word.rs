#[cfg(target_os = "macos")]
use crate::state::AppState;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

const MANIFEST_FILE: &str = "cite-word.xml";
const CERT_FILE: &str = "word-cert.pem";
const KEY_FILE: &str = "word-key.pem";
const SETTINGS_FILE: &str = "install.json";
const DEFAULT_PORT: u16 = 23120;
const MAX_PORT: u16 = 23129;
// Incremente ao alterar painel, campos ou ícones para forçar o Word a
// recarregar os arquivos mesmo quando a versão do aplicativo não muda.
const ADDIN_REVISION: &str = "8";

pub struct Word {
    app: AppHandle,
    inner: Arc<std::sync::Mutex<Inner>>,
}

struct Inner {
    base_dir: PathBuf,
    library_dir: PathBuf,
    static_dir: PathBuf,
    template_path: PathBuf,
    wef_dir: Option<PathBuf>,
    settings_path: PathBuf,
    installed: bool,
    trusted: bool,
    port: Option<u16>,
    saved_port: Option<u16>,
    error: String,
    preferred_port: u16,
    trust_mode: String,
    stop: Option<Arc<std::sync::atomic::AtomicBool>>,
}

fn platform_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "darwin"
    } else if cfg!(target_os = "windows") {
        "win32"
    } else {
        "linux"
    }
}

fn default_wef_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("CITE_WORD_WEF_DIR") {
        return Some(PathBuf::from(dir));
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").ok()?;
        return Some(
            PathBuf::from(home)
                .join("Library")
                .join("Containers")
                .join("com.microsoft.Word")
                .join("Data")
                .join("Documents")
                .join("wef"),
        );
    }
    #[allow(unreachable_code)]
    None
}

fn read_json(path: &Path) -> Value {
    fs::read(path)
        .ok()
        .and_then(|raw| serde_json::from_slice(&raw).ok())
        .unwrap_or_else(|| json!({}))
}

fn write_json(path: &Path, value: &Value) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, serde_json::to_vec_pretty(value).unwrap_or_default())
        .map_err(|e| e.to_string())
}

impl Word {
    pub fn new(app: &AppHandle, config_dir: PathBuf, library_dir: PathBuf) -> Self {
        let base_dir = std::env::var("CITE_WORD_ADDIN_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| config_dir.join("word-addin"));
        let static_dir = {
            let packaged = app
                .path()
                .resource_dir()
                .map(|dir| dir.join("integrations").join("word"))
                .unwrap_or_else(|_| PathBuf::from("/nonexistent"));
            if packaged.join("taskpane.html").exists() {
                packaged
            } else {
                PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                    .join("..")
                    .join("integrations")
                    .join("word")
            }
        };
        let settings_path = base_dir.join(SETTINGS_FILE);
        let settings = read_json(&settings_path);
        let wef_dir = default_wef_dir();
        let installed = settings
            .get("installed")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let trusted = settings
            .get("trusted")
            .and_then(Value::as_bool)
            .unwrap_or(false);
        let preferred_port = std::env::var("CITE_WORD_PORT")
            .ok()
            .and_then(|value| value.parse::<u16>().ok())
            .unwrap_or(DEFAULT_PORT);
        let inner = Inner {
            base_dir: base_dir.clone(),
            library_dir,
            static_dir,
            template_path: PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("integrations")
                .join("word")
                .join("manifest.local-server.xml"),
            wef_dir,
            settings_path,
            installed,
            trusted,
            port: None,
            saved_port: settings
                .get("port")
                .and_then(Value::as_u64)
                .map(|value| value as u16),
            error: String::new(),
            preferred_port,
            trust_mode: std::env::var("CITE_WORD_TRUST").unwrap_or_else(|_| "auto".into()),
            stop: None,
        };
        Self {
            app: app.clone(),
            inner: Arc::new(std::sync::Mutex::new(inner)),
        }
    }

    fn version(&self) -> String {
        self.app.package_info().version.to_string()
    }

    pub fn status(&self) -> Value {
        let inner = self.inner.lock().unwrap();
        let manifest_path = inner
            .wef_dir
            .as_ref()
            .map(|dir| dir.join(MANIFEST_FILE).to_string_lossy().to_string());
        let active = inner.port;
        let shown = active.or(inner.saved_port);
        json!({
            "supported": inner.wef_dir.is_some(),
            "platform": platform_name(),
            "installed": inner.installed,
            "running": active.is_some(),
            "port": shown,
            "url": shown.map(|port| format!("https://localhost:{port}")).unwrap_or_default(),
            "trusted": inner.trusted,
            "manifestPath": manifest_path,
            "wefDir": inner.wef_dir.as_ref().map(|dir| dir.to_string_lossy().to_string()),
            "error": inner.error
        })
    }

    pub fn install(&self) -> Value {
        let mut inner = self.inner.lock().unwrap();
        inner.error.clear();
        if inner.wef_dir.is_none() {
            inner.error =
                "A instalação automática está disponível no Word para macOS.".to_string();
            let error = inner.error.clone();
            drop(inner);
            return json!({ "ok": false, "error": error, "status": self.status() });
        }
        let cert = match certificate(&inner.base_dir) {
            Ok(cert) => cert,
            Err(error) => {
                inner.error = error.clone();
                drop(inner);
                return json!({ "ok": false, "error": error, "status": self.status() });
            }
        };
        let trust_ok = trust_certificate(&inner, &cert.0);
        if let Err(error) = trust_ok {
            inner.error = error.clone();
            drop(inner);
            return json!({ "ok": false, "error": error, "status": self.status() });
        }
        let port = match start_server(&self.app, &inner, &cert.0, &cert.1) {
            Ok((port, stop)) => {
                inner.stop = Some(stop);
                port
            }
            Err(error) => {
                inner.error = error.clone();
                drop(inner);
                return json!({ "ok": false, "error": error, "status": self.status() });
            }
        };
        if let Err(error) = write_manifest(&inner, port, &self.version()) {
            inner.error = error.clone();
            drop(inner);
            return json!({ "ok": false, "error": error, "status": self.status() });
        }
        inner.installed = true;
        inner.trusted = true;
        inner.port = Some(port);
        inner.saved_port = Some(port);
        let settings = json!({
            "installed": true,
            "trusted": true,
            "port": port,
            "version": self.version(),
            "installedAt": chrono::Utc::now().to_rfc3339()
        });
        let _ = write_json(&inner.settings_path, &settings);
        drop(inner);
        json!({ "ok": true, "status": self.status() })
    }

    pub fn uninstall(&self) -> Value {
        let mut inner = self.inner.lock().unwrap();
        if let Some(wef) = inner.wef_dir.clone() {
            let _ = fs::remove_file(wef.join(MANIFEST_FILE));
        }
        if let Some(stop) = inner.stop.take() {
            stop.store(false, std::sync::atomic::Ordering::SeqCst);
        }
        inner.port = None;
        inner.saved_port = None;
        inner.installed = false;
        let _ = write_json(&inner.settings_path, &json!({ "installed": false }));
        drop(inner);
        json!({ "ok": true, "status": self.status() })
    }

    pub fn ensure_installed(&self) {
        if std::env::var("CITE_DISABLE_WORD").as_deref() == Ok("1") {
            return;
        }
        let mut inner = self.inner.lock().unwrap();
        if !inner.installed || inner.wef_dir.is_none() {
            return;
        }
        let cert = match certificate(&inner.base_dir) {
            Ok(cert) => cert,
            Err(error) => {
                inner.error = error;
                return;
            }
        };
        match start_server(&self.app, &inner, &cert.0, &cert.1) {
            Ok((port, stop)) => {
                inner.stop = Some(stop);
                inner.port = Some(port);
                inner.saved_port = Some(port);
                let _ = write_manifest(&inner, port, &self.version());
                let _ = write_json(
                    &inner.settings_path,
                    &json!({ "installed": true, "trusted": inner.trusted, "port": port, "version": self.version() }),
                );
                inner.error.clear();
            }
            Err(error) => {
                inner.error = error.clone();
                eprintln!("Falha ao iniciar o painel local do Word: {error}");
            }
        }
    }

    pub fn stop(&self) {
        let mut inner = self.inner.lock().unwrap();
        if let Some(stop) = inner.stop.take() {
            stop.store(false, std::sync::atomic::Ordering::SeqCst);
        }
        inner.port = None;
    }
}

fn certificate_is_usable(cert_path: &Path) -> bool {
    fs::read_to_string(cert_path)
        .map(|pem| pem.contains("BEGIN CERTIFICATE"))
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn certificate(base_dir: &Path) -> Result<(String, String), String> {
    let tls_dir = base_dir.join("tls");
    let cert_path = tls_dir.join(CERT_FILE);
    let key_path = tls_dir.join(KEY_FILE);
    if certificate_is_usable(&cert_path) && key_path.exists() {
        let cert = fs::read_to_string(&cert_path).map_err(|e| e.to_string())?;
        let key = fs::read_to_string(&key_path).map_err(|e| e.to_string())?;
        return Ok((cert, key));
    }
    fs::create_dir_all(&tls_dir).map_err(|e| e.to_string())?;
    let mut params = rcgen::CertificateParams::new(vec![
        "localhost".to_string(),
        "127.0.0.1".to_string(),
    ])
    .map_err(|e| e.to_string())?;
    params
        .distinguished_name
        .push(rcgen::DnType::CommonName, "localhost");
    params
        .distinguished_name
        .push(rcgen::DnType::OrganizationName, "Cite");
    params.is_ca = rcgen::IsCa::Ca(rcgen::BasicConstraints::Unconstrained);
    params.key_usages = vec![
        rcgen::KeyUsagePurpose::DigitalSignature,
        rcgen::KeyUsagePurpose::KeyEncipherment,
        rcgen::KeyUsagePurpose::KeyCertSign,
    ];
    params.extended_key_usages = vec![rcgen::ExtendedKeyUsagePurpose::ServerAuth];
    params.not_after = rcgen::date_time_ymd(2035, 1, 1);
    let key_pair = rcgen::KeyPair::generate().map_err(|e| e.to_string())?;
    let cert = params
        .self_signed(&key_pair)
        .map_err(|e| e.to_string())?;
    let cert_pem = cert.pem();
    let key_pem = key_pair.serialize_pem();
    fs::write(&cert_path, &cert_pem).map_err(|e| e.to_string())?;
    fs::write(&key_path, &key_pem).map_err(|e| e.to_string())?;
    Ok((cert_pem, key_pem))
}

#[cfg(not(target_os = "macos"))]
fn certificate(_base_dir: &Path) -> Result<(String, String), String> {
    Err("A integração com o Word está disponível no macOS.".to_string())
}

fn run_command(command: &str, args: &[&str]) -> (bool, String) {
    match std::process::Command::new(command).args(args).output() {
        Ok(output) => (
            output.status.success(),
            String::from_utf8_lossy(&output.stderr).trim().to_string(),
        ),
        Err(error) => (false, error.to_string()),
    }
}

#[cfg(target_os = "macos")]
fn login_keychain() -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    let modern = format!("{home}/Library/Keychains/login.keychain-db");
    if Path::new(&modern).exists() {
        modern
    } else {
        format!("{home}/Library/Keychains/login.keychain")
    }
}

fn trust_certificate(inner: &Inner, cert_pem: &str) -> Result<(), String> {
    if inner.trust_mode == "skip" {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        if !certificate_is_usable(&inner.base_dir.join("tls").join(CERT_FILE)) {
            return Err("certificado local indisponível".to_string());
        }
        let cert_path = inner.base_dir.join("tls").join(CERT_FILE);
        let cert = cert_path.to_string_lossy().to_string();
        let (verified, _) = run_command("security", &["verify-cert", "-c", &cert, "-p", "ssl"]);
        if verified {
            return Ok(());
        }
        let keychain = login_keychain();
        let (ok, message) = run_command(
            "security",
            &["add-trusted-cert", "-r", "trustRoot", "-k", &keychain, &cert],
        );
        if !ok {
            return Err(if message.is_empty() {
                "não foi possível confiar no certificado".to_string()
            } else {
                message
            });
        }
        let _ = cert_pem;
        Ok(())
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (inner, cert_pem);
        Err("instalação automática disponível apenas no macOS".to_string())
    }
}

fn write_manifest(inner: &Inner, port: u16, version: &str) -> Result<(), String> {
    let Some(wef_dir) = inner.wef_dir.as_ref() else {
        return Err("pasta de suplementos do Word não encontrada".to_string());
    };
    let template = fs::read_to_string(&inner.template_path)
        .map_err(|_| "modelo do manifesto não encontrado".to_string())?;
    let version = urlencode(&format!("{version}-r{ADDIN_REVISION}"));
    let mut manifest = template.replace("__PORT__", &port.to_string());
    let query = regex::Regex::new(r"(taskpane|commands)\.html(\?[a-zA-Z0-9_=&-]+)?")
        .map_err(|e| e.to_string())?;
    manifest = query
        .replace_all(&manifest, |caps: &regex::Captures| {
            let name = &caps[1];
            let extra = caps
                .get(2)
                .map(|m| format!("&amp;{}", m.as_str().trim_start_matches('?')))
                .unwrap_or_default();
            format!("{name}.html?v={version}{extra}")
        })
        .to_string();
    fs::create_dir_all(wef_dir).map_err(|e| e.to_string())?;
    fs::write(wef_dir.join(MANIFEST_FILE), manifest).map_err(|e| e.to_string())
}

fn urlencode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*byte as char)
            }
            _ => out.push_str(&format!("%{byte:02X}")),
        }
    }
    out
}

#[cfg(target_os = "macos")]
fn start_server(
    app: &AppHandle,
    inner: &Inner,
    cert_pem: &str,
    key_pem: &str,
) -> Result<(u16, Arc<std::sync::atomic::AtomicBool>), String> {
    use std::net::TcpListener;

    let _ = rustls::crypto::ring::default_provider().install_default();
    let mut cert_reader = cert_pem.as_bytes();
    let certs: Vec<rustls::pki_types::CertificateDer<'static>> =
        rustls_pemfile::certs(&mut cert_reader)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
    let mut key_reader = key_pem.as_bytes();
    let key = rustls_pemfile::private_key(&mut key_reader)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "chave local inválida".to_string())?;
    let config = rustls::ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(certs, key)
        .map_err(|e| e.to_string())?;
    let config = Arc::new(config);

    let mut listener = None;
    let mut port = inner.preferred_port;
    let last = inner.preferred_port.saturating_add(MAX_PORT - DEFAULT_PORT);
    while port <= last {
        match TcpListener::bind(("127.0.0.1", port)) {
            Ok(bound) => {
                listener = Some(bound);
                break;
            }
            Err(_) => port += 1,
        }
    }
    let listener = listener.ok_or_else(|| {
        format!(
            "nenhuma porta livre entre {} e {last}",
            inner.preferred_port
        )
    })?;
    listener
        .set_nonblocking(true)
        .map_err(|e| e.to_string())?;

    let stop = Arc::new(std::sync::atomic::AtomicBool::new(true));
    let stop_thread = stop.clone();
    let app_handle = app.clone();
    let static_dir = inner.static_dir.clone();
    let library_dir = inner.library_dir.clone();
    let version = app.package_info().version.to_string();
    std::thread::spawn(move || {
        while stop_thread.load(std::sync::atomic::Ordering::SeqCst) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let _ = stream.set_nonblocking(false);
                    let _ = stream.set_read_timeout(Some(std::time::Duration::from_secs(15)));
                    let config = config.clone();
                    let app = app_handle.clone();
                    let static_dir = static_dir.clone();
                    let library_dir = library_dir.clone();
                    let version = version.clone();
                    std::thread::spawn(move || {
                        if let Err(error) = handle_connection(stream, config, &app, &static_dir, &library_dir, &version) {
                            eprintln!("Cite word: falha na conexão: {error}");
                        }
                    });
                }
                Err(ref error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(60));
                }
                Err(_) => break,
            }
        }
    });
    Ok((port, stop))
}

#[cfg(not(target_os = "macos"))]
fn start_server(
    _app: &AppHandle,
    _inner: &Inner,
    _cert_pem: &str,
    _key_pem: &str,
) -> Result<(u16, Arc<std::sync::atomic::AtomicBool>), String> {
    Err("A integração com o Word está disponível no macOS.".to_string())
}

#[cfg(target_os = "macos")]
fn handle_connection(
    stream: std::net::TcpStream,
    config: Arc<rustls::ServerConfig>,
    app: &AppHandle,
    static_dir: &Path,
    library_dir: &Path,
    version: &str,
) -> Result<(), String> {
    use std::io::{Read, Write};

    let connection = rustls::ServerConnection::new(config).map_err(|e| e.to_string())?;
    let mut tls = rustls::StreamOwned::new(connection, stream);
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 8192];
    loop {
        let read = tls.read(&mut chunk).map_err(|e| e.to_string())?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.windows(4).any(|window| window == b"\r\n\r\n") || buffer.len() > 64 * 1024 {
            break;
        }
    }
    let head = String::from_utf8_lossy(&buffer);
    let mut request_line = head.lines().next().unwrap_or_default().split_whitespace();
    let method = request_line.next().unwrap_or("GET").to_string();
    let path = request_line.next().unwrap_or("/").to_string();
    let path = path.split('?').next().unwrap_or("/").to_string();

    let (status, content_type, body) =
        route(app, static_dir, library_dir, version, &method, &path);
    let response_head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nAccess-Control-Allow-Private-Network: true\r\n\r\n",
        body.len()
    );
    tls.write_all(response_head.as_bytes())
        .map_err(|e| e.to_string())?;
    if method != "HEAD" {
        tls.write_all(&body).map_err(|e| e.to_string())?;
    }
    let _ = tls.flush();
    Ok(())
}

#[cfg(target_os = "macos")]
fn route(
    app: &AppHandle,
    static_dir: &Path,
    library_dir: &Path,
    version: &str,
    method: &str,
    path: &str,
) -> (u16, &'static str, Vec<u8>) {
    if method == "OPTIONS" {
        return (204, "text/plain; charset=utf-8", Vec::new());
    }
    if method != "GET" && method != "HEAD" {
        return (
            405,
            "application/json; charset=utf-8",
            b"{\"error\":\"method not allowed\"}".to_vec(),
        );
    }
    if path == "/ping" {
        let (language, _) = language_of(app);
        let payload = json!({
            "app": "Cite",
            "version": version,
            "libraryPath": library_dir.to_string_lossy(),
            "language": language
        });
        return (
            200,
            "application/json; charset=utf-8",
            serde_json::to_vec(&payload).unwrap_or_default(),
        );
    }
    if path == "/library" {
        let state = app.state::<AppState>();
        let runtime = match state.rt.lock() {
            Ok(runtime) => runtime,
            Err(_) => {
                return (
                    503,
                    "application/json; charset=utf-8",
                    b"{\"error\":\"library unavailable\"}".to_vec(),
                )
            }
        };
        match crate::github::payload_for(&runtime) {
            Ok(payload) => (
                200,
                "application/json; charset=utf-8",
                serde_json::to_vec(&payload).unwrap_or_default(),
            ),
            Err(_) => (
                503,
                "application/json; charset=utf-8",
                b"{\"error\":\"library unavailable\"}".to_vec(),
            ),
        }
    } else if let Some((file, content_type)) = static_file(path) {
        let full = static_dir.join(file);
        match fs::read(&full) {
            Ok(body) => (200, content_type, body),
            Err(_) => (
                404,
                "application/json; charset=utf-8",
                b"{\"error\":\"not found\"}".to_vec(),
            ),
        }
    } else if let Some((name, size)) = asset_file(path) {
        let full = static_dir.join("assets").join(format!("{name}-{size}.png"));
        match fs::read(&full) {
            Ok(body) => (200, "image/png", body),
            Err(_) => (
                404,
                "application/json; charset=utf-8",
                b"{\"error\":\"not found\"}".to_vec(),
            ),
        }
    } else {
        (
            404,
            "application/json; charset=utf-8",
            b"{\"error\":\"not found\"}".to_vec(),
        )
    }
}

#[cfg(target_os = "macos")]
fn language_of(app: &AppHandle) -> (String, bool) {
    let state = app.state::<AppState>();
    let result = match state.rt.lock() {
        Ok(runtime) => {
            let language = runtime.language.clone();
            (language.clone(), language == "tet")
        }
        Err(_) => ("pt".to_string(), false),
    };
    result
}

#[cfg(target_os = "macos")]
fn static_file(path: &str) -> Option<(&'static str, &'static str)> {
    match path {
        "/" | "/taskpane.html" => Some(("taskpane.html", "text/html; charset=utf-8")),
        "/taskpane.js" => Some(("taskpane.js", "text/javascript; charset=utf-8")),
        "/fields.js" => Some(("fields.js", "text/javascript; charset=utf-8")),
        "/strings.js" => Some(("strings.js", "text/javascript; charset=utf-8")),
        "/commands.html" => Some(("commands.html", "text/html; charset=utf-8")),
        "/commands.js" => Some(("commands.js", "text/javascript; charset=utf-8")),
        "/demo-bibliography.json" => {
            Some(("demo-bibliography.json", "application/json; charset=utf-8"))
        }
        _ => None,
    }
}

#[cfg(target_os = "macos")]
fn asset_file(path: &str) -> Option<(String, String)> {
    let regex = regex::Regex::new(r"^/assets/([a-z]+)-(16|32|80)\.png$").ok()?;
    let captures = regex.captures(path)?;
    Some((
        captures.get(1)?.as_str().to_string(),
        captures.get(2)?.as_str().to_string(),
    ))
}
