use crate::error;
use discatelier_contracts::AppError;
use serde_json::Value;
use std::{
    io::{BufRead, BufReader, Write},
    path::Path,
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc,
    },
    thread,
    time::{Duration, Instant},
};

pub struct Process {
    child: Child,
    input: ChildStdin,
    output: mpsc::Receiver<Result<Value, ()>>,
    reader: Option<thread::JoinHandle<()>>,
    #[cfg(windows)]
    job: Option<crate::job::Job>,
}
impl Process {
    pub fn spawn(root: &Path, cache: &Path) -> Result<Self, AppError> {
        let node = root.join("node.exe");
        let runner = root.join("runner.cjs");
        if !node.is_file() || !runner.is_file() {
            return Err(error("内置网易云组件缺失，请使用包含运行组件的完整程序。"));
        }
        std::fs::create_dir_all(cache).map_err(|_| error("无法创建网易云缓存目录。"))?;
        let mut command = Command::new(node);
        command
            .arg(runner)
            .current_dir(cache)
            .env("TEMP", cache)
            .env("TMP", cache)
            .env_remove("NODE_OPTIONS")
            .env_remove("NODE_PATH")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(windows_sys::Win32::System::Threading::CREATE_NO_WINDOW);
        }
        let mut child = command.spawn().map_err(|_| error("内置网易云启动失败。"))?;
        #[cfg(windows)]
        let job = match crate::job::Job::attach(&child) {
            Ok(job) => job,
            Err(e) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(e);
            }
        };
        let input = child.stdin.take().expect("piped stdin");
        let output = child.stdout.take().expect("piped stdout");
        let (send, receive) = mpsc::sync_channel(2);
        let reader = thread::spawn(move || {
            let mut reader = BufReader::new(output);
            loop {
                // Bound each line before allocating or parsing the response.
                let mut bytes = Vec::new();
                loop {
                    let buffer = match reader.fill_buf() {
                        Ok(v) => v,
                        Err(_) => return,
                    };
                    if buffer.is_empty() {
                        return;
                    }
                    let end = buffer.iter().position(|&b| b == b'\n');
                    let count = end.map_or(buffer.len(), |n| n + 1);
                    if bytes.len() + count > 2 * 1024 * 1024 + 1 {
                        let _ = send.send(Err(()));
                        return;
                    }
                    bytes.extend_from_slice(&buffer[..count]);
                    reader.consume(count);
                    if end.is_some() {
                        break;
                    }
                }
                if send
                    .send(serde_json::from_slice(&bytes).map_err(|_| ()))
                    .is_err()
                {
                    return;
                }
            }
        });
        Ok(Self {
            child,
            input,
            output: receive,
            reader: Some(reader),
            #[cfg(windows)]
            job: Some(job),
        })
    }
    pub fn exited(&mut self) -> bool {
        !matches!(self.child.try_wait(), Ok(None))
    }
    pub fn exchange(
        &mut self,
        request: &Value,
        closing: &AtomicBool,
        timeout: Duration,
    ) -> Result<Value, AppError> {
        let mut bytes = serde_json::to_vec(request).map_err(|_| error("查询参数无效。"))?;
        bytes.push(b'\n');
        self.input
            .write_all(&bytes)
            .and_then(|_| self.input.flush())
            .map_err(|_| error("内置网易云已中断，请重试。"))?;
        let started = Instant::now();
        loop {
            if closing.load(Ordering::Acquire) {
                return Err(error("应用正在退出。"));
            }
            if started.elapsed() >= timeout {
                return Err(error("网易云查询超时，请重试。"));
            }
            match self.output.recv_timeout(Duration::from_millis(50)) {
                Ok(Ok(response)) => {
                    if response.get("id") != request.get("id") {
                        return Err(error("内置服务响应不匹配。"));
                    }
                    if response.get("error").is_some() {
                        return Err(error("内置网易云查询失败，请稍后重试。"));
                    }
                    return response
                        .get("body")
                        .cloned()
                        .ok_or_else(|| error("内置服务响应不完整。"));
                }
                Ok(Err(())) => return Err(error("内置服务响应无效或过大。")),
                Err(mpsc::RecvTimeoutError::Disconnected) => {
                    return Err(error("内置网易云已退出，请重试。"))
                }
                Err(mpsc::RecvTimeoutError::Timeout) => (),
            }
        }
    }
    #[cfg(test)]
    pub fn pid(&self) -> u32 {
        self.child.id()
    }
}
impl Drop for Process {
    fn drop(&mut self) {
        #[cfg(windows)]
        drop(self.job.take());
        let _ = self.child.kill();
        let _ = self.child.wait();
        // Disconnect first so a noisy child cannot leave the reader blocked on send.
        let (_, replacement) = mpsc::channel();
        drop(std::mem::replace(&mut self.output, replacement));
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}
