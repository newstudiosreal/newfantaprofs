#!/usr/bin/env node
// Migrazione FantaProf V1 → V2.
//
//   npm run migrate:v1 -- --dry-run                 # solo report, non scrive nulla
//   npm run migrate:v1 -- --rotate=nome1,nome2      # forza nuova password per questi utenti
//   npm run migrate:v1                              # migrazione reale
//
// Il progetto V1 viene solo LETTO. Il progetto V2 deve essere vuoto (o usa --force).
// Variabili richieste (vedi .env.example): V1_SUPABASE_URL, V1_SUPABASE_KEY, V2_SUPABASE_URL, V2_SUPABASE_SERVICE_ROLE_KEY.
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { transform } from './lib/transform.mjs';

const CATALOG = JSON.parse(readFileSync(new URL('./lib/default-catalog.json', import.meta.url), 'utf8'));
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Legge tutte le collezioni dalla tabella "store" di V1. */
export async function readV1(url, key) {
  const res = await fetch(`${url}/rest/v1/store?select=key,value`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Lettura V1 fallita: HTTP ${res.status}`);
  const rows = await res.json();
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

/**
 * Scrive i dati trasformati nel progetto V2.
 * @param sb      client supabase-js con service_role
 * @param createUser  async ({ username, password }) => uuid   (in produzione usa sb.auth.admin.createUser)
 */
export async function writeV2(sb, data, { createUser, log = console.log, force = false } = {}) {
  const ins = async (table, rows, size = 200) => {
    for (const part of chunk(rows, size)) {
      const { error } = await sb.from(table).insert(part);
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    log(`  ✓ ${table}: ${rows.length}`);
  };

  const { count } = await sb.from('leagues').select('id', { count: 'exact', head: true });
  if (count && !force) throw new Error('Il progetto V2 contiene già delle leghe. Usa --force solo se sai cosa stai facendo.');

  log('Utenti…');
  const uid = {};
  for (const u of data.users) {
    uid[u.key] = await createUser({ username: u.username, password: u.password });
    const { error } = await sb.from('profiles').update({ avatar: u.avatar, bio: u.bio, created_at: u.createdAt }).eq('id', uid[u.key]);
    if (error) throw new Error(`profilo ${u.username}: ${error.message}`);
  }
  log(`  ✓ utenti: ${data.users.length}`);
  const U = k => (k ? uid[k] ?? null : null);

  await ins('leagues', data.leagues.map(({ owner_id, ...l }) => ({ ...l, owner_id: U(owner_id) })));
  await ins('league_members', data.members.map(({ user_key, ...m }) => ({ ...m, user_id: U(user_key) })));
  await ins('professors', data.professors);
  await ins('teams', data.teams.map(({ owner_key, captain_id, ...t }) => ({ ...t, owner_id: U(owner_key), captain_id: null })));
  await ins('team_professors', data.teamProfessors);
  for (const t of data.teams.filter(t => t.captain_id)) {
    const { error } = await sb.from('teams').update({ captain_id: t.captain_id }).eq('id', t.id);
    if (error) throw new Error(`capitano: ${error.message}`);
  }
  await ins('events', data.events.map(({ created_by_key, ...e }) => ({ ...e, created_by: U(created_by_key) })), 500);
  await ins('trades', data.trades.map(({ from_key, to_key, ...t }) => ({ ...t, from_user: U(from_key), to_user: U(to_key) })));
  await ins('messages', data.messages.map(({ author_key, ...m }) => ({ ...m, author_id: U(author_key) })), 500);
  await ins('missions', data.missions);
  await ins('mission_claims', data.claims.map(({ user_key, ...c }) => ({ ...c, user_id: U(user_key) })));
  await ins('market_listings', data.listings.map(({ seller_key, current_bidder_key, sold_to_key, ...l }) => ({ ...l, seller_id: U(seller_key), current_bidder: U(current_bidder_key), sold_to: U(sold_to_key) })));
  await ins('powerups', data.powerups.map(({ user_key, ...p }) => ({ ...p, user_id: U(user_key) })));
  await ins('premium_codes', data.codes.map(({ used_by_key, ...c }) => ({ ...c, used_by: U(used_by_key) })));
  await ins('entitlements', data.entitlements.map(({ user_key, ...e }) => ({ ...e, user_id: U(user_key) })));
  if (data.hofSince) {
    const { error } = await sb.from('settings').upsert({ key: 'hof_since', value: data.hofSince });
    if (error) throw new Error(`settings: ${error.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const flag = n => args.includes(`--${n}`);
  const opt = n => args.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
  const need = n => { if (!process.env[n]) { console.error(`Manca la variabile ${n} (vedi .env.example)`); process.exit(1); } return process.env[n]; };

  const v1 = await readV1(need('V1_SUPABASE_URL'), need('V1_SUPABASE_KEY'));
  const data = transform(v1, { rotate: (opt('rotate') ?? '').split(',').filter(Boolean), defaultCatalog: CATALOG });
  const { report } = data;

  console.log('\nRiepilogo dati V1 → V2');
  console.table(report.counts);
  report.warnings.forEach(w => console.log('⚠', w));
  Object.entries(report.skipped).forEach(([k, v]) => console.log(`⚠ ${v.length} ${k} non migrati (es. ${v.slice(0, 2).join('; ')})`));
  report.renamedUsers.forEach(r => console.log(`⚠ username "${r.from}" → "${r.to}" (non rispettava le regole V2)`));
  if (flag('dry-run')) { console.log('\nDry-run: nessuna scrittura effettuata.'); return; }

  const sb = createClient(need('V2_SUPABASE_URL'), need('V2_SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  await writeV2(sb, data, {
    force: flag('force'),
    createUser: async ({ username, password }) => {
      const { data: res, error } = await sb.auth.admin.createUser({
        email: `${username.toLowerCase()}@users.fantaprof.app`, password, email_confirm: true, user_metadata: { username },
      });
      if (error) throw new Error(`utente ${username}: ${error.message}`);
      return res.user.id;
    },
  });

  // Il report contiene password temporanee: tienilo privato (è in .gitignore).
  writeFileSync('migration-report.json', JSON.stringify({ ...report, at: new Date().toISOString() }, null, 2));
  console.log(`\n✅ Migrazione completata. Report: migration-report.json (${report.tempPasswords.length} password temporanee da comunicare agli utenti).`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error('\n❌', e.message); process.exit(1); });
