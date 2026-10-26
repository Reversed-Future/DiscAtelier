use discatelier_domain::MediumDraft;

pub fn number(key: &str, media: &[MediumDraft]) -> Option<usize> {
    let ordinal = key
        .strip_prefix("manual:")
        .or_else(|| key.strip_prefix("section:"))
        .unwrap_or(key);
    if !ordinal.is_empty() && ordinal.bytes().all(|byte| byte.is_ascii_digit()) {
        let value: usize = ordinal.parse().ok()?;
        return (value > 0 && value <= media.len()).then_some(value);
    }
    for (prefix, id) in [("CD", "cd"), ("DVD", "dvd"), ("BD", "bd"), ("BR", "bd")] {
        if let Some(suffix) = key.strip_prefix(prefix) {
            let ordinal = if suffix.is_empty() {
                1
            } else {
                suffix.parse::<usize>().ok()?
            };
            return media
                .iter()
                .enumerate()
                .filter(|(_, medium)| medium.carrier_id == id)
                .nth(ordinal.checked_sub(1)?)
                .map(|(index, _)| index + 1);
        }
    }
    (key == "unassigned" && media.len() == 1).then_some(1)
}
