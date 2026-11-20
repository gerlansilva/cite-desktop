use regex::Regex;
use serde_json::{json, Map, Value};
use std::time::Duration;

const SEARCH_PAGE_SIZE: usize = 10;
const USER_AGENT: &str = "Cite/0.3.0";

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent(USER_AGENT)
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

fn text(value: Option<&Value>) -> Option<String> {
    match value {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    }
}

fn first_text(value: &Value, key: &str) -> Option<String> {
    match value.get(key) {
        Some(Value::Array(list)) => list.first().and_then(|item| text(Some(item))),
        other => text(other),
    }
}

fn env_url(key: &str, fallback: &str) -> String {
    std::env::var(key)
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn page_options(offset: Option<i64>, limit: Option<i64>) -> (usize, usize) {
    let start = offset.filter(|value| *value > 0).unwrap_or(0) as usize;
    let size = limit
        .filter(|value| *value > 0)
        .map(|value| value.min(50) as usize)
        .unwrap_or(SEARCH_PAGE_SIZE);
    (start, size)
}

fn merge_metadata(base: &Value, extra: &Value) -> Value {
    let mut out = base.as_object().cloned().unwrap_or_default();
    if let Some(object) = extra.as_object() {
        for (key, value) in object {
            let empty = value.is_null() || value.as_str().map(str::is_empty).unwrap_or(false);
            if empty {
                continue;
            }
            if value.as_array().map(|list| list.is_empty()).unwrap_or(false) {
                continue;
            }
            let current_empty = out
                .get(key)
                .map(|current| {
                    current.is_null() || current.as_str().map(str::is_empty).unwrap_or(false)
                })
                .unwrap_or(true);
            if current_empty {
                out.insert(key.clone(), value.clone());
            }
        }
    }
    Value::Object(out)
}

fn map_crossref_work(work: &Value, fallback_doi: &str) -> Value {
    let doi = text(work.get("DOI"))
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback_doi.to_string());
    let authors = work
        .get("author")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .map(|author| {
                    [first_text(author, "given"), first_text(author, "family")]
                        .into_iter()
                        .flatten()
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .filter(|name| !name.trim().is_empty())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let year = work
        .get("issued")
        .and_then(|issued| issued.get("date-parts"))
        .and_then(Value::as_array)
        .and_then(|parts| parts.first())
        .and_then(Value::as_array)
        .and_then(|parts| parts.first())
        .and_then(|value| text(Some(value)));
    let pdf_url = work
        .get("link")
        .and_then(Value::as_array)
        .and_then(|links| {
            links
                .iter()
                .find(|link| {
                    first_text(link, "content-type")
                        .map(|value| value.to_lowercase().contains("application/pdf"))
                        .unwrap_or(false)
                })
                .and_then(|link| first_text(link, "URL"))
        });
    let abstract_text = work
        .get("abstract")
        .and_then(Value::as_str)
        .map(|value| strip_html(value))
        .filter(|value| !value.is_empty());
    let key = if doi.is_empty() {
        uuid::Uuid::new_v4().to_string()
    } else {
        doi.clone()
    };
    let safe_key = Regex::new(r"[^\w.\-]").unwrap().replace_all(&key, "_");
    let mut out = Map::new();
    out.insert("_id".into(), json!(format!("doi-{safe_key}")));
    out.insert("citekey".into(), json!(safe_key));
    out.insert("type".into(), json!("article"));
    out.insert("title".into(), json!(first_text(work, "title")));
    out.insert("authors".into(), json!(authors));
    out.insert("year".into(), json!(year));
    out.insert("journal".into(), json!(first_text(work, "container-title")));
    out.insert("volume".into(), json!(text(work.get("volume"))));
    out.insert("issue".into(), json!(text(work.get("issue"))));
    out.insert(
        "pages".into(),
        json!(text(work.get("page")).or_else(|| text(work.get("article-number")))),
    );
    out.insert("publisher".into(), json!(text(work.get("publisher"))));
    out.insert(
        "place".into(),
        json!(text(work.get("publisher-location"))),
    );
    out.insert("issn".into(), json!(first_text(work, "ISSN")));
    out.insert("language".into(), json!(text(work.get("language"))));
    if !doi.is_empty() {
        out.insert("doi".into(), json!(doi));
    }
    out.insert("url".into(), json!(text(work.get("URL"))));
    if let Some(pdf_url) = pdf_url {
        out.insert("pdf_url".into(), json!(pdf_url));
    }
    if let Some(abstract_text) = abstract_text {
        out.insert("abstract".into(), json!(abstract_text));
    }
    Value::Object(out)
}

async fn search_crossref(query: &str, offset: Option<i64>, limit: Option<i64>) -> Result<Vec<Value>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let base = env_url("CITE_CROSSREF_URL", "https://api.crossref.org/works");
    let (start, size) = page_options(offset, limit);
    let url = format!(
        "{base}?query.bibliographic={}&rows={size}&offset={start}&select=DOI,title,author,issued,container-title,volume,issue,page,publisher,URL,abstract,link",
        urlencoding(query)
    );
    let response = client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Falha na busca no Crossref: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Falha na busca no Crossref: HTTP {}", response.status()));
    }
    let json: Value = response
        .json()
        .await
        .map_err(|e| format!("Resposta inválida do Crossref: {e}"))?;
    Ok(json["message"]["items"]
        .as_array()
        .map(|items| items.iter().map(|item| map_crossref_work(item, "")).collect())
        .unwrap_or_default())
}

