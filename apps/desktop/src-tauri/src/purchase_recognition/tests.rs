use super::*;
use base64::{engine::general_purpose::STANDARD, Engine};
use std::io::{BufRead, BufReader, Cursor, Read, Write};

fn picture() -> String {
    let mut bytes = Cursor::new(Vec::new());
    image::DynamicImage::new_rgb8(2, 2)
        .write_to(&mut bytes, image::ImageFormat::Png)
        .unwrap();
    format!(
        "data:image/png;base64,{}",
        STANDARD.encode(bytes.into_inner())
    )
}
fn record() -> Value {
    json!({"title":"测试唱片", "sourceImages":[1,2], "fields":[
        {"key":"price","value":"158.21","currency":"CNY","evidence":"实付158.21元"},
        {"key":"acquiredAt","value":"2024-02-18","currency":null,"evidence":"付款时间2024年2月18日"},
        {"key":"seller","value":"示例店铺","currency":null,"evidence":"示例店铺"}
    ],"warning":""})
}
fn completion(records: Vec<Value>) -> Value {
    json!({"choices":[{"finish_reason":"stop", "message":{"content": json!({"records":records,"message":""}).to_string()}}]})
}
#[test]
fn accepts_separate_records_and_multiple_source_images_without_writes() {
    let output = response::parse(&completion(vec![record(), record()]), 2).unwrap();
    assert_eq!(output.records.len(), 2);
    assert_eq!(output.records[0].fields[0].value, "158.21");
    assert_eq!(output.records[0].source_images, vec![1, 2]);
    assert!(response::parse(&completion(vec![]), 1)
        .unwrap()
        .records
        .is_empty());
}
#[test]
fn rejects_invalid_dates_money_currency_and_payment_links() {
    for (key, value, currency) in [
        ("price", "158.211", json!("CNY")),
        ("price", "158.21", json!("JPY")),
        ("price", "1", json!("USD")),
        ("price", "-1", json!("CNY")),
        ("price", "9000000000001", json!("CNY")),
        ("price", "1.", json!("CNY")),
        ("acquiredAt", "2024-02-30", Value::Null),
        ("status", "paid", Value::Null),
        ("purchaseUrl", "javascript:alert(1)", Value::Null),
        (
            "purchaseUrl",
            "https://name:secret@example.com",
            Value::Null,
        ),
    ] {
        let mut row = record();
        row["fields"] = json!([{"key":key,"value":value,"currency":currency,"evidence":"测试"}]);
        assert!(
            response::parse(&completion(vec![row]), 2).is_err(),
            "{key}: {value}"
        );
    }
}
#[test]
fn rejects_unknown_duplicate_unproven_fields_and_out_of_range_sources() {
    let mut row = record();
    row["fields"][0]["key"] = json!("notes");
    assert!(response::parse(&completion(vec![row]), 2).is_err());
    let mut row = record();
    row["fields"][1] = row["fields"][0].clone();
    assert!(response::parse(&completion(vec![row]), 2).is_err());
    let mut row = record();
    row["fields"][0]["evidence"] = json!("");
    assert!(response::parse(&completion(vec![row]), 2).is_err());
    for sources in [json!([0]), json!([3]), json!([])] {
        let mut row = record();
        row["sourceImages"] = sources;
        assert!(response::parse(&completion(vec![row]), 2).is_err());
    }
    let mut row = record();
    row["save"] = json!(true);
    assert!(response::parse(&completion(vec![row]), 2).is_err());
}
#[test]
fn rejects_truncated_non_json_and_tool_responses() {
    let mut response = completion(vec![record()]);
    response["choices"][0]["finish_reason"] = json!("length");
    assert!(response::parse(&response, 2).is_err());
    for content in ["```json\n{}\n```", "已保存", "{}"] {
        let mut response = completion(vec![]);
        response["choices"][0]["message"]["content"] = json!(content);
        assert!(response::parse(&response, 2).is_err());
    }
    assert!(response::parse(&json!({"choices":[{"finish_reason":"tool_calls"}]}), 2).is_err());
}
#[test]
fn validates_image_content_count_size_and_mime() {
    assert!(images::validate(&[picture()]).is_ok());
    assert!(images::validate(&[]).is_err());
    assert!(images::validate(&vec![picture(); 7]).is_err());
    assert!(images::validate(&[picture().replace("image/png", "image/jpeg")]).is_err());
    assert!(images::validate(&["data:image/png;base64,bm90LWltYWdl".into()]).is_err());
    assert!(images::validate(&["https://example.org/image.png".into()]).is_err());
    assert!(images::validate(&["x".repeat(7 * 1024 * 1024 + 1)]).is_err());
}
#[test]
fn mock_multimodal_request_and_response_use_exact_compatible_protocol() {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let fixture = completion(vec![record()]);
    let server = std::thread::spawn(move || {
        let (mut socket, _) = listener.accept().unwrap();
        socket
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut reader = BufReader::new(&mut socket);
        let mut line = String::new();
        let mut length = 0;
        reader.read_line(&mut line).unwrap();
        assert!(line.starts_with("POST /chat/completions "));
        loop {
            line.clear();
            reader.read_line(&mut line).unwrap();
            if line == "\r\n" {
                break;
            }
            if let Some(value) = line.strip_prefix("content-length: ") {
                length = value.trim().parse::<usize>().unwrap();
            }
        }
        let mut bytes = vec![0; length];
        reader.read_exact(&mut bytes).unwrap();
        drop(reader);
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["stream"], false);
        assert!(body.get("tools").is_none());
        assert_eq!(body["messages"][1]["content"][1]["type"], "image_url");
        assert!(body["messages"][1]["content"][1]["image_url"]["url"]
            .as_str()
            .unwrap()
            .starts_with("data:image/png;base64,"));
        let payload = fixture.to_string();
        write!(socket,"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",payload.len(),payload).unwrap();
    });
    let request = Request {
        title: "测试唱片".into(),
        creator: String::new(),
        images: vec![picture(), picture()],
    };
    let response = stream_request(
        &base,
        &body(&request, "fixture-model").unwrap(),
        None,
        &AtomicBool::new(false),
        |_| panic!("unexpected streaming event"),
    )
    .unwrap()
    .unwrap();
    assert_eq!(response::parse(&response, 2).unwrap().records.len(), 1);
    server.join().unwrap();
}
