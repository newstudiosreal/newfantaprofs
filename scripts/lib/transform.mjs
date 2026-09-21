// Trasformazione pura dei dati V1 (tabella "store", blob JSON) nelle righe del nuovo schema relazionale.
// Nessun accesso a rete o database: prende un oggetto { users, leagues, teams, ... } e restituisce righe + report.
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const DEFAULT_MISSIONS = JSON.parse(readFileSync(new URL('./default-missions.json', import.meta.url), 'utf8'));

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const iso = ms => new Date(Number.isFinite(+ms) && +ms > 0 ? +ms : Date.now()).toISOString();
const str = (v, max, fallback = '') => String(v ?? fallback).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const obj = v => (v && typeof v === 'object' ? v : {});
const arr = v => (Array.isArray(v) ? v : []);
const values = o => Object.values(obj(o));
const randPassword = () => randomBytes(9).toString('base64url');

export function sanitizeUsername(name, taken) {
  let base = String(name).normalize('NFKD').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (base.length < 3) base = (base + '_user').slice(0, 20);
  base = base.slice(0, 20);
  let cand = base, i = 2;
  while (taken.has(cand.toLowerCase())) { const suf = String(i++); cand = base.slice(0, 20 - suf.length) + suf; }
  return cand;
}

/**
 * @param {object} v1  { users, leagues, teams, events, trades, messages, missionClaims, market, powerups, premiumCodes, settings }
 * @param {{ rotate?: string[], defaultCatalog: { bonus: any[], malus: any[], premi: any[] } }} opts
 */
