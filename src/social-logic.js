const FRIEND_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;

export function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("请输入有效的邮箱地址");
  }
  return email;
}

export function normalizeOtp(value) {
  const otp = typeof value === "string" ? value.trim() : "";
  if (!/^\d{6}$/.test(otp)) throw new Error("请输入 6 位验证码");
  return otp;
}

export function normalizeFriendCode(value) {
  const friendCode = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!FRIEND_CODE_PATTERN.test(friendCode)) {
    throw new Error("请输入有效的 8 位好友码");
  }
  return friendCode;
}

export function normalizeNickname(value) {
  const nickname = typeof value === "string" ? value.trim() : "";
  if (nickname.length < 1 || nickname.length > 30) {
    throw new Error("昵称需要 1-30 个字符");
  }
  return nickname;
}

export function normalizeMessage(value) {
  const message = typeof value === "string" ? value.trim() : "";
  if (message.length < 1 || message.length > 500) {
    throw new Error("消息需要 1-500 个字符");
  }
  return message;
}

export function mergeMessages(existing = [], incoming = []) {
  const byId = new Map();
  for (const message of incoming) byId.set(String(message.id), message);
  for (const message of existing) byId.set(String(message.id), message);
  return [...byId.values()].sort((left, right) => {
    const leftId = BigInt(left.id);
    const rightId = BigInt(right.id);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  });
}

export function countUnreadMessages(conversations = []) {
  return conversations.reduce(
    (total, conversation) => total + Math.max(0, Number(conversation.unread_count) || 0),
    0,
  );
}

export function createNotificationState() {
  return { deferredCount: 0 };
}

export function handleIncomingNotification(
  state,
  message,
  { focusActive = false, previewEnabled = false } = {},
) {
  if (focusActive) {
    return {
      state: { ...state, deferredCount: state.deferredCount + 1 },
      notice: null,
    };
  }
  const nickname = normalizeNickname(message.nickname);
  const body = normalizeMessage(message.body);
  return {
    state,
    notice: previewEnabled
      ? `${nickname}：${body.length > 60 ? `${body.slice(0, 60)}…` : body}`
      : `${nickname}发来了新消息`,
  };
}

export function flushDeferredNotifications(state) {
  if (!state.deferredCount) return { state, notice: null };
  return {
    state: { ...state, deferredCount: 0 },
    notice: `休息一下吧，收到 ${state.deferredCount} 条新消息`,
  };
}
