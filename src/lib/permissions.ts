/**
 * The permission catalog — pure constants, safe to import from client and
 * server components alike (no next/headers or database imports here).
 */

/** Every permission, with the menu/action it grants — used by the role matrix UI. */
export const PERMISSION_KEYS = [
  { key: "viewDashboard", label: "Overview dashboard", hint: "KPIs and delivery charts" },
  { key: "viewOrders", label: "Orders", hint: "raw order records table" },
  { key: "exploreReports", label: "Explore & reports", hint: "chart builder and saved reports" },
  { key: "useAiAnalyst", label: "AI Analyst", hint: "chat, streaming and AI report creation" },
  { key: "viewForecasting", label: "Forecasting", hint: "demand forecasts and stock advice" },
  { key: "deleteConversation", label: "Delete chats", hint: "remove saved conversations" },
  { key: "manageUsers", label: "Users & roles", hint: "invite, edit, deactivate, role matrix" },
] as const;

export type Permission = (typeof PERMISSION_KEYS)[number]["key"];

export const ALL_PERMISSIONS = PERMISSION_KEYS.map((p) => p.key) as Permission[];
