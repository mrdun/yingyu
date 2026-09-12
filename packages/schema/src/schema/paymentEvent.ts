import { createId } from "@paralleldrive/cuid2";
import { pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { orders } from "./order";

/**
 * 支付事件审计流水: 记录 callback/query 事件与 payload hash。
 * UNIQUE(order_id, event_type, payload_hash) 防止同一事件重复处理。
 */
export const paymentEvent = pgTable(
  "payment_events",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => createId()),
    orderId: text("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").notNull(),
    eventType: text("event_type").notNull(), // callback / query
    payloadHash: text("payload_hash").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    processedAt: timestamp("processed_at"),
  },
  (t) => ({
    unq: unique("payment_events_order_event_hash_unique").on(t.orderId, t.eventType, t.payloadHash),
  }),
);
