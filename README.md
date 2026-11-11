# KSeF – pobieranie miesięczne z aktualizacjami dla Edge, Chrome i Opera GX

## Instalacja dla użytkowników Windows 10/11

1. Pobierz **Code → Download ZIP** z tego repozytorium i rozpakuj cały ZIP.
2. Uruchom dwuklikiem **ZAINSTALUJ.cmd**. Nie uruchamiaj jako administrator.
3. Otwórz `edge://extensions` (Edge), `opera://extensions` (Opera / Opera GX) lub `chrome://extensions` (Chrome) i włącz **Tryb dewelopera**.
4. Wyłącz dotychczasową kopię tej wtyczki, jeśli z niej korzystasz. Zachowaj ją do czasu sprawdzenia nowej instalacji.
5. Wybierz **Załaduj rozpakowane**. Wklej ścieżkę skopiowaną przez instalator do schowka. Jest to `%LOCALAPPDATA%\KSeFUpdater\extension` (w polu wyboru folderu można też wkleić ten zapis).
6. Odśwież otwarte strony Symfonii. Sprawdź ustawienia i wybór firm w nowej kopii.

Ważne: wybierz folder z **KSeFUpdater**, a nie `extension` z pobranego ZIP-a. Tylko folder instalacyjny jest automatycznie aktualizowany. Nowa instalacja ma stałe ID `oinnmnoanfppijpbgacpoojmdioaicmj`. Ustawienia starej kopii o innym ID nie są przenoszone automatycznie. Pobrane faktury pozostają na swoim miejscu.

Instalator kopiuje pliki do folderu bieżącego użytkownika i dodaje wpisy pomocnika w `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ksef_pobieranie.updater` oraz `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ksef_pobieranie.updater` (Chrome / Opera / Opera GX). Nie zakłada zadań cyklicznych ani usługi. Pomocnik działa wyłącznie na żądanie wtyczki. Zasady firmowe mogą blokować tryb dewelopera, PowerShell lub komunikację z lokalnymi aplikacjami.

## Jak działają aktualizacje

- Wtyczka sprawdza wersję godzinowo podczas pracy Edge, pierwszy raz około minuty po instalacji lub uruchomieniu przeglądarki. Edge może opóźnić alarm po uśpieniu komputera.
- Sprawdzenie jest pomijane, jeśli trwa lub jest wstrzymane pobieranie faktur. Zakończ pobieranie lub kliknij **Zatrzymaj**, aby pozwolić na aktualizację.
- W oknie wtyczki jest przełącznik aktualizacji, status i przycisk **Sprawdź teraz**.
- Pomocnik pobiera nowszą wersję z publicznej gałęzi `main` tego repozytorium i podmienia pliki wtyczki. Nie aktualizuje swojego kodu ani nie wykonuje skryptów pobranych z repozytorium poza kodem rozszerzenia wykonywanym przez Edge.
- Sprawdza poprawność wersji, tożsamość wtyczki, ścieżki i limity archiwum. Kanałem zaufania jest konto GitHub i HTTPS; nie jest to niezależnie podpisany system wydawania aktualizacji. Osoby mające prawo zapisu do repozytorium mogą publikować kod wtyczki.
- Przed zmianą plików zachowuje poprzedni katalog jako `%LOCALAPPDATA%\KSeFUpdater\previous-extension`. Przy błędzie kopiowania odtwarza pliki. Nie daje gwarancji naprawy po utracie zasilania, awarii dysku ani po opublikowaniu błędnego kodu.
- Po udanej aktualizacji wtyczka przeładowuje się. Otwarte strony Symfonii trzeba odświeżyć, żeby zaczęły używać nowego kodu strony.
- Awaria sieci nie usuwa działającej wersji. Próba powtarza się przy kolejnym sprawdzeniu.

Używaj tej instalacji w jednym profilu Edge na koncie Windows. Ochrona przed aktualizacją w trakcie pobierania dotyczy bieżącego profilu. Dodanie nowych uprawnień w przyszłej wersji może wymagać zatwierdzenia w Edge.

Weryfikacja pakietu: sprawdzono składnię JS/PowerShell, aktualizację, blokadę obniżenia wersji i zmiany tożsamości, kopię zapasową, odtworzenie po błędzie kopiowania, obsługę niebezpiecznych ścieżek ZIP oraz protokół komunikacji pomocnika. Pełna instalacja i aktualizacja w rzeczywistym Edge wymagają jeszcze sprawdzenia po publikacji repozytorium.

## Publikowanie nowej wersji przez autora

