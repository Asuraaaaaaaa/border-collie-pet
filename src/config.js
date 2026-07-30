export const SUPABASE_URL = "https://xwdbslytwgzeicqiugdj.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PzXcwoTFpab2asMsyLhf5g_NcJ2OI7-";

export function validatePublicSupabaseConfig(url, key) {
  const normalizedUrl = typeof url === "string" ? url.trim() : "";
  const normalizedKey = typeof key === "string" ? key.trim() : "";
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(normalizedUrl)) {
    throw new Error("Supabase 项目地址无效");
  }
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(normalizedKey)) {
    throw new Error("客户端必须使用 Supabase publishable key");
  }
  return { url: normalizedUrl, key: normalizedKey };
}

export const SUPABASE_CONFIG = validatePublicSupabaseConfig(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
);