export function transform(v1, opts) {
  const rotate = new Set((opts.rotate ?? []).map(s => s.toLowerCase()));
  const report = { warnings: [], skipped: {}, counts: {}, tempPasswords: [], renamedUsers: [] };
  const skip = (what, why) => { (report.skipped[what] ??= []).push(why); };

  // ── Utenti ─────────────────────────────────────────────────────
  const users = [];
  const uname = new Map();            // username V1 → utente V2
  const taken = new Set();
  for (const [name, u] of Object.entries(obj(v1.users))) {
    if (u?.superadmin) { report.warnings.push(`"${name}" è SuperAdmin in V1: non migrato. Dopo la registrazione promuovi il tuo account con SQL.`); continue; }
    const username = USERNAME_RE.test(name) && !taken.has(name.toLowerCase()) ? name : sanitizeUsername(name, taken);
    taken.add(username.toLowerCase());
    if (username !== name) report.renamedUsers.push({ from: name, to: username });
    let password = typeof u?.password === 'string' ? u.password : '';
    let temp = false;
    if (password.length < 6 || rotate.has(name.toLowerCase())) { password = randPassword(); temp = true; report.tempPasswords.push({ username, password, reason: rotate.has(name.toLowerCase()) ? 'rotazione richiesta' : 'password V1 troppo corta' }); }
    const p = obj(u?.premium);
    const badges = [...arr(p.badges), ...(Array.isArray(u?.badge) ? u.badge : u?.badge ? [u.badge] : [])];
    const row = {
      key: name, username, password, tempPassword: temp,
      avatar: str(u?.avatar, 16, '🎓') || '🎓', bio: str(u?.bio, 200), createdAt: iso(u?.createdAt),
      premium: { skins: arr(p.skins), badges: arr(p.badges), nameFx: arr(p.nameFx), pro: arr(p.pro), custom: badges.filter(b => !arr(p.badges).includes(b)) },
    };
    users.push(row); uname.set(name, row);
  }

  // ── Leghe ──────────────────────────────────────────────────────
  const leagues = [], members = [], professors = [], missions = [], leagueMap = new Map(), profMap = new Map(), missionMap = new Map();
  const usedCodes = new Set();
  for (const lg of values(v1.leagues)) {
    const owner = uname.get(lg.owner);
    if (!owner) { skip('leghe', `${lg.name ?? lg.id}: proprietario "${lg.owner}" non migrato`); continue; }
    const id = randomUUID(); leagueMap.set(lg.id, id);
    let code = String(lg.code ?? '').toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code) || usedCodes.has(code)) { code = randomBytes(4).toString('hex').slice(0, 6).toUpperCase(); report.warnings.push(`Lega "${lg.name}": codice rigenerato (${code})`); }
    usedCodes.add(code);

    const catalog = (list, fallback) => {
      const src = arr(list).length ? arr(list) : fallback;
      return src.filter(e => e && e.id && Number.isFinite(+e.pts)).map(e => ({ id: String(e.id), label: str(e.label, 120, e.id), pts: +e.pts, ...(e.maxPerWeek != null ? { maxPerWeek: +e.maxPerWeek } : {}) }));
    };
    const bonus = catalog(lg.bonus, opts.defaultCatalog.bonus);
    const malus = catalog(lg.malus, opts.defaultCatalog.malus);
    const premi = catalog(lg.premi, opts.defaultCatalog.premi);
    const have = new Set([...bonus, ...malus, ...premi].map(e => e.id));
    for (const c of arr(lg.customBM)) {
      if (!c?.id || have.has(String(c.id)) || !Number.isFinite(+c.pts) || +c.pts === 0) continue;
      (+c.pts > 0 ? bonus : malus).push({ id: String(c.id), label: str(c.label, 120, c.id), pts: +c.pts }); have.add(String(c.id));
    }

    leagues.push({ id, name: str(lg.name, 40, 'Lega') .padEnd(2, '_'), code, owner_id: owner.key, suspended: !!lg.suspended,
      season_start: lg.seasonStart ? new Date(lg.seasonStart).toISOString() : iso(lg.createdAt), bonus, malus, premi,
      missions_enabled: !!lg.missionsEnabled, created_at: iso(lg.createdAt) });

    const memberNames = new Set([lg.owner, ...arr(lg.members)]);
    for (const m of memberNames) {
      const u = uname.get(m); if (!u) continue;
      members.push({ league_id: id, user_key: u.key, role: m === lg.owner || arr(lg.coadmins).includes(m) ? 'coadmin' : 'member' });
    }
    for (const p of arr(lg.profs)) {
      if (!p?.id) continue;
      const pid = randomUUID(); profMap.set(`${lg.id}:${p.id}`, pid);
      professors.push({ id: pid, league_id: id, name: str(p.name, 40, 'Prof').padEnd(2, '_'), subject: str(p.subject ?? p.materia, 40), cost: clamp(Math.round(+p.cost || +p.price || 1), 1, 50) });
    }
    const msList = arr(lg.missions).length ? arr(lg.missions) : DEFAULT_MISSIONS.map(m => ({ id: m.id, label: m.label, desc: m.description, type: m.type, condition: m.condition, reward: m.reward, rewardVal: m.reward === 'pts' ? m.reward_pts : m.reward_badge, rewardLabel: m.reward_label }));
    for (const m of msList) {
      if (!m?.id || !['auto_pos', 'auto_pts', 'auto_trades', 'manual'].includes(m.type)) continue;
      const mid = randomUUID(); missionMap.set(`${lg.id}:${m.id}`, mid);
      const pts = m.reward === 'pts';
      missions.push({ id: mid, league_id: id, label: str(m.label, 60, 'Missione').padEnd(2, '_'), description: str(m.desc ?? m.description, 200), type: m.type,
        condition: m.type === 'manual' ? null : clamp(Math.round(+m.condition || 1), 1, 100000), reward: pts ? 'pts' : 'badge',
        reward_pts: pts ? clamp(Math.round(+m.rewardVal || 10), 1, 500) : null, reward_badge: pts ? null : str(m.rewardVal, 30, '🏅'), reward_label: str(m.rewardLabel, 60) });
    }
  }

  // ── Squadre ────────────────────────────────────────────────────
  const teams = [], teamProfessors = [], teamMap = new Map(), seenTeam = new Set();
  const teamProfSet = new Map();
  for (const t of values(v1.teams)) {
    const lgId = leagueMap.get(t.lgId), owner = uname.get(t.owner);
    if (!lgId || !owner) { skip('squadre', `${t.name ?? t.id}`); continue; }
    if (seenTeam.has(`${lgId}:${owner.key}`)) { skip('squadre', `${t.name}: doppione di ${t.owner}`); continue; }
    seenTeam.add(`${lgId}:${owner.key}`);
    const id = randomUUID(); teamMap.set(t.id, id);
    const profs = [...new Set(arr(t.profs))].map(p => profMap.get(`${t.lgId}:${p}`)).filter(Boolean).slice(0, 4);
    const cap = t.captain ? profMap.get(`${t.lgId}:${t.captain}`) : null;
    teams.push({ id, league_id: lgId, owner_key: owner.key, name: str(t.name, 30, 'Squadra').padEnd(2, '_'), captain_id: cap && profs.includes(cap) ? cap : null, created_at: iso(t.createdAt) });
    profs.forEach(p => teamProfessors.push({ team_id: id, professor_id: p }));
    teamProfSet.set(id, new Set(profs));
  }

  // ── Eventi ─────────────────────────────────────────────────────
  const events = [];
  for (const e of values(v1.events)) {
    const lgId = leagueMap.get(e.lgId); if (!lgId) continue;
    const pid = profMap.get(`${e.lgId}:${e.profId}`) ?? null;
    const tid = e.teamId ? teamMap.get(e.teamId) ?? null : null;
    if (!pid && !tid) { skip('eventi', `${e.label ?? e.id} (prof/squadra non più presente)`); continue; }
    const key = String(e.eventId ?? '');
    const kind = pid ? (e.tipo === 'premio' ? 'premio' : 'bm')
      : /forecast/.test(key + e.profId) ? 'forecast' : /mission/.test(key + e.profId) ? 'mission' : /market|shop|rotat|joker|shield|mult/.test(key + e.profId) ? 'shop' : 'other';
    const by = uname.get(e.by);
    events.push({ league_id: lgId, professor_id: pid, team_id: pid ? null : tid, event_key: str(key, 60, 'legacy') || 'legacy', label: str(e.label, 120, key || 'Evento') || 'Evento',
      kind, pts: clamp(Math.round(+e.pts || 0), -1000, 1000), created_by_key: by?.key ?? null, created_at: iso(e.ts ?? e.createdAt) });
  }

  // ── Scambi ─────────────────────────────────────────────────────
  const trades = [];
  for (const t of values(v1.trades)) {
    const lgId = leagueMap.get(t.lgId), from = uname.get(t.fromUser), to = uname.get(t.toUser);
    const fp = profMap.get(`${t.lgId}:${t.fromProfId}`), tp = profMap.get(`${t.lgId}:${t.toProfId}`);
    if (!lgId || !from || !to || !fp || !tp || from === to) { skip('scambi', t.id ?? '?'); continue; }
    trades.push({ league_id: lgId, from_key: from.key, to_key: to.key, from_prof: fp, to_prof: tp,
      status: ['pending', 'accepted', 'rejected', 'cancelled', 'expired'].includes(t.status) ? t.status : 'cancelled',
      created_at: iso(t.createdAt), expires_at: iso(t.expiresAt ?? (+t.createdAt || Date.now()) + 36e6) });
  }

  // ── Messaggi ───────────────────────────────────────────────────
  const messages = [];
  for (const m of values(v1.messages)) {
    const lgId = leagueMap.get(m.lgId), a = uname.get(m.author), body = str(m.text, 500);
    if (!lgId || !a || !body) continue;
    messages.push({ league_id: lgId, author_key: a.key, body, created_at: iso(m.createdAt) });
  }

  // ── Missioni completate ────────────────────────────────────────
  const claims = [], claimSeen = new Set();
  for (const c of values(v1.missionClaims).sort((a, b) => (a.claimedAt ?? 0) - (b.claimedAt ?? 0))) {
    const lgId = leagueMap.get(c.lgId), mid = missionMap.get(`${c.lgId}:${c.missionId}`), u = uname.get(c.username);
    if (!lgId || !mid || !u) continue;
    const status = ['pending', 'approved', 'rejected'].includes(c.status) ? c.status : 'rejected';
    const k = `${mid}:${u.key}`;
    if (status !== 'rejected') { if (claimSeen.has(k)) continue; claimSeen.add(k); }
    claims.push({ league_id: lgId, mission_id: mid, user_key: u.key, note: str(c.note, 200), status, auto: !!c.auto, created_at: iso(c.claimedAt ?? c.ts) });
  }

  // ── Mercato ────────────────────────────────────────────────────
  const listings = [];
  for (const l of values(v1.market)) {
    const lgId = leagueMap.get(l.lgId), pid = profMap.get(`${l.lgId}:${l.profId}`), seller = uname.get(l.sellerUser);
    if (!lgId || !pid || !seller) continue;
    const sellerTeam = l.sellerTeamId ? teamMap.get(l.sellerTeamId) : null;
    if (l.status === 'open') {
      // In V2 il prof in vendita esce dalla squadra: se in V1 è ancora in squadra non si può migrare senza perderlo.
      if (sellerTeam && teamProfSet.get(sellerTeam)?.has(pid)) { skip('annunci aperti', `${l.profId}: il prof è ancora nella squadra del venditore, annuncio non migrato`); continue; }
    } else if (l.status !== 'sold') continue;
    const auction = l.type === 'auction';
    listings.push({ league_id: lgId, professor_id: pid, seller_key: seller.key, seller_team_id: sellerTeam ?? null, type: auction ? 'auction' : 'direct',
      price: auction ? null : clamp(Math.round(+l.price || 50), 50, 1000), min_bid: auction ? clamp(Math.round(+l.minBid || 50), 50, 1000) : null,
      current_bid: auction ? clamp(Math.round(+l.currentBid || +l.minBid || 50), 50, 1000) : null, current_bidder_key: uname.get(l.currentBidder)?.key ?? null,
      status: l.status === 'sold' ? 'sold' : 'open', sold_to_key: uname.get(l.soldTo ?? l.buyer)?.key ?? null, sold_for: l.soldFor ?? null,
      expires_at: auction ? iso(l.expiresAt) : null, created_at: iso(l.createdAt) });
  }

  // ── Power-up ───────────────────────────────────────────────────
  const powerups = [];
  for (const p of values(v1.powerups)) {
    const lgId = leagueMap.get(p.lgId), tid = teamMap.get(p.teamId), u = uname.get(p.username);
    if (!lgId || !tid || !u || !['shield', 'multiplier'].includes(p.type)) continue;
    powerups.push({ league_id: lgId, team_id: tid, user_key: u.key, kind: p.type, expires_at: p.expiresAt ? iso(p.expiresAt) : null, used_at: p.usedAt ? iso(p.usedAt) : null, created_at: iso(p.purchasedAt) });
  }

  // ── Codici premium ─────────────────────────────────────────────
  const codes = [];
  for (const c of values(v1.premiumCodes)) {
    const type = String(c.type ?? '');
    if (!['pro', 'skin', 'skin_bundle', 'badge', 'badge_bundle', 'name_fx', 'custom_badge'].includes(type) || !c.code) continue;
    const m = obj(c.meta); const meta = {};
    if (type === 'pro') { const lg = leagueMap.get(m.lgId); if (!lg) continue; meta.lgId = lg; }
    if (type === 'skin') meta.ref = String(m.skinId ?? '');
    if (type === 'badge') meta.ref = String(m.badgeId ?? '');
    if (type === 'name_fx') meta.ref = String(m.fxId ?? '');
    if (type === 'custom_badge') meta.ref = str(m.label, 30);
    if (['skin', 'badge', 'name_fx', 'custom_badge'].includes(type) && !meta.ref) continue;
    codes.push({ code: String(c.code).toUpperCase().slice(0, 40), type, meta, used_by_key: c.used ? uname.get(c.usedBy)?.key ?? null : null, used_at: c.used ? iso(c.usedAt) : null });
  }

  // ── Diritti premium ────────────────────────────────────────────
  const entitlements = [];
  for (const u of users) {
    const add = (kind, ref) => { if (ref) entitlements.push({ user_key: u.key, kind, ref: String(ref) }); };
    u.premium.skins.forEach(s => add('skin', s)); u.premium.badges.forEach(b => add('badge', b)); u.premium.nameFx.forEach(f => add('name_fx', f));
    u.premium.pro.forEach(l => add('pro', leagueMap.get(l))); u.premium.custom.forEach(b => add('custom_badge', str(b, 30)));
  }

  const hofSince = Number(obj(v1.settings).hofResetAt) || 0;
  report.counts = Object.fromEntries(Object.entries({ users, leagues, members, professors, teams, teamProfessors, events, trades, messages, missions, claims, listings, powerups, codes, entitlements }).map(([k, v]) => [k, v.length]));
  return { users, leagues, members, professors, teams, teamProfessors, events, trades, messages, missions, claims, listings, powerups, codes, entitlements, hofSince, report };
}