async fn lookup_crossref(doi: &str) -> Option<Value> {
    if doi.trim().is_empty() {
        return None;
    }
    let base = env_url("CITE_CROSSREF_URL", "https://api.crossref.org/works");
    let response = client()
        .get(format!("{base}/{}", urlencoding(doi)))
        .send()
        .await
        .ok()?;
    if !response.status().is_success() {
        return None;
    }
    let json: Value = response.json().await.ok()?;
    Some(map_crossref_work(&json["message"], doi))
}

fn pick_tag(entry: &str, tag: &str) -> Option<String> {
    let pattern = Regex::new(&format!(r"(?s)<{tag}[^>]*>(.*?)</{tag}>")).ok()?;
    let capture = pattern.captures(entry)?;
    let value = strip_html(capture.get(1)?.as_str());
    if value.is_empty() {
        None
    } else {
        Some(value)
    }
}

fn parse_arxiv(xml: &str) -> Vec<Value> {
    let entry_pattern = Regex::new(r"(?s)<entry>(.*?)</entry>").unwrap();
    let author_pattern = Regex::new(r"(?s)<author>.*?<name>(.*?)</name>").unwrap();
    let mut out = Vec::new();
    for entry in entry_pattern.captures_iter(xml) {
        let body = entry.get(1).map(|m| m.as_str()).unwrap_or_default();
        let id = pick_tag(body, "id").unwrap_or_default();
        let arxiv_id = id.split("/abs/").nth(1).unwrap_or_default().to_string();
        let published = pick_tag(body, "published").unwrap_or_default();
        let authors: Vec<String> = author_pattern
            .captures_iter(body)
            .filter_map(|capture| capture.get(1))
            .map(|m| m.as_str().split_whitespace().collect::<Vec<_>>().join(" "))
            .collect();
        let key = if arxiv_id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            arxiv_id.clone()
        };
        let journal = pick_tag(body, "arxiv:journal_ref").unwrap_or_else(|| "arXiv".to_string());
        let mut out_item = Map::new();
        out_item.insert("_id".into(), json!(format!("arxiv-{key}")));
        out_item.insert("citekey".into(), json!(format!("arxiv-{key}")));
        out_item.insert("title".into(), json!(pick_tag(body, "title")));
        out_item.insert("authors".into(), json!(authors));
        out_item.insert(
            "year".into(),
            json!(if published.len() >= 4 { Some(published[..4].to_string()) } else { None }),
        );
        out_item.insert("journal".into(), json!(journal));
        out_item.insert("doi".into(), json!(pick_tag(body, "arxiv:doi")));
        out_item.insert("url".into(), json!(id));
        if !arxiv_id.is_empty() {
            out_item.insert("pdf_url".into(), json!(format!("https://arxiv.org/pdf/{arxiv_id}")));
        }
        out_item.insert("abstract".into(), json!(pick_tag(body, "summary")));
        out.push(Value::Object(out_item));
    }
    out
}

async fn search_arxiv(query: &str, offset: Option<i64>, limit: Option<i64>) -> Result<Vec<Value>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let base = env_url("CITE_ARXIV_URL", "https://export.arxiv.org/api/query");
    let (start, size) = page_options(offset, limit);
    let url = format!(
        "{base}?search_query=all:{}&start={start}&max_results={size}",
        urlencoding(query)
    );
    let response = client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Falha na busca no arXiv: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Falha na busca no arXiv: HTTP {}", response.status()));
    }
    let body = response.text().await.map_err(|e| e.to_string())?;
    Ok(parse_arxiv(&body))
}

