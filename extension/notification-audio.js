function makeKsefWav(kind) {
  const frequencies = kind === 'error' ? [440, 330, 440] : [660, 880, 1100];
  const rate = 22050, toneSeconds = kind === 'error' ? 0.22 : 0.14, gapSeconds = 0.06;
  const toneSamples = Math.floor(rate * toneSeconds), blockSamples = Math.floor(rate * (toneSeconds + gapSeconds));
  const samples = blockSamples * frequencies.length;
  const bytes = new Uint8Array(44 + samples * 2), view = new DataView(bytes.buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, 'RIFF'); view.setUint32(4, bytes.length - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples * 2, true);
  frequencies.forEach((frequency, block) => {
    for (let i = 0; i < toneSamples; i++) {
      const fade = Math.min(1, i / (rate * 0.01), (toneSamples - i) / (rate * 0.01));
      const sample = Math.round(Math.sin(2 * Math.PI * frequency * i / rate) * 7000 * fade);
      view.setInt16(44 + (block * blockSamples + i) * 2, sample, true);
    }
  });
  return bytes;
}
async function playKsefWav(kind) {
  const bytes = makeKsefWav(kind);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  const audio = new Audio(url);
  try {
    const ended = new Promise((resolve, reject) => {
      audio.onended = resolve;
      audio.onerror = () => reject(new Error('Błąd odtwarzania dźwięku.'));
    });
    await Promise.all([audio.play(), ended]);
  } finally { audio.pause(); URL.revokeObjectURL(url); }
}
if (typeof chrome !== 'undefined') {
  let queue = Promise.resolve();
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (message.target !== 'ksef-audio' || !['error', 'complete'].includes(message.kind) || sender.id !== chrome.runtime.id) return false;
    queue = queue.catch(() => {}).then(() => playKsefWav(message.kind));
    queue.then(() => reply({ ok: true }), error => reply({ ok: false, error: error.message }));
    return true;
  });
}
if (typeof module !== 'undefined' && module.exports) module.exports = { makeKsefWav };
