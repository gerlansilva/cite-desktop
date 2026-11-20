use chrono::Datelike;
use regex::Regex;
use serde_json::Value;

fn s(pubv: &Value, key: &str) -> String {
    match pubv.get(key) {
        Some(Value::String(value)) => value.clone(),
        Some(Value::Number(value)) => value.to_string(),
        Some(Value::Bool(value)) => value.to_string(),
        _ => String::new(),
    }
}

fn authors(pubv: &Value) -> Vec<String> {
    pubv.get("authors")
        .and_then(Value::as_array)
        .map(|list| {
            list.iter()
                .filter_map(|item| item.as_str())
                .map(|item| item.trim().to_string())
                .filter(|item| !item.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub fn normalize_type(value: &str) -> &'static str {
    let raw = value.to_lowercase().replace(['_', ' '], "-");
    if raw.is_empty() {
        return "article";
    }
    if raw == "chap"
        || raw.contains("chapter")
        || raw.contains("incollection")
        || raw.contains("section")
    {
        return "chapter";
    }
    if raw.contains("conf") || raw.contains("proceeding") || raw.contains("inproceedings") {
        return "conference";
    }
    if raw == "thes"
        || raw.contains("thesis")
        || raw.contains("dissertation")
        || raw.contains("phd")
        || raw.contains("master")
    {
        return "thesis";
    }
    if raw == "rprt" || raw.contains("report") || raw.contains("techreport") {
        return "report";
    }
    if raw.contains("web") || raw.contains("blog") || raw.contains("site") {
        return "webpage";
    }
    if raw.contains("newspaper") || raw.contains("jornal") {
        return "newspaper";
    }
    if raw.contains("magazine") || raw.contains("revista") {
        return "magazine";
    }
    if raw.contains("book") || raw.contains("livro") {
        return "book";
    }
    "article"
}

fn join(values: &[String], separator: &str) -> String {
    values
        .iter()
        .filter(|value| !value.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join(separator)
}

fn format_authors(list: &[String], separator: &str) -> String {
    match list.len() {
        0 => String::new(),
        1 => list[0].clone(),
        2 => format!("{}{}{}", list[0], separator, list[1]),
        _ => format!(
            "{}, & {}",
            list[..list.len() - 1].join(", "),
            list[list.len() - 1]
        ),
    }
}

fn abnt_given_name(value: &str) -> String {
    let given = value.trim();
    if given.is_empty() {
        return String::new();
    }
    if Regex::new(r"^[A-Z]$").unwrap().is_match(given) {
        return format!("{given}.");
    }
    if Regex::new(r"^[A-Z]{2,4}$").unwrap().is_match(given) {
        return given
            .chars()
            .map(|letter| format!("{letter}."))
            .collect::<Vec<_>>()
            .join(" ");
    }
    if Regex::new(r"^[A-Z](?:\.[A-Z])*\.?$").unwrap().is_match(given) {
        return given
            .split('.')
            .filter(|part| !part.is_empty())
            .map(|letter| format!("{letter}."))
            .collect::<Vec<_>>()
            .join(" ");
    }
    given.to_string()
}

fn abnt_name(author: &str) -> String {
    let raw = author.split_whitespace().collect::<Vec<_>>().join(" ");
    if raw.is_empty() {
        return String::new();
    }
    if Regex::new(r"(?i)\s(ltda|s\.?a\.?|inc\.?|corp\.?)\b\.?$")
        .unwrap()
        .is_match(&raw)
    {
        return raw.to_uppercase();
    }
    if Regex::new(r"(?i)^(organização|organizacao|instituto|universidade|minist[ée]rio|associa[çc][ãa]o|funda[çc][ãa]o|centro|departamento|secretaria|conselho|comiss[ãa]o|empresa|companhia)\b")
        .unwrap()
        .is_match(&raw)
    {
        return raw.to_uppercase();
    }
    if let Some(comma) = raw.find(',') {
        let surname = raw[..comma].trim();
        let given = abnt_given_name(raw[comma + 1..].trim());
        return format!("{}, {}", surname.to_uppercase(), given)
            .trim()
            .to_string();
    }
    let parts: Vec<&str> = raw.split(' ').collect();
    if parts.len() == 1 {
        return raw.to_uppercase();
    }
    let given = abnt_given_name(&parts[..parts.len() - 1].join(" "));
    format!("{}, {}", parts[parts.len() - 1].to_uppercase(), given)
}

fn abnt_authors(list: &[String]) -> String {
    let names: Vec<String> = list
        .iter()
        .map(|name| abnt_name(name))
        .filter(|name| !name.is_empty())
        .collect();
    if names.is_empty() {
        return String::new();
    }
    if names.len() > 3 {
        return format!("{} et al.", names[0]);
    }
    names.join("; ")
}

fn sentence(value: &str) -> String {
    let text = value.trim();
    if text.is_empty() {
        return String::new();
    }
    if Regex::new(r"[.!?]$").unwrap().is_match(text) {
        text.to_string()
    } else {
        format!("{text}.")
    }
}

fn access_date(value: &str) -> String {
    let raw = value.trim();
    if raw.is_empty() {
        return String::new();
    }
    let parsed = if let Ok(date) = chrono::NaiveDate::parse_from_str(raw, "%Y-%m-%d") {
        Some(date)
    } else {
        chrono::DateTime::parse_from_rfc3339(raw)
            .ok()
            .map(|date| date.date_naive())
    };
    match parsed {
        Some(date) => {
            let months = [
                "jan.", "fev.", "mar.", "abr.", "maio", "jun.", "jul.", "ago.", "set.", "out.",
                "nov.", "dez.",
            ];
            format!(
                "{:02} {} {}",
                date.day(),
                months[date.month0() as usize],
                date.year()
            )
        }
        None => raw.to_string(),
    }
}

pub fn to_abnt(pubv: &Value) -> String {
    let kind = normalize_type(&s(pubv, "type"));
    let authors = abnt_authors(&authors(pubv));
    let author_part = if authors.is_empty() {
        String::new()
    } else {
        sentence(&authors)
    };
    let title = sentence(&s(pubv, "title"));
    let year = s(pubv, "year").trim().to_string();
    let place = s(pubv, "place").trim().to_string();
    let publisher = s(pubv, "publisher").trim().to_string();
    let edition = if s(pubv, "edition").is_empty() {
        String::new()
    } else {
        format!("{}. ed.", s(pubv, "edition").trim())
    };
    let journal = {
        let full = s(pubv, "fullJournal");
        if full.is_empty() { s(pubv, "journal") } else { full }
    }
    .trim()
    .to_string();
    let pages = s(pubv, "pages").trim().to_string();
    let volume = s(pubv, "volume").trim().to_string();
    let issue = s(pubv, "issue").trim().to_string();
    let doi = s(pubv, "doi").trim().to_string();
    let url = s(pubv, "url").trim().to_string();
    let accessed = access_date(&s(pubv, "accessed"));
    let mut pieces: Vec<String> = Vec::new();
    let publication = join(&[place.clone(), publisher.clone()], ": ");

    match kind {
        "book" => {
            pieces.push(author_part);
            pieces.push(title);
            pieces.push(edition);
            let tail = join(&[publication, year.clone()], ", ");
            if !tail.is_empty() {
                pieces.push(format!("{tail}."));
            }
        }
        "chapter" => {
            let book_title = sentence(&{
                let book = s(pubv, "bookTitle");
                if book.is_empty() { s(pubv, "journal") } else { book }
            });
            let editors = s(pubv, "editors")
                .split(';')
                .map(abnt_name)
                .filter(|name| !name.is_empty())
                .collect::<Vec<_>>()
                .join("; ");
            pieces.push(author_part);
            pieces.push(title);
            pieces.push("In:".into());
            if !editors.is_empty() {
                pieces.push(sentence(&editors));
            }
            pieces.push(book_title);
            pieces.push(edition);
            let tail = join(&[publication, year.clone()], ", ");
            if !tail.is_empty() {
                pieces.push(format!("{tail}."));
            }
            if !pages.is_empty() {
                pieces.push(format!("p. {pages}."));
            }
        }
        "conference" => {
            let conference = s(pubv, "conference").trim().to_string();
            let proceedings = sentence(&{
                let value = s(pubv, "proceedings");
                if value.is_empty() { s(pubv, "bookTitle") } else { value }
            });
            pieces.push(author_part);
            pieces.push(title);
            pieces.push("In:".into());
            if !conference.is_empty() {
                pieces.push(format!(
                    "{}.",
                    join(&[conference, year.clone(), place.clone()], ", ")
                ));
            }
            pieces.push(proceedings);
            let tail = join(&[publication, year.clone()], ", ");
            if !tail.is_empty() {
                pieces.push(format!("{tail}."));
            }
            if !pages.is_empty() {
                pieces.push(format!("p. {pages}."));
            }
        }
        "thesis" => {
            let institution = {
                let university = s(pubv, "university");
                if university.is_empty() {
                    s(pubv, "institution")
                } else {
                    university
                }
            }
            .trim()
            .to_string();
            let thesis_type = {
                let value = s(pubv, "thesisType").trim().to_string();
                if value.is_empty() {
                    "Tese".to_string()
                } else {
                    value
                }
            };
            pieces.push(author_part);
            pieces.push(title);
            if !year.is_empty() {
                pieces.push(format!("{year}."));
            }
            pieces.push(format!(
                "{} – {}{}{}.",
                thesis_type,
                if institution.is_empty() {
                    "[s. n.]"
                } else {
                    &institution
                },
                if place.is_empty() {
                    String::new()
                } else {
                    format!(", {place}")
                },
                if year.is_empty() {
                    String::new()
                } else {
                    format!(", {year}")
                }
            ));
        }
        "report" => {
            let institution = {
                let value = s(pubv, "institution");
                if value.is_empty() {
                    s(pubv, "university")
                } else {
                    value
                }
            }
            .trim()
            .to_string();
            pieces.push(author_part);
            pieces.push(title);
            let tail = join(&[join(&[place.clone(), institution], ": "), year.clone()], ", ");
            if !tail.is_empty() {
                pieces.push(format!("{tail}."));
            }
            let number = s(pubv, "reportNumber");
            if !number.is_empty() {
                pieces.push(format!("({number})."));
            }
        }
        "webpage" => {
            pieces.push(author_part);
            pieces.push(title);
            if !year.is_empty() {
                pieces.push(format!("{year}."));
            }
            if !url.is_empty() {
                pieces.push(format!("Disponível em: {url}."));
            }
            if !accessed.is_empty() {
                pieces.push(format!("Acesso em: {accessed}."));
            }
        }
        _ => {
            let section = s(pubv, "section").trim().to_string();
            let source = join(
                &[
                    journal.clone(),
                    place.clone(),
                    section,
                    if volume.is_empty() {
                        String::new()
                    } else {
                        format!("v. {volume}")
                    },
                    if issue.is_empty() {
                        String::new()
                    } else {
                        format!("n. {issue}")
                    },
                    if pages.is_empty() {
                        String::new()
                    } else {
                        format!("p. {pages}")
                    },
                    year.clone(),
                ],
                ", ",
            );
            pieces.push(author_part);
            pieces.push(title);
            if !source.is_empty() {
                pieces.push(format!("{source}."));
            }
            if !doi.is_empty() {
                pieces.push(format!("DOI: {doi}."));
            } else if !url.is_empty() {
                pieces.push(format!("Disponível em: {url}."));
                if !accessed.is_empty() {
                    pieces.push(format!("Acesso em: {accessed}."));
                }
            }
        }
    }

    if !matches!(kind, "article" | "webpage") && !doi.is_empty() {
        pieces.push(format!("DOI: {doi}."));
    }
    if !matches!(kind, "article" | "webpage") && !url.is_empty() && doi.is_empty() {
        pieces.push(format!("Disponível em: {url}."));
    }
    if !matches!(kind, "article" | "webpage") && !url.is_empty() && !accessed.is_empty() {
        pieces.push(format!("Acesso em: {accessed}."));
    }

    let joined = pieces
        .into_iter()
        .filter(|piece| !piece.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    Regex::new(r"\.\.+")
        .unwrap()
        .replace_all(&joined, ".")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn to_apa(pubv: &Value) -> String {
    let authors = format_authors(&authors(pubv), ", & ");
    let year = {
        let value = s(pubv, "year");
        if value.is_empty() {
            "(n.d.).".to_string()
        } else {
            format!("({value}).")
        }
    };
    let title = if s(pubv, "title").is_empty() {
        String::new()
    } else {
        format!("{}.", s(pubv, "title"))
    };
    let journal = s(pubv, "journal");
    let volume = if s(pubv, "volume").is_empty() {
        String::new()
    } else {
        format!(", {}", s(pubv, "volume"))
    };
    let issue = if s(pubv, "issue").is_empty() {
        String::new()
    } else {
        format!("({})", s(pubv, "issue"))
    };
    let pages = if s(pubv, "pages").is_empty() {
        String::new()
    } else {
        format!(", {}", s(pubv, "pages"))
    };
    let source = if journal.is_empty() {
        String::new()
    } else {
        format!("{journal}{volume}{issue}{pages}.")
    };
    let doi = if !s(pubv, "doi").is_empty() {
        format!(" https://doi.org/{}", s(pubv, "doi"))
    } else if !s(pubv, "url").is_empty() {
        format!(" {}", s(pubv, "url"))
    } else {
        String::new()
    };
    let body = [authors, year, title, source]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    format!("{}{doi}", body.trim())
}

fn to_chicago(pubv: &Value) -> String {
    let authors = format_authors(&authors(pubv), ", and ");
    let year = if s(pubv, "year").is_empty() {
        String::new()
    } else {
        format!(" ({})", s(pubv, "year"))
    };
    let title = if s(pubv, "title").is_empty() {
        String::new()
    } else {
        format!("\"{}\".", s(pubv, "title"))
    };
    let journal = s(pubv, "journal");
    let volume = if s(pubv, "volume").is_empty() {
        String::new()
    } else {
        format!(" {}", s(pubv, "volume"))
    };
    let issue = if s(pubv, "issue").is_empty() {
        String::new()
    } else {
        format!(", no. {}", s(pubv, "issue"))
    };
    let pages = if s(pubv, "pages").is_empty() {
        String::new()
    } else {
        format!(": {}", s(pubv, "pages"))
    };
    let source = if !journal.is_empty() {
        format!("{journal}{volume}{issue}{year}{pages}.")
    } else if !year.is_empty() {
        format!("{year}.")
    } else {
        String::new()
    };
    let doi = if s(pubv, "doi").is_empty() {
        String::new()
    } else {
        format!(" https://doi.org/{}", s(pubv, "doi"))
    };
    let body = [authors, title, source]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    format!("{}{doi}", body.trim())
}

fn to_mla(pubv: &Value) -> String {
    let authors = format_authors(&authors(pubv), ", and ");
    let title = if s(pubv, "title").is_empty() {
        String::new()
    } else {
        format!("\"{}\".", s(pubv, "title"))
    };
    let journal = s(pubv, "journal");
    let volume = if s(pubv, "volume").is_empty() {
        String::new()
    } else {
        format!(", vol. {}", s(pubv, "volume"))
    };
    let issue = if s(pubv, "issue").is_empty() {
        String::new()
    } else {
        format!(", no. {}", s(pubv, "issue"))
    };
    let year = if s(pubv, "year").is_empty() {
        String::new()
    } else {
        format!(", {}", s(pubv, "year"))
    };
    let pages = if s(pubv, "pages").is_empty() {
        String::new()
    } else {
        format!(", pp. {}", s(pubv, "pages"))
    };
    let source = if journal.is_empty() {
        String::new()
    } else {
        format!("{journal}{volume}{issue}{year}{pages}.")
    };
    let doi = if s(pubv, "doi").is_empty() {
        String::new()
    } else {
        format!(" https://doi.org/{}", s(pubv, "doi"))
    };
    let body = [authors, title, source]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    format!("{}{doi}", body.trim())
}

fn to_harvard(pubv: &Value) -> String {
    let authors = format_authors(&authors(pubv), " and ");
    let year = if s(pubv, "year").is_empty() {
        "(n.d.)".to_string()
    } else {
        format!("({})", s(pubv, "year"))
    };
    let title = if s(pubv, "title").is_empty() {
        String::new()
    } else {
        format!("'{}'", s(pubv, "title"))
    };
    let journal = s(pubv, "journal");
    let volume = if s(pubv, "volume").is_empty() {
        String::new()
    } else {
        format!(", {}", s(pubv, "volume"))
    };
    let issue = if s(pubv, "issue").is_empty() {
        String::new()
    } else {
        format!("({})", s(pubv, "issue"))
    };
    let pages = if s(pubv, "pages").is_empty() {
        String::new()
    } else {
        format!(", pp. {}", s(pubv, "pages"))
    };
    let source = if journal.is_empty() {
        String::new()
    } else {
        format!("{journal}{volume}{issue}{pages}.")
    };
    let doi = if s(pubv, "doi").is_empty() {
        String::new()
    } else {
        format!(" doi: {}.", s(pubv, "doi"))
    };
    let body = [authors, year, title, source]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    format!("{}{doi}", body.trim())
}

fn to_vancouver(pubv: &Value) -> String {
    let authors = authors(pubv)
        .iter()
        .map(|name| name.replace(',', "").replace('.', "").trim().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    let title = if s(pubv, "title").is_empty() {
        String::new()
    } else {
        format!("{}.", s(pubv, "title"))
    };
    let journal = if s(pubv, "journal").is_empty() {
        String::new()
    } else {
        format!("{}.", s(pubv, "journal"))
    };
    let year = if s(pubv, "year").is_empty() {
        String::new()
    } else {
        format!(" {}", s(pubv, "year"))
    };
    let volume = s(pubv, "volume");
    let issue = if s(pubv, "issue").is_empty() {
        String::new()
    } else {
        format!("({})", s(pubv, "issue"))
    };
    let pages = if s(pubv, "pages").is_empty() {
        String::new()
    } else {
        format!(":{}", s(pubv, "pages"))
    };
    let source = if !journal.is_empty() {
        format!("{journal}{year};{volume}{issue}{pages}.")
    } else if !year.is_empty() {
        format!("{year}.")
    } else {
        String::new()
    };
    let doi = if s(pubv, "doi").is_empty() {
        String::new()
    } else {
        format!(" doi:{}", s(pubv, "doi"))
    };
    let body = [
        if authors.is_empty() {
            String::new()
        } else {
            format!("{authors}.")
        },
        title,
        source,
    ]
    .into_iter()
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join(" ");
    format!("{}{doi}", body.trim())
}

pub fn format(style: &str, pubv: &Value) -> String {
    match style {
        "ABNT" => to_abnt(pubv),
        "MLA" => to_mla(pubv),
        "Harvard" => to_harvard(pubv),
        "Vancouver" => to_vancouver(pubv),
        "Chicago" => to_chicago(pubv),
        _ => to_apa(pubv),
    }
}

pub const STYLES: [&str; 6] = ["ABNT", "APA", "MLA", "Harvard", "Vancouver", "Chicago"];

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn formats_apa() {
        let pubv = json!({
            "authors": ["Ada Lovelace", "Alan Turing"],
            "year": 1950,
            "title": "Computing",
            "journal": "Nature",
            "volume": "1",
            "pages": "1-10"
        });
        assert_eq!(
            format("APA", &pubv),
            "Ada Lovelace, & Alan Turing (1950). Computing. Nature, 1, 1-10."
        );
    }

    #[test]
    fn formats_abnt() {
        let pubv = json!({
            "authors": ["Ada Lovelace"],
            "year": 1950,
            "title": "Computing",
            "journal": "Nature",
            "volume": "1",
            "pages": "1-10"
        });
        assert!(format("ABNT", &pubv).contains("LOVELACE, Ada."));
    }
}
