use crate::error;
use discatelier_contracts::AppError;
use std::{mem::size_of, os::windows::io::AsRawHandle, process::Child, ptr};
use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};

// Owned kernel handle; may be closed on another thread, never borrowed externally.
pub struct Job(isize);
impl Job {
    pub fn attach(child: &Child) -> Result<Self, AppError> {
        let handle = unsafe { CreateJobObjectW(ptr::null(), ptr::null()) };
        if handle.is_null() {
            return Err(error("无法建立内置服务进程保护。"));
        }
        let job = Self(handle as isize);
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = unsafe { std::mem::zeroed() };
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = unsafe {
            SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &limits as *const _ as _,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            )
        };
        if ok == 0 || unsafe { AssignProcessToJobObject(handle, child.as_raw_handle() as _) } == 0 {
            return Err(error("无法建立内置服务进程保护。"));
        }
        Ok(job)
    }
}
impl Drop for Job {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0 as _);
        }
    }
}
