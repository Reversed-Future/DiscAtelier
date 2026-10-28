const projects = [
  ['Tauri · Rust · React', '桌面应用框架与界面'],
  ['Three.js · fflate · openskp', '三维模型显示、解压与 SketchUp 文件读取'],
  ['VLC / libVLC · mpv · Eclipse Temurin', '影音播放与蓝光 Java 运行环境'],
  ['NeteaseCloudMusicApiEnhanced · Node.js', '网易云音乐资料、播放接口与运行环境'],
  ['ZXing · OpenCC · Motion', '条码识别、简繁转换与界面动画'],
  ['SQLite', '本地收藏与资料存储'],
];

export function ThirdPartyCredits() {
  return <section className="third-party-credits" aria-label="致谢与字体">
    <h4 className="settings-subheading">第三方项目</h4>
    <p className="setting-hint">感谢以下项目及其贡献者，为 DiscAtelier 提供支持。</p>
    <dl>{projects.map(([name, purpose]) => <div key={name}><dt>{name}</dt><dd>{purpose}</dd></div>)}</dl>
    <p className="setting-hint">资料来源：Discogs、网易云音乐、TMDB、Bangumi、MusicBrainz；汇率由接口盒子提供。感谢各资料平台及参与整理内容的社区。</p>
    <h4 className="settings-subheading">字体</h4>
    <dl aria-label="字体"><div><dt>MiSans</dt><dd>界面字体 · Regular / Medium · 字体版权归小米所有</dd></div></dl>
    <p className="setting-hint">完整组件许可见安装目录 legal/，播放运行库许可见 vlc/、mpv/ 与 jre/；MiSans 授权文件为 legal/MiSans-LICENSE.pdf。</p>
  </section>;
}
