// Icons.jsx — jeu d'icônes SVG inline (zéro dépendance, embarquable offline).
// Tracé 24x24, stroke currentColor : héritent la couleur du contexte.
import React from "react";

const S = ({ children, ...p }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);

export const IconPulse = (p) => <S {...p}><path d="M3 12h4l2 5 4-12 2 7h6" /></S>;
export const IconSliders = (p) => <S {...p}><line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" /><line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" /></S>;
export const IconShield = (p) => <S {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M9 12l2 2 4-4" /></S>;
export const IconBolt = (p) => <S {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></S>;
export const IconCheck = (p) => <S {...p}><polyline points="20 6 9 17 4 12" /></S>;
export const IconUndo = (p) => <S {...p}><polyline points="9 14 4 9 9 4" /><path d="M20 20v-7a4 4 0 0 0-4-4H4" /></S>;
export const IconHistory = (p) => <S {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" /><path d="M12 8v4l3 2" /></S>;
export const IconGem = (p) => <S {...p}><path d="M6 3h12l4 6-10 12L2 9z" /><path d="M2 9h20M9 3 7 9l5 12 5-12-2-6" /></S>;
export const IconGauge = (p) => <S {...p}><path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" /><path d="M3 12a9 9 0 0 1 18 0" /><path d="m13.4 10.6 3.6-3.6" /></S>;
export const IconWarn = (p) => <S {...p}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12" y2="17" /></S>;
export const IconRefresh = (p) => <S {...p}><path d="M21 12a9 9 0 1 1-3-6.7" /><polyline points="21 3 21 9 15 9" /></S>;
export const IconDiscord = (p) => <S {...p}><path d="M18 5a18 18 0 0 0-4-1l-.3.6a14 14 0 0 1 3.4 1M6 5a18 18 0 0 1 4-1l.3.6A14 14 0 0 0 6.9 5.6" /><path d="M7 16s1 1.5 2.5 1.5M17 16s-1 1.5-2.5 1.5" /><path d="M5 6c-1.5 3-2 6-1.5 9.5C5 17 6.5 18 8 18l1-2M19 6c1.5 3 2 6 1.5 9.5C18 17 16.5 18 15 18l-1-2" /><circle cx="9.5" cy="12" r="1" /><circle cx="14.5" cy="12" r="1" /></S>;
export const IconChat = (p) => <S {...p}><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 20l1.3-3.1A8.4 8.4 0 1 1 21 11.5z" /><path d="M8 10h8M8 13.5h5" /></S>;
export const IconSend = (p) => <S {...p}><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /></S>;
export const IconCog = (p) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></S>;
export const IconTrash = (p) => <S {...p}><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></S>;
export const IconChart = (p) => <S {...p}><line x1="3" y1="21" x2="21" y2="21" /><rect x="5" y="11" width="3.5" height="8" /><rect x="10.25" y="6" width="3.5" height="13" /><rect x="15.5" y="14" width="3.5" height="5" /></S>;
export const IconChip = (p) => <S {...p}><rect x="7" y="7" width="10" height="10" rx="1.5" /><path d="M9.5 1v3M14.5 1v3M9.5 20v3M14.5 20v3M1 9.5h3M1 14.5h3M20 9.5h3M20 14.5h3" /></S>;
export const IconTrophy = (p) => <S {...p}><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z" /><path d="M5 4H3v2a3 3 0 0 0 3 3M19 4h2v2a3 3 0 0 1-3 3" /></S>;
export const IconDownload = (p) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></S>;
export const IconUpload = (p) => <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></S>;
export const IconSparkle = (p) => <S {...p}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /></S>;
export const IconSun = (p) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>;
export const IconMoon = (p) => <S {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></S>;
