import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const configUrl = new URL("../src/config.js", import.meta.url);
const logicUrl = new URL("../src/social-logic.js", import.meta.url);
const serviceUrl = new URL("../src/social-service.js", import.meta.url);
const uiUrl = new URL("../src/social-ui.js", import.meta.url);
const htmlUrl = new URL("../src/index.html", import.meta.url);
const petUrl = new URL("../src/pet.js", import.meta.url);

test("ships only public Supabase client configuration", () => {
  assert.equal(existsSync(configUrl), true, "src/config.js must exist");

  const source = readFileSync(configUrl, "utf8");
  assert.match(source, /https:\/\/xwdbslytwgzeicqiugdj\.supabase\.co/);
  assert.match(source, /SUPABASE_(?:PUBLISHABLE|ANON)_KEY/);
  assert.doesNotMatch(source, /service_role|sb_secret_|databasePassword|db_password/i);
});

test("provides isolated social-domain logic", () => {
  assert.equal(existsSync(logicUrl), true, "src/social-logic.js must exist");
});

test("provides an isolated Supabase social service", () => {
  assert.equal(existsSync(serviceUrl), true, "src/social-service.js must exist");
});

test("routes Supabase HTTP requests through the Tauri transport", () => {
  const source = readFileSync(serviceUrl, "utf8");
  assert.match(source, /@tauri-apps\/plugin-http/);
  assert.match(source, /global:\s*\{\s*fetch:\s*tauriFetch\s*\}/);
});

