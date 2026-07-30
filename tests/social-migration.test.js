import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../supabase/migrations/202607300001_social_chat.sql",
  import.meta.url,
);

test("defines the social schema, transactional RPCs, RLS, and realtime", () => {
  assert.equal(existsSync(migrationUrl), true, "social migration must exist");
  const sql = readFileSync(migrationUrl, "utf8");

  for (const table of [
    "profiles",
    "friend_requests",
    "friendships",
    "blocks",
    "conversations",
    "conversation_members",
    "messages",
    "friend_lookup_attempts",
  ]) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}`, "i"));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }

  for (const rpc of [
    "send_friend_request",
    "respond_friend_request",
    "remove_friend",
    "block_user",
    "regenerate_friend_code",
    "send_message",
    "mark_conversation_seen",
    "clear_conversation",
  ]) {
    assert.match(sql, new RegExp(`function public\\.${rpc}\\b`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${rpc}`, "i"));
  }

  assert.match(sql, /security definer[\s\S]*?set search_path\s*=\s*pg_catalog, public/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /friend-code:/i);
  assert.match(sql, /cleared_through_message_id/i);
  assert.match(sql, /last_seen_message_id/i);
  assert.match(sql, /function public\.mark_conversation_seen\(p_conversation_id uuid\)/i);
  assert.doesNotMatch(sql, /mark_conversation_seen[\s\S]{0,100}p_message_id/i);
  assert.match(sql, /function public\.list_blocked_users\(\)/i);
  assert.match(sql, /cleared_through_message_id bigint,[\s\S]*can_message boolean/i);
  assert.match(sql, /select 1 from public\.conversations[\s\S]*profiles\.id in/i);
  assert.match(sql, /alter publication supabase_realtime add table public\.messages/i);
  assert.doesNotMatch(sql, /grant\s+(?:insert|update|delete)\s+on\s+public\.messages/i);
});
