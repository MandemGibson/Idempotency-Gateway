import { EventEmitter } from "events";
import type { IdempotencyRecord } from "../types/idempotency.type.js";

export const idempotencyStore = new Map<string, IdempotencyRecord>();
export const eventEmitter = new EventEmitter();
