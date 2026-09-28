const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getFaviconUrl,
  createFavicon,
} = require("../popup/tab-list.js");

function createFakeElement() {
  const listeners = new Map();

  return {
    attributes: new Map(),
    children: [],
    hidden: false,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    append(...children) {
      this.children.push(...children);
    },
    getListener(type) {
      return listeners.get(type);
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

function createRuntime() {
  return {
    getURL(path) {
      assert.equal(path, "/_favicon/");
      return "chrome-extension://test-extension/_favicon/";
    },
  };
}

test("builds Chrome favicon service URLs for monochrome and color site tabs", () => {
  const faviconCases = [
    ["GitHub", "https://github.com/nikhil-reddy05/tab_discarder"],
    ["Gemini", "https://gemini.google.com/app/example"],
    ["Airflow", "https://airflow.apache.org/docs/"],
  ];

  for (const [, pageUrl] of faviconCases) {
    const faviconUrl = new URL(
      getFaviconUrl(
        { url: pageUrl, favIconUrl: "https://stale.example/favicon.svg" },
        createRuntime(),
      ),
    );

    assert.equal(faviconUrl.protocol, "chrome-extension:");
    assert.equal(faviconUrl.pathname, "/_favicon/");
    assert.equal(faviconUrl.searchParams.get("pageUrl"), pageUrl);
    assert.equal(faviconUrl.searchParams.get("size"), "32");
  }
});

test("keeps the fallback favicon when Chrome's service cannot be used or loaded", () => {
  assert.equal(getFaviconUrl({ url: "not a URL" }, createRuntime()), null);
  assert.equal(getFaviconUrl({ url: "https://example.com" }), null);

  const document = createFakeDocument();
  const unavailable = createFavicon(document, { url: "not a URL" }, createRuntime());
  assert.equal(unavailable.children.length, 1);

  const favicon = createFavicon(
    document,
    { url: "https://github.com", favIconUrl: "https://stale.example/favicon.svg" },
    createRuntime(),
  );
  const [fallback, image] = favicon.children;
  assert.equal(image.src.includes("stale.example"), false);

  image.getListener("load")();
  assert.equal(fallback.hidden, true);

  image.getListener("error")();
  assert.equal(image.hidden, true);
  assert.equal(fallback.hidden, false);
});
