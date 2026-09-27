import type { SVGProps } from 'react';
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
export const IconHome = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h5v-6h4v6h5V10" /></svg>;
export const IconTrophy = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M8 4h8v6a4 4 0 01-8 0V4z" /><path d="M8 6H4v2a3 3 0 003 3M16 6h4v2a3 3 0 01-3 3M12 14v4M8 20h8" /></svg>;
export const IconNews = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M4 5h13v14H6a2 2 0 01-2-2V5z" /><path d="M17 8h3v9a2 2 0 01-2 2M8 9h5M8 13h5" /></svg>;
export const IconUser = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
export const IconBook = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5z" /><path d="M19 19v2H6" /></svg>;
export const IconSun = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
export const IconMoon = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z" /></svg>;
export const IconShield = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4" /></svg>;

export const IconUsers = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="9" cy="8" r="3" /><path d="M2 20c0-3.3 3-5 7-5s7 1.7 7 5" /><circle cx="17" cy="8" r="2.5" /><path d="M17.5 13c2.6.3 4.5 1.8 4.5 4" /></svg>;
export const IconMessage = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M4 5h16v11H8l-4 4V5z" /></svg>;
export const IconBell = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M6 10a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" /><path d="M10 20a2 2 0 004 0" /></svg>;
export const IconBlock = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M5.5 5.5l13 13" /></svg>;
export const IconFlag = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><path d="M6 3v18" /><path d="M6 4h12l-3 4 3 4H6" /></svg>;
export const IconSearch = (p: SVGProps<SVGSVGElement>) => <svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>;

/** Solo il segno di spunta: nessun cerchio/badge bianco dietro, come richiesto. */
export const IconVerified = (p: SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-label="Account verificato" role="img" {...p}>
    <circle cx="12" cy="12" r="10" fill="#4d8dff" />
    <path d="M7.5 12.5l3 3 6-6.5" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
