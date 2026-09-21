const test = require("node:test");
const assert = require("node:assert/strict");

const { filterTabs, matchesTabSearch } = require("../lib/tab-filter.js");

const tabs = [
  {
    id: 1,
    title: "Project Overview",
    url: "https://example.com/dashboard",
  },
  {
    id: 2,
    title: "Release notes",
    url: "https://docs.example.org/releases",
  },
  {
    id: 3,
    title: "Music player",
    url: "https://music.example.net/library",
  },
];

test("matches title, address, and domain text case-insensitively", () => {
  assert.equal(matchesTabSearch(tabs[0], "PROJECT"), true);
  assert.equal(matchesTabSearch(tabs[1], "RELEASES"), true);
  assert.equal(matchesTabSearch(tabs[2], "example.net"), true);
  assert.equal(matchesTabSearch(tabs[2], "missing"), false);
});

test("returns matching tabs without mutating the original list or tab objects", () => {
  const originalTabs = [...tabs];
  const results = filterTabs(tabs, "example.com");

  assert.deepEqual(results, [tabs[0]]);
  assert.notEqual(results, tabs);
  assert.deepEqual(tabs, originalTabs);
  assert.equal(tabs[0], originalTabs[0]);
});

test("restores the full list for an empty search and returns no matches when needed", () => {
  assert.deepEqual(filterTabs(tabs, "   "), tabs);
  assert.deepEqual(filterTabs(tabs, "no matching tab"), []);
  assert.deepEqual(filterTabs(null, "project"), []);
});
