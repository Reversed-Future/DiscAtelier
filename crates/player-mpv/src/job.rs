use discatelier_contracts::AppError;
use std::{mem::size_of, os::windows::io::AsRawHandle, process::Child, ptr};
use windows_sys::Win32::{
    Foundation::{CloseHandle, HANDLE},
    System::JobObjects::*,
};

/// The job is created and used on the playback worker thread.
/// Closing it also terminates only the helper processes started by this player.
pub struct PlayerJob(HANDLE);
impl PlayerJob {
    pub fn attach(child: &mut Child) -> Result<Self, AppError> {
        let handle = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
        if handle.is_null() {
            let _ = child.kill();
            return Err(error());
        }
        let job = Self(handle);
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let configured = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        let attached = configured != 0
            && unsafe { AssignProcessToJobObject(handle, child.as_raw_handle() as _) } != 0;
        if !attached {
            let _ = child.kill();
            let _ = child.wait();
            return Err(error());
        }
        Ok(job)
    }
}
impl Drop for PlayerJob {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
fn error() -> AppError {
    AppError::new("player", "无法建立播放器进程保护，已停止启动。")
}
