const alertSoundControl = document.getElementById('alertSound');
const alertDesktopControl = document.getElementById('alertDesktop');
const alertTestControl = document.getElementById('alertTest');
const alertResult = document.getElementById('alertResult');
chrome.storage.local.get(['alertSound', 'alertDesktop']).then(prefs => {
  alertSoundControl.checked = prefs.alertSound !== false;
  alertDesktopControl.checked = prefs.alertDesktop !== false;
});
for (const control of [alertSoundControl, alertDesktopControl]) {
  control.addEventListener('change', () => chrome.storage.local.set({ [control.id]: control.checked }));
}
alertTestControl.addEventListener('click', async () => {
  alertTestControl.disabled = true;
  alertResult.textContent = 'Sprawdzanie…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'testAlert' });
    alertResult.textContent = result?.ok
      ? 'Test wysłany. Powinno pojawić się powiadomienie i krótki dźwięk (zgodnie z zaznaczonymi opcjami).'
      : (result?.errors || ['Nie udało się wysłać powiadomienia.']).join(' ');
  } catch (error) { alertResult.textContent = error.message; }
  finally { alertTestControl.disabled = false; }
});
