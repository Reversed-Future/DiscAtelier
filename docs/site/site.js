document.documentElement.classList.add('js');
const observer = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}, { threshold: 0.08 });
document.querySelectorAll('.reveal').forEach(element => observer.observe(element));

const shots = {
  detail: ['收藏的封面、版本、载体与发行资料', '版本资料与每套实体的购入记录，分别整理。'],
  tracks: ['收藏曲目与逐曲播放入口', '收藏里的曲目，可以从本地文件或已关联的网易云歌曲播放。'],
  video: ['影像收藏的章节名称、译名、日期与时长', '原名、译名与章节资料，和手中的实体一起保存。'],
  optical: ['光驱面板显示光盘载体与播放入口', '放入光盘，从光驱面板开始播放。'],
};
const screenshot = document.querySelector('#showcase-image');
document.querySelectorAll('[data-shot]').forEach(button => button.addEventListener('click', () => {
  const key = button.dataset.shot;
  screenshot.src = `assets/${key}.webp`;
  screenshot.alt = shots[key][0];
  document.querySelector('#showcase-caption').textContent = shots[key][1];
  document.querySelectorAll('[data-shot]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
}));

const video = document.querySelector('#intro-video');
const chapterButtons = document.querySelectorAll('#film-chapters button');
// Explicit scene IDs are authored in the render timeline; no time or key inference.
fetch('assets/chapters.json').then(response => {
  if (!response.ok) throw new Error('Video chapters unavailable');
  return response.json();
}).then(chapters => {
  chapterButtons.forEach(button => {
    if (button.dataset.scene) button.dataset.time = chapters[button.dataset.scene];
  });
}).catch(() => {
  chapterButtons.forEach(button => { if (button.dataset.scene) button.hidden = true; });
});
chapterButtons.forEach(button => button.addEventListener('click', () => {
  const seconds = Number(button.dataset.time);
  if (!Number.isFinite(seconds)) return;
  video.currentTime = seconds;
  video.play().catch(() => video.focus());
}));
