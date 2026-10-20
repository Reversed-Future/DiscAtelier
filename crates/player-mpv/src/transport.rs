use discatelier_contracts::AppError;
use serde_json::{json, Value};
use std::time::Duration;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::windows::named_pipe::{ClientOptions, NamedPipeClient},
    time::timeout,
};

pub struct Ipc {
    pipe: NamedPipeClient,
    buffer: Vec<u8>,
}
impl Ipc {
    pub fn connect(name: &str) -> std::io::Result<Self> {
        ClientOptions::new().open(name).map(|pipe| Self {
            pipe,
            buffer: Vec::new(),
        })
    }
    pub async fn send(&mut self, id: u64, command: Value) -> Result<(), AppError> {
        let mut bytes =
            serde_json::to_vec(&json!({"command":command,"request_id":id,"async":true}))
                .map_err(|_| error())?;
        bytes.push(b'\n');
        timeout(Duration::from_secs(2), self.pipe.write_all(&bytes))
            .await
            .map_err(|_| error())?
            .map_err(|cause| AppError::new("player", format!("播放器连接写入失败：{cause}")))
    }
    pub async fn next(&mut self) -> Result<Option<Value>, AppError> {
        loop {
            if let Some(end) = self.buffer.iter().position(|b| *b == b'\n') {
                let line: Vec<u8> = self.buffer.drain(..=end).collect();
                return serde_json::from_slice(&line).map(Some).map_err(|cause| {
                    AppError::new("player", format!("播放器响应无法解析：{cause}"))
                });
            }
            let mut bytes = [0u8; 8192];
            match timeout(Duration::from_millis(100), self.pipe.read(&mut bytes)).await {
                Err(_) => return Ok(None),
                // Windows message pipes may complete a zero-byte server write.
                // MPV emits these for events without a JSON representation.
                // Process exit and heartbeat expiry are checked by the worker.
                Ok(Ok(0)) => {
                    tokio::time::sleep(Duration::from_millis(10)).await;
                    return Ok(None);
                }
                Ok(Err(cause)) => {
                    return Err(AppError::new(
                        "player",
                        format!("播放器连接读取失败：{cause}"),
                    ))
                }
                Ok(Ok(count)) => self.buffer.extend_from_slice(&bytes[..count]),
            }
            if self.buffer.len() > 1024 * 1024 {
                return Err(AppError::new("player", "播放器响应超出限制。"));
            }
        }
    }
}
fn error() -> AppError {
    AppError::new("player", "播放器连接已断开或响应超时。")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::net::windows::named_pipe::{PipeMode, ServerOptions};

    #[test]
    fn empty_pipe_messages_and_partial_json_survive_read_timeouts() {
        let name = format!(
            r"\\.\pipe\discatelier-transport-test-{}",
            uuid::Uuid::new_v4()
        );
        let server_name = name.clone();
        let (ready, wait) = std::sync::mpsc::channel();
        let server = std::thread::spawn(move || {
            tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .unwrap()
                .block_on(async {
                    let pipe = ServerOptions::new()
                        .pipe_mode(PipeMode::Message)
                        .create(&server_name)
                        .unwrap();
                    ready.send(()).unwrap();
                    pipe.connect().await.unwrap();
                    pipe.writable().await.unwrap();
                    pipe.try_write(&[]).unwrap();
                    tokio::time::sleep(Duration::from_millis(150)).await;
                    let mut pipe = pipe;
                    pipe.write_all(b"{\"event\":\"").await.unwrap();
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    pipe.write_all(b"file-loaded\"}\n{\"request_id\":7,\"error\":\"success\"}\n")
                        .await
                        .unwrap();
                    tokio::time::sleep(Duration::from_millis(100)).await;
                });
        });
        wait.recv().unwrap();
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap()
            .block_on(async {
                let mut client = Ipc::connect(&name).unwrap();
                let mut values = Vec::new();
                for _ in 0..20 {
                    if let Some(value) = client.next().await.unwrap() {
                        values.push(value);
                    }
                    if values.len() == 2 {
                        break;
                    }
                }
                assert_eq!(
                    values,
                    vec![
                        json!({"event":"file-loaded"}),
                        json!({"request_id":7,"error":"success"})
                    ]
                );
            });
        server.join().unwrap();
    }
}
