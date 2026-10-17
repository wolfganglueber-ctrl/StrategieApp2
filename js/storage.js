// Speicherstand im Browser (localStorage), robust gegen gesperrten Speicher.
const PREFIX = 'hexkrone.';

function get(key, fallback) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function set(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* Speicher nicht verfügbar */
  }
}
function del(key) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignorieren */
  }
}

export const store = {
  progress: () => get('progress', { stars: {} }),
  setStars(levelId, stars) {
    const p = store.progress();
    p.stars[levelId] = Math.max(p.stars[levelId] || 0, stars);
    set('progress', p);
  },
  settings: () => Object.assign({ speed: 1, sound: true, ambience: 0.6, vibrate: true, confirmEnd: true, unlockAll: false, fogCampaign: false }, get('settings', {})),
  saveSettings: (s) => set('settings', s),
  lastSetup: () => get('setup', null),
  saveSetup: (s) => set('setup', s),
  savedGame: () => get('save', null),
  saveGame: (g) => set('save', g),
  clearGame: () => del('save'),
};
