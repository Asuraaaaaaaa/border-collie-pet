export const POCKET_MAX_ITEMS = 50;
export const POCKET_MAX_TEXT_LENGTH = 4000;
export const DEFAULT_POCKET_RETENTION_DAYS = 7;
export const POCKET_RETENTION_OPTIONS = Object.freeze([1, 7, 30, 0]);

const POCKET_KINDS = new Set(["text", "url", "file"]);

function isValidTimestamp(value) {
  return Number.isFinite(value) && !Number.isNaN(new Date(value).getTime());
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function newPocketId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `pocket-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizePocketValue(kind, value) {
  if (typeof value !== "string") return "";
  return kind === "file" ? value : value.trim();
}

function pocketContentKey(item) {
  return `${item.kind}\0${item.value}`;
}

export function inferPocketKind(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return isHttpUrl(normalized) ? "url" : "text";
}

export function createPocketItem({
  id = newPocketId(),
  kind,
  value,
  now = Date.now(),
  pinned = false,
}) {
  if (!POCKET_KINDS.has(kind)) throw new Error("不支持的口袋内容类型");
  const normalizedValue = normalizePocketValue(kind, value);
  if (!normalizedValue) throw new Error("请输入文字或链接");
  if (kind === "file" && normalizedValue.includes("\0")) {
    throw new Error("无效的文件路径");
  }
  if (kind === "url" && !isHttpUrl(normalizedValue)) {
    throw new Error("请输入有效的 HTTP(S) 链接");
  }
  if (normalizedValue.length > POCKET_MAX_TEXT_LENGTH) {
    throw new Error(`单条内容不能超过 ${POCKET_MAX_TEXT_LENGTH} 个字符`);
  }
  if (!isValidTimestamp(now)) throw new Error("无效的口袋时间");

  return {
    id,
    kind,
    value: normalizedValue,
    pinned: Boolean(pinned),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizePocketItem(record) {
  if (
    !record
    || typeof record.id !== "string"
    || !record.id
    || !POCKET_KINDS.has(record.kind)
    || typeof record.value !== "string"
    || !isValidTimestamp(record.createdAt)
    || !isValidTimestamp(record.updatedAt)
  ) {
    return null;
  }
  const value = normalizePocketValue(record.kind, record.value);
  if (!value || value.length > POCKET_MAX_TEXT_LENGTH) return null;
  if (record.kind === "file" && value.includes("\0")) return null;
  if (record.kind === "url" && !isHttpUrl(value)) return null;
  return {
    id: record.id,
    kind: record.kind,
    value,
    pinned: Boolean(record.pinned),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function sortPocketItems(items) {
  return [...items].sort((left, right) => (
    Number(right.pinned) - Number(left.pinned)
    || right.updatedAt - left.updatedAt
  ));
}

export function parsePocketItems(serialized) {
  try {
    const records = JSON.parse(serialized ?? "[]");
    if (!Array.isArray(records)) return [];
    const unique = new Map();
    const usedIds = new Set();
    for (const record of records) {
      let item = normalizePocketItem(record);
      if (!item) continue;
      while (usedIds.has(item.id)) item = { ...item, id: newPocketId() };
      usedIds.add(item.id);
      unique.set(pocketContentKey(item), item);
    }
    return sortPocketItems([...unique.values()]).slice(0, POCKET_MAX_ITEMS);
  } catch {
    return [];
  }
}

export function addPocketEntries(
  items,
  entries,
  { now = Date.now(), idFactory = newPocketId } = {},
) {
  let nextItems = parsePocketItems(JSON.stringify(items));
  const requestedKeys = new Set();
  for (const entry of entries) {
    const kind = entry.kind ?? inferPocketKind(entry.value);
    const created = createPocketItem({
      id: idFactory(),
      kind,
      value: entry.value,
      now,
    });
    requestedKeys.add(pocketContentKey(created));
    const duplicate = nextItems.find(
      item => item.kind === created.kind && item.value === created.value,
    );
    nextItems = nextItems.filter(
      item => item.kind !== created.kind || item.value !== created.value,
    );
    nextItems.push(duplicate
      ? {
          ...duplicate,
          updatedAt: now,
        }
      : created);
  }
  const retainedItems = sortPocketItems(nextItems).slice(0, POCKET_MAX_ITEMS);
  const retainedKeys = new Set(retainedItems.map(pocketContentKey));
  if ([...requestedKeys].some(key => !retainedKeys.has(key))) {
    throw new Error("口袋已被固定内容占满，请先取消部分固定");
  }
  return retainedItems;
}

export function removePocketItem(items, id) {
  return items.filter(item => item.id !== id);
}

export function togglePocketPinned(items, id, now = Date.now()) {
  return sortPocketItems(items.map(item => item.id === id
    ? { ...item, pinned: !item.pinned, updatedAt: now }
    : item));
}

export function normalizePocketRetentionDays(value) {
  const days = Number(value);
  return POCKET_RETENTION_OPTIONS.includes(days)
    ? days
    : DEFAULT_POCKET_RETENTION_DAYS;
}

export function purgeExpiredPocketItems(
  items,
  retentionDays,
  now = Date.now(),
) {
  const days = normalizePocketRetentionDays(retentionDays);
  if (days === 0) return sortPocketItems(items);
  const expiresBefore = now - days * 24 * 60 * 60 * 1000;
  return sortPocketItems(items.filter(
    item => item.pinned || item.updatedAt > expiresBefore,
  ));
}

export function pocketItemLabel(item) {
  if (item.kind !== "file") return item.value;
  const segments = item.value.split(/[\\/]/).filter(Boolean);
  return segments.at(-1) ?? item.value;
}
