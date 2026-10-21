use super::*;
use std::{fs, sync::Arc, thread, time::Instant};
fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../artifacts")
}
fn fixture() -> Runtime {
    let dir = root().join(format!("netease-test-{}", uuid::Uuid::new_v4()));
    fixture_at(dir)
}
fn fixture_at(dir: PathBuf) -> Runtime {
    fs::create_dir_all(&dir).unwrap();
    fs::hard_link(
        root().join("netease-runtime/node.exe"),
        dir.join("node.exe"),
    )
    .unwrap();
    fs::write(
        dir.join("runner.cjs"),
        r#"
const readline = require('node:readline');
const input = readline.createInterface({input:process.stdin});
input.on('close',()=>process.exit(0));
input.on('line', line => {
 const r=JSON.parse(line);
 if(r.arguments.query==='exit') return process.exit(3);
 if(r.arguments.query==='wait') return;
 if(r.arguments.query==='large') return process.stdout.write('x'.repeat(3*1024*1024)+'\n');
 process.stdout.write(JSON.stringify({id:r.id,body:{pid:process.pid}})+'\n');
});
"#,
    )
    .unwrap();
    Runtime::new(dir.clone(), dir.join("cache"))
}
#[cfg(windows)]
#[test]
fn canonical_resource_path_with_unicode_and_spaces_starts_and_reuses() {
    let mut runtime =
        fixture_at(root().join(format!("netease-test-路径 空格-{}", uuid::Uuid::new_v4())));
    // Tauri resolves the executable/resource directory with std::fs::canonicalize.
    runtime.root = fs::canonicalize(&runtime.root).unwrap();
    fs::create_dir_all(&runtime.cache).unwrap();
    runtime.cache = fs::canonicalize(&runtime.cache).unwrap();
    let first = runtime.request("search", json!({"query":"one"})).unwrap();
    assert_eq!(
        first,
        runtime.request("search", json!({"query":"two"})).unwrap()
    );
    runtime.shutdown();
    assert!(pid(&runtime).is_none());
}
fn pid(runtime: &Runtime) -> Option<u32> {
    runtime
        .process
        .lock()
        .unwrap()
        .as_ref()
        .map(process::Process::pid)
}
#[test]
fn missing_components_do_not_start_or_create_cache() {
    let path = root().join(format!("netease-missing-{}", uuid::Uuid::new_v4()));
    let runtime = Runtime::new(path.clone(), path.join("cache"));
    assert!(runtime.request("album", json!({"id":32311})).is_err());
    assert!(!path.exists());
    assert!(pid(&runtime).is_none());
}
#[test]
fn invalid_search_offsets_do_not_start_a_process() {
    let runtime = fixture();
    for offset in [
        json!(-1),
        json!(0.5),
        json!("20"),
        json!(4_294_967_296_u64),
        json!(null),
    ] {
        assert!(runtime
            .request("search", json!({"query":"album", "offset":offset}))
            .is_err());
        assert!(pid(&runtime).is_none());
    }
    assert!(runtime
        .request("search", json!({"query":"album", "offset":20}))
        .is_ok());
}
#[test]
fn lazy_reuse_restart_and_shutdown() {
    let runtime = fixture();
    assert!(pid(&runtime).is_none());
    assert!(runtime.request("not_registered", json!({})).is_err());
    assert!(pid(&runtime).is_none());
    let first = runtime.request("search", json!({"query":"one"})).unwrap();
    assert_eq!(
        first,
        runtime.request("search", json!({"query":"two"})).unwrap()
    );
    assert!(runtime.request("search", json!({"query":"exit"})).is_err());
    assert!(pid(&runtime).is_none());
    let next = runtime.request("search", json!({"query":"three"})).unwrap();
    assert_ne!(first, next);
    runtime.shutdown();
    assert!(pid(&runtime).is_none());
    assert!(runtime.request("album", json!({"id":32311})).is_err());
}
#[test]
fn timeout_and_oversized_response_release_the_process() {
    let mut runtime = fixture();
    runtime.timeout = Duration::from_millis(250);
    assert!(runtime.request("search", json!({"query":"wait"})).is_err());
    assert!(pid(&runtime).is_none());
    runtime.timeout = Duration::from_secs(3);
    assert!(runtime.request("search", json!({"query":"large"})).is_err());
    assert!(pid(&runtime).is_none());
    assert!(runtime
        .request("search", json!({"query":"recovered"}))
        .is_ok());
}
#[test]
fn simultaneous_requests_share_one_child() {
    let runtime = Arc::new(fixture());
    let tasks: Vec<_> = (0..4)
        .map(|n| {
            let r = runtime.clone();
            thread::spawn(move || r.request("search", json!({"query":n.to_string()})).unwrap())
        })
        .collect();
    let replies: Vec<_> = tasks.into_iter().map(|t| t.join().unwrap()).collect();
    assert!(replies.iter().all(|v| v == &replies[0]));
}
#[cfg(windows)]
#[test]
fn shutdown_interrupts_pending_query_and_child_exits() {
    use windows_sys::Win32::{
        Foundation::{CloseHandle, WAIT_OBJECT_0},
        System::Threading::{OpenProcess, WaitForSingleObject, PROCESS_SYNCHRONIZE},
    };
    let runtime = Arc::new(fixture());
    runtime.request("search", json!({"query":"ready"})).unwrap();
    let child = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, pid(&runtime).unwrap()) };
    assert!(!child.is_null());
    let r = runtime.clone();
    let task = thread::spawn(move || r.request("search", json!({"query":"wait"})));
    thread::sleep(Duration::from_millis(100));
    let started = Instant::now();
    runtime.shutdown();
    assert!(task.join().unwrap().is_err());
    assert!(started.elapsed() < Duration::from_secs(2));
    assert_eq!(unsafe { WaitForSingleObject(child, 2000) }, WAIT_OBJECT_0);
    unsafe {
        CloseHandle(child);
    }
}

