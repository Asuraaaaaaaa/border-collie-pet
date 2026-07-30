import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CONFIG } from "./config.js";
import {
  normalizeEmail,
  normalizeFriendCode,
  normalizeMessage,
  normalizeNickname,
  normalizeOtp,
} from "./social-logic.js";

const DEFAULT_PAGE_SIZE = 50;

export function normalizeSocialError(error) {
  if (!error) return null;
  const source = `${error.message ?? ""} ${error.details ?? ""}`.toLowerCase();
  if (source.includes("rate") || source.includes("频繁")) {
    return new Error("操作过于频繁，请稍后再试");
  }
  if (source.includes("expired") || source.includes("token has expired")) {
    return new Error("验证码已过期，请重新获取");
  }
  if (source.includes("invalid") && source.includes("token")) {
    return new Error("验证码无效或已过期");
  }
  return new Error(error.message || "网络请求失败，请稍后再试");
}

function unwrap(result) {
  if (result?.error) throw normalizeSocialError(result.error);
  return result?.data ?? null;
}

function firstRow(data) {
  return Array.isArray(data) ? (data[0] ?? null) : data;
}

export function createSocialService(client) {
  if (!client) throw new Error("Supabase client is required");

  async function rpc(name, args) {
    return unwrap(await client.rpc(name, args));
  }

  async function listMessages(
    conversationId,
    { beforeId = null, afterId = null, limit = DEFAULT_PAGE_SIZE } = {},
  ) {
    const pageSize = Math.max(1, Math.min(100, Number(limit) || DEFAULT_PAGE_SIZE));
    let query = client
      .from("messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .eq("conversation_id", conversationId);
    if (beforeId != null) query = query.lt("id", String(beforeId));
    if (afterId != null) query = query.gt("id", String(afterId));
    const ascending = afterId != null;
    query = query.order("id", { ascending }).limit(pageSize);
    const messages = unwrap(await query) ?? [];
    return ascending ? messages : [...messages].reverse();
  }

  async function backfillConversation(
    conversationId,
    afterId,
    { pageSize = 100 } = {},
  ) {
    if (afterId == null) return listMessages(conversationId, { limit: pageSize });
    const messages = [];
    let cursor = String(afterId);
    while (true) {
      const page = await listMessages(conversationId, {
        afterId: cursor,
        limit: pageSize,
      });
      messages.push(...page);
      if (page.length < pageSize) break;
      cursor = String(page[page.length - 1].id);
    }
    return messages;
  }

  return {
    async sendOtp(email) {
      return unwrap(await client.auth.signInWithOtp({
        email: normalizeEmail(email),
        options: { shouldCreateUser: true },
      }));
    },

    async verifyOtp(email, token) {
      return unwrap(await client.auth.verifyOtp({
        email: normalizeEmail(email),
        token: normalizeOtp(token),
        type: "email",
      }));
    },

    async getSession() {
      const data = unwrap(await client.auth.getSession());
      return data?.session ?? null;
    },

    onAuthStateChange(handler) {
      const { data } = client.auth.onAuthStateChange(handler);
      return () => data.subscription.unsubscribe();
    },

    async signOut() {
      return unwrap(await client.auth.signOut());
    },

    async getProfile() {
      const session = await this.getSession();
      if (!session?.user?.id) return null;
      const result = await client
        .from("profiles")
        .select("id, nickname, friend_code, message_preview_enabled")
        .eq("id", session.user.id)
        .maybeSingle();
      return unwrap(result);
    },

    async updateProfile({ nickname, messagePreviewEnabled = false }) {
      return firstRow(await rpc("update_profile", {
        p_nickname: normalizeNickname(nickname),
        p_message_preview_enabled: Boolean(messagePreviewEnabled),
      }));
    },

    async regenerateFriendCode() {
      return firstRow(await rpc("regenerate_friend_code"));
    },

    async sendFriendRequest(friendCode) {
      const request = firstRow(await rpc("send_friend_request", {
        p_friend_code: normalizeFriendCode(friendCode),
      }));
      if (!request) throw new Error("无法发送好友申请");
      return request;
    },

    async listFriendRequests() {
      return await rpc("list_friend_requests") ?? [];
    },

    async listBlockedUsers() {
      return await rpc("list_blocked_users") ?? [];
    },

    async respondFriendRequest(requestId, accept) {
      return firstRow(await rpc("respond_friend_request", {
        p_request_id: Number(requestId),
        p_accept: Boolean(accept),
      }));
    },

    async listConversations() {
      return await rpc("get_conversation_summaries") ?? [];
    },

    listMessages,
    backfillConversation,

    async sendMessage(conversationId, body) {
      return firstRow(await rpc("send_message", {
        p_conversation_id: conversationId,
        p_body: normalizeMessage(body),
      }));
    },

    async markSeen(conversationId) {
      return rpc("mark_conversation_seen", {
        p_conversation_id: conversationId,
      });
    },

    async clearConversation(conversationId) {
      return firstRow(await rpc("clear_conversation", {
        p_conversation_id: conversationId,
      }));
    },

    async removeFriend(friendId) {
      return rpc("remove_friend", { p_friend_id: friendId });
    },

    async blockUser(userId) {
      return rpc("block_user", { p_user_id: userId });
    },

    async unblockUser(userId) {
      return rpc("unblock_user", { p_user_id: userId });
    },

    subscribeToMessages({ onMessage, onStatus = () => {} }) {
      const channelId = typeof globalThis.crypto?.randomUUID === "function"
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const channel = client
        .channel(`social-messages-${channelId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages" },
          ({ new: message }) => onMessage(message),
        )
        .subscribe(onStatus);
      return () => client.removeChannel(channel);
    },

    async syncMessages(cursors = {}) {
      const summaries = await this.listConversations();
      const messagesByConversation = {};
      await Promise.all(summaries.map(async (summary) => {
        const conversationId = summary.conversation_id;
        const cursor = cursors[conversationId] ?? null;
        if (
          cursor != null
          && summary.last_message_id != null
          && BigInt(summary.last_message_id) <= BigInt(cursor)
        ) {
          messagesByConversation[conversationId] = [];
          return;
        }
        messagesByConversation[conversationId] = await backfillConversation(
          conversationId,
          cursor,
        );
      }));
      return { summaries, messagesByConversation };
    },
  };
}

export function createDefaultSocialService() {
  const client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return createSocialService(client);
}