1. Zmień pliki w katalogu **extension/**, zachowując `auto-update.js`, jego import w `background.js` i obsługę komunikatu `checkUpdate` oraz blokadę rozpoczynania pracy w trakcie aktualizacji.
2. Podnieś `version` w `extension/manifest.json`, np. z `1.0.3` na `1.0.4`.
3. Zachowaj dokładnie ten sam **key** w manifeście oraz uprawnienia `nativeMessaging`, `alarms`, `storage`. Klucz tutaj jest publicznym kluczem tożsamości, nie hasłem.
4. Przetestuj zmiany lokalnie. Wgraj kompletny katalog `extension/` do gałęzi **main** repozytorium `dwacwelesixseven-coder/wtyczka1`, najlepiej w jednym zatwierdzeniu.
5. Repozytorium musi pozostać publiczne. Nie umieszczaj w nim danych firm, faktur, haseł ani tokenów.

Nie trzeba tworzyć GitHub Releases ani rozsyłać nowego instalatora przy zwykłych zmianach wtyczki. Zmiany samego pomocnika lub adresu repozytorium wymagają ponownego rozesłania instalatora. Ponowne uruchomienie instalatora zachowuje już istniejący folder wtyczki.

## Wyłączenie i powrót do poprzedniej wersji

Odznacz **Automatyczne aktualizacje** w oknie wtyczki. Aby całkowicie odłączyć pomocnika, uruchom **WYLACZ-AKTUALIZACJE.cmd**. Nie usuwa to wtyczki, jej ustawień ani faktur.

Jeśli nowa wersja wtyczki przestanie działać, zamknij Edge, zachowaj osobną kopię folderu `extension`, a następnie skopiuj zawartość `previous-extension` do `extension`. Po uruchomieniu Edge przeładuj wtyczkę w `edge://extensions` i wyłącz aktualizacje do czasu opublikowania poprawki. Kopia zapasowa obejmuje kod, a nie dane `chrome.storage`; przy zmianach formatu danych autor musi zadbać o zgodność.

Instrukcja pobierania faktur: `extension/INSTRUKCJA.txt` (opis instalacji z tamtego pliku zastępują kroki powyżej).

## Poprawka 1.0.4: Opera / Opera GX

Instalator rejestruje teraz pomocnika także dla Chrome i Opery. Jeśli wcześniej zainstalowano pakiet 1.0.3 w Operze, pobierz obecny ZIP i uruchom ponownie ZAINSTALUJ.cmd. Folder wtyczki i jej dane zostaną zachowane. Następnie kliknij Sprawdź teraz; w razie potrzeby uruchom ponownie przeglądarkę. Komunikat błędu pokazuje teraz dokładny powód niepowodzenia.

## Poprawka 1.0.5: wybieranie dat

Wtyczka wybiera daty przez kalendarz Symfonii, potwierdza filtr na podstawie odpowiedzi listy i rozpoznaje zakres ustawiony wcześniej. Nie wpisuje już cyfr do maskowanych pól. Przycisk Zatrzymaj jest dostępny także przy wstrzymanym zadaniu, żeby można było pobrać poprawkę bez rozpoczynania kolejnego zadania. Testy regresji: node tests/calendar.cjs. Po aktualizacji odśwież kartę Symfonii przed wznowieniem pracy.


## Poprawka 1.0.6: menu Pobierz

Akcja pobierania jest rozpoznawana po identyfikatorze downloadInvoiceMultipleAction, również gdy jest ikoną span zamiast przycisku. Zaznaczenie jest potwierdzane przez pola wierszy tabeli. Dziennik pokazuje etap zaznaczania, otwierania menu i oczekiwania na plik ZIP. Testy: node tests/downloads.cjs.


## Poprawka 1.0.7: właściwy element kliknięcia

W nowym pasku akcji Symfonii identyfikator pobierania znajduje się na kontenerze div. Wtyczka klika teraz umieszczony w nim przycisk, który faktycznie otwiera menu. Test obejmuje kontener bez obsługi kliknięcia oraz przycisk wewnętrzny, także wyłączony.


## Poprawka 1.0.8: niezależna korekta dat od/do

Prawidłowa data już ustawiona w polu jest pomijana. Kalendarz Symfonii nie zgłasza zmiany po kliknięciu już wybranego dnia, dlatego wcześniejsza wersja mogła zatrzymać się na prawidłowej dacie od przed poprawieniem daty do. Po zmianie dat pola są odczytywane ponownie z bieżącej strony.


## Wersja 1.0.9: 50 pozycji dla PDF

Przed pobieraniem faktur w PDF wtyczka ustawia Pokaż na stronie na 50 i czeka na odświeżenie listy z serwera. Dla zestawu PDF + XML ustawienie 50 pozostaje wspólne. Pobieranie samego XML nie zmienia rozmiaru strony. Gdy lista ma więcej niż 50 pozycji, kolejne strony nadal są pobierane oddzielnie. Testy: node tests/page-size.cjs.


## Wersja 1.0.10: foldery firm dla archiwów PDF

Archiwa ZIP z PDF-ami są zapisywane w Pobrane/KSeF/RRRR-MM/Nazwa firmy/. Raporty XLSX pozostają bezpośrednio w Pobrane/KSeF/RRRR-MM/, z nazwą firmy w nazwie pliku. Nazwy folderów są oczyszczane z niedozwolonych znaków tak jak nazwy plików. ZIP-y z XML pozostają w dotychczasowym miejscu. Zmiana dotyczy nowych pobrań; nie przenosi wcześniejszych plików.

