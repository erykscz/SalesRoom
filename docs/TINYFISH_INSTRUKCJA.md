# TinyFish (AgentQL) — Instrukcja Obsługi

## Spis treści
1. [Co to jest TinyFish?](#1-co-to-jest-tinyfish)
2. [Konfiguracja](#2-konfiguracja)
3. [Enrichment pojedynczego deala](#3-enrichment-pojedynczego-deala)
4. [Bulk enrichment leadów](#4-bulk-enrichment-leadów)
5. [Integracja z Deep Research](#5-integracja-z-deep-research)
6. [API — dokumentacja endpointów](#6-api--dokumentacja-endpointów)
7. [Rozwiązywanie problemów](#7-rozwiązywanie-problemów)

---

## 1. Co to jest TinyFish?

TinyFish to integracja z **AgentQL** — AI-powered web scraping API, który wyciąga ustrukturyzowane dane z profili LinkedIn i stron firmowych. W odróżnieniu od Deep Research (Proxycurl + scrapery), TinyFish używa inteligentnej ekstrakcji danych za pomocą zapytań strukturalnych.

**Co wyciąga TinyFish:**
- **LinkedIn (osoba):** imię i nazwisko, headline, podsumowanie, lokalizacja, doświadczenie zawodowe, edukacja, umiejętności
- **Strona firmowa:** nazwa firmy, opis, branża, usługi, produkty, technologie, zespół, dane kontaktowe

---

## 2. Konfiguracja

### Krok 1: Uzyskaj klucz API AgentQL

1. Wejdź na [agentql.com](https://agentql.com) i zarejestruj się
2. Wygeneruj klucz API w panelu użytkownika
3. Skopiuj klucz (format: `aq_...`)

### Krok 2: Ustaw zmienne środowiskowe

Dodaj do pliku `.env` (w katalogu głównym projektu):

```env
TINYFISH_API_KEY=aq_twoj_klucz_tutaj
TINYFISH_API_URL=https://api.agentql.com/v1
RESEARCH_PROVIDER=tinyfish
```

> **Uwaga:** Jeśli używasz `.env.local` (Vercel), dodaj tam te same zmienne.
>
> Jeśli nie masz pliku `.env` w katalogu głównym, stwórz go kopiując `.env.example`:
> ```bash
> cp .env.example .env
> ```
> A następnie uzupełnij wartości.

### Krok 3: Zrestartuj backend

```bash
cd backend && npm run dev
```

### Krok 4: Zweryfikuj konfigurację

W przeglądarce lub Postmanie:
```
GET http://localhost:3001/api/enrichment/status
Authorization: Bearer <twoj_token>
```

Oczekiwana odpowiedź:
```json
{
  "configured": true,
  "provider": "tinyfish"
}
```

Jeśli `configured: false` — klucz API nie jest ustawiony lub jest pusty.

### Opcja: RESEARCH_PROVIDER

| Wartość | Zachowanie |
|---------|-----------|
| `proxycurl` (domyślna) | Deep Research używa Proxycurl + scrapery HTML |
| `tinyfish` | Deep Research używa AgentQL do LinkedIn i stron WWW |

> Niezależnie od tej opcji, endpointy `/api/enrichment/*` zawsze używają AgentQL (jeśli klucz jest ustawiony).

---

## 3. Enrichment pojedynczego deala

### Gdzie to jest?

Na stronie **szczegółów deala** (Deal Detail), w **prawej kolumnie** pojawia się karta **"Prospect Intelligence"**.

### Jak używać:

1. Otwórz dowolny deal w aplikacji
2. W prawej kolumnie zobaczysz kartę **"Prospect Intelligence"** z przyciskiem **"Enrich"**
3. Kliknij **"Enrich"** — system rozpocznie ekstrakcję danych
4. Poczekaj kilka sekund (karta pokaże spinner "Extracting data...")
5. Po zakończeniu zobaczysz:
   - **Sekcja "Person"** — dane osoby (imię, stanowisko, lokalizacja, umiejętności, doświadczenie, edukacja)
   - **Sekcja "Company"** — dane firmy (branża, opis, technologie, usługi)
6. Data ostatniego enrichmentu jest wyświetlona na dole karty
7. Przycisk zmienia się na **"Refresh"** — kliknij, żeby ponownie pobrać dane

### Wymagania:
- Deal musi mieć **LinkedIn URL** (pole `linkedin_url`) i/lub **Company URL** (pole `company_url`)
- Bez tych pól enrichment nie będzie miał skąd wyciągać danych

### Screenshot lokalizacji:
```
┌─────────────────────────────────────────────┐
│ Deal Detail Page                            │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │              │  │ ★ Prospect Intel  [↻] │ │  <-- NOWA KARTA
│  │  Main Info   │  │   Person: Jan Kowal.. │ │
│  │  Activities  │  │   Company: Acme...    │ │
│  │  Research    │  ├──────────────────────┤ │
│  │              │  │   Pain Points        │ │
│  │              │  │   Stakeholders       │ │
│  │              │  │   ...                │ │
│  └──────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────┘
```

---

## 4. Bulk enrichment leadów

### Gdzie to jest?

Na stronie **Intent Scraper** (lista leadów), w zakładce z leadami.

### Jak używać:

1. Przejdź do **Intent Scraper** w nawigacji
2. Przy każdym leadzie zobaczysz **checkbox** (kwadracik do zaznaczenia)
3. Zaznacz leady, które chcesz wzbogacić:
   - Kliknij checkbox przy konkretnym leadzie, lub
   - Użyj **"Select all"** na górze listy, żeby zaznaczyć wszystkie
4. Na dole ekranu pojawi się **pasek akcji** (Enrichment Panel):
   - Pokazuje liczbę zaznaczonych leadów
   - Przycisk **"Enrich Selected"** — rozpoczyna bulk enrichment
   - Przycisk **"Clear"** — odznacza wszystkie
5. Kliknij **"Enrich Selected"**
6. Pasek pokaże **progress bar** z postępem (np. "3/10 enriched")
7. Po zakończeniu:
   - Przy wzbogaconych leadach pojawi się badge **"Enriched"** (fioletowy)
   - Jeśli częściowo: **"Partially Enriched"** (żółty)
   - Jeśli się nie udało: **"Enrichment Failed"** (czerwony)

### Limity:
- Maksymalnie **50 leadów** w jednym bulk request
- Między każdym leadem jest 500ms opóźnienia (ochrona przed rate limitem AgentQL)

### Screenshot:
```
┌─────────────────────────────────────────────┐
│ Intent Scraper — Leads                      │
│                                             │
│ ☑ Select all (15)                           │
│                                             │
│ ┌───────────────────────────────────────┐   │
│ │ ☑ Jan Kowalski  |  Acme Corp          │   │
│ │    CEO | Industry: IT  [Enriched ✓]   │   │
│ └───────────────────────────────────────┘   │
│ ┌───────────────────────────────────────┐   │
│ │ ☐ Anna Nowak  |  Beta Sp. z o.o.     │   │
│ │    CTO | Industry: Finance            │   │
│ └───────────────────────────────────────┘   │
│                                             │
│ ═══════════════════════════════════════════  │
│ ★ 3 leads selected  [████░░░░] 1/3         │
│                          [Clear] [Enrich ↻] │
└─────────────────────────────────────────────┘
```

---

## 5. Integracja z Deep Research

Jeśli ustawisz `RESEARCH_PROVIDER=tinyfish`, system **Deep Research** (na stronie deala, sekcja "Research") będzie automatycznie używał AgentQL zamiast Proxycurl/scraperów HTML dla:
- **LinkedIn** — ekstrakcja profilu osoby i firmy
- **Website** — ekstrakcja danych ze strony firmowej

Pozostałe platformy (GitHub, Twitter, Reddit, Facebook) działają bez zmian.

> Jeśli `RESEARCH_PROVIDER` nie jest ustawiony lub = `proxycurl`, Deep Research działa jak dotychczas (Proxycurl + scrapery HTML), a TinyFish działa tylko przez endpointy `/api/enrichment/*`.

---

## 6. API — dokumentacja endpointów

Wszystkie endpointy wymagają nagłówka `Authorization: Bearer <token>`.

### GET `/api/enrichment/status`
Sprawdza, czy TinyFish jest skonfigurowany.

**Odpowiedź:**
```json
{ "configured": true, "provider": "tinyfish" }
```

### POST `/api/enrichment/enrich`
Wzbogaca pojedynczego leada lub deala (asynchronicznie).

**Body:**
```json
{ "entityType": "deal", "entityId": "uuid-of-deal" }
```

**Odpowiedź (202):**
```json
{
  "jobId": "uuid-of-job",
  "status": "pending",
  "message": "Enrichment started. Poll /api/enrichment/jobs/:jobId/status for progress."
}
```

### POST `/api/enrichment/bulk`
Wzbogaca wiele encji naraz (max 50).

**Body:**
```json
{
  "jobs": [
    { "entityType": "lead", "entityId": "uuid-1" },
    { "entityType": "lead", "entityId": "uuid-2" }
  ]
}
```

**Odpowiedź (202):**
```json
{
  "jobs": [
    { "jobId": "job-uuid-1", "entityType": "lead", "entityId": "uuid-1" },
    { "jobId": "job-uuid-2", "entityType": "lead", "entityId": "uuid-2" }
  ],
  "message": "2 enrichment jobs started."
}
```

### GET `/api/enrichment/jobs/:jobId/status`
Sprawdza status pojedynczego joba.

**Odpowiedź:**
```json
{
  "id": "job-uuid",
  "entityType": "lead",
  "entityId": "lead-uuid",
  "status": "completed",
  "errors": null,
  "created_at": "2026-03-03 12:00:00",
  "completed_at": "2026-03-03 12:00:15"
}
```

Statusy: `pending` → `running` → `completed` / `partial` / `failed`

### GET `/api/enrichment/entity/:entityType/:entityId`
Pobiera wyniki enrichmentu dla danej encji.

**Odpowiedź:**
```json
{
  "entityType": "deal",
  "entityId": "deal-uuid",
  "enrichmentData": {
    "linkedin": { "full_name": "Jan Kowalski", "headline": "CEO at Acme", ... },
    "website": { "name": "Acme Corp", "industry": "IT", "technologies": ["React", "Node.js"], ... }
  },
  "lastEnriched": "2026-03-03 12:00:15",
  "job": { ... }
}
```

---

## 7. Rozwiązywanie problemów

### Nie widzę karty "Prospect Intelligence" na stronie deala
- **Przyczyna:** `TINYFISH_API_KEY` nie jest ustawiony
- **Rozwiązanie:** Dodaj klucz do `.env` i zrestartuj backend
- **Weryfikacja:** `GET /api/enrichment/status` powinien zwrócić `"configured": true`

### Nie widzę checkboxów przy leadach w Intent Scraper
- **Przyczyna:** Jak wyżej — frontend ukrywa checkboxy gdy TinyFish nie jest skonfigurowany
- **Rozwiązanie:** Ustaw `TINYFISH_API_KEY` i zrestartuj backend

### Enrichment zwraca "failed"
- **Przyczyna:** Brak LinkedIn URL lub Company URL na encji
- **Rozwiązanie:** Uzupełnij pola `linkedin_url` i/lub `company_url` na dealu/leadzie
- **Przyczyna 2:** Nieprawidłowy klucz API AgentQL
- **Rozwiązanie:** Sprawdź klucz na [agentql.com](https://agentql.com)

### Enrichment trwa bardzo długo (>30s)
- AgentQL musi załadować stronę w przeglądarce headless — LinkedIn jest wolny
- Timeout jest ustawiony na 30 sekund per zapytanie
- Jeśli LinkedIn blokuje — spróbuj ponownie za kilka minut

### Backend nie startuje po zmianach
- Upewnij się, że plik `.env` istnieje w katalogu głównym projektu
- Jeśli używasz tylko `.env.local`, skopiuj go:
  ```bash
  cp .env.local .env
  ```
  i dodaj zmienne TinyFish do `.env`

### Schemat bazy danych
Migracje uruchamiają się automatycznie przy starcie backendu. Nowe kolumny i tabela `enrichment_jobs` zostaną dodane bez interwencji.
