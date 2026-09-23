const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  getUngroupedTabs,
  getGroupTitle,
  getGroupColor,
  buildGroupSummaries,
} = require("../popup/group-list.js");

const tabStateModel = {
  states: { SLEEPING: "sleeping" },
  deriveTabState(tab) {
    return tab.discarded ? "sleeping" : "awake";
  },
};

function createFakeElement() {
  const listeners = new Map();

  return {
    attributes: new Map(),
    children: [],
    className: "",
    hidden: false,
    id: "",
    style: {},
    textContent: "",
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    append(...children) {
      this.children.push(...children);
    },
    getAttribute(name) {
      return this.attributes.get(name);
    },
    getListener(type) {
      return listeners.get(type);
    },
    replaceChildren(...children) {
      this.children = children;
    },
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    },
  };
}

function createFakeDocument() {
  return {
    createElement() {
      return createFakeElement();
    },
  };
}

test("builds one factual summary per live Chrome group", () => {
  const summaries = buildGroupSummaries(
    [
      { id: 10, title: "Research", color: "blue" },
      { id: 11, title: "", color: "purple" },
    ],
    [
      { id: 1, groupId: 10 },
      { id: 2, groupId: 10, discarded: true },
      { id: 3, groupId: 11, discarded: true },
      { id: 4, groupId: -1 },
    ],
    tabStateModel,
  );

  assert.deepEqual(summaries, [
    {
      groupId: 10,
      title: "Research",
      color: "#1a73e8",
      memberTabs: [
        { id: 1, groupId: 10 },
        { id: 2, groupId: 10, discarded: true },
      ],
      totalCount: 2,
      awakeCount: 1,
      sleepingCount: 1,
    },
    {
      groupId: 11,
      title: "Untitled group",
      color: "#a142f4",
      memberTabs: [{ id: 3, groupId: 11, discarded: true }],
      totalCount: 1,
      awakeCount: 0,
      sleepingCount: 1,
    },
  ]);
});

test("keeps only ungrouped tabs in This window and safely falls back for metadata", () => {
  assert.deepEqual(
    getUngroupedTabs([{ id: 1, groupId: -1 }, { id: 2, groupId: 4 }, { id: 3 }]),
    [{ id: 1, groupId: -1 }, { id: 3 }],
  );
  assert.equal(getGroupTitle({ title: "  " }), "Untitled group");
  assert.equal(getGroupColor({ color: "unknown" }), "#5f6368");
});

test("expands and collapses current members with the shared tab-row renderer", () => {
  const { renderGroupList } = require("../popup/group-list.js");
  const document = createFakeDocument();
  const container = createFakeElement();
  container.ownerDocument = document;
  const renderedMembers = [];
  const memberTabs = [{ id: 1, groupId: 10 }, { id: 2, groupId: 10 }];
  const tabListRenderer = {
    renderTabList(list, tabs, stateModel, onSleep) {
      renderedMembers.push({ list, tabs, stateModel, onSleep });
    },
  };

  renderGroupList(
    container,
    [
      {
        groupId: 10,
        title: "Research",
        color: "#1a73e8",
        memberTabs,
        totalCount: 2,
        awakeCount: 2,
        sleepingCount: 0,
      },
    ],
    () => {},
    { tabListRenderer, tabStateModel, onSleepTab: () => {} },
  );

  const row = container.children[0];
  const header = row.children[0];
  const expandAction = header.children[2];
  const memberList = row.children[1];

  assert.deepEqual(renderedMembers[0].tabs, memberTabs);
  assert.equal(renderedMembers[0].stateModel, tabStateModel);
  assert.equal(memberList.hidden, true);
  assert.equal(expandAction.getAttribute("aria-expanded"), "false");
  assert.equal(expandAction.textContent, "⌄");

  expandAction.getListener("click")();
  assert.equal(memberList.hidden, false);
  assert.equal(expandAction.getAttribute("aria-expanded"), "true");
  assert.equal(expandAction.textContent, "⌃");

  expandAction.getListener("click")();
  assert.equal(memberList.hidden, true);
  assert.equal(expandAction.getAttribute("aria-expanded"), "false");
  assert.equal(expandAction.textContent, "⌄");
});

test("popup CSS visually hides a member list after its second toggle", () => {
  const css = fs.readFileSync(
    path.join(__dirname, "../popup/popup.css"),
    "utf8",
  );

  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});
