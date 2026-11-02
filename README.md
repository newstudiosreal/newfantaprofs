# FantaProf V2 — Il fantasy dei prof

Crea la tua squadra di professori, gestisci i tuoi crediti e scala la classifica.

**Stack:** Vite · React 18 · TypeScript · Supabase (Auth + Postgres con RLS + Storage). Pronto per Vercel.

## Avvio in locale

```bash
npm install
cp .env.example .env.local     # poi inserisci URL e anon key del tuo progetto Supabase
npm run dev                    # http://localhost:5173
npm run build                  # typecheck + build di produzione in dist/
npm test                       # test unitari
```

## 1. Prepara Supabase (progetto di test, poi quello definitivo)

1. Crea un progetto Supabase.
2. **Authentication → Providers → Email**: disattiva **Confirm email** (gli utenti accedono con username, non con email reali).
3. **SQL Editor**: esegui in ordine i file di `supabase/migrations/`
   `001_schema.sql` → `002_rls.sql` → `003_functions.sql` → `004_market_missions.sql` → `005_season_account.sql` → `006_game.sql` → `007_social_admin.sql`.
   Se il tuo database è già in produzione con le prime quattro, esegui solo 005, 006 e 007 nell'ordine.
4. Registra il tuo account dall'app, poi promuovilo SuperAdmin (l'unico modo: non si può fare dal client):
   ```sql
   update public.profiles set is_superadmin = true where username = 'IL_TUO_USERNAME';
   ```
5. **Project Settings → API**: copia *Project URL* e *anon key* in `.env.local`.
   Non mettere mai la `service_role` nel front-end né su GitHub.

Per passare dal progetto di test a quello definitivo cambi solo le due variabili d'ambiente: il codice resta lo stesso.

## 2. Deploy su Vercel

Importa il repository, imposta `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` in *Environment Variables*. `vercel.json` gestisce rewrite SPA e header di sicurezza.

## 3. Migrare i dati dalla V1

Lo script legge la V1 **solo in lettura** e scrive nel V2 (che deve essere vuoto).
Copia le variabili `V1_*` e `V2_*` di `.env.example` nel tuo ambiente (`export` o `.env` caricato dalla shell), poi:

```bash
npm run migrate:v1 -- --dry-run                    # riepilogo, non scrive nulla
npm run migrate:v1 -- --rotate=utente1,utente2     # migra e forza nuove password per questi utenti
```

- Le password V1 di almeno 6 caratteri vengono mantenute; quelle più corte ricevono una password temporanea.
  **Le password V1 erano leggibili da chiunque**: ruota almeno gli admin con `--rotate`.
- Le password temporanee finiscono in `migration-report.json` (ignorato da git): comunicale agli utenti e cancella il file.
- Il SuperAdmin V1 non viene migrato: promuovi il tuo account con l'SQL sopra.
- Username non validi (spazi, accenti…) vengono sanitizzati e segnalati nel riepilogo.
- Non migrati: pronostici in corso, immagini banner squadra (erano nel `localStorage`), annunci di mercato aperti il cui prof è ancora in squadra.
- Gli utenti possono cambiare password da **Profilo → Sicurezza**.

## Sicurezza (cosa è cambiato rispetto alla V1)

| V1 | V2 |
|---|---|
| Tutto il database in blob JSON scaricabili e riscrivibili con la chiave anonima | Tabelle relazionali con RLS: il client legge solo la propria lega e non scrive direttamente |
| Password in chiaro nel database | Supabase Auth (hash) |
| Credenziali admin nel sorgente | Nessun segreto nel repo; ruolo SuperAdmin solo da SQL |
| Punteggi e crediti calcolati nel browser | Budget (50 crediti, max 4 prof), punti dal catalogo, mercato, scambi e codici premium validati dal server |

Novità di gioco: scudo e moltiplicatore agiscono solo sulla squadra che li possiede (in V1 il valore modificato veniva applicato a tutte le squadre).

## Struttura

```
src/lib/        client Supabase, API tipizzata, errori, regole (stagioni, budget)
src/hooks/      auth, tema, toast, caricamento dati
src/components/ UI condivisa e shell di navigazione
src/pages/      pagine; league/ contiene le sezioni della lega
supabase/migrations/   schema, RLS, funzioni di gioco
scripts/        migrazione V1 → V2
```

## Note

- Skin lega: colore d'accento scelto e visibile solo da chi la usa (salvato sul dispositivo). Gli effetti nome squadra sono invece pubblici.
- Modalità app (normale / estate / manutenzione) e Hall of Fame globale si gestiscono dal pannello SuperAdmin.
- La modalità "timer" della V1 non è stata portata.

## Aggiornamento V2.1

**Fine stagione.** A 30 giorni dall'inizio la classifica finale viene archiviata (tab *Stagioni*, podio incluso), si azzerano punti, mercato, scambi, sfide e pronostici e le squadre restano vuote durante i 3 giorni di pausa: ognuno ricostruisce la propria con 50 crediti. Nome squadra, effetto nome e acquisti premium restano per sempre. In *Gestione → Stagione* l'admin sceglie se la chiusura è automatica (alla prima apertura della lega dopo la scadenza, oppure con pg_cron: vedi `close_due_seasons` nella 005) o manuale. L'Hall of Fame somma anche le stagioni archiviate.

**Recupero password.** Alla registrazione l'app mostra un codice di recupero una sola volta (nel database c'è solo l'hash). Dalla pagina *Password dimenticata?* username + codice → nuova password; il codice si rinnova a ogni uso. Chi era già registrato lo genera da *Profilo → Sicurezza*. Il reset da SuperAdmin resta come ultima spiaggia.

**Novità di gioco.** Classifica con filtri e frecce, grafico punti, sfide 1 contro 1, confronto squadre, missioni giornaliere/settimanali, pronostici di squadra con serie, scambi 2 contro 1 e controfferta, preferiti con notifiche, scheda professore. Admin: permessi dei co-admin, registrazione in blocco, annulla ultima registrazione, proposte dei giocatori, export CSV, invito con link e QR. Chat: risposte, reazioni, messaggio fissato, sondaggi, filtro parole (lista vuota: la gestisce il SuperAdmin). Community: seguiti e feed. Tecnica: realtime, notifiche push, invito a installare l'app, pagina d'errore con segnalazione, FAQ e numeri reali in landing.

### Da fare a mano dopo il deploy
1. `npm install` (nuova dipendenza `qrcode`).
2. Edge function (richiedono Supabase CLI):
   ```bash
   supabase functions deploy recover-password --no-verify-jwt
   supabase functions deploy change-username
   supabase functions deploy admin-reset-password
   supabase functions deploy send-push --no-verify-jwt   # solo se usi le push
   ```
3. Push (facoltative): `npx web-push generate-vapid-keys`, poi `VITE_VAPID_PUBLIC_KEY` nel front-end e i secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `WEBHOOK_SECRET`; crea un Database Webhook su INSERT di `notifications` verso `send-push` con header `x-webhook-secret`. Dettagli in testa a `supabase/functions/send-push/index.ts`.
4. Realtime: verifica che sia attivo nel progetto (la 007 aggiunge le tabelle alla publication).
5. Le tabelle della community (`notifications`, `direct_messages`, `audit_logs`, segnalazioni, blocchi) non sono nelle migrazioni 001-004 di questo repo: la V2.1 assume che esistano già nel tuo database, con le colonne usate dal client.

### Test
`npm test` per i test del front-end. Per l'SQL, in `supabase/tests/` ci sono gli script di verifica (005, 006, 007) da eseguire con `psql` su un database con le migrazioni applicate.
