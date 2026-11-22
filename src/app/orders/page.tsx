import { requirePage } from "@/lib/page-guard";
import { OrdersClient } from "@/components/orders/orders-client";

export default async function OrdersPage() {
  await requirePage("viewOrders");
  return <OrdersClient />;
}
