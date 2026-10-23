use discatelier_contracts::{AppError, OpticalDrive, OpticalKind, OpticalMedium, OpticalStatus};
use std::{mem::size_of, path::Path, ptr};
use windows_sys::Win32::{
    Foundation::{
        CloseHandle, GetLastError, ERROR_NOT_READY, ERROR_NO_MEDIA_IN_DRIVE, GENERIC_READ,
        GENERIC_WRITE, HANDLE, INVALID_HANDLE_VALUE,
    },
    Storage::FileSystem::{
        CreateFileW, GetDriveTypeW, GetLogicalDrives, GetVolumeInformationW, FILE_SHARE_READ,
        FILE_SHARE_WRITE, OPEN_EXISTING,
    },
    System::{
        Ioctl::{
            PropertyStandardQuery, StorageDeviceProperty, IOCTL_STORAGE_CHECK_VERIFY2,
            IOCTL_STORAGE_EJECT_MEDIA, IOCTL_STORAGE_QUERY_PROPERTY, STORAGE_DEVICE_DESCRIPTOR,
            STORAGE_PROPERTY_QUERY,
        },
        WindowsProgramming::DRIVE_CDROM,
        IO::DeviceIoControl,
    },
};

struct Device(HANDLE);
impl Drop for Device {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(Some(0)).collect()
}
fn text(value: &[u16]) -> String {
    String::from_utf16_lossy(&value[..value.iter().position(|v| *v == 0).unwrap_or(value.len())])
}

fn name(device: &Device) -> Option<String> {
    let query = STORAGE_PROPERTY_QUERY {
        PropertyId: StorageDeviceProperty,
        QueryType: PropertyStandardQuery,
        AdditionalParameters: [0],
    };
    let mut bytes = vec![0u8; 4096];
    let mut used = 0;
    let ok = unsafe {
        DeviceIoControl(
            device.0,
            IOCTL_STORAGE_QUERY_PROPERTY,
            &query as *const _ as _,
            size_of::<STORAGE_PROPERTY_QUERY>() as u32,
            bytes.as_mut_ptr() as _,
            bytes.len() as u32,
            &mut used,
            ptr::null_mut(),
        )
    };
    if ok == 0 || (used as usize) < size_of::<STORAGE_DEVICE_DESCRIPTOR>() {
        return None;
    }
    bytes.truncate(used as usize);
    let descriptor =
        unsafe { ptr::read_unaligned(bytes.as_ptr() as *const STORAGE_DEVICE_DESCRIPTOR) };
    let read = |offset: u32| -> Option<String> {
        if offset == 0 {
            return None;
        }
        let raw = bytes.get(offset as usize..)?;
        let end = raw.iter().position(|byte| *byte == 0)?;
        Some(String::from_utf8_lossy(&raw[..end]).trim().to_owned())
    };
    let parts: Vec<_> = [
        read(descriptor.VendorIdOffset),
        read(descriptor.ProductIdOffset),
    ]
    .into_iter()
    .flatten()
    .filter(|v| !v.is_empty())
    .collect();
    (!parts.is_empty()).then(|| parts.join(" "))
}