function createSupabaseStub() {
  const calls = [];
  const result = (data) => Promise.resolve({ data, error: null });
  const client = {
    calls,
    auth: {
      signInWithOtp: (args) => {
        calls.push(["signInWithOtp", args]);
        return result(null);
      },
      verifyOtp: (args) => {
        calls.push(["verifyOtp", args]);
        return result({ session: { user: { id: "me" } } });
      },
      getSession: () => result({ session: { user: { id: "me" } } }),
      signOut: () => result(null),
      onAuthStateChange: (handler) => {
        calls.push(["onAuthStateChange", handler]);
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
    from(table) {
      const query = {
        select(columns) { calls.push(["select", table, columns]); return query; },
        eq(column, value) { calls.push(["eq", column, value]); return query; },
        gt(column, value) { calls.push(["gt", column, value]); return query; },
        lt(column, value) { calls.push(["lt", column, value]); return query; },
        order(column, options) { calls.push(["order", column, options]); return query; },
        limit(value) { calls.push(["limit", value]); return query; },
        maybeSingle() { return result({ id: "me", nickname: "边牧" }); },
        then(resolve, reject) {
          return result([{ id: "12", conversation_id: "chat" }]).then(resolve, reject);
        },
      };
      return query;
    },
    rpc(name, args) {
      calls.push(["rpc", name, args]);
      return result([{ conversation_id: "chat", unread_count: 1 }]);
    },
    channel(name) {
      calls.push(["channel", name]);
      return {
        on(_kind, _filter, handler) { calls.push(["realtime", handler]); return this; },
        subscribe(handler) { calls.push(["subscribe", handler]); return this; },
      };
    },
    removeChannel(channel) { calls.push(["removeChannel", channel]); return result("ok"); },
  };
  return client;
}

test("routes auth and social mutations through the service contract", async () => {
  const { createSocialService } = await import("../src/social-service.js");
  const client = createSupabaseStub();
  const service = createSocialService(client);

  await service.sendOtp(" User@Example.com ");
  await service.verifyOtp("User@Example.com", " 123456 ");
  await service.updateProfile({ nickname: " 边牧 ", messagePreviewEnabled: true });
  await service.sendFriendRequest(" abcd2345 ");
  await service.sendMessage("chat", " 你好 ");

  assert.deepEqual(client.calls[0], ["signInWithOtp", {
    email: "user@example.com",
    options: { shouldCreateUser: true },
  }]);
  assert.ok(client.calls.some((call) => call[0] === "rpc"
    && call[1] === "update_profile"
    && call[2].p_nickname === "边牧"));
  assert.ok(client.calls.some((call) => call[0] === "rpc"
    && call[1] === "send_friend_request"
    && call[2].p_friend_code === "ABCD2345"));
  assert.ok(client.calls.some((call) => call[0] === "rpc"
    && call[1] === "send_message"
    && call[2].p_body === "你好"));
});

test("paginates and backfills messages with independent conversation cursors", async () => {
  const { createSocialService } = await import("../src/social-service.js");
  const client = createSupabaseStub();
  const service = createSocialService(client);

  await service.listMessages("chat-a", { beforeId: "20", limit: 25 });
  await service.listMessages("chat-b", { afterId: "7", limit: 50 });

  const filters = client.calls.filter((call) => ["eq", "lt", "gt"].includes(call[0]));
  assert.deepEqual(filters.slice(0, 3), [
    ["eq", "conversation_id", "chat-a"],
    ["lt", "id", "20"],
    ["eq", "conversation_id", "chat-b"],
  ]);
  assert.deepEqual(filters[3], ["gt", "id", "7"]);
});

test("uses one generic error when a friend-code request returns no target", async () => {
  const { createSocialService } = await import("../src/social-service.js");
  const client = createSupabaseStub();
  client.rpc = () => Promise.resolve({ data: [], error: null });
  const service = createSocialService(client);
  await assert.rejects(
    service.sendFriendRequest("ABCD2345"),
    /无法发送好友申请/,
  );
});

test("cleans up realtime subscriptions", async () => {
  const { createSocialService } = await import("../src/social-service.js");
  const client = createSupabaseStub();
  const service = createSocialService(client);
  const stop = service.subscribeToMessages({ onMessage() {}, onStatus() {} });
  await stop();
  assert.ok(client.calls.some((call) => call[0] === "removeChannel"));
});

test("provides the compact social panel and coordinator hooks", () => {
  assert.equal(existsSync(uiUrl), true, "src/social-ui.js must exist");
  const html = readFileSync(htmlUrl, "utf8");
  const source = readFileSync(uiUrl, "utf8");
  const pet = readFileSync(petUrl, "utf8");
  assert.match(source, /function leaveChat\(\)/);
  assert.match(source, /backButton\.addEventListener\("click", leaveChat\)/);
  assert.match(html, /#socialBack \{ grid-column: 1; \}/);
  assert.match(html, /#socialTitle \{ grid-column: 2; \}/);
  assert.match(html, /#socialClose \{ grid-column: 3; \}/);
  assert.match(html, /id="socialPanel"/);
  assert.match(html, /id="socialUnread"/);
  assert.match(html, /data-act="social"/);
  assert.match(html, /id="socialComposer"[^>]*maxlength="500"/);
  assert.match(html, /id="socialPreviewEnabled"/);
  assert.match(pet, /configureSocialLayout/);
  assert.match(pet, /flushSocialNotifications/);
});

test("normalizes account and message inputs", async () => {
  const logic = await import("../src/social-logic.js");

  assert.equal(logic.normalizeEmail("  User@Example.COM "), "user@example.com");
  assert.equal(logic.normalizeOtp(" 123456 "), "123456");
  assert.equal(logic.normalizeFriendCode(" abcd2345 "), "ABCD2345");
  assert.equal(logic.normalizeNickname("  边牧队长  "), "边牧队长");
  assert.equal(logic.normalizeMessage("  今天好吗？  "), "今天好吗？");

  assert.throws(() => logic.normalizeEmail("not-an-email"), /邮箱/);
  assert.throws(() => logic.normalizeOtp("12345"), /6 位/);
  assert.throws(() => logic.normalizeFriendCode("OOOOOOOO"), /好友码/);
  assert.throws(() => logic.normalizeNickname(" "), /昵称/);
  assert.throws(() => logic.normalizeMessage("x".repeat(501)), /500/);
});

test("merges realtime and backfill messages by id in chronological order", async () => {
  const { mergeMessages } = await import("../src/social-logic.js");
  const first = { id: "9", body: "A" };
  const replaced = { id: "10", body: "B-new" };
  const result = mergeMessages(
    [replaced, first],
    [{ id: "10", body: "B" }, { id: "11", body: "C" }],
  );

  assert.deepEqual(result.map((message) => message.id), ["9", "10", "11"]);
  assert.equal(result[1], replaced);
});

test("counts unread conversations without exposing read receipts", async () => {
  const { countUnreadMessages } = await import("../src/social-logic.js");
  assert.equal(countUnreadMessages([
    { unread_count: 3 },
    { unread_count: "2" },
    { unread_count: null },
  ]), 5);
});

test("keeps message content private and defers notices during focus work", async () => {
  const {
    createNotificationState,
    flushDeferredNotifications,
    handleIncomingNotification,
  } = await import("../src/social-logic.js");
  const initial = createNotificationState();
  const focused = handleIncomingNotification(
    initial,
    { nickname: "小明", body: "会议改到三点" },
    { focusActive: true, previewEnabled: false },
  );
  assert.equal(focused.notice, null);
  assert.equal(focused.state.deferredCount, 1);

  const flushed = flushDeferredNotifications(focused.state);
  assert.equal(flushed.notice, "休息一下吧，收到 1 条新消息");
  assert.equal(flushed.state.deferredCount, 0);

  const privateNotice = handleIncomingNotification(
    flushed.state,
    { nickname: "小明", body: "会议改到三点" },
    { focusActive: false, previewEnabled: false },
  );
  assert.equal(privateNotice.notice, "小明发来了新消息");

  const previewNotice = handleIncomingNotification(
    flushed.state,
    { nickname: "小明", body: "会议改到三点" },
    { focusActive: false, previewEnabled: true },
  );
  assert.equal(previewNotice.notice, "小明：会议改到三点");
});
