import {
  countUnreadMessages,
  createNotificationState,
  flushDeferredNotifications,
  handleIncomingNotification,
  mergeMessages,
} from "./social-logic.js";
import { createDefaultSocialService } from "./social-service.js";

export const SOCIAL_PANEL_SIZE = { width: 320, height: 420 };
export const SOCIAL_PANEL_MIN_SIZE = { width: 260, height: 240 };

const byId = (id) => document.getElementById(id);
const panel = byId("socialPanel");
const title = byId("socialTitle");
const backButton = byId("socialBack");
const closeButton = byId("socialClose");
const authView = byId("socialAuthView");
const profileView = byId("socialProfileView");
const main = byId("socialMain");
const tabs = byId("socialTabs");
const views = {
  conversations: byId("socialConversationsView"),
  friends: byId("socialFriendsView"),
  requests: byId("socialRequestsView"),
  settings: byId("socialSettingsView"),
  chat: byId("socialChatView"),
};

let layoutHandler = () => {};
let notificationHandlers = {
  onUnread: () => {},
  onNotice: () => {},
  isFocusActive: () => false,
};
let controller = null;

function setError(element, error) {
  element.textContent = error?.message ?? "";
}

function emptyState(text) {
  const element = document.createElement("div");
  element.className = "social-empty";
  element.textContent = text;
  return element;
}

function actionButton(text, action, className = "social-secondary") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.socialAction = action;
  button.textContent = text;
  return button;
}

function formatMessageTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function createController(service) {
  const state = {
    visible: false,
    session: null,
    profile: null,
    view: "conversations",
    activeConversationId: null,
    summaries: [],
    requests: [],
    blocked: [],
    messages: {},
    hasOlder: {},
    pendingEmail: "",
    notification: createNotificationState(),
    hasCompletedSync: false,
  };
  let realtimeStop = null;
  let authStop = null;
  let syncPromise = null;
  let buffering = false;
  let realtimeBuffer = [];
  let destroyed = false;

  function currentUserId() {
    return state.session?.user?.id ?? null;
  }

  function updateBadges() {
    const unread = countUnreadMessages(state.summaries);
    notificationHandlers.onUnread(unread);
    const requestCount = state.requests.filter(
      (request) => request.direction === "incoming",
    ).length;
    const badge = byId("socialRequestUnread");
    badge.textContent = String(requestCount);
    badge.hidden = requestCount === 0;
  }

  function showRoot(root) {
    authView.hidden = root !== "auth";
    profileView.hidden = root !== "profile";
    main.hidden = root !== "main";
    backButton.hidden = true;
    title.textContent = root === "auth" ? "邮箱登录" : "好友与消息";
  }

  function renderConversations() {
    const list = byId("socialConversations");
    list.replaceChildren();
    if (!state.summaries.length) {
      list.appendChild(emptyState("还没有消息，先添加一位好友吧"));
      return;
    }
    for (const summary of state.summaries) {
      const row = document.createElement("div");
      row.className = "social-row";
      const rowMain = document.createElement("div");
      rowMain.className = "social-row-main";
      rowMain.dataset.conversationId = summary.conversation_id;
      const rowTitle = document.createElement("div");
      rowTitle.className = "social-row-title";
      rowTitle.textContent = summary.nickname;
      const meta = document.createElement("div");
      meta.className = "social-row-meta";
      meta.textContent = summary.last_message_body
        || (summary.can_message ? "可以开始聊天了" : "已无法继续发送消息");
      rowMain.append(rowTitle, meta);
      row.appendChild(rowMain);
      const unread = Math.max(0, Number(summary.unread_count) || 0);
      if (unread) {
        const badge = document.createElement("span");
        badge.className = "social-badge";
        badge.textContent = unread > 99 ? "99+" : String(unread);
        row.appendChild(badge);
      }
      list.appendChild(row);
    }
  }

  function renderFriends() {
    byId("socialFriendCode").textContent = state.profile?.friend_code ?? "--------";
    const list = byId("socialFriends");
    list.replaceChildren();
    const friends = state.summaries.filter((summary) => summary.can_message);
    if (!friends.length) {
      list.appendChild(emptyState("输入好友码添加朋友"));
      return;
    }
    for (const friend of friends) {
      const row = document.createElement("div");
      row.className = "social-row";
      const rowMain = document.createElement("div");
      rowMain.className = "social-row-main";
      rowMain.dataset.conversationId = friend.conversation_id;
      const name = document.createElement("div");
      name.className = "social-row-title";
      name.textContent = friend.nickname;
      rowMain.appendChild(name);
      const open = actionButton("聊天", "open-chat", "social-primary");
      open.dataset.conversationId = friend.conversation_id;
      row.append(rowMain, open);
      list.appendChild(row);
    }
  }

  function renderRequests() {
    const list = byId("socialRequests");
    list.replaceChildren();
    if (!state.requests.length) {
      list.appendChild(emptyState("暂无好友申请"));
      return;
    }
    for (const request of state.requests) {
      const row = document.createElement("div");
      row.className = "social-row";
      const details = document.createElement("div");
      const name = document.createElement("div");
      name.className = "social-row-title";
      name.textContent = request.nickname;
      const meta = document.createElement("div");
      meta.className = "social-row-meta";
      meta.textContent = request.direction === "incoming" ? "请求添加你为好友" : "等待对方接受";
      details.append(name, meta);
      row.appendChild(details);
      if (request.direction === "incoming") {
        const actions = document.createElement("div");
        actions.className = "social-request-actions";
        const accept = actionButton("接受", "accept-request", "social-primary");
        const reject = actionButton("拒绝", "reject-request");
        accept.dataset.requestId = request.request_id;
        reject.dataset.requestId = request.request_id;
        actions.append(accept, reject);
        row.appendChild(actions);
      }
      list.appendChild(row);
    }
  }

  function renderSettings() {
    byId("socialSettingsNickname").value = state.profile?.nickname ?? "";
    byId("socialPreviewEnabled").checked = Boolean(
      state.profile?.message_preview_enabled,
    );
    const list = byId("socialBlocked");
    list.replaceChildren();
    if (!state.blocked.length) {
      const empty = emptyState("没有已拉黑的用户");
      empty.style.padding = "14px 4px";
      list.appendChild(empty);
      return;
    }
    for (const blocked of state.blocked) {
      const row = document.createElement("div");
      row.className = "social-row";
      const name = document.createElement("div");
      name.className = "social-row-title";
      name.textContent = blocked.nickname;
      const unblock = actionButton("解除", "unblock");
      unblock.dataset.userId = blocked.user_id;
      row.append(name, unblock);
      list.appendChild(row);
    }
  }

  function renderMessages() {
    const container = byId("socialMessages");
    container.replaceChildren();
    const summary = state.summaries.find(
      (item) => item.conversation_id === state.activeConversationId,
    );
    if (!summary) return;

    const menu = document.createElement("div");
    menu.className = "social-chat-menu";
    const clear = actionButton("清空记录", "clear-chat");
    const remove = actionButton("删除好友", "remove-friend");
    const block = actionButton("拉黑", "block-user", "social-danger");
    remove.disabled = !summary.can_message;
    menu.append(clear, remove, block);
    container.appendChild(menu);

    const messages = state.messages[state.activeConversationId] ?? [];
    if (state.hasOlder[state.activeConversationId] && messages.length) {
      const loadOlder = actionButton("加载更早消息", "load-older");
      loadOlder.style.display = "block";
      loadOlder.style.margin = "8px auto";
      container.appendChild(loadOlder);
    }
    if (!messages.length) container.appendChild(emptyState("还没有消息"));
    for (const message of messages) {
      const item = document.createElement("div");
      item.className = `social-message${message.sender_id === currentUserId() ? " mine" : ""}`;
      const body = document.createElement("div");
      body.textContent = message.body;
      const time = document.createElement("div");
      time.className = "social-message-time";
      time.textContent = formatMessageTime(message.created_at);
      item.append(body, time);
      container.appendChild(item);
    }
    byId("socialSend").disabled = !summary.can_message;
    byId("socialComposer").disabled = !summary.can_message;
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
  }

  function renderMain() {
    renderConversations();
    renderFriends();
    renderRequests();
    renderSettings();
    if (state.view === "chat") renderMessages();
    updateBadges();
  }

  function switchView(nextView) {
    state.view = nextView;
    for (const [name, view] of Object.entries(views)) view.hidden = name !== nextView;
    const inChat = nextView === "chat";
    tabs.hidden = inChat;
    backButton.hidden = !inChat;
    for (const tab of tabs.querySelectorAll("[data-social-view]")) {
      tab.classList.toggle("active", tab.dataset.socialView === nextView);
    }
    if (!inChat) title.textContent = "好友与消息";
    renderMain();
  }

  async function openChat(conversationId) {
    const summary = state.summaries.find(
      (item) => item.conversation_id === conversationId,
    );
    if (!summary) return;
    state.activeConversationId = conversationId;
    title.textContent = summary.nickname;
    switchView("chat");
    if (!state.messages[conversationId]) {
      const messages = await service.listMessages(conversationId);
      state.messages[conversationId] = messages;
      state.hasOlder[conversationId] = messages.length >= 50;
    }
    summary.unread_count = 0;
    renderMessages();
    updateBadges();
    await service.markSeen(conversationId);
  }

  function cursors() {
    return Object.fromEntries(Object.entries(state.messages).flatMap(
      ([conversationId, messages]) => messages.length
        ? [[conversationId, String(messages[messages.length - 1].id)]]
        : [],
    ));
  }

  async function applyRealtimeMessage(message) {
    const conversationId = message.conversation_id;
    const current = state.messages[conversationId] ?? [];
    if (current.some((item) => String(item.id) === String(message.id))) return;
    state.messages[conversationId] = mergeMessages(current, [message]);
    state.summaries = await service.listConversations();
    const activelyViewing = state.visible
      && state.view === "chat"
      && state.activeConversationId === conversationId;
    if (activelyViewing) {
      const summary = state.summaries.find((item) => item.conversation_id === conversationId);
      if (summary) summary.unread_count = 0;
      renderMessages();
      await service.markSeen(conversationId);
    }
    renderMain();

    if (!activelyViewing) notifyForMessage(message);
  }

  function notifyForMessage(message) {
    if (message.sender_id === currentUserId()) return;
    const summary = state.summaries.find(
      (item) => item.conversation_id === message.conversation_id,
    );
    if (!summary) return;
    const result = handleIncomingNotification(
      state.notification,
      { nickname: summary.nickname, body: message.body },
      {
        focusActive: notificationHandlers.isFocusActive(),
        previewEnabled: Boolean(state.profile?.message_preview_enabled),
      },
    );
    state.notification = result.state;
    if (result.notice) notificationHandlers.onNotice(result.notice);
  }

  async function syncNow() {
    if (!state.session) return;
    if (syncPromise) return syncPromise;
    syncPromise = (async () => {
      buffering = true;
      const [{ summaries, messagesByConversation }, requests, blocked] = await Promise.all([
        service.syncMessages(cursors()),
        service.listFriendRequests(),
        service.listBlockedUsers(),
      ]);
      state.summaries = summaries;
      state.requests = requests;
      state.blocked = blocked;
      for (const [conversationId, messages] of Object.entries(messagesByConversation)) {
        const wasLoaded = Object.hasOwn(state.messages, conversationId);
        const summary = summaries.find(
          (item) => item.conversation_id === conversationId,
        );
        const clearWatermark = BigInt(summary?.cleared_through_message_id ?? 0);
        const retainedMessages = (state.messages[conversationId] ?? []).filter(
          (message) => BigInt(message.id) > clearWatermark,
        );
        const retainedIds = new Set(retainedMessages.map((message) => String(message.id)));
        const missedMessages = messages.filter(
          (message) => !retainedIds.has(String(message.id)),
        );
        state.messages[conversationId] = mergeMessages(
          retainedMessages,
          messages,
        );
        if (!wasLoaded) state.hasOlder[conversationId] = messages.length >= 100;
        const activelyViewing = state.visible
          && state.view === "chat"
          && state.activeConversationId === conversationId;
        if (activelyViewing) {
          if (summary) summary.unread_count = 0;
          await service.markSeen(conversationId);
        } else if (state.hasCompletedSync) {
          for (const message of missedMessages) notifyForMessage(message);
        }
      }
      buffering = false;
      const buffered = realtimeBuffer;
      realtimeBuffer = [];
      for (const message of buffered) await applyRealtimeMessage(message);
      state.hasCompletedSync = true;
      renderMain();
    })().finally(() => { syncPromise = null; buffering = false; });
    return syncPromise;
  }

  function stopRealtime() {
    if (realtimeStop) void realtimeStop();
    realtimeStop = null;
    realtimeBuffer = [];
  }

  function startRealtime() {
    stopRealtime();
    buffering = true;
    realtimeStop = service.subscribeToMessages({
      onMessage(message) {
        if (buffering) realtimeBuffer.push(message);
        else void applyRealtimeMessage(message);
      },
      onStatus(status) {
        if (status === "SUBSCRIBED") void syncNow();
      },
    });
  }

  async function applySession(session) {
    const sameUser = currentUserId() && currentUserId() === session?.user?.id;
    state.session = session;
    if (!session) {
      stopRealtime();
      state.profile = null;
      state.summaries = [];
      state.requests = [];
      state.blocked = [];
      state.messages = {};
      state.hasOlder = {};
      state.hasCompletedSync = false;
      showRoot("auth");
      updateBadges();
      return;
    }
    state.profile = await service.getProfile();
    if (!state.profile || state.profile.nickname === "新朋友") {
      byId("socialNickname").value = "";
      showRoot("profile");
    } else {
      showRoot("main");
    }
    if (!sameUser) startRealtime();
    else await syncNow();
  }

  async function initialize() {
    const session = await service.getSession();
    await applySession(session);
    authStop = service.onAuthStateChange((_event, nextSession) => {
      void applySession(nextSession);
    });
  }

  function open() {
    state.visible = true;
    panel.style.display = "block";
    layoutHandler(true, SOCIAL_PANEL_SIZE);
    if (state.session) void syncNow();
  }

  function leaveChat() {
    state.activeConversationId = null;
    switchView("conversations");
  }

  function close() {
    if (!state.visible) return;
    leaveChat();
    state.visible = false;
    panel.style.display = "none";
    layoutHandler(false, SOCIAL_PANEL_SIZE);
  }

  function flushNotifications() {
    const result = flushDeferredNotifications(state.notification);
    state.notification = result.state;
    if (result.notice) notificationHandlers.onNotice(result.notice);
  }

  async function handleAction(button) {
    const action = button.dataset.socialAction;
    try {
      if (action === "open-chat") await openChat(button.dataset.conversationId);
      if (action === "accept-request" || action === "reject-request") {
        await service.respondFriendRequest(
          button.dataset.requestId,
          action === "accept-request",
        );
        await syncNow();
      }
      if (action === "clear-chat") {
        await service.clearConversation(state.activeConversationId);
        state.messages[state.activeConversationId] = [];
        state.hasOlder[state.activeConversationId] = false;
        await syncNow();
      }
      if (action === "load-older") {
        const current = state.messages[state.activeConversationId] ?? [];
        const older = await service.listMessages(state.activeConversationId, {
          beforeId: current[0]?.id,
          limit: 50,
        });
        state.messages[state.activeConversationId] = mergeMessages(current, older);
        state.hasOlder[state.activeConversationId] = older.length === 50;
        renderMessages();
      }
      if (action === "remove-friend" || action === "block-user") {
        const summary = state.summaries.find(
          (item) => item.conversation_id === state.activeConversationId,
        );
        if (!summary) return;
        if (action === "remove-friend") await service.removeFriend(summary.friend_id);
        else await service.blockUser(summary.friend_id);
        switchView("conversations");
        await syncNow();
      }
      if (action === "unblock") {
        await service.unblockUser(button.dataset.userId);
        await syncNow();
      }
    } catch (error) {
      notificationHandlers.onNotice(error.message);
    }
  }

  closeButton.addEventListener("click", close);
  backButton.addEventListener("click", leaveChat);
  tabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-social-view]");
    if (tab) switchView(tab.dataset.socialView);
  });
  panel.addEventListener("click", (event) => {
    const conversation = event.target.closest("[data-conversation-id]");
    if (conversation && !conversation.dataset.socialAction) {
      void openChat(conversation.dataset.conversationId);
      return;
    }
    const action = event.target.closest("[data-social-action]");
    if (action) void handleAction(action);
  });

  byId("socialEmailForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = byId("socialAuthError");
    setError(errorElement);
    try {
      state.pendingEmail = byId("socialEmail").value;
      await service.sendOtp(state.pendingEmail);
      byId("socialEmailForm").hidden = true;
      byId("socialOtpForm").hidden = false;
      byId("socialOtpHint").textContent = `验证码已发送到 ${state.pendingEmail.trim()}`;
      byId("socialOtp").focus();
    } catch (error) {
      setError(errorElement, error);
    }
  });

  byId("socialOtpForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = byId("socialOtpError");
    setError(errorElement);
    try {
      const result = await service.verifyOtp(state.pendingEmail, byId("socialOtp").value);
      await applySession(result.session);
    } catch (error) {
      setError(errorElement, error);
    }
  });

  byId("socialChangeEmail").addEventListener("click", () => {
    byId("socialOtpForm").hidden = true;
    byId("socialEmailForm").hidden = false;
    setError(byId("socialOtpError"));
  });

  byId("socialProfileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = byId("socialProfileError");
    setError(errorElement);
    try {
      state.profile = await service.updateProfile({
        nickname: byId("socialNickname").value,
        messagePreviewEnabled: false,
      });
      showRoot("main");
      renderMain();
    } catch (error) {
      setError(errorElement, error);
    }
  });

  byId("socialFriendForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = byId("socialFriendError");
    setError(errorElement);
    try {
      await service.sendFriendRequest(byId("socialFriendCodeInput").value);
      byId("socialFriendCodeInput").value = "";
      await syncNow();
      notificationHandlers.onNotice("好友申请已发送");
    } catch (error) {
      setError(errorElement, error);
    }
  });

  byId("socialCopyCode").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.profile?.friend_code ?? "");
      notificationHandlers.onNotice("好友码已复制");
    } catch {
      notificationHandlers.onNotice("复制失败，请手动记录好友码");
    }
  });

  byId("socialSettingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorElement = byId("socialSettingsError");
    setError(errorElement);
    try {
      state.profile = await service.updateProfile({
        nickname: byId("socialSettingsNickname").value,
        messagePreviewEnabled: byId("socialPreviewEnabled").checked,
      });
      renderSettings();
      notificationHandlers.onNotice("设置已保存");
    } catch (error) {
      setError(errorElement, error);
    }
  });

  byId("socialComposerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const composer = byId("socialComposer");
    try {
      const message = await service.sendMessage(state.activeConversationId, composer.value);
      composer.value = "";
      state.messages[state.activeConversationId] = mergeMessages(
        state.messages[state.activeConversationId] ?? [],
        [message],
      );
      renderMessages();
    } catch (error) {
      notificationHandlers.onNotice(error.message);
    }
  });

  byId("socialSignOut").addEventListener("click", async () => {
    await service.signOut();
    await applySession(null);
  });

  const foregroundSync = () => {
    if (!document.hidden && state.session) void syncNow();
  };
  document.addEventListener("visibilitychange", foregroundSync);
  window.addEventListener("focus", foregroundSync);
  window.addEventListener("online", foregroundSync);

  return {
    initialize,
    open,
    close,
    flushNotifications,
    sync: syncNow,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopRealtime();
      authStop?.();
      document.removeEventListener("visibilitychange", foregroundSync);
      window.removeEventListener("focus", foregroundSync);
      window.removeEventListener("online", foregroundSync);
    },
  };
}

function ensureController() {
  if (!controller) controller = createController(createDefaultSocialService());
  return controller;
}

export function configureSocialLayout(handler) {
  layoutHandler = handler;
}

export function configureSocialNotifications(handlers) {
  notificationHandlers = { ...notificationHandlers, ...handlers };
}

export function initializeSocial() {
  return ensureController().initialize();
}

export function showSocial() {
  ensureController().open();
}

export function hideSocial() {
  controller?.close();
}

export function flushSocialNotifications() {
  controller?.flushNotifications();
}

export function syncSocial() {
  return controller?.sync();
}

export function setSocialPanelRect(rect) {
  panel.style.left = `${rect.x}px`;
  panel.style.top = `${rect.y}px`;
  panel.style.width = `${rect.width}px`;
  panel.style.height = `${rect.height}px`;
  panel.dataset.placement = rect.placement;
  panel.style.setProperty("--pointer-offset", `${rect.pointerOffset}px`);
}
