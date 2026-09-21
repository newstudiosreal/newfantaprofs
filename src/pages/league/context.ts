import { createContext, useContext } from 'react';
import type { LeagueBundle } from '@/lib/api';
import type { Professor, Profile, Team, TeamScore } from '@/lib/types';

export interface LeagueCtx {
  bundle: LeagueBundle;
  reload: () => Promise<void>;
  meId: string;
  isSuper: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  myTeam: Team | undefined;
  myScore: number;
  /** Punti disponibili da spendere sul mercato (= punteggio della squadra). */
  profById: (id: string) => Professor | undefined;
  userById: (id: string) => Profile | undefined;
  teamProfs: (teamId: string) => Professor[];
  ranking: TeamScore[];
}

export const LeagueContext = createContext<LeagueCtx | null>(null);

export function useLeague(): LeagueCtx {
  const v = useContext(LeagueContext);
  if (!v) throw new Error('useLeague fuori da LeagueLayout');
  return v;
}
