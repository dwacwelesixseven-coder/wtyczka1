# KSeF – pobieranie miesięczne z aktualizacjami dla Edge

## Instalacja dla użytkowników Windows 10/11

1. Pobierz **Code → Download ZIP** z tego repozytorium i rozpakuj cały ZIP.
2. Uruchom dwuklikiem **ZAINSTALUJ.cmd**. Nie uruchamiaj jako administrator.
3. Otwórz `edge://extensions` i włącz **Tryb dewelopera**.
4. Wyłącz dotychczasową kopię tej wtyczki, jeśli z niej korzystasz. Zachowaj ją do czasu sprawdzenia nowej instalacji.
5. Wybierz **Załaduj rozpakowane**. Wklej ścieżkę skopiowaną przez instalator do schowka. Jest to `%LOCALAPPDATA%\KSeFUpdater\extension` (w polu wyboru folderu można też wkleić ten zapis).
6. Odśwież otwarte strony Symfonii. Sprawdź ustawienia i wybór firm w nowej kopii.

Ważne: wybierz folder z **KSeFUpdater**, a nie `extension` z pobranego ZIP-a. Tylko folder instalacyjny jest automatycznie aktualizowany. Nowa instalacja ma stałe ID `oinnmnoanfppijpbgacpoojmdioaicmj`. Ustawienia starej kopii o innym ID nie są przenoszone automatycznie. Pobrane faktury pozostają na swoim miejscu.

Instalator kopiuje pliki do folderu bieżącego użytkownika i dodaje wpis pomocnika w `HKCU\Software\Microsoft\Edge\NativeMessagingHosts\com.ksef_pobieranie.updater`. Nie zakłada zadań cyklicznych ani usługi. Pomocnik działa wyłącznie na żądanie wtyczki. Zasady firmowe mogą blokować tryb dewelopera, PowerShell lub komunikację z lokalnymi aplikacjami.

## Jak działają aktualizacje

- Wtyczka sprawdza wersję godzinowo podczas pracy Edge, pierwszy raz około minuty po instalacji lub uruchomieniu przeglądarki. Edge może opóźnić alarm po uśpieniu komputera.
- Sprawdzenie jest pomijane, jeśli trwa lub jest wstrzymane pobieranie faktur. Zakończ pobieranie lub kliknij **Zatrzymaj**, aby pozwolić na aktualizację.
- W oknie wtyczki jest przełącznik aktualizacji, status i przycisk **Sprawdź teraz**.
- Pomocnik pobiera nowszą wersję z publicznej gałęzi `main` tego repozytorium i podmienia pliki wtyczki. Nie aktualizuje swojego kodu ani nie wykonuje skryptów pobranych z repozytorium poza kodem rozszerzenia wykonywanym przez Edge.
- Sprawdza poprawność wersji, tożsamość wtyczki, ścieżki i limity archiwum. Kanałem zaufania jest konto GitHub i HTTPS; nie jest to niezależnie podpisany system wydawania aktualizacji. Osoby mające prawo zapisu do repozytorium mogą publikować kod wtyczki.
- Przed zmianą plików zachowuje poprzedni katalog jako `%LOCALAPPDATA%\KSeFUpdater\previous-extension`. Przy błędzie kopiowania odtwarza pliki. Nie daje gwarancji naprawy po utracie zasilania, awarii dysku ani po opublikowaniu błędnego kodu.
- Po udanej aktualizacji wtyczka przeładowuje się. Otwarte strony Symfonii trzeba odświeżyć, żeby zaczęły używać nowego kodu strony.
- Awaria sieci nie usuwa działającej wersji. Próba powtarza się przy kolejnym sprawdzeniu.

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
