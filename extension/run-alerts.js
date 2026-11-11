let ksefAudioCreating = null;
async function ensureKsefAudio() {
  if (!chrome.offscreen?.createDocument) throw new Error('Ta przeglądarka nie obsługuje dźwięku w tle.');
  const url = chrome.runtime.getURL('notification-audio.html');
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'], documentUrls: [url] });
  if (contexts.length) return;
  if (!ksefAudioCreating) {
    ksefAudioCreating = chrome.offscreen.createDocument({
      url: 'notification-audio.html', reasons: ['AUDIO_PLAYBACK'],
      justification: 'Play a short sound when invoice downloading finishes or needs attention.'
    }).finally(() => { ksefAudioCreating = null; });
  }
  await ksefAudioCreating;
}
async function playKsefAlert(kind) {
  await ensureKsefAudio();
  let timer;
  try {
    const result = await Promise.race([
      chrome.runtime.sendMessage({ target: 'ksef-audio', kind }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Nie udało się odtworzyć dźwięku.')), 8000); })
    ]);
    if (!result?.ok) throw new Error(result?.error || 'Nie udało się odtworzyć dźwięku.');
  } finally { clearTimeout(timer); }
}
async function notifyKsefRun(kind, message, test = false) {
  // Alert failures must never interrupt the download controller.
  try {
    const prefs = await chrome.storage.local.get(['alertSound', 'alertDesktop']);
    const title = test ? 'KSeF: test powiadomienia' : kind === 'error'
      ? 'KSeF: pobieranie wstrzymane' : 'KSeF: pobieranie zakończone';
    const work = [chrome.action.setBadgeText({ text: kind === 'error' ? '!' : 'OK' })];
    if (prefs.alertDesktop !== false) work.push((async () => {
      if (await chrome.notifications.getPermissionLevel() !== 'granted') {
        throw new Error('Powiadomienia systemowe są zablokowane w przeglądarce.');
      }
      await chrome.notifications.create('ksef-run-status', {
        type: 'basic', iconUrl: chrome.runtime.getURL('icon128.png'), title,
        message: String(message).slice(0, 500), priority: 1,
        requireInteraction: kind === 'error', silent: true
      });
    })());
    if (prefs.alertSound !== false) work.push(playKsefAlert(kind));
    const results = await Promise.allSettled(work);
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason?.message || String(result.reason));
    const status = { ok: errors.length === 0, errors, at: Date.now(), kind };
    await chrome.storage.local.set({ alertStatus: status });
    return status;
  } catch (error) { return { ok: false, errors: [error.message] }; }
}
chrome.notifications.onClicked.addListener(async id => {
  if (id !== 'ksef-run-status') return;
  try {
    const { run } = await chrome.storage.local.get('run');
    if (!run?.tabId) return;
    const tab = await chrome.tabs.update(run.tabId, { active: true });
    await chrome.windows.update(tab.windowId, { focused: true });
  } catch (_) {}
});
