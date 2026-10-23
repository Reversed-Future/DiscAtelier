# DVD 章节识别

DVD 由 VLC/libdvdnav 播放；章节分段由只读 IFO 适配器提供，不写光盘、不修改光驱。

## 数据来源

1. `VIDEO_TS/VIDEO_TS.IFO`：读取 title search pointer，将 VLC 标题号映射到 VTS 号和 VTS 内标题号。
2. `VIDEO_TS/VTS_xx_0.IFO`：读取 PGCIT 中对应 PGC 的 program map 和 cell playback 表。
3. 章节起点为 program 首 cell 之前所有 cell 播放时长之和；时长为 BCD 时分秒加帧数。
4. 结果按媒体令牌和标题号缓存在前端，进度条显示章节刻度；点击章节调用 libVLC 章节接口。

## 回退

以下情况不显示分段，保留普通进度条：

- 光盘不是 DVD；
- 当前是 DVD 菜单；
- IFO 缺失、损坏、超出大小限制；
- 标题号不在 title search pointer 表；
- PGC、program map 或 cell 表越界；
- 只有一章。

多角度、多 PGC 和无缝分支目前只按顺序 cell 累计；真实光盘验收时需要重点检查这些结构。

## 手动验收

1. 插入 DVD，打开光驱面板并播放。
2. 确认进度条出现章节刻度，下方出现可点击章节条。
3. 点击不同章节，确认画面跳转、章节高亮和播放时间一致。
4. 回到菜单再进入标题，确认分段不残留到菜单进度条。
5. 用一张多章节、多角度或多 PGC 的 DVD 检查章节数量和起点。
