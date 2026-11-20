use crate::citations;
use crate::state::Runtime;
use base64::Engine;
use regex::Regex;
use serde_json::{json, Value};

const KEYRING_SERVICE: &str = "Cite";
const KEYRING_USER: &str = "github-token";

fn github_config(runtime: &Runtime) -> Value {
    runtime
        .read_integrations()
        .get("github")
        .cloned()
        .unwrap_or_else(|| json!({}))
}

fn keyring_entry() -> Option<keyring::Entry> {
    keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()
}

fn store_token(token: &str) -> Option<()> {
    let entry = keyring_entry()?;
    entry.set_password(token).ok()
}

fn load_token(config: &Value) -> String {
    if let Some(entry) = keyring_entry() {
        if let Ok(value) = entry.get_password() {
            if !value.is_empty() {
                return value;
            }
        }
    }
    if let Some(value) = config.get("token").and_then(Value::as_str) {
        if let Some(encoded) = value.strip_prefix("plain:") {
            if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(encoded) {
                return String::from_utf8_lossy(&bytes).to_string();
            }
        }
    }
    String::new()
}

pub fn get(runtime: &Runtime) -> Value {
    let config = github_config(runtime);
    json!({
        "repo": config.get("repo").and_then(Value::as_str).unwrap_or(""),
        "branch": config.get("branch").and_then(Value::as_str).unwrap_or("main"),
        "folder": config.get("folder").and_then(Value::as_str).unwrap_or("cite"),
        "hasToken": config.get("hasToken").and_then(Value::as_bool).unwrap_or(false)
    })
}

pub fn save(runtime: &Runtime, payload: &Value) -> Result<Value, String> {
    let repo = payload
        .get("repo")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    if !Regex::new(r"^[^/\s]+/[^/\s]+$").unwrap().is_match(&repo) {
        return Err("Use o repositório no formato usuario/repositorio.".to_string());
    }
    let branch = payload
        .get("branch")
        .and_then(Value::as_str)
        .unwrap_or("main")
        .trim()
        .to_string();
    let folder = payload
        .get("folder")
        .and_then(Value::as_str)
        .unwrap_or("cite")
        .trim_matches('/')
        .to_string();
    let mut integrations = runtime.read_integrations();
    if !integrations.is_object() {
        integrations = json!({});
    }
    let previous = integrations.get("github").cloned().unwrap_or_else(|| json!({}));
    let mut github = json!({
        "repo": repo,
        "branch": if branch.is_empty() { "main".to_string() } else { branch },
        "folder": if folder.is_empty() { "cite".to_string() } else { folder }
    });
    let token = payload
        .get("token")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .trim()
        .to_string();
    let has_previous = previous
        .get("hasToken")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    if !token.is_empty() {
        let stored = store_token(&token).is_some();
        if !stored {
            let encoded = base64::engine::general_purpose::STANDARD.encode(token.as_bytes());
            if let Some(object) = github.as_object_mut() {
                object.insert("token".into(), json!(format!("plain:{encoded}")));
            }
        }
        if let Some(object) = github.as_object_mut() {
            object.insert("hasToken".into(), json!(true));
        }
    } else if has_previous {
        if let Some(object) = github.as_object_mut() {
            object.insert("hasToken".into(), json!(true));
            if let Some(token) = previous.get("token") {
                object.insert("token".into(), token.clone());
            }
        }
    }
    if let Some(object) = integrations.as_object_mut() {
        object.insert("github".into(), github.clone());
    }
    runtime.write_integrations(&integrations)?;
    Ok(json!({
        "repo": github.get("repo").cloned().unwrap_or(json!("")),
        "branch": github.get("branch").cloned().unwrap_or(json!("main")),
        "folder": github.get("folder").cloned().unwrap_or(json!("cite")),
        "hasToken": github.get("hasToken").cloned().unwrap_or(json!(false))
    }))
}

fn bibliography_payload(pubs: &[Value]) -> Value {
    let items = pubs
        .iter()
        .map(|pubv| {
            let mut citations_map = serde_json::Map::new();
            for style in citations::STYLES {
                citations_map.insert(style.to_string(), json!(citations::format(style, pubv)));
            }
            json!({
                "id": pubv.get("_id").cloned().unwrap_or(Value::Null),
                "type": pubv.get("type").cloned().unwrap_or(json!("article")),
                "title": pubv.get("title").cloned().unwrap_or(Value::Null),
                "authors": pubv.get("authors").cloned().unwrap_or(json!([])),
                "year": pubv.get("year").cloned().unwrap_or(Value::Null),
                "journal": pubv.get("journal").cloned().unwrap_or(Value::Null),
                "fullJournal": pubv.get("fullJournal").cloned().unwrap_or(Value::Null),
                "volume": pubv.get("volume").cloned().unwrap_or(Value::Null),
                "issue": pubv.get("issue").cloned().unwrap_or(Value::Null),
                "pages": pubv.get("pages").cloned().unwrap_or(Value::Null),
                "doi": pubv.get("doi").cloned().unwrap_or(Value::Null),
                "url": pubv.get("url").cloned().unwrap_or(Value::Null),
                "publisher": pubv.get("publisher").cloned().unwrap_or(Value::Null),
                "place": pubv.get("place").cloned().unwrap_or(Value::Null),
                "issn": pubv.get("issn").cloned().unwrap_or(Value::Null),
                "isbn": pubv.get("isbn").cloned().unwrap_or(Value::Null),
                "conference": pubv.get("conference").cloned().unwrap_or(Value::Null),
                "proceedings": pubv.get("proceedings").cloned().unwrap_or(Value::Null),
                "university": pubv.get("university").cloned().unwrap_or(Value::Null),
                "thesisType": pubv.get("thesisType").cloned().unwrap_or(Value::Null),
                "institution": pubv.get("institution").cloned().unwrap_or(Value::Null),
                "reportNumber": pubv.get("reportNumber").cloned().unwrap_or(Value::Null),
                "website": pubv.get("website").cloned().unwrap_or(Value::Null),
                "accessed": pubv.get("accessed").cloned().unwrap_or(Value::Null),
                "language": pubv.get("language").cloned().unwrap_or(Value::Null),
                "tags": pubv.get("tags").cloned().unwrap_or(json!([])),
                "abstract": pubv.get("abstract").cloned().unwrap_or(Value::Null),
                "citations": Value::Object(citations_map)
            })
        })
        .collect::<Vec<_>>();
    json!({
        "version": 1,
        "generator": "Cite",
        "generatedAt": chrono::Utc::now().to_rfc3339(),
        "styles": citations::STYLES,
        "items": items
    })
}

