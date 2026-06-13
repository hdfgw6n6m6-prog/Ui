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