fn read_audio_toc(path: &[u16]) -> Result<Option<OpticalMedium>, u32> {
    // READ_TOC requires FILE_READ_ACCESS. The metadata-only handle has no access
    // rights and returns ERROR_ACCESS_DENIED on real CD drives. Open a separate
    // read-only handle for this bounded query; never request GENERIC_WRITE.
    let raw = unsafe {
        CreateFileW(
            path.as_ptr(),
            GENERIC_READ,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null(),
            OPEN_EXISTING,
            0,
            ptr::null_mut(),
        )
    };
    if raw == INVALID_HANDLE_VALUE {
        return Err(unsafe { GetLastError() });
    }
    let device = Device(raw);
    let mut toc = [0u8; 804];
    let mut returned = 0;
    let ok = unsafe {
        DeviceIoControl(
            device.0,
            windows_sys::Win32::Devices::Cdrom::IOCTL_CDROM_READ_TOC,
            ptr::null(),
            0,
            toc.as_mut_ptr() as _,
            toc.len() as u32,
            &mut returned,
            ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(unsafe { GetLastError() });
    }
    Ok(toc
        .get(..returned as usize)
        .and_then(crate::audio_cd::decode))
}

pub fn eject(mount_point: &str) -> Result<(), AppError> {
    let mount = mount_point.trim().trim_end_matches('\\');
    let mut chars = mount.chars();
    let valid = mount.len() == 2
        && chars
            .next()
            .is_some_and(|value| value.is_ascii_alphabetic())
        && chars.next() == Some(':');
    if !valid {
        return Err(AppError::new("device", "光驱盘符无效。"));
    }
    let path = wide(&format!("\\\\.\\{mount}"));
    let open = |access| unsafe {
        CreateFileW(
            path.as_ptr(),
            access,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            ptr::null(),
            OPEN_EXISTING,
            0,
            ptr::null_mut(),
        )
    };
    let mut raw = open(GENERIC_READ | GENERIC_WRITE);
    if raw == INVALID_HANDLE_VALUE {
        raw = open(GENERIC_READ);
    }
    if raw == INVALID_HANDLE_VALUE {
        raw = open(0);
    }
    if raw == INVALID_HANDLE_VALUE {
        return Err(AppError::new(
            "device",
            format!("无法打开光驱 {mount}，可能正被其他程序占用。"),
        ));
    }
    let device = Device(raw);
    let mut returned = 0;
    let ok = unsafe {
        DeviceIoControl(
            device.0,
            IOCTL_STORAGE_EJECT_MEDIA,
            ptr::null(),
            0,
            ptr::null_mut(),
            0,
            &mut returned,
            ptr::null_mut(),
        )
    };
    if ok == 0 {
        return Err(AppError::new(
            "device",
            format!("光驱 {mount} 弹出失败，托盘可能已打开或设备不支持。"),
        ));
    }
    Ok(())
}

pub fn enumerate() -> Result<Vec<OpticalDrive>, AppError> {
    let drives = unsafe { GetLogicalDrives() };
    if drives == 0 {
        return Err(AppError::new("device", "无法枚举光驱。"));
    }
    let mut result = Vec::new();
    for bit in 0..26 {
        if drives & (1 << bit) == 0 {
            continue;
        }
        let mount_point = format!("{}:", char::from(b'A' + bit));
        let root = format!("{mount_point}\\");
        let root_wide = wide(&root);
        if unsafe { GetDriveTypeW(root_wide.as_ptr()) } != DRIVE_CDROM {
            continue;
        }
        let path = wide(&format!("\\\\.\\{mount_point}"));
        // Zero desired access: metadata query only. Never request write access.
        // Sharing write access does not grant this handle permission to write.
        let raw = unsafe {
            CreateFileW(
                path.as_ptr(),
                0,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                ptr::null(),
                OPEN_EXISTING,
                0,
                ptr::null_mut(),
            )
        };
        let mut drive = OpticalDrive {
            mount_point,
            name: String::new(),
            status: OpticalStatus::Unavailable,
            medium: None,
            error: None,
        };
        if raw == INVALID_HANDLE_VALUE {
            drive.error = Some(format!("光驱暂不可访问（{}）", unsafe {
                GetLastError()
            }));
            result.push(drive);
            continue;
        }
        let device = Device(raw);
        drive.name = name(&device).unwrap_or_else(|| "光驱".into());
        let mut returned = 0;
        if unsafe {
            DeviceIoControl(
                device.0,
                IOCTL_STORAGE_CHECK_VERIFY2,
                ptr::null(),
                0,
                ptr::null_mut(),
                0,
                &mut returned,
                ptr::null_mut(),
            )
        } == 0
        {
            let code = unsafe { GetLastError() };
            if code == ERROR_NOT_READY || code == ERROR_NO_MEDIA_IN_DRIVE {
                drive.status = OpticalStatus::Empty;
            } else {
                drive.error = Some(format!("介质暂不可读取（{code}）"));
            }
            result.push(drive);
            continue;
        }
        let toc_error = match read_audio_toc(&path) {
            Ok(Some(medium)) => {
                drive.status = OpticalStatus::Ready;
                if medium.playlists.is_empty() {
                    drive.error = Some("已识别音轨；混合模式或非标准起始曲号暂不支持播放。".into());
                }
                drive.medium = Some(medium);
                result.push(drive);
                continue;
            }
            Ok(None) => None,
            Err(code) => Some(code),
        };
        let mut label = [0u16; 261];
        let mut fs = [0u16; 261];
        let mut serial = 0;
        let ok = unsafe {
            GetVolumeInformationW(
                root_wide.as_ptr(),
                label.as_mut_ptr(),
                label.len() as u32,
                &mut serial,
                ptr::null_mut(),
                ptr::null_mut(),
                fs.as_mut_ptr(),
                fs.len() as u32,
            )
        };
        if ok == 0 {
            drive.error = Some(format!(
                "已检测到介质，文件系统暂不可读取（{}）",
                unsafe { GetLastError() }
            ));
        } else {
            match crate::structure::inspect(Path::new(&root), text(&label), text(&fs), serial) {
                Ok(medium) => {
                    drive.status = OpticalStatus::Ready;
                    if matches!(medium.kind, OpticalKind::Other) {
                        if let Some(code) = toc_error {
                            drive.error =
                                Some(format!("光盘曲目目录读取失败（{code}），请刷新后重试。"));
                        }
                    }
                    drive.medium = Some(medium);
                }
                Err(error) => {
                    drive.error = Some(format!("读取光盘结构失败：{error}"));
                }
            }
        }
        result.push(drive);
    }
    Ok(result)
}
