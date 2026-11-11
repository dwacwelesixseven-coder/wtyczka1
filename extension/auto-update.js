// The local helper can only be called by this extension's fixed ID.
globalThis.ksefUpdateBusy = false;
const UPDATE_ALARM = 'ksef-update';

async function checkKsefUpdate() {
  if (globalThis.ksefUpdateBusy) return { ok: false, error: 'Sprawdzanie aktualizacji już trwa.' };
  globalThis.ksefUpdateBusy = true;
  let reloading = false;
  try {
    const { run, autoUpdatesEnabled = true } = await chrome.storage.local.get(['run', 'autoUpdatesEnabled']);
    if (!autoUpdatesEnabled) return { ok: true, skipped: true, message: 'Automatyczne aktualizacje są wyłączone.' };
    // A paused run also keeps its existing code until the user stops it.
    if (run?.active || (typeof pending !== 'undefined' && pending.length > 0)) {
      return { ok: true, skipped: true, message: 'Aktualizacja poczeka na zakończenie pobierania faktur.' };
    }
    const result = await new Promise((resolve, reject) => {
      const port = chrome.runtime.connectNative('com.ksef_pobieranie.updater');
      let answered = false;
      port.onMessage.addListener(message => {
        if (answered) return;
        answered = true;
        resolve(message);
        port.disconnect();
      });
      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        if (!answered) reject(new Error(error?.message || 'Brak odpowiedzi lokalnego pomocnika.'));
      });
      port.postMessage({ action: 'update' });
    });
    await chrome.storage.local.set({ updaterStatus: { ...result, checkedAt: Date.now() } });
    if (result.updated) {
      reloading = true;
      chrome.runtime.reload();
      // Keep the lock until the old worker is unloaded.
      return result;
    }
    globalThis.ksefUpdateBusy = false;
    return result;
  } catch (error) {
    const result = { ok: false, error: error.message };
    await chrome.storage.local.set({ updaterStatus: { ...result, checkedAt: Date.now() } });
    globalThis.ksefUpdateBusy = false;
    return result;
  } finally {
    // reload() is synchronous; never release the lock in the old worker after an update.
    if (!reloading) globalThis.ksefUpdateBusy = false;
  }
}

async function setupKsefUpdates() {
  await chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: 60 });
}
chrome.runtime.onInstalled.addListener(setupKsefUpdates);
chrome.runtime.onStartup.addListener(setupKsefUpdates);
chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === UPDATE_ALARM) void checkKsefUpdate();
});
