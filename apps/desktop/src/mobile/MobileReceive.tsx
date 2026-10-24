import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { errorMessage } from '../library/gateway';
import './mobile.css';

export type MobilePayload = { kind: 'barcode'; value: string } | { kind: 'screenshots'; images: string[] };
interface Address { ip: string; label: string }
interface Connection { id: string; url: string; qrDataUrl: string; expiresAt: number }
interface Poll { connected: boolean; received: MobilePayload | null }
const stop = (id: string) => invoke('mobile_stop', { id }).catch(() => undefined);

export function MobileReceive({ mode, maxImages = 6, onReceive, onClose }: {
  mode: 'barcode' | 'screenshots'; maxImages?: number; onReceive(value: MobilePayload): void; onClose(): void;
}) {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState('');
  const [connection, setConnection] = useState<Connection | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [barcodeCount, setBarcodeCount] = useState(0);
  const active = useRef<string | null>(null);
  const mounted = useRef(false);
  const callbacks = useRef({ onReceive, onClose });
  callbacks.current = { onReceive, onClose };

  useEffect(() => {
    mounted.current = true;
    let disposed = false;
    void invoke<Address[]>('mobile_addresses').then(values => {
      if (disposed) return;
      setAddresses(values); setAddress(values[0]?.ip || '');
      if (!values.length) setError('没有可用的局域网地址，请将电脑连接到与手机相同的 Wi-Fi。');
    }).catch(cause => { if (!disposed) setError(errorMessage(cause)); });
    return () => { disposed = true; mounted.current = false; if (active.current) void stop(active.current); active.current = null; };
  }, []);

  useEffect(() => {
    if (!connection) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await invoke<Poll>('mobile_poll', { id: connection!.id });
        if (disposed || active.current !== connection!.id) return;
        setConnected(value.connected);
        if (value.received) {
          callbacks.current.onReceive(value.received);
          if (mode === 'screenshots') {
            await stop(connection!.id);
            if (disposed || active.current !== connection!.id) return;
            active.current = null;
            callbacks.current.onClose(); return;
          }
          setBarcodeCount(value => value + 1);
        }
        timer = setTimeout(() => void poll(), 900);
      } catch (cause) {
        if (disposed) return;
        if (active.current === connection!.id) { void stop(connection!.id); active.current = null; }
        setConnection(null); setError(errorMessage(cause));
      }
    }
    void poll();
    return () => { disposed = true; clearTimeout(timer); };
  }, [connection]);

  async function start() {
    if (busy) return;
    setBusy(true); setError(''); setConnected(false); setCopied(false); setConnection(null); setBarcodeCount(0);
    if (active.current) { await stop(active.current); active.current = null; }
    try {
      const value = await invoke<Connection>('mobile_start', { address, mode, maxImages });
      if (!mounted.current) { await stop(value.id); return; }
      active.current = value.id; setConnection(value);
    } catch (cause) { if (mounted.current) setError(errorMessage(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <Modal title={mode === 'barcode' ? '手机扫条码' : '手机传图'} onClose={onClose} className="mobile-receive-panel">
    <div className="mobile-receive-content">
      <p className="utility-copy">手机与电脑连接同一 Wi-Fi，扫描二维码后在浏览器打开。</p>
      {!connection && <><Select label="电脑网络地址" value={address} options={addresses.map(item => ({ id: item.ip, label: item.label }))}
        onChange={setAddress} disabled={busy}/><button type="button" className="solid-button" disabled={busy || !address} onClick={() => void start()}>{busy ? '连接准备中…' : '生成连接二维码'}</button></>}
      {connection && <div className="mobile-connection">
        <img className="mobile-qr" src={connection.qrDataUrl} alt="手机连接二维码"/>
        <strong role="status">{mode === 'barcode' && barcodeCount ? `已接收 ${barcodeCount} 个条码` : connected ? '手机已连接' : '等待手机连接'}</strong>
        <p className="utility-copy">{mode === 'barcode' ? '手机可连续扫描条码；每扫一个都会更新电脑搜索框，关闭窗口结束。' : `选择或拍摄最多 ${maxImages} 张图片，发送后在电脑确认识别。`}</p>
        <div className="mobile-connection-actions"><button type="button" className="text-button" onClick={() => {
          void navigator.clipboard.writeText(connection.url).then(() => setCopied(true)).catch(() => setError('复制失败，请使用二维码连接。'));
        }}>{copied ? '已复制' : '复制连接'}</button><button type="button" className="text-button" onClick={() => {
          if (active.current) void stop(active.current);
          active.current = null; setConnection(null); setConnected(false);
        }}>更换连接</button></div>
        <small>本次连接有效至 {new Date(connection.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}；{mode === 'barcode' ? '可连续接收多个条码，关闭窗口后结束。' : '接收一次或关闭窗口后结束。'}</small>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <p className="mobile-connection-note">仅在可信 Wi-Fi 使用，局域网传输未加密。如 Windows 提示网络访问权限，请手动允许专用网络。无法连接时可换选电脑的 Wi-Fi 地址。</p>
    </div>
  </Modal>;
}
