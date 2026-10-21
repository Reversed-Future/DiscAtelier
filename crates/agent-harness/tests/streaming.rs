use discatelier_agent_harness::{Host, Model, Session, ToolResult};
use discatelier_contracts::AppError;
use serde_json::{json, Value};
use std::{
    io::{BufRead, BufReader, Read, Write},
    net::TcpListener,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    thread,
    time::{Duration, Instant},
};

#[derive(Default)]
struct Observer {
    partial: Vec<String>,
    calls: usize,
}
impl Host for Observer {
    fn execute(&mut self, _: &str, _: &str) -> Result<ToolResult, AppError> {
        self.calls += 1;
        Ok(ToolResult {
            value: json!({}),
            proposal: None,
            action: None,
        })
    }
    fn checkpoint(&mut self, _: &Session) -> Result<(), AppError> {
        Ok(())
    }
    fn progress(&mut self, s: &Session) {
        if let Some(text) = s.messages.last().and_then(|m| m.content.clone()) {
            self.partial.push(text);
        }
    }
}
fn server(
    events: Vec<String>,
    hang: bool,
    ready: Arc<AtomicBool>,
) -> (String, thread::JoinHandle<()>) {
    let socket = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", socket.local_addr().unwrap());
    let thread = thread::spawn(move || {
        let (mut stream, _) = socket.accept().unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut reader = BufReader::new(&mut stream);
        let mut line = String::new();
        let mut size = 0;
        loop {
            line.clear();
            reader.read_line(&mut line).unwrap();
            if line == "\r\n" {
                break;
            }
            if let Some((name, value)) = line.split_once(':') {
                if name.eq_ignore_ascii_case("content-length") {
                    size = value.trim().parse::<usize>().unwrap();
                }
            }
        }
        let mut bytes = vec![0; size];
        reader.read_exact(&mut bytes).unwrap();
        drop(reader);
        let body: Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(body["stream"], true);
        write!(
            stream,
            "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n"
        )
        .unwrap();
        stream.flush().unwrap();
        ready.store(true, Ordering::Release);
        if hang {
            thread::sleep(Duration::from_millis(800));
            return;
        }
        for event in events {
            if stream.write_all(event.as_bytes()).is_err() {
                break;
            }
            let _ = stream.flush();
            thread::sleep(Duration::from_millis(65));
        }
    });
    (base, thread)
}
fn chunk(text: &str, finish: Value) -> String {
    format!(
        "data: {}\n\n",
        json!({"choices":[{"index":0,"delta":{"content":text},"finish_reason":finish}]})
    )
}
#[test]
fn text_arrives_incrementally_and_final_text_is_persistable() {
    let (base, thread) = server(
        vec![
            chunk("一起", Value::Null),
            chunk("听音乐。", json!("stop")),
            "data: [DONE]\n\n".into(),
        ],
        false,
        Arc::new(AtomicBool::new(false)),
    );
    let mut host = Observer::default();
    let mut session = Session::default();
    discatelier_agent_harness::run(
        &mut session,
        "聊聊天",
        Model {
            base: &base,
            name: "fixture",
            key: None,
        },
        &mut host,
        &AtomicBool::new(false),
    )
    .unwrap();
    thread.join().unwrap();
    assert!(host.partial.contains(&"一起".into()));
    assert_eq!(
        session.messages.last().unwrap().content.as_deref(),
        Some("一起听音乐。")
    );
    assert_eq!(session.phase, "idle");
    assert_eq!(host.calls, 0);
    assert!(Session::restore(&serde_json::to_string(&session).unwrap()).is_ok());
}
#[test]
fn partial_tool_on_disconnect_is_never_executed() {
    let event = format!(
        "data: {}\n\n",
        json!({"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"x","type":"function","function":{"name":"propose_add_collection","arguments":"{"}}]},"finish_reason":null}]})
    );
    let (base, thread) = server(vec![event], false, Arc::new(AtomicBool::new(false)));
    let mut host = Observer::default();
    let mut s = Session::default();
    discatelier_agent_harness::run(
        &mut s,
        "添加",
        Model {
            base: &base,
            name: "fixture",
            key: None,
        },
        &mut host,
        &AtomicBool::new(false),
    )
    .unwrap();
    thread.join().unwrap();
    assert_eq!(host.calls, 0);
    assert_eq!(s.phase, "failed");
    assert!(s.action.is_none());
}
#[test]
fn cancel_interrupts_waiting_for_stream_bytes() {
    let ready = Arc::new(AtomicBool::new(false));
    let cancelled = Arc::new(AtomicBool::new(false));
    let (base, thread) = server(vec![], true, ready.clone());
    let flag = cancelled.clone();
    let cancel = thread::spawn(move || {
        while !ready.load(Ordering::Acquire) {
            thread::sleep(Duration::from_millis(5));
        }
        flag.store(true, Ordering::Release);
    });
    let mut host = Observer::default();
    let mut s = Session::default();
    let start = Instant::now();
    discatelier_agent_harness::run(
        &mut s,
        "停止",
        Model {
            base: &base,
            name: "fixture",
            key: None,
        },
        &mut host,
        &cancelled,
    )
    .unwrap();
    assert!(start.elapsed() < Duration::from_millis(700));
    assert_eq!(s.phase, "cancelled");
    assert_eq!(host.calls, 0);
    cancel.join().unwrap();
    thread.join().unwrap();
}
