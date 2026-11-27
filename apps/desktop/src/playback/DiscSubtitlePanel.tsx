import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../library/gateway';
import { Select } from '../ui/Select';
import { CaptionLines } from './VideoCaptionOverlay';
import { defaultAppearance, type CaptionAppearance } from './captionAppearance';
import type { Snapshot } from './gateway';
import { playback } from './gateway';
import { fileTextAt, parseSubtitleFile, type FileCue } from './subtitleFile';

type Mode = 'native' | 'styled' | 'file' | 'listen';
type Language = { tag: string; name: string };
let captureQueue = Promise.resolve();
function capture(session:string, mode:string) {
  const request = captureQueue.then(() => invoke<void>('subtitle_capture_mode', { session, mode }));
  captureQueue = request.catch(() => {});
  return request;
}

export function DiscSubtitlePanel({s,open,localAI,setLocalAI,onError}: {
  s:Snapshot;open:boolean;localAI:boolean;setLocalAI(on:boolean):void;onError(message:string):void;
}) {
  const session=s.sessionId, local=s.source.mediaToken==='local-video';
  const [mode,setMode]=useState<Mode>('native'), [busy,setBusy]=useState(false);
  const [languages,setLanguages]=useState<Language[]>([]), [language,setLanguage]=useState('');
  const [appearance,setAppearance]=useState<CaptionAppearance>(defaultAppearance);
  const [translate,setTranslate]=useState(false), [lines,setLines]=useState(''), [translated,setTranslated]=useState('');
  const [file,setFile]=useState<{name:string;cues:FileCue[]}>(), [notice,setNotice]=useState('');
  const [selected,setSelected]=useState<number | undefined>();
  const input=useRef<HTMLInputElement>(null), latest=useRef(s);
  latest.current=s;
  const opticalActive=mode==='styled' || mode==='listen';
  const nativeId=selected ?? s.selectedSubtitle ?? -1;
  const [epoch,setEpoch]=useState(0);
  const prev=useRef(s.positionSeconds);
  useEffect(() => { setSelected(undefined); }, [s.dvdTitle, s.selectedSubtitle]);
  useEffect(() => {
    const track=s.subtitleTracks?.find(t=>t.id===nativeId);
    const iso:Record<string,string>={eng:'en',jpn:'ja',zho:'zh',chi:'zh',kor:'ko',fra:'fr',fre:'fr',deu:'de',ger:'de',spa:'es'};
    const primary=track && (iso[track.language] ?? track.language.split('-')[0]);
    const match=languages.find(l=>l.tag.split('-')[0]===primary);
    setLanguage(match?.tag ?? '');
  },[nativeId,languages,s.dvdTitle]);
  useEffect(() => {
    if (Math.abs(prev.current-s.positionSeconds)>3) setEpoch(n=>n+1);
    prev.current=s.positionSeconds;
  },[s.positionSeconds]);
  useEffect(()=>{
    let alive=true;
    void invoke<{preferences:{appearance:CaptionAppearance}}>('subtitle_settings').then(v=>{if(alive)setAppearance(v.preferences.appearance)}).catch(e=>{if(alive)onError(errorMessage(e))});
    void invoke<Language[]>('subtitle_ocr_languages').then(v=>{if(alive)setLanguages(v)}).catch(e=>{if(alive)setNotice(errorMessage(e))});
    return ()=>{alive=false};
  },[local,session,onError]);
  useEffect(()=>{
    if(!opticalActive) return;
    let alive=true, timer:ReturnType<typeof setTimeout>, job='', previous=0;
    setLines(''); setNotice('');
    async function tick(){
      if(!alive) return;
      try {
        if(mode==='styled') {
          const f=await invoke<{version:number;text:string}>('subtitle_disc_frame',{session,previous,language});
          if(alive && f.version!==previous){ previous=f.version; setLines(f.text); }
        } else if(job && !latest.current.paused){
          const text=await invoke<string|null>('subtitle_live_dialogue',{id:job});
          if(alive && text!==null) setLines(text);
        }
        if(alive) timer=setTimeout(()=>void tick(),150);
      } catch(e){if(alive){setNotice(errorMessage(e));setLines('');setMode('native');}}
    }
    async function start(){
      if(mode==='listen'){
        const v=await invoke<{id:string;notice:string}>('subtitle_start',{session,trackId:s.selectedAudio});
        job=v.id;
        if(!alive){await invoke('subtitle_stop',{id:job});return}
      }
      if(!alive) return;
      await capture(session,mode);
      if(alive) void tick();
    }
    void start().catch(e=>{if(alive){setNotice(errorMessage(e));setMode('native')}});
    return ()=>{alive=false;clearTimeout(timer);void capture(session,'off').catch(()=>{});if(job)void invoke('subtitle_stop',{id:job}).catch(()=>{});};
  },[mode,opticalActive,session,language,s.selectedAudio,nativeId,epoch,s.dvdTitle]);
  const original=mode==='file' && file?fileTextAt(file.cues,s.positionSeconds):opticalActive?lines:'';
  const cache=useRef(new Map<string,string>());
  const desired=useRef(''),pending=useRef(false);
  desired.current=translate?original:'';
  useEffect(()=>{
    let alive=true;
    setTranslated('');
    if(!translate || !original) return;
    const cached=cache.current.get(original);
    if(cached){setTranslated(cached);return}
    let timer:ReturnType<typeof setTimeout>;
    async function run(){
      if(!alive || desired.current!==original) return;
      if(pending.current){timer=setTimeout(()=>void run(),120);return}
      pending.current=true;
      try{
        const text=await invoke<string>('subtitle_text_translation',{session,text:original});
        if(cache.current.size>=128) cache.current.clear();
        cache.current.set(original,text);
        if(alive && desired.current===original) setTranslated(text);
      }catch(e){if(alive){setNotice(errorMessage(e));setTranslate(false)}}
      finally{pending.current=false}
    }
    void run();
    return ()=>{alive=false;clearTimeout(timer)};
  },[translate,original,session]);
  async function switchTrack(id:number,next:Mode) {
    setBusy(true);setNotice('');
    if(id!==nativeId) setTranslate(false);
    try{
      if(id!==(s.selectedSubtitle??-1) || next==='native') await playback.control(session,{action:'subtitle',id});
      setLocalAI(false);setSelected(id);setMode(next);setLines('');
    }catch(e){setNotice(errorMessage(e))}
    finally{setBusy(false)}
  }
  async function loadFile(f?:File){
    if(!f)return;
    try{
      if(f.size>8*1024*1024) throw new Error('请选择 8 MiB 以内的字幕文件。');
      const cues=parseSubtitleFile(new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer()));
      if(!cues.length) throw new Error('没有读到字幕，请选择 UTF-8 编码的 SRT 或 WebVTT 文件。');
      if(s.selectedSubtitle!=null) await playback.control(session,{action:'subtitle',id:-1});
      setTranslate(false);setFile({name:f.name,cues});setSelected(-1);setLocalAI(false);setMode('file');setNotice('');
    }catch(e){setNotice(errorMessage(e))}
  }
  const tracks=s.subtitleTracks??[];
  const trackOptions=[{id:'-1',label:'关闭原片字幕'},...tracks.map(t=>({id:String(t.id),label:[t.title || '字幕轨 '+t.id,t.language].filter(Boolean).join(' · ')}))];
  return <>
    {(mode==='file'||opticalActive) && <CaptionLines source={original} translation={translated} appearance={appearance} onError={onError}/>}
    {open && <section className="disc-subtitle-panel" aria-label="字幕来源">
      <div><strong>原片字幕</strong><Select label="原片字幕轨" value={String(nativeId)} options={trackOptions} disabled={busy}
        onChange={v=>void switchTrack(Number(v),'native')}/>
        {nativeId>=0 && <>
          <Select label="文字识别语言" value={language} options={[{id:'',label:'图形字幕识别语言'},...languages.map(l=>({id:l.tag,label:l.name}))]} onChange={setLanguage}/>
          <button className="text-button" aria-pressed={mode==='styled'} disabled={busy} onClick={()=>void switchTrack(nativeId,mode==='styled'?'native':'styled')}>{mode==='styled'?'恢复原盘样式':'使用应用字幕样式'}</button>
        </>}
      </div>
      <div><button className="text-button" disabled={busy} onClick={()=>input.current?.click()}>打开外挂字幕…</button>
        <input hidden ref={input} type="file" accept=".srt,.vtt" onChange={e=>{void loadFile(e.target.files?.[0]);e.target.value=''}}/>
        <span>{mode==='file'?file?.name:'SRT / WebVTT'}</span>
        <button className="text-button" disabled={busy || s.selectedAudio==null} aria-pressed={localAI||mode==='listen'} onClick={async()=>{
          if(local){if(!localAI && !await disableNative())return;setMode('native');setLocalAI(!localAI);}
          else if(mode==='listen'){setMode('native');setLines('')}else{await switchTrack(-1,'listen')}
        }}>{localAI||mode==='listen'?'关闭 AI 听译':'开启 AI 听译'}</button>
        {mode==='file' && <button className="text-button" onClick={()=>setMode('native')}>关闭外挂字幕</button>}
      </div>
      {(mode==='file'||opticalActive) && <label><input type="checkbox" checked={translate} onChange={e=>setTranslate(e.target.checked)}/> 将字幕文字发送至助手，翻译为简体中文</label>}
      {notice && <p role="status">{notice}</p>}
      {nativeId>=0 && !languages.length && <p>图形字幕重排需要在 Windows 语言设置中安装对应的文字识别组件。</p>}
    </section>}
  </>;
  async function disableNative(){
    try { if(s.selectedSubtitle!=null) await playback.control(session,{action:'subtitle',id:-1});setSelected(-1);return true }
    catch(e){setNotice(errorMessage(e));return false}
  }
}
