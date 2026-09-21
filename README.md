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
   `001_schema.sql` → `002_rls.sql` → `003_functions.sql` → `004_market_missions.sql`.
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
