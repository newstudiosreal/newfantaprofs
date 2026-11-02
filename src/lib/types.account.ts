/** Una riga dell'archivio stagioni (tabella season_results). */
export interface SeasonResult {
  id: string;
  league_id: string;
  season_num: number;
  rank: number;
  team_id: string | null;
  team_name: string;
  owner_id: string | null;
  username: string;
  score: number;
  professors: { name: string; subject: string; cost: number; captain: boolean }[];
  created_at: string;
}

export interface RecoverResult { ok: true; new_code: string | null }
export interface ChangeUsernameResult { ok: true; username: string; next_change_at: string }
