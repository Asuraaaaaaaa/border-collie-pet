import assert from "node:assert/strict";
import test from "node:test";

import {
  POCKET_MAX_ITEMS,
  addPocketEntries,
  inferPocketKind,
  parsePocketItems,
  pocketItemLabel,
  purgeExpiredPocketItems,
  sortPocketItems,
  togglePocketPinned,
} from "../src/pocket.js";

function pocketItem(overrides = {}) {
  return {
    id: "item-1",
    kind: "text",
    value: "hello",
    pinned: false,
    createdAt: 1_000,
    updatedAt: 1_000,
    ...overrides,
  };
}

test("infers HTTP links and keeps other content as text", () => {
  assert.equal(inferPocketKind("https://example.com/path"), "url");
  assert.equal(inferPocketKind("http://localhost:1420"), "url");
  assert.equal(inferPocketKind("javascript:alert(1)"), "text");
  assert.equal(inferPocketKind("meeting notes"), "text");
});

test("recovers from damaged storage and drops invalid records", () => {
  assert.deepEqual(parsePocketItems("not-json"), []);
  assert.deepEqual(parsePocketItems("{}"), []);
  assert.deepEqual(parsePocketItems(JSON.stringify([
    pocketItem(),
    pocketItem({ id: "unsafe", kind: "url", value: "javascript:alert(1)" }),
    pocketItem({ id: "empty", value: " " }),
  ])), [pocketItem()]);
});

test("repairs duplicate persisted IDs so actions stay isolated", () => {
  const result = parsePocketItems(JSON.stringify([
    pocketItem({ id: "duplicate", value: "first" }),
    pocketItem({ id: "duplicate", value: "second" }),
  ]));

  assert.equal(result.length, 2);
  assert.equal(new Set(result.map(item => item.id)).size, 2);
});

test("refreshes a duplicate without creating another entry", () => {
  const existing = pocketItem({ id: "existing", updatedAt: 2_000 });
  const result = addPocketEntries(
    [existing],
    [{ kind: "text", value: " hello " }],
    { now: 5_000, idFactory: () => "new-id" },
  );

  assert.equal(result.length, 1);
  assert.equal(result[0].id, "existing");
  assert.equal(result[0].createdAt, 1_000);
  assert.equal(result[0].updatedAt, 5_000);
});

test("sorts fixed entries first and toggles their state", () => {
  const items = [
    pocketItem({ id: "new", value: "new", updatedAt: 3_000 }),
    pocketItem({ id: "old", value: "old", updatedAt: 2_000 }),
  ];
  const pinned = togglePocketPinned(items, "old", 4_000);

  assert.deepEqual(pinned.map(item => item.id), ["old", "new"]);
  assert.equal(pinned[0].pinned, true);
  assert.deepEqual(
    sortPocketItems(pinned).map(item => item.id),
    ["old", "new"],
  );
});

test("expires old entries while retaining fixed entries", () => {
  const day = 24 * 60 * 60 * 1_000;
  const now = 10 * day;
  const result = purgeExpiredPocketItems([
    pocketItem({ id: "expired", value: "expired", updatedAt: now - 8 * day }),
    pocketItem({ id: "fixed", value: "fixed", pinned: true, updatedAt: now - 8 * day }),
    pocketItem({ id: "recent", value: "recent", updatedAt: now - day }),
  ], 7, now);

  assert.deepEqual(result.map(item => item.id), ["fixed", "recent"]);
});

test("keeps only the configured maximum number of entries", () => {
  const entries = Array.from({ length: POCKET_MAX_ITEMS }, (_, index) => ({
    kind: "text",
    value: `item-${index}`,
  }));
  let id = 0;
  const fullPocket = addPocketEntries([], entries, {
    now: 5_000,
    idFactory: () => `id-${id++}`,
  });
  const result = addPocketEntries(fullPocket, [{
    kind: "text",
    value: "newest-item",
  }], {
    now: 6_000,
    idFactory: () => "newest-id",
  });

  assert.equal(result.length, POCKET_MAX_ITEMS);
  assert.equal(result[0].id, "newest-id");
});

test("rejects a batch atomically when fixed entries leave too little room", () => {
  const fixed = Array.from({ length: POCKET_MAX_ITEMS - 1 }, (_, index) => (
    pocketItem({
      id: `fixed-${index}`,
      value: `fixed-${index}`,
      pinned: true,
      updatedAt: index + 1,
    })
  ));

  assert.throws(
    () => addPocketEntries(fixed, [
      { kind: "text", value: "new-1" },
      { kind: "text", value: "new-2" },
    ], { now: 10_000, idFactory: () => crypto.randomUUID() }),
    /口袋已被固定内容占满/,
  );
  assert.equal(fixed.length, POCKET_MAX_ITEMS - 1);
});

test("extracts file names from Windows and Unix paths", () => {
  assert.equal(
    pocketItemLabel(pocketItem({ kind: "file", value: "C:\\Users\\Asura\\notes.txt" })),
    "notes.txt",
  );
  assert.equal(
    pocketItemLabel(pocketItem({ kind: "file", value: "/Users/asura/notes.txt" })),
    "notes.txt",
  );
});

test("preserves whitespace that is part of a file path", () => {
  const [item] = addPocketEntries([], [{
    kind: "file",
    value: "/Users/asura/report \n",
  }], { now: 5_000, idFactory: () => "file-id" });

  assert.equal(item.value, "/Users/asura/report \n");
});
