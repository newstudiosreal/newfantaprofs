export interface Skin { id: string; name: string; emoji: string; color: string }
export interface BadgeDef { id: string; name: string; emoji: string; desc: string }
export interface FxDef { id: 'glitch' | 'neon' | 'rainbow'; name: string; emoji: string }

export const SKINS: Skin[] = [
  { id: 'default', name: 'Classica', emoji: '🟡', color: '#ffe600' },
  { id: 'dark_gold', name: 'Dark Gold', emoji: '🖤', color: '#d9b44a' },
  { id: 'rosso', name: 'Rosso Fuoco', emoji: '🔴', color: '#ff4d4d' },
  { id: 'blue', name: 'Blue Ice', emoji: '🔵', color: '#4d8dff' },
  { id: 'verde', name: 'Verde Bosco', emoji: '🌿', color: '#35d07f' },
  { id: 'pink', name: 'Pink Chaos', emoji: '🌸', color: '#ff6fb5' },
  { id: 'electric', name: 'Electric', emoji: '⚡', color: '#adff2f' },
];

export const BADGES: BadgeDef[] = [
  { id: 'diamante', name: 'Diamante', emoji: '💎', desc: 'Supporter ufficiale' },
  { id: 'fondatore', name: 'Fondatore', emoji: '👑', desc: 'Era in beta' },
  { id: 'og', name: 'OG', emoji: '🔥', desc: 'Early adopter' },
  { id: 'leggenda', name: 'Leggenda', emoji: '⚡', desc: 'Badge raro limitato' },
  { id: 'alieno', name: 'Alieno', emoji: '🛸', desc: 'Per chi vuole distinguersi' },
];

export const NAME_FX: FxDef[] = [
  { id: 'glitch', name: 'Glitch', emoji: '⚡' },
  { id: 'neon', name: 'Neon', emoji: '🌟' },
  { id: 'rainbow', name: 'Rainbow', emoji: '🌈' },
];

export const badgeLabel = (id: string): string => {
  const b = BADGES.find(x => x.id === id);
  return b ? `${b.emoji} ${b.name}` : id; // i badge personalizzati sono testo libero
};

const SKIN_KEY = (leagueId: string) => `fp_skin_${leagueId}`;
export const getSavedSkin = (leagueId: string): string => {
  try { return localStorage.getItem(SKIN_KEY(leagueId)) ?? 'default'; } catch { return 'default'; }
};
export const saveSkin = (leagueId: string, skin: string) => {
  try { localStorage.setItem(SKIN_KEY(leagueId), skin); } catch { /* storage non disponibile */ }
};
export const applySkin = (skin: string) => {
  if (skin === 'default') delete document.documentElement.dataset.skin;
  else document.documentElement.dataset.skin = skin;
};

export const SHOP = [
  { id: 'shield', icon: '🛡️', label: 'Scudo', desc: 'Blocca il prossimo malus dei tuoi prof (valido 24h)', price: 120 },
  { id: 'multiplier', icon: '⚡', label: 'Moltiplicatore', desc: 'Raddoppia il prossimo evento positivo dei tuoi prof', price: 200 },
  { id: 'joker', icon: '🎲', label: 'Jolly', desc: 'Ricevi un prof casuale tra gli annunci diretti aperti', price: 150 },
] as const;
