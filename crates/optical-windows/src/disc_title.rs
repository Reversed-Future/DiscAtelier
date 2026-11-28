use quick_xml::{
    events::Event,
    name::{Namespace, ResolveResult},
    reader::NsReader,
};
use std::{fs, io::Read, path::Path};

const MAX_BYTES: u64 = 256 * 1024;
const LIB: Namespace = Namespace("urn:BDA:bdmv;disclib");
const INFO: Namespace = Namespace("urn:BDA:bdmv;discinfo");

pub fn read(root: &Path) -> Option<String> {
    let dir = root.join("BDMV").join("META").join("DL");
    let mut files = Vec::new();
    for entry in fs::read_dir(dir).ok()?.take(256).flatten() {
        let name = entry.file_name().into_string().ok().unwrap_or_default();
        let lang = name
            .strip_prefix("bdmt_")
            .and_then(|s| s.strip_suffix(".xml"));
        if lang.is_some_and(|s| s.len() == 3 && s.bytes().all(|b| b.is_ascii_lowercase()))
            && entry.file_type().is_ok_and(|t| t.is_file())
        {
            files.push((name, entry.path()));
        }
    }
    files.sort_by(|a, b| a.0.cmp(&b.0));
    files.into_iter().find_map(|(_, path)| {
        let mut xml = String::new();
        fs::File::open(path)
            .ok()?
            .take(MAX_BYTES + 1)
            .read_to_string(&mut xml)
            .ok()?;
        if xml.len() as u64 > MAX_BYTES {
            return None;
        }
        title(&xml)
    })
}

fn title(xml: &str) -> Option<String> {
    let path = [
        (LIB, "disclib"),
        (INFO, "discinfo"),
        (INFO, "title"),
        (INFO, "name"),
    ];
    let mut reader = NsReader::from_str(xml.trim_start_matches('\u{feff}'));
    let mut depth = 0usize;
    let mut matched = 0usize;
    let mut name = String::new();
    loop {
        let (ns, event) = reader.read_resolved_event().ok()?;
        match event {
            Event::Start(tag) => {
                if depth == matched
                    && path.get(depth).is_some_and(|(uri, local)| {
                        ns == ResolveResult::Bound(*uri) && tag.local_name().as_ref() == *local
                    })
                {
                    matched += 1;
                }
                depth += 1;
            }
            Event::Text(text) if matched == path.len() && depth == matched => {
                name.push_str(&text.xml10_content())
            }
            Event::CData(text) if matched == path.len() && depth == matched => {
                name.push_str(&text.xml10_content())
            }
            Event::GeneralRef(reference) if matched == path.len() && depth == matched => {
                if let Some(ch) = reference.resolve_char_ref().ok()? {
                    name.push(ch);
                } else {
                    name.push_str(quick_xml::escape::resolve_xml_entity(
                        &reference.xml10_content(),
                    )?);
                }
            }
            Event::End(_) => {
                if depth == matched && matched == path.len() {
                    let value = name.trim();
                    if !value.is_empty() && value.len() <= 512 {
                        return Some(value.to_owned());
                    }
                    name.clear();
                }
                depth = depth.checked_sub(1)?;
                matched = matched.min(depth);
            }
            Event::DocType(_) | Event::Eof => return None,
            _ => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reads_the_disc_name_in_its_namespace_only() {
        let xml = r#"<disclib xmlns="urn:BDA:bdmv;disclib" xmlns:x="urn:BDA:bdmv;discinfo"><x:discinfo><x:description><x:name>Other</x:name></x:description><x:title><x:name>君の名は。　本編DISC Blu-ray &amp; &#65;</x:name></x:title></x:discinfo></disclib>"#;
        assert_eq!(
            title(xml).as_deref(),
            Some("君の名は。　本編DISC Blu-ray & A")
        );
        assert_eq!(title(&xml.replace("urn:BDA:bdmv;discinfo", "other")), None);
    }
}
