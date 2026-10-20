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
};

fn server(
    replies: Vec<Value>,
    cancel: Option<Arc<AtomicBool>>,
) -> (String, thread::JoinHandle<Vec<Value>>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let address = format!("http://{}", listener.local_addr().unwrap());
    let task = thread::spawn(move || {
        let mut received = Vec::new();
        for reply in replies {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(&mut stream);
            let mut line = String::new();
            reader.read_line(&mut line).unwrap();
            assert!(line.starts_with("POST /chat/completions "));
            let mut size = 0;
            loop {
                line.clear();
                reader.read_line(&mut line).unwrap();
                if line == "\r\n" {
                    break;
                }
                if let Some((key, value)) = line.split_once(':') {
                    if key.eq_ignore_ascii_case("content-length") {
                        size = value.trim().parse::<usize>().unwrap();
                    }
                }
            }
            let mut body = vec![0; size];
            reader.read_exact(&mut body).unwrap();
            received.push(serde_json::from_slice(&body).unwrap());
            drop(reader);
            if let Some(flag) = &cancel {
                flag.store(true, Ordering::Release);
            }
            let body = reply.to_string();
            write!(stream,"HTTP/1.1 200 OK\r\nContent-Length: {}\r\nContent-Type: application/json\r\nConnection: close\r\n\r\n{}",body.len(),body).unwrap();
        }
        received
    });
    (address, task)
}
#[derive(Default)]
struct FakeHost {
    calls: Vec<String>,
    saved: Vec<Session>,
}
impl Host for FakeHost {
    fn execute(&mut self, name: &str, _args: &str) -> Result<ToolResult, AppError> {
        self.calls.push(name.into());
        Ok(ToolResult {
            value: json!({"count":2}),
            proposal: None,
        })
    }
    fn checkpoint(&mut self, s: &Session) -> Result<(), AppError> {
        self.saved.push(s.clone());
        Ok(())
    }
}
fn call() -> Value {
    json!({"choices":[{"finish_reason":"tool_calls","message":{"role":"assistant","content":null,"tool_calls":[{"id":"call1","type":"function","function":{"name":"search_library","arguments":"{}"}}]}}]})
}
#[test]
fn tool_result_is_correlated_and_persisted_before_followup() {
    let (base, task) = server(
        vec![
            call(),
            json!({"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"2 records"}}]}),
        ],
        None,
    );
    let mut host = FakeHost::default();
    let mut session = Session::default();
    discatelier_agent_harness::run(
        &mut session,
        "Count",
        Model {
            base: &base,
            name: "fixture",
            key: None,
        },
        &mut host,
        &AtomicBool::new(false),
    )
    .unwrap();
    assert_eq!(host.calls, vec!["search_library"]);
    assert_eq!(session.phase, "idle");
    let requests = task.join().unwrap();
    let messages = requests[1]["messages"].as_array().unwrap();
    assert_eq!(messages.last().unwrap()["tool_call_id"], "call1");
    assert_eq!(messages.last().unwrap()["role"], "tool");
    assert_eq!(requests[0]["parallel_tool_calls"], false);
    assert!(host
        .saved
        .iter()
        .any(|s| s.messages.last().is_some_and(|m| m.role == "tool")));
    assert!(Session::restore(&serde_json::to_string(&session).unwrap()).is_ok());
}
#[test]
fn cancelled_response_never_executes_a_tool() {
    let cancelled = Arc::new(AtomicBool::new(false));
    let (base, task) = server(vec![call()], Some(cancelled.clone()));
    let mut host = FakeHost::default();
    let mut session = Session::default();
    discatelier_agent_harness::run(
        &mut session,
        "Cancel",
        Model {
            base: &base,
            name: "fixture",
            key: None,
        },
        &mut host,
        &cancelled,
    )
    .unwrap();
    task.join().unwrap();
    assert!(host.calls.is_empty());
    assert_eq!(session.phase, "cancelled");
}

#[test]
fn unregistered_tool_never_reaches_host() {
    let mut response = call();
    response["choices"][0]["message"]["tool_calls"][0]["function"]["name"] = json!("execute_shell");
    let (base, task) = server(
        vec![
            response,
            json!({"choices":[{"finish_reason":"stop","message":{"role":"assistant","content":"Unavailable"}}]}),
        ],
        None,
    );
    let mut host = FakeHost::default();
    let mut session = Session::default();
    discatelier_agent_harness::run(
        &mut session,
        "Run",
        Model {
            base: &base,
            name: "fixture",
            key: None,
        },
        &mut host,
        &AtomicBool::new(false),
    )
    .unwrap();
    let requests = task.join().unwrap();
    assert!(host.calls.is_empty());
    let messages = requests[1]["messages"].as_array().unwrap();
    let result: Value =
        serde_json::from_str(messages.last().unwrap()["content"].as_str().unwrap()).unwrap();
    assert!(result["error"].is_string());
}
