use serde_json::Value;

fn s(pubv: &Value, key: &str) -> String {
    match pubv.get(key) {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Number(value)) => value.to_string(),
        _ => String::new(),
    }
}

pub fn to_bibtex(pubs: &[Value]) -> String {
    pubs.iter()
        .map(|pubv| {
            let raw = s(pubv, "type");
            let kind: String = match raw.as_str() {
                "article" => "article".to_string(),
                "book" => "book".to_string(),
                "chapter" => "incollection".to_string(),
                "conference" => "inproceedings".to_string(),
                "thesis" => "phdthesis".to_string(),
                "report" => "techreport".to_string(),
                "webpage" => "misc".to_string(),
                "newspaper" => "article".to_string(),
                "magazine" => "article".to_string(),
                _ if raw.is_empty() => "article".to_string(),
                _ => raw.clone(),
            };
            let key = {
                let citekey = s(pubv, "citekey");
                if citekey.is_empty() {
                    let id = s(pubv, "_id");
                    if id.is_empty() {
                        "ref".to_string()
                    } else {
                        id
                    }
                } else {
                    citekey
                }
            };
            let authors = pubv
                .get("authors")
                .and_then(Value::as_array)
                .map(|list| {
                    list.iter()
                        .filter_map(|item| item.as_str())
                        .collect::<Vec<_>>()
                        .join(" and ")
                })
                .unwrap_or_default();
            let tags = pubv
                .get("tags")
                .and_then(Value::as_array)
                .map(|list| {
                    list.iter()
                        .filter_map(|item| item.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_default();
            let book_title = {
                let value = s(pubv, "bookTitle");
                if value.is_empty() {
                    s(pubv, "proceedings")
                } else {
                    value
                }
            };
            let number = {
                let value = s(pubv, "issue");
                if value.is_empty() {
                    s(pubv, "reportNumber")
                } else {
                    value
                }
            };
            let fields = [
                ("title", s(pubv, "title")),
                ("author", authors),
                ("editor", s(pubv, "editors")),
                ("year", s(pubv, "year")),
                ("journal", s(pubv, "journal")),
                ("booktitle", book_title),
                ("eventtitle", s(pubv, "conference")),
                ("volume", s(pubv, "volume")),
                ("number", number),
                ("pages", s(pubv, "pages")),
                ("publisher", s(pubv, "publisher")),
                ("address", s(pubv, "place")),
                ("edition", s(pubv, "edition")),
                ("isbn", s(pubv, "isbn")),
                ("issn", s(pubv, "issn")),
                ("school", s(pubv, "university")),
                ("institution", s(pubv, "institution")),
                ("type", s(pubv, "thesisType")),
                ("howpublished", s(pubv, "website")),
                ("urldate", s(pubv, "accessed")),
                ("language", s(pubv, "language")),
                ("keywords", tags),
                ("doi", s(pubv, "doi")),
                ("url", s(pubv, "url")),
                ("abstract", s(pubv, "abstract")),
            ];
            let body = fields
                .into_iter()
                .filter(|(_, value)| !value.is_empty())
                .map(|(name, value)| format!("  {name} = {{{value}}}"))
                .collect::<Vec<_>>()
                .join(",\n");
            format!("@{kind}{{{key},\n{body}\n}}")
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn writes_bibtex() {
        let text = to_bibtex(&[json!({
            "_id": "k1",
            "type": "article",
            "title": "T",
            "authors": ["A", "B"],
            "year": 2020
        })]);
        assert!(text.contains("@article{k1,"));
        assert!(text.contains("author = {A and B}"));
    }
}
