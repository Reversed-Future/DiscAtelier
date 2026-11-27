use super::error;
use discatelier_contracts::AppError;
use serde::{de::Visitor, Deserialize, Deserializer, Serialize};
use std::fmt;

#[derive(Serialize, Debug)]
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub text: String,
    pub marks: Vec<Mark>,
}

#[derive(Serialize, Debug)]
pub struct Mark {
    // UTF-16 offset into the displayed text, for the WebView.
    pub index: usize,
    pub start: f64,
    pub end: f64,
}

#[derive(Deserialize)]
struct Output {
    transcription: Vec<Segment>,
}
#[derive(Deserialize)]
struct Segment {
    offsets: Offsets,
    text: String,
    #[serde(default)]
    tokens: Vec<Token>,
}
#[derive(Deserialize)]
struct Offsets {
    from: u64,
    to: u64,
}
#[derive(Deserialize)]
struct Token {
    #[serde(deserialize_with = "token_bytes")]
    text: Vec<u8>,
    offsets: Option<Offsets>,
}

// Whisper's byte-pair tokenizer can divide a single UTF-8 character between
// two JSON strings. The complete segment remains the authoritative Unicode text.
fn token_bytes<'de, D: Deserializer<'de>>(d: D) -> Result<Vec<u8>, D::Error> {
    struct Bytes;
    impl<'de> Visitor<'de> for Bytes {
        type Value = Vec<u8>;
        fn expecting(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            f.write_str("Whisper token bytes")
        }
        fn visit_bytes<E: serde::de::Error>(self, b: &[u8]) -> Result<Vec<u8>, E> {
            Ok(b.to_vec())
        }
    }
    d.deserialize_bytes(Bytes)
}

pub fn parse(bytes: &[u8], start: u64, seconds: f64) -> Result<Vec<Cue>, AppError> {
    let output: Output =
        serde_json::from_slice(bytes).map_err(|_| error("Whisper 返回的字幕格式无效。"))?;
    let absolute = |ms: u64| start as f64 + (ms as f64 / 1000.).min(seconds);
    let mut cues = Vec::new();
    for segment in output.transcription {
        let text = segment.text.trim();
        let begin = absolute(segment.offsets.from);
        let end = absolute(segment.offsets.to);
        if end <= begin || text.is_empty() || text == "[BLANK_AUDIO]" {
            continue;
        }
        let leading = segment.text.len() - segment.text.trim_start().len();
        let mut pos = 0;
        let mut marks: Vec<Mark> = Vec::new();
        for token in segment.tokens {
            if token.text.is_empty() || !segment.text.as_bytes()[pos..].starts_with(&token.text) {
                continue;
            }
            let byte_index = pos.saturating_sub(leading);
            pos += token.text.len();
            let Some(t) = token.offsets else { continue };
            if byte_index >= text.len() {
                continue;
            }
            let until = absolute(t.to).clamp(begin, end);
            if !text.is_char_boundary(byte_index) {
                if let Some(last) = marks.last_mut() {
                    last.end = last.end.max(until)
                }
                continue;
            }
            let index = text[..byte_index].encode_utf16().count();
            let at = absolute(t.from).clamp(marks.last().map_or(begin, |m| m.start), end);
            if let Some(last) = marks.last_mut().filter(|m| m.index == index) {
                last.end = until.max(last.end);
                continue;
            }
            marks.push(Mark {
                index,
                start: at,
                end: until.max(at),
            });
        }
        if pos < leading + text.len() {
            marks.clear()
        }
        cues.push(Cue {
            start: begin,
            end,
            text: text.into(),
            marks,
        });
    }
    Ok(cues)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn merges_utf8_fragments_and_skips_control_tokens() {
        let mut json = br#"{"transcription":[{"offsets":{"from":500,"to":2000},"text":" "#.to_vec();
        json.extend("海岸".as_bytes());
        json.extend(br#"","tokens":[{"text":"[_BEG_]"},{"text":" "#);
        json.push(0xe6);
        json.extend(br#"","offsets":{"from":550,"to":600}},{"text":""#);
        json.extend([0xb5, 0xb7]);
        json.extend(br#"","offsets":{"from":600,"to":800}},{"text":""#);
        json.extend("岸".as_bytes());
        json.extend(br#"","offsets":{"from":1100,"to":1500}}]}]}"#);
        let cues = parse(&json, 24, 12.).unwrap();
        assert_eq!(cues[0].text, "海岸");
        assert_eq!(cues[0].marks.len(), 2);
        assert_eq!((cues[0].marks[1].index, cues[0].marks[1].start), (1, 25.1));
    }
}
