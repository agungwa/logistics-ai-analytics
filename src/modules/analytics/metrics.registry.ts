import type { MetricId } from "./analytics.types";

/**
 * Application-owned metric registry. Single source of truth for metric
 * semantics — used by the dashboard labels, the `get_metric_definition` AI
 * tool, and the README. Never trust the LLM to recall these definitions.
 */
export interface MetricDefinition {
  id: MetricId;
  label: string;
  unit: string;
  formula: string;
  description: string;
  caveats: string[];
}

export const METRIC_REGISTRY: Record<MetricId, MetricDefinition> = {
  total_orders: {
    id: "total_orders",
    label: "Total orders",
    unit: "orders",
    formula: "COUNT(DISTINCT order_id) across all statuses",
    description: "Number of unique orders in the selected period, regardless of status.",
    caveats: ["Includes in-transit, exception and canceled orders."],
  },
  delivered_orders: {
    id: "delivered_orders",
    label: "Delivered orders",
    unit: "orders",
    formula: "COUNT where status = 'delivered'",
    description: "Orders whose current status is delivered.",
    caveats: [],
  },
  delayed_orders: {
    id: "delayed_orders",
    label: "Delayed orders",
    unit: "orders",
    formula: "COUNT where status = 'delayed'",
    description: "Orders flagged as delayed in the operational status.",
    caveats: [],
  },
  delivery_performance: {
    id: "delivery_performance",
    label: "Delivery performance (delivered vs delayed)",
    unit: "orders",
    formula: "COUNT(delivered) and COUNT(delayed) side by side, per time bucket or dimension",
    description:
      "Comparison metric: delivered and delayed order counts together, for on-time vs late analysis. Requires a time bucket (trend) or a dimension (breakdown).",
    caveats: [
      "Two series in one query — the only multi-metric supported in v1.",
      "'Delivered' is the on-time proxy (the dataset has no SLA date).",
    ],
  },
  on_time_rate: {
    id: "on_time_rate",
    label: "On-time delivery rate (status-based proxy)",
    unit: "%",
    formula: "delivered / (delivered + delayed) × 100",
    description:
      "Share of completed delivery outcomes (delivered + delayed) that were delivered.",
    caveats: [
      "The dataset has no promised-delivery date or SLA field, so this is a status-based proxy, not verified SLA compliance.",
      "In-transit, exception and canceled orders are excluded from the denominator.",
    ],
  },
  delay_rate: {
    id: "delay_rate",
    label: "Delay rate",
    unit: "%",
    formula: "delayed / (delivered + delayed) × 100",
    description: "Share of completed delivery outcomes that were delayed.",
    caveats: [
      "Denominator is completed outcomes only (delivered + delayed); carriers/orders with zero completed outcomes are not ranked.",
    ],
  },
  avg_delivery_time: {
    id: "avg_delivery_time",
    label: "Average delivery time",
    unit: "days",
    formula: "AVG(delivery_date − order_date) for delivered + delayed orders",
    description: "Mean calendar-day difference between delivery and order date.",
    caveats: [
      "Excludes pending (in_transit), exception and canceled orders.",
      "Excludes rows with a missing delivery_date (30 rows dataset-wide).",
    ],
  },
  total_order_value: {
    id: "total_order_value",
    label: "Total order value",
    unit: "USD",
    formula: "SUM(order_value_usd)",
    description: "Sum of order value across all statuses in the period.",
    caveats: ["Includes canceled orders; no revenue-recognition filtering applied."],
  },
  avg_order_value: {
    id: "avg_order_value",
    label: "Average order value",
    unit: "USD",
    formula: "AVG(order_value_usd)",
    description: "Mean order value across all statuses in the period.",
    caveats: ["Includes canceled orders."],
  },
};

export const SUPPORTED_METRICS = Object.keys(METRIC_REGISTRY) as MetricId[];
