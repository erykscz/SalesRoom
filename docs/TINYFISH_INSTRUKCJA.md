# TinyFish — Instrukcja Obsługi

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

TinyFish to integracja z **TinyFish Web Agent** (https://agent.tinyfish.ai) — AI-powered web automation API, który wyciąga ustrukturyzowane dane z profili LinkedIn i stron firmowych za pomocą poleceń w języku naturalnym. W odróżnieniu od Deep Research (Proxycurl + scrapery HTML), TinyFish używa inteligentnej przeglądarki headless z trybem stealth do omijania blokad bot-detection.

**Co wyciąga TinyFish:**
- **LinkedIn (osoba):** imię i nazwisko, headline, podsumowanie, lokalizacja, doświadczenie zawodowe, edukacja, umiejętności
- **Strona firmowa:** nazwa firmy, opis, branża, usługi, produkty, technologie, zespół, dane kontaktowe

**Jak działa:**
1. Wysyłamy URL + cel (goal) w języku naturalnym do TinyFish API
2. TinyFish uruchamia przeglądarkę headless, ładuje stronę, wyciąga dane
3. Wyniki wracają jako ustrukturyzowany JSON

---

## 2. Konfiguracja

### Krok 1: Uzyskaj klucz API TinyFish

1. Wejdź na [agent.tinyfish.ai/signup](https://agent.tinyfish.ai/signup) i zarejestruj się
2. Wygeneruj klucz API w dashboardzie
3. Skopiuj klucz (format: `sk-tinyfish-...`)

### Krok 2: Ustaw zmienne środowiskowe

#### Lokalnie (development)

Dodaj do pliku `.env.local` (w katalogu głównym projektu):

```env
TINYFISH_API_KEY=sk-tinyfish-twoj_klucz_tutaj
TINYFISH_API_URL=https://agent.tinyfish.ai/v1
RESEARCH_PROVIDER=tinyfish
```

#### Na Vercel (production)

```bash
echo -n "sk-tinyfish-twoj_klucz" | vercel env add TINYFISH_API_KEY production
echo -n "https://agent.tinyfish.ai/v1" | vercel env add TINYFISH_API_URL production
echo -n "tinyfish" | vercel env add RESEARCH_PROVIDER production
vercel --prod
```

> **Uwaga:** Użyj `echo -n` żeby uniknąć dodania znaku nowej linii do wartości.

### Krok 3: Zrestartuj/zdeployuj

Lokalnie:
```bash
cd backend && npm run dev
```

Na Vercel:
```bash
vercel --prod
```

### Krok 4: Zweryfikuj konfigurację

```
GET /api/enrichment/status
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
| `tinyfish` | Deep Research używa TinyFish do LinkedIn i stron WWW |

> Niezależnie od tej opcji, endpointy `/api/enrichment/*` zawsze używają TinyFish (jeśli klucz jest ustawiony).

---

## 3. Enrichment pojedynczego deala

### Gdzie to jest?

Na stronie **szczegółów deala** (Deal Detail), w **prawej kolumnie** pojawia się karta **"Prospect Intelligence"**.

### Jak używać:

1. Otwórz dowolny deal w aplikacji
2. W prawej kolumnie zobaczysz kartę **"Prospect Intelligence"** z przyciskiem **"Enrich"**
3. Kliknij **"Enrich"** — system rozpocznie ekstrakcję danych
4. Poczekaj — karta pokaże spinner "Extracting data..."
   - **Website:** ~30-40 sekund
   - **LinkedIn:** ~3-10 minut (tryb stealth, LinkedIn jest wolny)
5. Frontend automatycznie polluje status co kilka sekund
6. Po zakończeniu zobaczysz:
   - **Sekcja "Person"** — dane osoby (imię, stanowisko, lokalizacja, umiejętności, doświadczenie, edukacja)
   - **Sekcja "Company"** — dane firmy (branża, opis, technologie, usługi)
7. Data ostatniego enrichmentu jest wyświetlona na dole karty
8. Przycisk zmienia się na **"Refresh"** — kliknij, żeby ponownie pobrać dane

### Wymagania:
- Deal musi mieć **LinkedIn URL** (pole `linkedin_url`) i/lub **Company URL** (pole `company_url`)
- Bez tych pól enrichment nie będzie miał skąd wyciągać danych
- LinkedIn i website research uruchamiają się **równolegle** (nie trzeba czekać na jedno, żeby drugie się zaczęło)

### Screenshot lokalizacji:
```
┌─────────────────────────────────────────────┐
│ Deal Detail Page                            │
│                                             │
│  ┌──────────────┐  ┌──────────────────────┐ │
│  │              │  │ ★ Prospect Intel  [↻] │ │  <-- KARTA
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

Jeśli ustawisz `RESEARCH_PROVIDER=tinyfish`, system **Deep Research** (na stronie deala, sekcja "Research") będzie automatycznie używał TinyFish zamiast Proxycurl/scraperów HTML dla:
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
Wzbogaca pojedynczego leada lub deala.

Endpoint uruchamia **asynchroniczne** TinyFish runy i zwraca `jobId` natychmiast. Wyniki są dostępne po pollowaniu statusu.

**Body:**
```json
{ "entityType": "deal", "entityId": "uuid-of-deal" }
```

**Odpowiedź (202):**
```json
{
  "jobId": "uuid-of-job",
  "status": "running",
  "message": "Enrichment started. Poll /api/enrichment/jobs/:jobId/status for results."
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

**Ważne:** Ten endpoint jednocześnie sprawdza status w TinyFish i aktualizuje bazę danych gdy wyniki są gotowe. Frontend powinien pollować ten endpoint co 5-10 sekund.

**Odpowiedź:**
```json
{
  "id": "job-uuid",
  "entityType": "lead",
  "entityId": "lead-uuid",
  "status": "completed",
  "errors": null,
  "created_at": "2026-03-03T12:00:00Z",
  "completed_at": "2026-03-03T12:05:15Z"
}
```

Statusy: `pending` → `running` → `completed` / `partial` / `failed`

### GET `/api/enrichment/entity/:entityType/:entityId`
Pobiera wyniki enrichmentu dla danej encji. Jeśli job jest wciąż w toku, automatycznie sprawdza TinyFish.

**Odpowiedź:**
```json
{
  "entityType": "deal",
  "entityId": "deal-uuid",
  "enrichmentData": {
    "linkedin": { "full_name": "Jan Kowalski", "headline": "CEO at Acme", "..." },
    "website": { "name": "Acme Corp", "industry": "IT", "technologies": ["React", "Node.js"], "..." }
  },
  "lastEnriched": "2026-03-03T12:05:15Z",
  "job": { "..." }
}
```

---

## 7. Rozwiązywanie problemów

### Nie widzę karty "Prospect Intelligence" na stronie deala
- **Przyczyna:** `TINYFISH_API_KEY` nie jest ustawiony
- **Rozwiązanie:** Dodaj klucz do `.env.local` (lokalnie) lub do Vercel env vars (production)
- **Weryfikacja:** `GET /api/enrichment/status` powinien zwrócić `"configured": true`

### Nie widzę checkboxów przy leadach w Intent Scraper
- **Przyczyna:** Jak wyżej — frontend ukrywa checkboxy gdy TinyFish nie jest skonfigurowany
- **Rozwiązanie:** Ustaw `TINYFISH_API_KEY` i zdeployuj/zrestartuj

### Enrichment zwraca "failed to start enrichment"
- **Przyczyna:** Tabela `enrichment_jobs` nie istnieje w bazie danych
- **Rozwiązanie:** Migracje uruchamiają się automatycznie. Zdeployuj najnowszą wersję kodu
- **Przyczyna 2:** Nieprawidłowy klucz API TinyFish
- **Rozwiązanie:** Sprawdź klucz na [agent.tinyfish.ai](https://agent.tinyfish.ai)

### Enrichment zwraca "failed" z błędem API
- **Przyczyna:** Brak LinkedIn URL lub Company URL na encji
- **Rozwiązanie:** Uzupełnij pola `linkedin_url` i/lub `company_url` na dealu/leadzie
- **Przyczyna 2:** Klucz API wygasł lub jest nieaktywny
- **Rozwiązanie:** Wygeneruj nowy klucz na dashboardzie TinyFish
- **Przyczyna 3:** Brak kredytów na koncie TinyFish (błąd 403 FORBIDDEN)
- **Rozwiązanie:** Doładuj konto na agent.tinyfish.ai

### Enrichment trwa bardzo długo
- **Website:** ~30-40 sekund (normalne)
- **LinkedIn:** ~3-10 minut (normalne — tryb stealth, LinkedIn jest trudny do scrape'owania)
- TinyFish uruchamia prawdziwą przeglądarkę headless, to nie jest zwykłe HTTP request
- LinkedIn i website research uruchamiają się równolegle
- Frontend automatycznie polluje status — nie trzeba odświeżać strony

### Enrichment "running" ale nigdy się nie kończy
- **Przyczyna:** TinyFish run mógł się zawiesić
- **Rozwiązanie:** Kliknij "Refresh" na karcie Prospect Intelligence żeby uruchomić nowy enrichment
- Stary job pozostanie w statusie "running" ale nie blokuje nowych

### Schemat bazy danych
Migracje uruchamiają się automatycznie przy starcie backendu — zarówno dla SQLite (dev) jak i PostgreSQL/Neon (Vercel). Nowe kolumny i tabela `enrichment_jobs` zostaną dodane bez interwencji.

### Kody błędów TinyFish API

| Kod | Znaczenie |
|-----|-----------|
| 401 | Nieprawidłowy lub brakujący klucz API |
| 403 | Brak kredytów lub nieaktywna subskrypcja |
| 429 | Rate limit — zbyt wiele zapytań, poczekaj chwilę |
| 500 | Błąd po stronie TinyFish — spróbuj ponownie |