#[cfg(windows)]
#[test]
fn parent_exit_cleans_up_owned_child() {
    use std::{
        os::windows::process::CommandExt,
        process::{Command, Stdio},
    };
    use windows_sys::Win32::{
        Foundation::{CloseHandle, WAIT_OBJECT_0},
        System::Threading::{
            OpenProcess, WaitForSingleObject, CREATE_NO_WINDOW, PROCESS_SYNCHRONIZE,
        },
    };
    let report = root().join(format!("netease-exit-{}.json", uuid::Uuid::new_v4()));
    let mut parent = Command::new(std::env::current_exe().unwrap())
        .args(["--exact", "tests::parent_exit_helper", "--ignored"])
        .env("DISCATELIER_NODE_EXIT_REPORT", &report)
        .creation_flags(CREATE_NO_WINDOW)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let started = Instant::now();
    while !report.is_file() && started.elapsed() < Duration::from_secs(8) {
        thread::sleep(Duration::from_millis(20));
    }
    assert!(report.is_file());
    let child_id: u32 = fs::read_to_string(&report).unwrap().parse().unwrap();
    let child = unsafe { OpenProcess(PROCESS_SYNCHRONIZE, 0, child_id) };
    assert!(!child.is_null());
    // Terminate only this synthetic parent: its destructors do not execute.
    parent.kill().unwrap();
    parent.wait().unwrap();
    assert_eq!(unsafe { WaitForSingleObject(child, 3000) }, WAIT_OBJECT_0);
    unsafe {
        CloseHandle(child);
    }
}

#[test]
#[ignore = "Subprocess entry point used only by parent_exit_cleans_up_owned_child"]
fn parent_exit_helper() {
    let runtime = fixture();
    runtime.request("search", json!({"query":"ready"})).unwrap();
    let report = std::env::var_os("DISCATELIER_NODE_EXIT_REPORT").unwrap();
    fs::write(report, pid(&runtime).unwrap().to_string()).unwrap();
    thread::sleep(Duration::from_secs(10));
}

#[test]
#[ignore = "Explicit offline check of the Release resource directory; no UI or API requests"]
fn packaged_runner_starts_with_canonical_release_path() {
    let resources = fs::canonicalize(root().join("../target/release/netease-runtime")).unwrap();
    let cache = root().join(format!("netease-boot-test-{}", uuid::Uuid::new_v4()));
    fs::create_dir_all(&cache).unwrap();
    let mut process =
        process::Process::spawn(&resources, &fs::canonicalize(cache).unwrap()).unwrap();
    // Unsupported operations are answered by the actual runner before loading
    // upstream modules, proving startup and pipes without contacting a service.
    let result = process.exchange(
        &json!({"id":"boot-check","operation":"invalid","arguments":{}}),
        &AtomicBool::new(false),
        Duration::from_secs(5),
    );
    assert_eq!(
        result.unwrap_err().message,
        "内置网易云查询失败，请稍后重试。"
    );
    assert!(!process.exited());
}

#[test]
#[ignore = "Explicit public network check using packaged Node and api-enhanced; no UI, credentials or disc access"]
fn actual_packaged_api() {
    let runtime = Runtime::new(
        fs::canonicalize(root().join("netease-runtime")).unwrap(),
        root().join(format!("netease-public-test-{}", uuid::Uuid::new_v4())),
    );
    assert!(pid(&runtime).is_none());
    let start = Instant::now();
    let album = runtime.request("album", json!({"id":32311})).unwrap();
    assert_eq!(album["code"], 200);
    assert_eq!(album["album"]["id"], 32311);
    assert!(!album["songs"].as_array().unwrap().is_empty());
    let first = pid(&runtime).unwrap();
    println!(
        "First request: {}ms, {} tracks",
        start.elapsed().as_millis(),
        album["songs"].as_array().unwrap().len()
    );
    let start = Instant::now();
    let search = runtime.request("search", json!({"query":"Lemon"})).unwrap();
    assert_eq!(search["code"], 200);
    assert!(!search["result"]["albums"].as_array().unwrap().is_empty());
    assert_eq!(pid(&runtime).unwrap(), first);
    println!(
        "Reused process: {}ms, {} results",
        start.elapsed().as_millis(),
        search["result"]["albums"].as_array().unwrap().len()
    );
    runtime.shutdown();
    assert!(pid(&runtime).is_none());
}
