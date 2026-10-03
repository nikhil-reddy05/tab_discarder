const test = require("node:test");
const assert = require("node:assert/strict");

const {
  formatRelativeTime,
  getRecentTabPresentation,
  renderRecentlyAwakenedList,
} = require("../popup/recent-awakened-list.js");

function createFakeElement() {
  const listeners = new Map();

  return {
    children: [],
    className: "",
    disabled: false,
    hidden: false,
    textContent: "",
    title: "",
    type: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    append(...children) {
      this.children.push(...children);
    },
    getListener(type) {
      return listeners.get(type);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute() {},
  };
}

function createFakeDocument() {
  return {
    createElement() {
      return createFakeElement();
    },
  };
}

const tabStateModel = {
  getDiscardEligibility(tab) {
    if (tab.active) {
      return { eligible: false, state: "active" };
    }
    if (tab.pinned) {
      return { eligible: false, state: "pinned" };
    }
    return { eligible: true, state: "awake" };
  },
};

const tabListRenderer = {
  createFavicon(document) {
    return document.createElement("span");
  },
  getTabTitle(tab) {
    return tab.title || "Untitled tab";
  },
};

test("formats compact relative wake times", () => {
  const now = 10_000_000;
  assert.equal(formatRelativeTime(now - 59_000, now), "Just now");
  assert.equal(formatRelativeTime(now - 120_000, now), "2m ago");
  assert.equal(formatRelativeTime(now - 10_800_000, now), "3h ago");
  assert.equal(formatRelativeTime(now - 172_800_000, now), "2d ago");
});

test("reflects protected recent tabs instead of offering Discard again", () => {
  assert.deepEqual(getRecentTabPresentation({ active: true }, tabStateModel), {
    kind: "badge",
    label: "Active",
  });
  assert.deepEqual(getRecentTabPresentation({ pinned: true }, tabStateModel), {
    kind: "badge",
    label: "Pinned",
  });
  assert.deepEqual(getRecentTabPresentation({}, tabStateModel), {
    kind: "action",
    label: "Discard again",
  });
});

test("labels a protected domain in Recently awakened", () => {
  const domainPolicyModel = {
    getDiscardEligibility() {
      return {
        eligible: false,
        state: "protected-domain",
        reason: "protected-domain",
      };
    },
  };

  assert.deepEqual(
    getRecentTabPresentation({ url: "https://example.com" }, domainPolicyModel, {
      protectedDomains: ["example.com"],
    }),
    { kind: "badge", label: "Protected site" },
  );
});

test("renders live tab details safely and sends Discard again through its callback", async () => {
  const document = createFakeDocument();
  const container = createFakeElement();
  container.ownerDocument = document;
  const discardCalls = [];

  renderRecentlyAwakenedList(
    container,
    [
      {
        tab: { id: 1, active: true, title: "Current research" },
        awakenedAt: 1_000,
      },
      {
        tab: { id: 2, active: false, title: "Background research" },
        awakenedAt: 2_000,
      },
    ],
    tabStateModel,
    tabListRenderer,
    async (tabId) => discardCalls.push(tabId),
    3_000,
  );

  assert.equal(container.children.length, 2);
  assert.equal(container.children[0].children[1].textContent, "Active");

  const discardAgain = container.children[1].children[1];
  assert.equal(discardAgain.textContent, "Discard again");
  await discardAgain.getListener("click")();
  assert.deepEqual(discardCalls, [2]);
});
