const STORAGE_KEYS = Object.freeze({
  THEME: "theme",
});

async function getStorageValue(key) {
  try {
    const values = await chrome.storage.local.get(key);
    return values[key];
  } catch {
    return undefined;
  }
}

async function setStorageValue(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    return true;
  } catch {
    return false;
  }
}

globalThis.tabDiscarderStorage = Object.freeze({
  keys: STORAGE_KEYS,
  get: getStorageValue,
  set: setStorageValue,
});
