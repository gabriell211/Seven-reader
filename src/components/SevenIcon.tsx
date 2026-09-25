import type { SVGProps } from "react";

export type IconName =
  | "open" | "folder" | "edit" | "convert" | "sign" | "comment" | "create"
  | "search" | "save" | "print" | "tools" | "pages" | "recent" | "star"
  | "pin" | "scan" | "ocr" | "compress" | "shield" | "merge" | "settings"
  | "close" | "chevronLeft" | "chevronRight" | "zoomIn" | "zoomOut" | "hand"
  | "highlight" | "text" | "draw" | "more" | "home" | "bookmark" | "attachment"
  | "layers" | "form" | "redact" | "compare" | "accessibility" | "automation"
  | "certificate" | "lock" | "history" | "undo" | "redo";

const paths: Record<IconName, string[]> = {
  open: ["M4 7.5h6l2 2H20v8.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7.5Z", "M8 14h8", "m13 11 3 3-3 3"],
  folder: ["M3.5 7.5h6l2 2h9v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7.5Z"],
  edit: ["M5 19l.8-4.2L16.9 3.7a2 2 0 0 1 2.8 0l.6.6a2 2 0 0 1 0 2.8L9.2 18.2 5 19Z", "M14.8 5.8l3.4 3.4"],
  convert: ["M7 4h10l3 3v5", "M17 4v4h4", "M5 13v7h7", "m9 16 3 4 3-4"],
  sign: ["M4 18c3.5-4 5-7 6.5-6 1.3.9-1 4.5.6 4.6 1.4.1 2.4-3 3.8-2.7 1.4.4.5 3.3 2.3 3.3 1.4 0 2.6-.8 3.2-1.3"],
  comment: ["M5 5.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4.5 3v-3H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z", "M8 10h8", "M8 13.5h5"],
  create: ["M12 4v16", "M4 12h16"],
  search: ["M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z", "m16 16 5 5"],
  save: ["M5 4h12l3 3v13H4V5a1 1 0 0 1 1-1Z", "M8 4v6h8V4", "M8 20v-6h8v6"],
  print: ["M7 9V4h10v5", "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2", "M7 14h10v7H7z"],
  tools: ["M4 6h16", "M4 12h16", "M4 18h16", "M8 4v4", "M16 10v4", "M10 16v4"],
  pages: ["M7 3h9l4 4v13H7z", "M16 3v5h5", "M4 7v13h11"],
  recent: ["M12 5a7 7 0 1 1-6.3 4", "M5 5v5h5", "M12 8v5l3 2"],
  star: ["m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"],
  pin: ["M8 4h8l-1 6 3 3H6l3-3-1-6Z", "M12 13v8"],
  scan: ["M4 8V5a1 1 0 0 1 1-1h3", "M16 4h3a1 1 0 0 1 1 1v3", "M20 16v3a1 1 0 0 1-1 1h-3", "M8 20H5a1 1 0 0 1-1-1v-3", "M6 12h12"],
  ocr: ["M4 7V5a1 1 0 0 1 1-1h2", "M17 4h2a1 1 0 0 1 1 1v2", "M20 17v2a1 1 0 0 1-1 1h-2", "M7 20H5a1 1 0 0 1-1-1v-2", "M7 9h3v6H7z", "M12 9h5", "M12 12h4", "M12 15h5"],
  compress: ["m8 3-4 4h3v4h4V7h3L10 3H8Z", "m16 21 4-4h-3v-4h-4v4h-3l4 4h2Z"],
  shield: ["M12 3 20 6v5c0 5.3-3.5 8.4-8 10-4.5-1.6-8-4.7-8-10V6l8-3Z", "m9 12 2 2 4-4"],
  merge: ["M6 4v5c0 3 2 4 6 4h6", "M6 20v-3c0-3 2-4 6-4", "m15 10 3 3-3 3"],
  settings: ["M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z", "M19 13.5v-3l-2.2-.7-.8-1.9 1.1-2-2.1-2.1-2 1.1-1.9-.8L10.5 2h-3l-.7 2.2-1.9.8-2-1.1L.8 6l1.1 2-.8 1.9L-1 10.5v3l2.2.7.8 1.9-1.1 2L3 20.2l2-1.1 1.9.8.7 2.1h3l.7-2.2 1.9-.8 2 1.1 2.1-2.1-1.1-2 .8-1.9 2-.6Z"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  chevronLeft: ["m15 6-6 6 6 6"],
  chevronRight: ["m9 6 6 6-6 6"],
  zoomIn: ["M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z", "m16 16 5 5", "M10.5 7v7", "M7 10.5h7"],
  zoomOut: ["M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z", "m16 16 5 5", "M7 10.5h7"],
  hand: ["M8 12V7a1.5 1.5 0 0 1 3 0v4", "M11 10V5.5a1.5 1.5 0 0 1 3 0V11", "M14 10V7a1.5 1.5 0 0 1 3 0v5", "M17 11a1.5 1.5 0 0 1 3 0v3c0 5-3.3 7-7 7-4 0-5.3-2.7-7-5.5L4.5 13A1.6 1.6 0 0 1 7 11l1 1Z"],
  highlight: ["m5 17 4 2 10-10-4-4L5 15v2Z", "M4 21h16"],
  text: ["M5 5h14", "M12 5v14", "M8 19h8"],
  draw: ["M4 18c5-5 7-7 10-10 1.5-1.5 3.5-1.2 4.5 0s1 3-1 4.5c-3 2.3-5.5 2.6-8.5 2.5-2.5 0-3.8 2-5 3Z"],
  more: ["M5 12h.01", "M12 12h.01", "M19 12h.01"],
  home: ["M3 11.5 12 4l9 7.5", "M6 10.5V21h12V10.5", "M10 21v-6h4v6"],
  bookmark: ["M7 4h10v17l-5-3-5 3V4Z"],
  attachment: ["m8 12 6-6a3 3 0 0 1 4.2 4.2l-7.5 7.5a5 5 0 0 1-7.1-7.1L11 3.2"],
  layers: ["m12 3 9 5-9 5-9-5 9-5Z", "m3 12 9 5 9-5", "m3 16 9 5 9-5"],
  form: ["M5 3h14v18H5z", "M8 7h8", "M8 11h3", "M8 15h8"],
  redact: ["M5 5h14v14H5z", "M7 9h10", "M7 12h10", "M7 15h7"],
  compare: ["M4 4h7v16H4z", "M13 4h7v16h-7z", "m7 9 2 3-2 3", "m17 15-2-3 2-3"],
  accessibility: ["M12 5.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z", "M4 8h16", "M12 8v6", "m12 14-5 7", "m12 14 5 7"],
  automation: ["M8 4h8v4H8z", "M6 10h12v10H6z", "M9 14h6", "M9 17h4"],
  certificate: ["M7 3h10v11H7z", "m9 7 2 2 4-4", "m10 14-1 7 3-2 3 2-1-7"],
  lock: ["M6 10h12v11H6z", "M9 10V7a3 3 0 0 1 6 0v3", "M12 14v3"],
  history: ["M12 5a7 7 0 1 1-6.3 4", "M5 5v5h5", "M12 8v5l3 2"],
  undo: ["M9 7 4-4", "M9 7l4 4", "M9 7h5a6 6 0 0 1 0 12H9"],
  redo: ["m15 7-4-4", "m15 7-4 4", "M15 7h-5a6 6 0 0 0 0 12h5"],
};

export function SevenIcon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {paths[name].map((d, index) => <path d={d} key={index} />)}
    </svg>
  );
}