async fn search_pubmed(query: &str, offset: Option<i64>, limit: Option<i64>) -> Result<Vec<Value>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let base = env_url(
        "CITE_PUBMED_URL",
        "https://eutils.ncbi.nlm.nih.gov/entrez/eutils",
    );
    let (start, size) = page_options(offset, limit);
    let search_url = format!(
        "{base}/esearch.fcgi?db=pubmed&retmode=json&retstart={start}&retmax={size}&term={}",
        urlencoding(query)
    );
    let response = client()
        .get(&search_url)
        .send()
        .await
        .map_err(|e| format!("Falha na busca no PubMed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Falha na busca no PubMed: HTTP {}", response.status()));
    }
    let search: Value = response.json().await.map_err(|e| e.to_string())?;
    let ids: Vec<String> = search["esearchresult"]["idlist"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|value| value.as_str().map(str::to_string))
                .collect()
        })
        .unwrap_or_default();
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let summary_url = format!("{base}/esummary.fcgi?db=pubmed&retmode=json&id={}", ids.join(","));
    let response = client()
        .get(&summary_url)
        .send()
        .await
        .map_err(|e| format!("Falha nos detalhes do PubMed: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Falha nos detalhes do PubMed: HTTP {}",
            response.status()
        ));
    }
    let summary: Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(ids
        .iter()
        .map(|id| {
            let item = &summary["result"][id];
            let pmcid = item["articleids"]
                .as_array()
                .and_then(|list| {
                    list.iter()
                        .find(|entry| entry["idtype"] == "pmc")
                        .and_then(|entry| entry["value"].as_str())
                });
            let doi = item["articleids"].as_array().and_then(|list| {
                list.iter()
                    .find(|entry| entry["idtype"] == "doi")
                    .and_then(|entry| entry["value"].as_str())
            });
            let pubdate = text(item.get("pubdate"))
                .or_else(|| text(item.get("epubdate")))
                .unwrap_or_default();
            let authors = item["authors"]
                .as_array()
                .map(|list| {
                    list.iter()
                        .filter_map(|author| author["name"].as_str())
                        .map(str::to_string)
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();
            json!({
                "_id": format!("pubmed-{id}"),
                "citekey": format!("pubmed-{id}"),
                "type": "article",
                "title": text(item.get("title")),
                "authors": authors,
                "year": if pubdate.len() >= 4 { Some(pubdate[..4].to_string()) } else { None },
                "journal": text(item.get("fulljournalname")).or_else(|| text(item.get("source"))),
                "volume": text(item.get("volume")),
                "issue": text(item.get("issue")),
                "pages": text(item.get("pages")),
                "doi": doi,
                "url": format!("https://pubmed.ncbi.nlm.nih.gov/{id}/"),
                "pdf_url": pmcid.map(|id| format!("https://europepmc.org/articles/{id}?pdf=render"))
            })
        })
        .collect())
}

fn strip_html(value: &str) -> String {
    let tag = Regex::new(r"<[^>]*>").unwrap();
    let numeric = Regex::new(r"&#(\d+);").unwrap();
    let hex = Regex::new(r"(?i)&#x([0-9a-f]+);").unwrap();
    let mut out = tag.replace_all(value, " ").to_string();
    out = out.replace("&nbsp;", " ");
    out = out.replace("&amp;", "&");
    out = out.replace("&quot;", "\"");
    out = out.replace("&#39;", "'");
    out = out.replace("&apos;", "'");
    out = out.replace("&lt;", "<");
    out = out.replace("&gt;", ">");
    out = numeric
        .replace_all(&out, |caps: &regex::Captures| {
            caps[1]
                .parse::<u32>()
                .ok()
                .and_then(char::from_u32)
                .map(|ch| ch.to_string())
                .unwrap_or_default()
        })
        .to_string();
    out = hex
        .replace_all(&out, |caps: &regex::Captures| {
            u32::from_str_radix(&caps[1], 16)
                .ok()
                .and_then(char::from_u32)
                .map(|ch| ch.to_string())
                .unwrap_or_default()
        })
        .to_string();
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_google_scholar(html: &str, limit: usize) -> Vec<Value> {
    let heading = Regex::new(r#"(?s)<h3 class="gs_rt"[^>]*>(.*?)</h3>"#).unwrap();
    let link = Regex::new(r#"(?s)<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>"#).unwrap();
    let meta = Regex::new(r#"(?s)<div class="gs_a">(.*?)</div>"#).unwrap();
    let abstract_pattern = Regex::new(r#"(?s)<div class="gs_rs">(.*?)</div>"#).unwrap();
    let pdf_pattern =
        Regex::new(r#"(?s)<div class="gs_or_ggsm"[^>]*>\s*<a[^>]*href="([^"]+)""#).unwrap();
    let mut out = Vec::new();
    for block in html.split(r#"<div class="gs_r ""#).skip(1).take(limit) {
        let Some(heading_html) = heading.captures(block) else {
            continue;
        };
        let heading_html = heading_html.get(1).map(|m| m.as_str()).unwrap_or_default();
        let link_capture = link.captures(heading_html);
        let title_html = link_capture
            .as_ref()
            .and_then(|capture| capture.get(2))
            .map(|m| m.as_str())
            .unwrap_or(heading_html);
        let title = strip_html(title_html);
        if title.is_empty() {
            continue;
        }
        let meta_text = meta
            .captures(block)
            .and_then(|capture| capture.get(1))
            .map(|m| strip_html(m.as_str()))
            .unwrap_or_default();
        let abstract_text = abstract_pattern
            .captures(block)
            .and_then(|capture| capture.get(1))
            .map(|m| strip_html(m.as_str()))
            .filter(|value| !value.is_empty());
        let year = Regex::new(r"\b(?:19|20)\d{2}\b")
            .unwrap()
            .find(&meta_text)
            .map(|m| m.as_str().to_string());
        let segments: Vec<&str> = meta_text.split(" - ").collect();
        let journal = if segments.len() > 1 {
            let year_pattern = Regex::new(r",?\s*(?:19|20)\d{2}\b").unwrap();
            let source = segments[1..]
                .iter()
                .find(|part| Regex::new(r"\b(?:19|20)\d{2}\b").unwrap().is_match(part))
                .copied()
                .unwrap_or(segments[1]);
            let clean = year_pattern.replace_all(source, "").to_string();
            let clean = clean.trim_matches(|ch: char| ch == ',' || ch == ';' || ch.is_whitespace());
            if clean.is_empty() {
                None
            } else {
                Some(clean.to_string())
            }
        } else {
            None
        };
        let authors: Vec<String> = segments[0]
            .split(',')
            .map(|name| name.replace('…', "").trim().to_string())
            .filter(|name| !name.is_empty())
            .collect();
        fn unwrap_scholar(mut value: String) -> String {
            if value.starts_with('/') {
                value = format!("https://scholar.google.com{value}");
            }
            if let Ok(parsed) = reqwest::Url::parse(&value) {
                if parsed
                    .host_str()
                    .map(|host| host.to_lowercase().contains("scholar.google"))
                    .unwrap_or(false)
                    && parsed.path().contains("scholar_url")
                {
                    if let Some((_, target)) = parsed.query_pairs().find(|(key, _)| key == "url") {
                        return target.to_string();
                    }
                }
            }
            value
        }
        let url = link_capture
            .as_ref()
            .and_then(|capture| capture.get(1))
            .map(|m| unwrap_scholar(strip_html(m.as_str())));
        let original_pdf = pdf_pattern
            .captures(block)
            .and_then(|capture| capture.get(1))
            .map(|m| unwrap_scholar(strip_html(m.as_str())));
        let mut pdf_url = original_pdf.clone();
        if pdf_url.is_none() {
            if let Some(value) = url.as_ref() {
                if Regex::new(r"(?i)\.pdf(?:$|[?#])").unwrap().is_match(value) {
                    pdf_url = Some(value.clone());
                }
            }
        }
        let hash = {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(url.clone().unwrap_or_else(|| title.clone()).as_bytes());
            format!("{:x}", hasher.finalize())[..12].to_string()
        };
        let alt = original_pdf.filter(|value| pdf_url.as_deref() != Some(value.as_str()));
        out.push(json!({
            "_id": format!("google-{hash}"),
            "citekey": format!("google-{hash}"),
            "type": "article",
            "title": title,
            "authors": authors,
            "year": year,
            "journal": journal,
            "url": url,
            "pdf_url": pdf_url,
            "pdf_url_alt": alt,
            "abstract": abstract_text
        }));
    }
    out
}

async fn search_google_scholar(
    query: &str,
    offset: Option<i64>,
    limit: Option<i64>,
) -> Result<Vec<Value>, String> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let base = env_url("CITE_GOOGLE_SCHOLAR_URL", "https://scholar.google.com/scholar");
    let (start, size) = page_options(offset, limit);
    let url = format!(
        "{base}?hl=pt-BR&as_sdt=0,5&start={start}&num={size}&q={}",
        urlencoding(query)
    );
    let response = client()
        .get(&url)
        .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| format!("Falha na busca no Google Acadêmico: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Falha na busca no Google Acadêmico: HTTP {}",
            response.status()
        ));
    }
    let html = response.text().await.map_err(|e| e.to_string())?;
    if Regex::new(r"(?i)unusual traffic|not a robot|recaptcha|captcha")
        .unwrap()
        .is_match(&html)
    {
        return Err(
            "O Google Acadêmico pediu verificação. Tente novamente mais tarde ou use outra base."
                .to_string(),
        );
    }
    Ok(parse_google_scholar(&html, size))
}

fn meta_contents(html: &str, names: &[&str]) -> Vec<String> {
    let escaped: Vec<String> = names
        .iter()
        .map(|name| regex::escape(name))
        .collect();
    let joined = escaped.join("|");
    let patterns = [
        format!(r#"(?is)<meta[^>]+(?:name|property)=["'](?:{joined})["'][^>]+content=["']([^"']*)["']"#),
        format!(r#"(?is)<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["'](?:{joined})["']"#),
    ];
    let mut values: Vec<String> = Vec::new();
    for pattern in patterns {
        let Ok(regex) = Regex::new(&pattern) else {
            continue;
        };
        for capture in regex.captures_iter(html) {
            let value = capture
                .get(1)
                .map(|m| m.as_str())
                .unwrap_or_default()
                .replace("&amp;", "&")
                .replace("&quot;", "\"")
                .replace("&#39;", "'");
            let value = value.trim().to_string();
            if !value.is_empty() && !values.contains(&value) {
                values.push(value);
            }
        }
    }
    values
}

fn html_page_title(html: &str) -> String {
    if let Some(value) = meta_contents(
        html,
        &["citation_title", "og:title", "dc.title"],
    )
    .into_iter()
    .next()
    {
        return value;
    }
    Regex::new(r"(?is)<title[^>]*>(.*?)</title>")
        .unwrap()
        .captures(html)
        .and_then(|capture| capture.get(1))
        .map(|m| strip_html(m.as_str()))
        .unwrap_or_default()
}

pub fn html_citation_metadata(html: &str) -> Value {
    let authors = meta_contents(html, &["citation_author", "dc.creator"]);
    let date = meta_contents(
        html,
        &[
            "citation_publication_date",
            "dc.date.issued",
            "citation_date",
            "dc.date",
        ],
    )
    .into_iter()
    .next()
    .unwrap_or_default();
    let year = Regex::new(r"\d{4}")
        .unwrap()
        .find(&date)
        .map(|m| m.as_str().to_string());
    let first_page = meta_contents(html, &["citation_firstpage", "dc.identifier.firstpage"])
        .into_iter()
        .next();
    let last_page = meta_contents(html, &["citation_lastpage", "dc.identifier.lastpage"])
        .into_iter()
        .next();
    let page_number = meta_contents(html, &["dc.identifier.pagenumber", "citation_pages"])
        .into_iter()
        .next();
    let pages = page_number.or_else(|| match (first_page, last_page) {
        (Some(first), Some(last)) if first != last => Some(format!("{first}-{last}")),
        (Some(first), _) => Some(first),
        (None, Some(last)) => Some(last),
        _ => None,
    });
    let conference = meta_contents(html, &["citation_conference_title"])
        .into_iter()
        .next();
    let doi = meta_contents(html, &["citation_doi", "dc.identifier.doi", "dc.identifier"])
        .into_iter()
        .find(|value| value.starts_with("10."));
    json!({
        "type": if conference.is_some() { "conference" } else { "article" },
        "title": meta_contents(html, &["citation_title", "dc.title", "og:title"]).into_iter().next().unwrap_or_else(|| html_page_title(html)),
        "authors": authors,
        "year": year,
        "journal": meta_contents(html, &["citation_journal_title", "dc.source"]).into_iter().next(),
        "conference": conference,
        "volume": meta_contents(html, &["citation_volume", "dc.source.volume"]).into_iter().next(),
        "issue": meta_contents(html, &["citation_issue", "dc.source.issue"]).into_iter().next(),
        "pages": pages,
        "issn": meta_contents(html, &["citation_issn", "dc.source.issn"]).into_iter().next(),
        "isbn": meta_contents(html, &["citation_isbn"]).into_iter().next(),
        "publisher": meta_contents(html, &["citation_publisher"]).into_iter().next(),
        "language": meta_contents(html, &["citation_language", "dc.language"]).into_iter().next(),
        "doi": doi,
        "url": meta_contents(html, &["citation_public_url", "dc.identifier.uri", "og:url"]).into_iter().next(),
        "abstract": meta_contents(html, &["citation_abstract", "dc.description"]).into_iter().next()
    })
}

fn pdf_links_from_html(html: &str, base_url: &str) -> Vec<String> {
    let patterns = [
        r#"(?is)<meta[^>]+(?:name|property)=["']citation_pdf_url["'][^>]+content=["']([^"']+)["']"#,
        r#"(?is)<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']citation_pdf_url["']"#,
        r#"(?is)<link[^>]+type=["']application/pdf["'][^>]+href=["']([^"']+)["']"#,
        r#"(?is)<link[^>]+href=["']([^"']+)["'][^>]+type=["']application/pdf["']"#,
        r#"(?is)href=["']([^"']+\.pdf(?:\?[^"']*)?)["']"#,
    ];
    let mut links: Vec<String> = Vec::new();
    for pattern in patterns {
        let Ok(regex) = Regex::new(pattern) else {
            continue;
        };
        for capture in regex.captures_iter(html) {
            if links.len() >= 8 {
                break;
            }
            let raw = capture
                .get(1)
                .map(|m| m.as_str())
                .unwrap_or_default()
                .replace("&amp;", "&");
            if let Ok(base) = reqwest::Url::parse(base_url) {
                if let Ok(url) = base.join(&raw) {
                    let value = url.to_string();
                    if (value.starts_with("http://") || value.starts_with("https://"))
                        && !links.contains(&value)
                    {
                        links.push(value);
                    }
                }
            }
        }
    }
    links
}

fn looks_like_pdf(buffer: &[u8]) -> bool {
    buffer
        .get(..buffer.len().min(1024))
        .map(|head| head.windows(5).any(|window| window == b"%PDF-"))
        .unwrap_or(false)
}

struct PdfFound {
    buffer: Vec<u8>,
    url: String,
    metadata: Value,
}

async fn fetch_pdf_candidate(url: &str, depth: usize) -> Result<PdfFound, String> {
    let parsed = reqwest::Url::parse(url).map_err(|_| "Endereço de PDF inválido.".to_string())?;
    if parsed.scheme() != "http" && parsed.scheme() != "https" {
        return Err("Endereço de PDF inválido.".to_string());
    }
    let response = client()
        .get(parsed.clone())
        .header("Accept", "application/pdf,text/html;q=0.9,*/*;q=0.8")
        .timeout(Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }
    let final_url = response.url().to_string();
    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_lowercase();
    if let Some(length) = response
        .headers()
        .get("content-length")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<u64>().ok())
    {
        if length > 100 * 1024 * 1024 {
            return Err("PDF muito grande.".to_string());
        }
    }
    let bytes = response.bytes().await.map_err(|e| e.to_string())?.to_vec();
    if bytes.len() > 100 * 1024 * 1024 {
        return Err("PDF muito grande.".to_string());
    }
    if looks_like_pdf(&bytes) {
        return Ok(PdfFound {
            buffer: bytes,
            url: final_url,
            metadata: json!({ "url": url }),
        });
    }
    let head = String::from_utf8_lossy(&bytes[..bytes.len().min(2048)]).to_lowercase();
    if content_type.contains("text/html") || head.contains("<html") {
        if depth >= 1 {
            return Err("O link abriu uma página, não um PDF.".to_string());
        }
        let html = String::from_utf8_lossy(&bytes[..bytes.len().min(2 * 1024 * 1024)]).to_string();
        let links = pdf_links_from_html(&html, &final_url);
        let mut metadata = html_citation_metadata(&html);
        if let Some(doi) = metadata.get("doi").and_then(Value::as_str) {
            if let Some(crossref) = lookup_crossref(doi).await {
                metadata = merge_metadata(&metadata, &crossref);
            }
        }
        let mut last_error = None;
        for link in links {
            match Box::pin(fetch_pdf_candidate(&link, depth + 1)).await {
                Ok(found) => {
                    return Ok(PdfFound {
                        buffer: found.buffer,
                        url: found.url,
                        metadata: merge_metadata(&found.metadata, &metadata),
                    });
                }
                Err(error) => last_error = Some(error),
            }
        }
        return Err(last_error.unwrap_or_else(|| "O link abriu uma página, não um PDF.".to_string()));
    }
    Err("O arquivo baixado não é um PDF.".to_string())
}

async fn open_access_candidates(doi: &str) -> Vec<String> {
    if doi.trim().is_empty() {
        return Vec::new();
    }
    let base = env_url("CITE_OPENALEX_URL", "https://api.openalex.org");
    let url = format!("{base}/works?filter=doi:{}&per-page=1", urlencoding(doi));
    let Ok(response) = client().get(url).send().await else {
        return Vec::new();
    };
    if !response.status().is_success() {
        return Vec::new();
    }
    let Ok(json) = response.json::<Value>().await else {
        return Vec::new();
    };
    let Some(work) = json["results"].as_array().and_then(|list| list.first()) else {
        return Vec::new();
    };
    let mut out: Vec<String> = Vec::new();
    let mut push = |value: Option<&str>| {
        if let Some(text) = value {
            let is_pdf = Regex::new(r"(?i)\.pdf(?:$|[?#])").unwrap().is_match(text);
            if text.starts_with("http") && (is_pdf || value.is_some()) && !out.iter().any(|item| item == text) {
                out.push(text.to_string());
            }
        }
    };
    push(work["best_oa_location"]["pdf_url"].as_str());
    if let Some(locations) = work["locations"].as_array() {
        for location in locations {
            push(location["pdf_url"].as_str());
            push(location["landing_page_url"].as_str());
        }
    }
    push(work["open_access"]["oa_url"].as_str());
    out
}

fn pdf_file_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|ch| {
            if matches!(ch, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|') {
                ' '
            } else {
                ch
            }
        })
        .collect();
    let mut base = cleaned
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(120)
        .collect::<String>()
        .trim()
        .to_string();
    if base.is_empty() {
        base = "artigo".to_string();
    }
    if Regex::new(r"(?i)\.pdf$").unwrap().is_match(&base) {
        base
    } else {
        format!("{base}.pdf")
    }
}

pub async fn pdf_download(library: &std::path::Path, payload: &Value) -> Result<Value, String> {
    let name = payload
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or("artigo");
    let doi = payload.get("doi").and_then(Value::as_str).unwrap_or_default();
    let mut candidates: Vec<String> = Vec::new();
    for key in ["url", "altUrl"] {
        if let Some(value) = payload.get(key).and_then(Value::as_str) {
            if value.starts_with("http://") || value.starts_with("https://") {
                candidates.push(value.to_string());
            }
        }
    }
    candidates.extend(open_access_candidates(doi).await);
    candidates.dedup();
    if candidates.is_empty() {
        return Err("Este resultado não informa um PDF de acesso aberto. Use “Anexar PDF” para escolher um arquivo baixado manualmente.".to_string());
    }
    let mut last_error = None;
    for candidate in candidates {
        match fetch_pdf_candidate(&candidate, 0).await {
            Ok(found) => {
                let file_name = pdf_file_name(name);
                let saved = crate::attachments::save(library, &file_name, &found.buffer)?;
                let meta = found.metadata;
                let mut out = Map::new();
                out.insert("ok".into(), json!(true));
                for key in ["path", "hash", "size", "deduped"] {
                    if let Some(value) = saved.get(key) {
                        out.insert(key.into(), value.clone());
                    }
                }
                out.insert("name".into(), json!(file_name));
                out.insert("url".into(), json!(found.url));
                for key in [
                    "type",
                    "title",
                    "authors",
                    "year",
                    "journal",
                    "conference",
                    "volume",
                    "issue",
                    "pages",
                    "issn",
                    "isbn",
                    "publisher",
                    "place",
                    "language",
                    "abstract",
                    "doi",
                ] {
                    if let Some(value) = meta.get(key) {
                        if !value.is_null() {
                            out.insert(key.into(), value.clone());
                        }
                    }
                }
                if !out.contains_key("title") {
                    out.insert("title".into(), json!(name));
                }
                return Ok(Value::Object(out));
            }
            Err(error) => last_error = Some(error),
        }
    }
    Err(format!(
        "Não foi possível baixar o PDF automaticamente{}. O artigo pode estar protegido ou o link pode ter expirado. Use “Anexar PDF” para escolher o arquivo.",
        last_error
            .map(|error| format!(" ({error})"))
            .unwrap_or_default()
    ))
}

pub async fn search(source: &str, query: &str, offset: Option<i64>, limit: Option<i64>) -> Result<Vec<Value>, String> {
    match source {
        "arxiv" => search_arxiv(query, offset, limit).await,
        "pubmed" => search_pubmed(query, offset, limit).await,
        "google" => search_google_scholar(query, offset, limit).await,
        _ => search_crossref(query, offset, limit).await,
    }
}

pub async fn doi_lookup(doi: &str) -> Result<Value, String> {
    let base = env_url("CITE_CROSSREF_URL", "https://api.crossref.org/works");
    let response = client()
        .get(format!("{base}/{}", urlencoding(doi)))
        .send()
        .await
        .map_err(|e| format!("Falha na consulta do DOI: {e}"))?;
    if !response.status().is_success() {
        return Err(format!(
            "Falha na consulta do DOI: HTTP {}",
            response.status()
        ));
    }
    let json: Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(map_crossref_work(&json["message"], doi))
}

pub async fn metadata_lookup(payload: &Value) -> Result<Value, String> {
    let mut result = json!({});
    if let Some(url) = payload.get("url").and_then(Value::as_str) {
        if url.starts_with("http://") || url.starts_with("https://") {
            if let Ok(response) = client()
                .get(url)
                .header("Accept", "text/html,application/xhtml+xml")
                .send()
                .await
            {
                if response.status().is_success() {
                    if let Ok(html) = response.text().await {
                        result = merge_metadata(&result, &html_citation_metadata(&html));
                    }
                }
            }
        }
    }
    let target = payload
        .get("doi")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| result.get("doi").and_then(Value::as_str).map(str::to_string));
    if let Some(doi) = target {
        if let Some(crossref) = lookup_crossref(&doi).await {
            result = merge_metadata(&result, &crossref);
        }
    }
    let has_title = result
        .get("title")
        .and_then(Value::as_str)
        .map(|value| !value.is_empty())
        .unwrap_or(false);
    let has_doi = result
        .get("doi")
        .and_then(Value::as_str)
        .map(|value| !value.is_empty())
        .unwrap_or(false);
    if !has_title && !has_doi {
        return Err("Não foi possível obter metadados deste DOI ou endereço.".to_string());
    }
    Ok(result)
}

pub async fn translate(input: &str, target: &str) -> Result<String, String> {
    let value = input.trim();
    if value.is_empty() {
        return Ok(String::new());
    }
    if value.chars().count() > 5000 {
        return Err("O trecho selecionado é longo demais para tradução.".to_string());
    }
    let allowed = ["pt", "en", "es", "fr", "de", "it", "ja", "zh", "tet"];
    let language = if allowed.contains(&target) { target } else { "pt" };
    if let Ok(configured) = std::env::var("CITE_TRANSLATE_URL") {
        let url = format!(
            "{configured}?q={}&target={}",
            urlencoding(value),
            urlencoding(language)
        );
        let response = client()
            .get(url)
            .send()
            .await
            .map_err(|e| format!("Falha na tradução: {e}"))?;
        if !response.status().is_success() {
            return Err(format!("Falha na tradução: HTTP {}", response.status()));
        }
        let json: Value = response.json().await.map_err(|e| e.to_string())?;
        let text = ["translatedText", "translation", "text"]
            .iter()
            .find_map(|key| json.get(key).and_then(Value::as_str))
            .unwrap_or_default();
        if text.is_empty() {
            return Err("A tradução não retornou texto.".to_string());
        }
        return Ok(text.to_string());
    }
    let url = format!(
        "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl={}&dt=t&q={}",
        urlencoding(language),
        urlencoding(value)
    );
    let response = client()
        .get(url)
        .header("Accept-Language", "pt-BR,pt;q=0.9,en;q=0.8")
        .send()
        .await
        .map_err(|e| format!("Falha na tradução: {e}"))?;
    if !response.status().is_success() {
        return Err(format!("Falha na tradução: HTTP {}", response.status()));
    }
    let json: Value = response.json().await.map_err(|e| e.to_string())?;
    let translated = json[0]
        .as_array()
        .map(|parts| {
            parts
                .iter()
                .filter_map(|part| part[0].as_str())
                .collect::<String>()
        })
        .unwrap_or_default();
    if translated.is_empty() {
        return Err("A tradução não retornou texto.".to_string());
    }
    Ok(translated)
}

fn urlencoding(value: &str) -> String {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_arxiv_entries() {
        let xml = r#"<feed><entry><id>http://arxiv.org/abs/1234.5678</id>
            <published>2020-01-02T00:00:00Z</published>
            <title>  A   title </title>
            <author><name>Ada Lovelace</name></author>
            <summary>Abstract.</summary></entry></feed>"#;
        let items = parse_arxiv(xml);
        assert_eq!(items.len(), 1);
        assert_eq!(items[0]["year"], "2020");
        assert_eq!(items[0]["title"], "A title");
    }

    #[test]
    fn parses_citation_meta() {
        let html = r#"<html><head>
            <meta name="citation_title" content="Paper">
            <meta name="citation_author" content="Ada Lovelace">
            <meta name="citation_publication_date" content="2020-05-01">
            <meta name="citation_doi" content="10.1/xyz">
            </head></html>"#;
        let meta = html_citation_metadata(html);
        assert_eq!(meta["title"], "Paper");
        assert_eq!(meta["year"], "2020");
        assert_eq!(meta["doi"], "10.1/xyz");
    }
}
