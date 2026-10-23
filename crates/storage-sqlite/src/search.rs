//! Local library search: case-insensitive, simplified/traditional Chinese,
//! partial substring and a small typo tolerance. No network or user data leaves
//! the process.

#[cfg(windows)]
fn simplify(value: &str) -> String {
    use std::ptr;
    use windows_sys::Win32::Globalization::{
        LCMapStringEx, LCMAP_SIMPLIFIED_CHINESE, LOCALE_NAME_INVARIANT,
    };
    let source = value.encode_utf16().chain(Some(0)).collect::<Vec<_>>();
    let mut target = vec![0u16; source.len().saturating_mul(2).saturating_add(8)];
    let length = unsafe {
        LCMapStringEx(
            LOCALE_NAME_INVARIANT,
            LCMAP_SIMPLIFIED_CHINESE,
            source.as_ptr(),
            -1,
            target.as_mut_ptr(),
            i32::try_from(target.len()).unwrap_or(i32::MAX),
            ptr::null(),
            ptr::null(),
            0,
        )
    };
    if length <= 1 {
        return value.to_owned();
    }
    let length = (length as usize).saturating_sub(1).min(target.len());
    String::from_utf16_lossy(&target[..length])
}

#[cfg(not(windows))]
fn simplify(value: &str) -> String {
    value.to_owned()
}

fn width(character: char) -> char {
    match character as u32 {
        0x3000 => ' ',
        0xff01..=0xff5e => char::from_u32(character as u32 - 0xfee0).unwrap_or(character),
        _ => character,
    }
}

fn normalize(value: &str) -> String {
    let folded = value
        .chars()
        .map(width)
        .flat_map(char::to_lowercase)
        .collect::<String>();
    simplify(&folded)
}

fn compact(value: &str) -> Vec<char> {
    value
        .chars()
        .filter(|character| character.is_alphanumeric())
        .collect()
}

fn distance(left: &[char], right: &[char]) -> usize {
    let mut previous = (0..=right.len()).collect::<Vec<_>>();
    let mut current = vec![0; right.len() + 1];
    for (row, left) in left.iter().enumerate() {
        current[0] = row + 1;
        for (column, right) in right.iter().enumerate() {
            let substitution = previous[column] + usize::from(left != right);
            current[column + 1] = (current[column] + 1)
                .min(previous[column + 1] + 1)
                .min(substitution);
        }
        std::mem::swap(&mut previous, &mut current);
    }
    previous[right.len()]
}

fn is_cjk(character: char) -> bool {
    matches!(character as u32, 0x3400..=0x9fff | 0xf900..=0xfaff)
}

fn fuzzy(field: &[char], query: &[char], tolerance: usize) -> bool {
    // Short Latin queries already use direct substring matching. Allowing a
    // typo there would make "lem" match unrelated format/edition text such as
    // "Limited". Three-character CJK queries may still use one typo.
    let short_cjk = query.len() == 3 && query.iter().all(|character| is_cjk(*character));
    if query.len() < 3 || (query.len() == 3 && !short_cjk) || field.len() + tolerance < query.len()
    {
        return false;
    }
    let shortest = query.len().saturating_sub(tolerance).max(1);
    let longest = (query.len() + tolerance).min(field.len());
    for length in shortest..=longest {
        for window in field.windows(length) {
            if distance(window, query) <= tolerance {
                return true;
            }
        }
    }
    false
}

pub(crate) fn matches(query: &str, fields: &[&str], identifiers: &[String]) -> bool {
    let tokens = query
        .split_whitespace()
        .map(normalize)
        .filter(|token| !token.is_empty())
        .collect::<Vec<_>>();
    if tokens.is_empty() {
        return true;
    }
    let fields = fields
        .iter()
        .copied()
        .chain(identifiers.iter().map(String::as_str))
        .map(normalize)
        .map(|text| {
            let chars = compact(&text);
            (text, chars)
        })
        .collect::<Vec<_>>();
    tokens.iter().all(|token| {
        let chars = compact(token);
        if chars.is_empty() {
            return false;
        }
        let tolerance = if chars.len() <= 5 { 1 } else { 2 };
        fields.iter().any(|(text, field)| {
            text.contains(token)
                || field
                    .windows(chars.len())
                    .any(|window| window == chars.as_slice())
                || fuzzy(field, &chars, tolerance)
        })
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn case_width_and_partial_text_match() {
        assert!(matches("LEMON", &["Lemon"], &[]));
        assert!(matches("ｌｅｍｏｎ", &["Lemon"], &[]));
        assert!(matches("lem", &["Lemon"], &[]));
        assert!(matches("mon", &["Lemon"], &[]));
        assert!(!matches("lem", &["Limited"], &[]));
    }

    #[test]
    fn simplified_and_traditional_are_equivalent() {
        assert!(matches("陈奕迅", &["陳奕迅"], &[]));
        assert!(matches("陳奕迅", &["陈奕迅"], &[]));
    }

    #[test]
    fn small_typos_still_match_but_empty_noise_does_not() {
        assert!(matches("lmon", &["Lemon"], &[]));
        assert!(matches("陈奕讯", &["陈奕迅"], &[]));
        assert!(!matches("zzzz", &["Lemon"], &[]));
    }

    #[test]
    fn multiple_terms_must_all_match_across_fields() {
        assert!(matches("lemon 米津", &["Lemon", "米津玄師"], &[]));
        assert!(!matches("lemon 米津", &["Lemon", "Radwimps"], &[]));
        assert!(!matches("lemon 米津", &["Other", "Nobody"], &[]));
        assert!(matches("4988", &["Lemon"], &["4988031423806".into()]));
    }
}
