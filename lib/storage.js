const STORAGE_KEYS = Object.freeze({
  THEME: "theme",
  PROTECT_PINNED: "protectPinned",
  PROTECT_AUDIBLE: "protectAudible",
  PROTECTED_DOMAINS: "protectedDomains",
});

const DEFAULT_PROTECTION_SETTINGS = Object.freeze({
  protectPinned: true,
  protectAudible: true,
  protectedDomains: [],
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

async function getProtectionSettings() {
  try {
    const values = await chrome.storage.local.get([
      STORAGE_KEYS.PROTECT_PINNED,
      STORAGE_KEYS.PROTECT_AUDIBLE,
      STORAGE_KEYS.PROTECTED_DOMAINS,
    ]);

    return {
      protectPinned:
        typeof values[STORAGE_KEYS.PROTECT_PINNED] === "boolean"
          ? values[STORAGE_KEYS.PROTECT_PINNED]
          : DEFAULT_PROTECTION_SETTINGS.protectPinned,
      protectAudible:
        typeof values[STORAGE_KEYS.PROTECT_AUDIBLE] === "boolean"
          ? values[STORAGE_KEYS.PROTECT_AUDIBLE]
          : DEFAULT_PROTECTION_SETTINGS.protectAudible,
      protectedDomains: Array.isArray(values[STORAGE_KEYS.PROTECTED_DOMAINS])
        ? values[STORAGE_KEYS.PROTECTED_DOMAINS]
        : [],
    };
  } catch {
    return { ...DEFAULT_PROTECTION_SETTINGS };
  }
}

globalThis.tabDiscarderStorage = Object.freeze({
  keys: STORAGE_KEYS,
  defaultProtectionSettings: DEFAULT_PROTECTION_SETTINGS,
  get: getStorageValue,
  set: setStorageValue,
  getProtectionSettings,
});
