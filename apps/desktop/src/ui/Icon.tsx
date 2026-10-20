const paths = {
  settings: <><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 3v6M16 9v6M10 15v6"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
  plus: <path d="M12 4v16M4 12h16"/>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
  back: <path d="m10 5-7 7 7 7M3 12h18"/>,
  more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
  list: <path d="M8 6h12M8 12h12M8 18h12M3 6h.1M3 12h.1M3 18h.1"/>,
  rotate: <path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7"/>,
  archive: <><rect x="4" y="6" width="16" height="15" rx="1"/><path d="M3 3h18v4H3zM9 11h6"/></>,
};
export function Icon({ name }: { name: keyof typeof paths }) {
  return <span className="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg></span>;
}
