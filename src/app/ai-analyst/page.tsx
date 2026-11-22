import { requirePage } from "@/lib/page-guard";
import { ChatClient } from "@/components/chat/chat-client";

export default async function AiAnalystPage() {
  const user = await requirePage("useAiAnalyst");
  return <ChatClient userName={user.name} canDelete={user.permissions.includes("deleteConversation")} />;
}
