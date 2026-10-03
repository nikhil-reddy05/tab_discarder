const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createEvent() {
  let listener;

  return {
    addListener(nextListener) {
      listener = nextListener;
    },
    getListener() {
      return listener;
    },
  };
}

function loadServiceWorker() {
  const onUpdated = createEvent();
  const onAttached = createEvent();
  const onCreated = createEvent();
  const onRemoved = createEvent();
  const onReplaced = createEvent();
  const onCommand = createEvent();
  const calls = [];
  const tracker = {
    async initialize() {},
    async handleUpdated() {},
    async handleAttached() {},
    async handleCreated() {},
    async handleRemoved() {},
    async handleReplaced() {},
  };
  const context = {
    chrome: {
      tabs: {
        onUpdated,
        onAttached,
        onCreated,
        onRemoved,
        onReplaced,
      },
      storage: { session: {} },
      commands: { onCommand },
    },
    importScripts() {},
    tabDiscarderRecentlyAwakenedState: {
      createTracker() {
        return tracker;
      },
    },
    tabDiscarderRecentlyAwakenedCommand: {
      async discardMostRecentEligibleAwakenedTab(options) {
        calls.push(options);
      },
    },
    tabDiscarderStorage: {
      async getProtectionSettings() {
        return { protectPinned: false, protectAudible: true };
      },
    },
    tabDiscarderTabState: { getDiscardEligibility() {} },
    tabDiscarderDiscardService: { discardTabs() {} },
  };
  context.globalThis = context;

  vm.runInNewContext(
    fs.readFileSync(
      path.join(__dirname, "../background/service-worker.js"),
      "utf8",
    ),
    context,
  );

  return { calls, commandListener: onCommand.getListener(), context, tracker };
}

test("declares a remappable MV3 command with platform-appropriate defaults", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, "../manifest.json"), "utf8"),
  );
  const command = manifest.commands["sleep-most-recent-awakened"];

  assert.deepEqual(command.suggested_key, {
    default: "Ctrl+Shift+L",
    mac: "Command+Shift+L",
  });
  assert.match(command.description, /recently awakened/i);
});

test("service worker handles only the explicit discard-recent command", async () => {
  const worker = loadServiceWorker();

  worker.commandListener("other-command");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(worker.calls, []);

  worker.commandListener("sleep-most-recent-awakened");
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(worker.calls.length, 1);
  assert.equal(worker.calls[0].recentlyAwakenedTracker, worker.tracker);
  assert.equal(worker.calls[0].tabsApi, worker.context.chrome.tabs);
  assert.equal(
    worker.calls[0].discardTabs,
    worker.context.tabDiscarderDiscardService.discardTabs,
  );
  assert.deepEqual(worker.calls[0].policy, {
    protectPinned: false,
    protectAudible: true,
  });
});
