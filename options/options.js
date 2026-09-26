const {
  keys: storageKeys,
  getProtectionSettings: loadProtectionSettings,
  set: setStoredSetting,
} = globalThis.tabDiscarderStorage;
const { normalizeProtectedDomain } = globalThis.tabDiscarderTabState;

let protectedDomains = [];

function setStatus(message) {
  document.getElementById("settingsStatus").textContent = message;
}

async function saveProtectionSetting(input, storageKey) {
  input.disabled = true;
  const saved = await setStoredSetting(storageKey, input.checked);
  input.disabled = false;
  setStatus(saved ? "Settings saved." : "Could not save settings. Please try again.");
}

function getNormalizedProtectedDomains(domains) {
  return [...new Set((Array.isArray(domains) ? domains : [])
    .map((domain) => normalizeProtectedDomain(domain))
    .filter(Boolean))].sort();
}

function renderProtectedDomains() {
  const list = document.getElementById("protectedDomainsList");
  list.replaceChildren();

  for (const domain of protectedDomains) {
    const row = document.createElement("li");
    row.className = "protected-domain-row";

    const label = document.createElement("code");
    label.textContent = domain;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.setAttribute("aria-label", `Remove protection for ${domain}`);
    remove.addEventListener("click", async () => {
      const nextDomains = protectedDomains.filter((entry) => entry !== domain);
      remove.disabled = true;
      const saved = await setStoredSetting(storageKeys.PROTECTED_DOMAINS, nextDomains);

      if (saved) {
        protectedDomains = nextDomains;
        renderProtectedDomains();
      } else {
        remove.disabled = false;
      }

      setStatus(saved ? "Protected site removed." : "Could not save settings. Please try again.");
    });

    row.append(label, remove);
    list.append(row);
  }
}

async function addProtectedDomain() {
  const input = document.getElementById("protectedDomainInput");
  const domain = normalizeProtectedDomain(input.value);

  if (!domain) {
    setStatus("Enter a valid domain, such as example.com.");
    return;
  }

  if (protectedDomains.includes(domain)) {
    input.value = "";
    setStatus("That site is already protected.");
    return;
  }

  const nextDomains = [...protectedDomains, domain].sort();
  input.disabled = true;
  const saved = await setStoredSetting(storageKeys.PROTECTED_DOMAINS, nextDomains);
  input.disabled = false;

  if (saved) {
    protectedDomains = nextDomains;
    input.value = "";
    renderProtectedDomains();
  }

  setStatus(saved ? "Protected site added." : "Could not save settings. Please try again.");
}

async function initializeOptions() {
  const pinnedInput = document.getElementById("protectPinned");
  const audibleInput = document.getElementById("protectAudible");
  const settings = await loadProtectionSettings();

  pinnedInput.checked = settings.protectPinned;
  audibleInput.checked = settings.protectAudible;
  protectedDomains = getNormalizedProtectedDomains(settings.protectedDomains);
  renderProtectedDomains();
  pinnedInput.addEventListener("change", () =>
    saveProtectionSetting(pinnedInput, storageKeys.PROTECT_PINNED),
  );
  audibleInput.addEventListener("change", () =>
    saveProtectionSetting(audibleInput, storageKeys.PROTECT_AUDIBLE),
  );
  document.getElementById("protectedDomainForm").addEventListener("submit", (event) => {
    event.preventDefault();
    void addProtectedDomain();
  });
}

void initializeOptions();
