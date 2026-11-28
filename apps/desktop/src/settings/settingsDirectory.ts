export const settingsGroups = [
  { label: '收藏与工具', pages: [
    { id: 'data', label: '收藏数据', icon: 'archive', sections: [
      { id: 'backups', label: '存储与备份', keywords: '数据位置 目录 路径 创建 恢复 收藏 封面 模型' },
      { id: 'logs', label: '诊断日志', keywords: '报错 复制 导出 log' },
    ] },
    { id: 'exchange', label: '汇率换算', icon: 'swap', sections: [
      { id: 'today', label: '今日汇率与计算器', keywords: '金额 币种 换算' },
      { id: 'ratesApi', label: '汇率 API', keywords: '接口盒子 每天更新 开发者 ID KEY' },
    ] },
  ] },
  { label: '影音播放', pages: [
    { id: 'playback', label: '播放器与光驱', icon: 'disc', sections: [
      { id: 'mediaKeys', label: '系统媒体控制', keywords: 'Windows SMTC 媒体键' },
      { id: 'bluray', label: '蓝光读取', keywords: 'KEYDB.cfg FindVUK MakeMKV libaacs 密钥' },
      { id: 'engines', label: '播放器路径', keywords: 'mpv.exe VLC libvlc.dll 内核' },
    ] },
    { id: 'subtitles', label: '视频字幕', icon: 'list', sections: [
      { id: 'appearance', label: '字幕外观', keywords: '字号 大小 背景 透明度 位置 预览 原片 外挂 PGS OCR' },
      { id: 'speech', label: '对白听译', keywords: 'AI 字幕 识别 语言 原文 双语 中文 翻译' },
      { id: 'models', label: 'Whisper 模型', keywords: 'AI 字幕 下载 卸载 导入 Hugging Face HF-Mirror Tiny Base Small Medium Large Turbo' },
    ] },
    { id: 'audio', label: '音效均衡器', icon: 'volume', sections: [
      { id: 'equalizer', label: '音效均衡器', keywords: 'EQ 频段 预设 增益' },
    ] },
  ] },
  { label: '资料与服务', pages: [
    { id: 'music', label: '音乐资料', icon: 'audio', sections: [
      { id: 'musicbrainz', label: 'MusicBrainz', keywords: 'CD 识别 Disc ID API' },
      { id: 'discogs', label: 'Discogs', keywords: '版本 发行 Token 令牌' },
      { id: 'netease', label: '网易云音乐', keywords: '账号 登录 服务地址 歌词' },
    ] },
    { id: 'video', label: '影像资料', icon: 'fullscreen', sections: [
      { id: 'tmdb', label: 'TMDB', keywords: '电影 剧集 读取令牌 API' },
      { id: 'bangumi', label: 'Bangumi', keywords: '番剧 动画 令牌 到期' },
    ] },
    { id: 'assistant', label: 'AI 助手与翻译', icon: 'chat', sections: [
      { id: 'assistant', label: 'AI 助手与翻译', keywords: '模型 翻译服务 API Key Base URL 光盘菜单 自动识别' },
    ] },
  ] },
  { label: '应用', pages: [
    { id: 'window', label: '窗口与托盘', icon: 'window', sections: [
      { id: 'window', label: '窗口与托盘', keywords: '最小化 关闭 退出' },
    ] },
    { id: 'about', label: '更新与关于', icon: 'rotate', sections: [
      { id: 'app', label: '版本更新', keywords: '检查 下载 安装 忽略' },
      { id: 'credits', label: '致谢', keywords: '第三方 项目 字体' },
    ] },
  ] },
] as const;

type Group = typeof settingsGroups[number];
export type SettingsPage = Group['pages'][number];
export type SectionId = SettingsPage['sections'][number]['id'];
export const settingsPages: readonly SettingsPage[] = settingsGroups.flatMap(group => [...group.pages] as SettingsPage[]);

export function findSettings(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/);
  return settingsPages.flatMap(page => page.sections.filter(section => {
    const text = [page.label, section.label, section.keywords].join(' ').toLowerCase();
    return words.every(word => text.includes(word));
  }).map(section => ({ page, section })));
}