#[cfg(target_os = "macos")]
pub fn payload_for(runtime: &Runtime) -> Result<Value, String> {
    let store = runtime.store_arc()?;
    let guard = store.lock().map_err(|_| "Biblioteca bloqueada".to_string())?;
    Ok(bibliography_payload(&guard.all_published()))
}

fn api_base() -> String {
    std::env::var("CITE_GITHUB_API")
        .unwrap_or_else(|_| "https://api.github.com".to_string())
        .trim_end_matches('/')
        .to_string()
}

async fn publish_file(
    client: &reqwest::Client,
    token: &str,
    repo: &str,
    branch: &str,
    file_path: &str,
    content: &str,
    message: &str,
) -> Result<Value, String> {
    let encoded_path = file_path
        .split('/')
        .map(|part| {
            let mut out = String::new();
            for byte in part.as_bytes() {
                match byte {
                    b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                        out.push(*byte as char)
                    }
                    _ => out.push_str(&format!("%{byte:02X}")),
                }
            }
            out
        })
        .collect::<Vec<_>>()
        .join("/");
    let url = format!("{}/repos/{repo}/contents/{encoded_path}", api_base());
    let existing = client
        .get(format!("{url}?ref={}", branch))
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|e| format!("GitHub: {e}"))?;
    let mut body = json!({
        "message": message,
        "content": base64::engine::general_purpose::STANDARD.encode(content.as_bytes()),
        "branch": branch
    });
    if existing.status().is_success() {
        if let Ok(json) = existing.json::<Value>().await {
            if let Some(sha) = json.get("sha") {
                if let Some(object) = body.as_object_mut() {
                    object.insert("sha".into(), sha.clone());
                }
            }
        }
    } else if existing.status() != reqwest::StatusCode::NOT_FOUND {
        return Err(format!("GitHub HTTP {}", existing.status()));
    }
    let response = client
        .put(&url)
        .bearer_auth(token)
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("GitHub: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!(
            "GitHub HTTP {status}{}",
            if text.is_empty() {
                String::new()
            } else {
                format!(": {}", text.chars().take(180).collect::<String>())
            }
        ));
    }
    let json: Value = response.json().await.unwrap_or_else(|_| json!({}));
    let html_url = json
        .get("content")
        .and_then(|content| content.get("html_url"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| format!("https://github.com/{repo}/blob/{branch}/{file_path}"));
    Ok(json!({ "path": file_path, "url": html_url }))
}

pub fn config_for(runtime: &Runtime) -> Value {
    github_config(runtime)
}

pub async fn publish_with(config: &Value, pubs: &[Value]) -> Result<Value, String> {
    let repo = config
        .get("repo")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();
    let branch = config
        .get("branch")
        .and_then(Value::as_str)
        .unwrap_or("main")
        .to_string();
    let folder = config
        .get("folder")
        .and_then(Value::as_str)
        .unwrap_or("cite")
        .trim_matches('/')
        .to_string();
    let token = load_token(config);
    if repo.is_empty() || token.is_empty() {
        return Err("Configure o repositório e o token do GitHub antes de publicar.".to_string());
    }
    let payload = bibliography_payload(pubs);
    let bib = crate::bibtex::to_bibtex(pubs);
    let client = reqwest::Client::builder()
        .user_agent("Cite/0.3.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let stamp = chrono::Utc::now().to_rfc3339();
    let json_path = format!("{folder}/bibliography.json");
    let bib_path = format!("{folder}/references.bib");
    let mut files = Vec::new();
    files.push(
        publish_file(
            &client,
            &token,
            &repo,
            &branch,
            &json_path,
            &format!("{}\n", serde_json::to_string_pretty(&payload).unwrap_or_default()),
            &format!("Cite: atualizar bibliografia ({stamp})"),
        )
        .await?,
    );
    files.push(
        publish_file(
            &client,
            &token,
            &repo,
            &branch,
            &bib_path,
            &format!("{bib}\n"),
            &format!("Cite: atualizar BibTeX ({stamp})"),
        )
        .await?,
    );
    Ok(json!({
        "repo": repo,
        "branch": branch,
        "folder": folder,
        "count": pubs.len(),
        "files": files,
        "repoUrl": format!("https://github.com/{repo}")
    }))
}
