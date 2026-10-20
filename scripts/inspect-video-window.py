"""Read-only native window evidence for the embedded playback acceptance test."""
import ctypes as c
from ctypes import wintypes as w
import json
import sys

u = c.WinDLL("user32", use_last_error=True)
u.SetProcessDpiAwarenessContext.argtypes = [c.c_void_p]
u.SetProcessDpiAwarenessContext.restype = w.BOOL
u.SetProcessDpiAwarenessContext(c.c_void_p(-4))
g = c.WinDLL("gdi32", use_last_error=True)
g.CreateRectRgn.argtypes = [c.c_int] * 4
g.CreateRectRgn.restype = w.HANDLE
g.GetRgnBox.argtypes = [w.HANDLE, c.POINTER(w.RECT)]
g.GetRgnBox.restype = c.c_int
g.DeleteObject.argtypes = [w.HANDLE]
g.DeleteObject.restype = w.BOOL
u.GetWindowRgn.argtypes = [w.HWND, w.HANDLE]
u.GetWindowRgn.restype = c.c_int
callback = c.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
for name, result, args in [
    ("GetParent", w.HWND, [w.HWND]),
    ("GetWindowThreadProcessId", w.DWORD, [w.HWND, c.POINTER(w.DWORD)]),
    ("GetWindowRect", w.BOOL, [w.HWND, c.POINTER(w.RECT)]),
    ("GetClientRect", w.BOOL, [w.HWND, c.POINTER(w.RECT)]),
    ("ClientToScreen", w.BOOL, [w.HWND, c.POINTER(w.POINT)]),
    ("IsWindowVisible", w.BOOL, [w.HWND]),
    ("GetClassNameW", c.c_int, [w.HWND, w.LPWSTR, c.c_int]),
    ("EnumWindows", w.BOOL, [callback, w.LPARAM]),
    ("EnumChildWindows", w.BOOL, [w.HWND, callback, w.LPARAM]),
]:
    fn = getattr(u, name)
    fn.restype, fn.argtypes = result, args

player_pid, host = map(int, sys.argv[1:3])
owner = u.GetParent(host)


def read(handle):
    pid, rect, client, point = w.DWORD(), w.RECT(), w.RECT(), w.POINT()
    u.GetWindowThreadProcessId(handle, c.byref(pid))
    if not u.GetWindowRect(handle, c.byref(rect)):
        raise c.WinError(c.get_last_error())
    u.GetClientRect(handle, c.byref(client))
    u.ClientToScreen(handle, c.byref(point))
    name = c.create_unicode_buffer(256)
    u.GetClassNameW(handle, name, 256)
    return dict(handle=handle, parent=u.GetParent(handle), pid=pid.value,
                visible=bool(u.IsWindowVisible(handle)), className=name.value,
                rect=dict(x=rect.left, y=rect.top, width=rect.right-rect.left, height=rect.bottom-rect.top),
                client=dict(x=point.x, y=point.y, width=client.right, height=client.bottom))


children, top = [], []


@callback
def child(handle, _):
    value = read(handle)
    if value["pid"] == player_pid:
        children.append(value)
    return True


@callback
def top_window(handle, _):
    pid = w.DWORD()
    u.GetWindowThreadProcessId(handle, c.byref(pid))
    if pid.value == player_pid:
        top.append(read(handle))
    return True


u.EnumChildWindows(host, child, 0)
u.EnumWindows(top_window, 0)
region = g.CreateRectRgn(0, 0, 0, 0)
box = w.RECT()
u.GetWindowRgn(host, region)
g.GetRgnBox(region, c.byref(box))
g.DeleteObject(region)
print(json.dumps(dict(host=read(host), owner=read(owner), video=children, topLevel=top,
                      clip=dict(x=box.left, y=box.top, width=box.right-box.left, height=box.bottom-box.top))))
