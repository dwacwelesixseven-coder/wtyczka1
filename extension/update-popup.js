const updateEnabled = document.getElementById('updateEnabled');
const updateStatus = document.getElementById('updateStatus');
const updateNow = document.getElementById('updateNow');

function showUpdateStatus(status) {
  if (!status) { updateStatus.textContent = 'Pierwsze sprawdzenie nastąpi w ciągu minuty.'; return; }
  const prefix = status.checkedAt ? new Date(status.checkedAt).toLocaleString('pl-PL') + ': ' : '';
  updateStatus.textContent = prefix + (status.error
    ? 'Nie udało się sprawdzić aktualizacji: ' + status.error
    : status.updated ? 'Zainstalowano wersję ' + status.version + '. Odśwież strony Symfonii.'
      : status.message || 'Wersja ' + status.version + ' jest aktualna.');
  updateStatus.title = status.error || '';
}
chrome.storage.local.get(['autoUpdatesEnabled', 'updaterStatus']).then(data => {
  updateEnabled.checked = data.autoUpdatesEnabled !== false;
  showUpdateStatus(data.updaterStatus);
});
updateEnabled.addEventListener('change', () => {
  void chrome.storage.local.set({ autoUpdatesEnabled: updateEnabled.checked });
  updateStatus.textContent = updateEnabled.checked ? 'Automatyczne aktualizacje włączone.' : 'Automatyczne aktualizacje wyłączone.';
});
updateNow.addEventListener('click', async () => {
  updateNow.disabled = true;
  updateStatus.textContent = 'Sprawdzanie aktualizacji…';
  try { showUpdateStatus(await chrome.runtime.sendMessage({ type: 'checkUpdate' })); }
  catch { updateStatus.textContent = 'Po aktualizacji otwórz okno wtyczki ponownie.'; }
  finally { updateNow.disabled = false; }
});
