import { eBliss } from './eBSDK.js';

let cachePromise = null;
let writeQueue = Promise.resolve();
const timers = new Map();

async function loadAll() {
  if (!cachePromise) cachePromise = eBliss.profile.preferences();
  return cachePromise;
}

async function get(name) {
  const preferences = await loadAll();
  return preferences?.[String(name)];
}

function set(name, value) {
  const key = String(name);
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    const result = await eBliss.profile.setPreference(key, value);
    if (result?.preferences) cachePromise = Promise.resolve(result.preferences);
    return result;
  });
  return writeQueue;
}

function schedule(name, value, { delay = 250, errorMessage = 'Unable to save profile preference' } = {}) {
  const key = String(name);
  const snapshot = typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
  window.clearTimeout(timers.get(key));
  timers.set(key, window.setTimeout(() => {
    timers.delete(key);
    void set(key, snapshot).catch(error => window.ebStatus?.error?.(error?.message || errorMessage));
  }, delay));
}

function invalidate() {
  cachePromise = null;
}

eBliss.auth.onAuthStateChange(() => {
  invalidate();
  window.dispatchEvent(new CustomEvent('preferences:profileChanged'));
});

export const eBPreferences = Object.freeze({ get, set, schedule, invalidate });
