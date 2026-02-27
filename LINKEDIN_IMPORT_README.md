# LinkedIn Sales Navigator CSV Import - Implementation Summary

## ✅ Implemented Changes

### Backend (`/backend/src/routes/deals.js`)

Rozszerzono istniejący endpoint `POST /api/deals/import/csv` o obsługę formatu LinkedIn Sales Navigator:

#### 1. **Auto-detekcja formatu LinkedIn**
- Wykrywa format po charakterystycznych kolumnach: `linkedin name`, `sales navigator profile link`, `organisation`
- Loguje informację o wykrytym formacie do konsoli

#### 2. **Preprocessing nagłówków LinkedIn**
Mapowanie kolumn LinkedIn → format systemowy:
```javascript
'first name' → 'first_name_temp'
'last name' → 'last_name_temp'
'linkedin name' → 'linkedin_name_temp'
'organisation' → 'company name'
'current role(s)' → 'job title'
'sales navigator profile link' → 'linkedin url'
'about' → 'about_temp'
// + inne kolumny pomocnicze
```

#### 3. **Filtrowanie zablokowanych wierszy**
- Automatycznie pomija wiersze zawierające `"LOCKED"` lub `"🔒"` w pierwszej kolumnie (ID)
- Loguje pominięte wiersze do konsoli

#### 4. **Łączenie pól imienia**
Kolejność priorytetów przy budowaniu pełnej nazwy kontaktu:
1. Standardowe pole `Name` (jeśli istnieje)
2. `First Name` + `Last Name` (dla LinkedIn)
3. `LinkedIn Name` (fallback dla LinkedIn)

#### 5. **Zapisywanie LinkedIn Bio**
- Pole `About` z LinkedIn jest zapisywane jako notatka do deala
- Format: `📝 LinkedIn Bio:\n\n{content}`
- Błędy zapisu notatki nie przerywają importu (graceful degradation)

#### 6. **Rozszerzona odpowiedź API**
```json
{
  "success": true,
  "imported": 3,
  "format": "linkedin",  // ← nowe pole
  "deals": [...],
  "errors": [...]
}
```

## 🧪 Jak przetestować

### Krok 1: Uruchom backend
```bash
cd backend
npm start
```

### Krok 2: Przygotuj plik CSV
Użyj pliku testowego `test-linkedin-import.csv` lub swojego eksportu z LinkedIn Sales Navigator.

Plik musi zawierać nagłówki:
- `First Name` i `Last Name` (lub `LinkedIn Name`)
- `Organisation` (będzie zmapowane na Company Name)
- `Current Role(s)` (będzie zmapowane na Job Title)
- `Sales Navigator Profile Link` (będzie zmapowane na LinkedIn URL)

### Krok 3: Testuj przez UI
1. Zaloguj się do aplikacji
2. Przejdź do strony Deals
3. Kliknij przycisk Import
4. Wybierz plik CSV
5. Sprawdź rezultaty:
   - Zablokowane wiersze powinny być pominięte
   - Imiona i nazwiska powinny być poprawnie połączone
   - LinkedIn Bio powinno być zapisane jako notatka

### Krok 4: Weryfikacja w konsoli backendu
Sprawdź logi:
```
CSV Format detected: LinkedIn Sales Navigator
LinkedIn headers mapped: [...]
Skipping locked row X
```

### Krok 5: Weryfikacja w bazie danych
```sql
-- Sprawdź zaimportowane deale
SELECT name, company_name, job_title, linkedin_url FROM deals WHERE source = 'import' ORDER BY created_at DESC LIMIT 10;

-- Sprawdź notatki LinkedIn Bio
SELECT d.name, dn.content FROM deals d
JOIN deal_notes dn ON d.id = dn.deal_id
WHERE dn.content LIKE '%LinkedIn Bio%'
ORDER BY dn.created_at DESC LIMIT 10;
```

## 📋 Test Cases

### ✅ Test 1: Import standardowego CSV (zgodność wsteczna)
**Plik**: CSV ze standardowymi kolumnami (`Name`, `Company Name`, `Job Title`, `LinkedIn URL`)
**Oczekiwany wynik**: Import działa jak wcześniej, format: `standard`

### ✅ Test 2: Import LinkedIn CSV z danymi
**Plik**: `test-linkedin-import.csv`
**Oczekiwany wynik**:
- Format wykryty jako: `linkedin`
- Zaimportowane 3 rekordy (2 zablokowane pominięte)
- Imiona połączone: "John Doe", "Jane Smith", "Michael Johnson"
- Firmy: "Acme Corporation", "Tech Innovations Inc.", "Global Solutions Ltd"
- LinkedIn Bio zapisane jako notatki

### ✅ Test 3: Import LinkedIn CSV tylko z zablokowanymi wierszami
**Plik**: CSV zawierający tylko wiersze z "LOCKED"
**Oczekiwany wynik**:
- Format: `linkedin`
- Imported: `0`
- Brak błędów

### ✅ Test 4: Import LinkedIn CSV z danymi wieloliniowymi
**Plik**: CSV z polem "About" zawierającym znaki nowej linii
**Oczekiwany wynik**:
- Poprawne parsowanie cytowanych pól
- Pełna treść "About" zapisana jako notatka

## 🔍 Debugging

Jeśli import nie działa:

1. **Sprawdź logi backendu**:
   - Czy format został wykryty jako `linkedin`?
   - Czy nagłówki zostały zmapowane?
   - Czy są błędy w pętli importu?

2. **Sprawdź plik CSV**:
   - Czy zawiera kolumny `LinkedIn Name` lub `Sales Navigator Profile Link` lub `Organisation`?
   - Czy encoding jest poprawny (UTF-8)?
   - Czy pola z przecinkami/cudzysłowami są prawidłowo cytowane?

3. **Sprawdź network tab w przeglądarce**:
   - Jaki jest request payload?
   - Jaka jest odpowiedź z `/api/deals/import/csv`?

## 📝 Notatki implementacyjne

### Zachowana zgodność wsteczna
- Wszystkie istniejące CSV będą działać jak wcześniej
- Dodano tylko nową logikę wykrywania i preprocessingu LinkedIn

### Graceful degradation
- Jeśli zapis notatki LinkedIn Bio się nie powiedzie, import kontynuuje
- Błędy są logowane, ale nie przerywają procesu

### Multiline CSV support
- Parser CSV (`parseCSVLine`) obsługuje pola cytowane z nowymi liniami
- Escape'owane cudzysłowy są prawidłowo obsługiwane

## 🎯 Kryteria sukcesu

✅ System wykrywa format LinkedIn po nagłówkach
✅ Kolumny LinkedIn są mapowane na format systemowy
✅ Wiersze "LOCKED" są automatycznie pomijane
✅ First Name + Last Name są łączone w pełne imię
✅ LinkedIn Bio jest zapisywane jako notatka do deala
✅ Zgodność wsteczna ze standardowym CSV jest zachowana
✅ Brak błędów składniowych w kodzie

## 🚀 Następne kroki (opcjonalne ulepszenia)

1. **Frontend notification**: Pokazać toast z informacją "Wykryto format LinkedIn - pominięto X zablokowanych wierszy"
2. **Batch processing**: Dla bardzo dużych plików CSV (>1000 wierszy) dodać batch processing
3. **Preview mode**: Podgląd pierwszych 5 wierszy przed importem z informacją o wykrytym formacie
4. **Additional fields**: Mapować więcej pól LinkedIn (Location, Industry, Company Size)
5. **Validation enhancements**: Walidacja formatu LinkedIn URL
