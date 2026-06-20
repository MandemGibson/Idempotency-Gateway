import type { NextFunction, Request, Response } from "express";
import { hashPayload } from "../utils/crypto.util.js";
import { eventEmitter, idempotencyStore } from "../store/idempotency.store.js";
import type { IdempotencyRecord } from "../types/idempotency.type.js";

const TTL_MS = 24 * 60 * 60 * 1000;

export const idempotencyMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const idempotencyKey = req.header("Idempotency-Key");
  const { amount, currency } = req.body || {};

  if (!idempotencyKey) {
    return res
      .status(400)
      .json({ success: false, message: "Idempotency-Key header is required" });
  }

  if (!amount || !currency) {
    return res
      .status(400)
      .json({ success: false, message: "Amount and currency are required" });
  }

  const currentPayloadHash = hashPayload(req.body);

  if (idempotencyStore.has(idempotencyKey)) {
    const record = idempotencyStore.get(idempotencyKey)!;

    // Expiry check
    const age = Date.now() - record.createdAt.getTime();
    if (age > TTL_MS) {
      idempotencyStore.delete(idempotencyKey);
    } else {
      // Payload mismatch check
      if (record.requestBodyHash !== currentPayloadHash) {
        return res.status(422).json({
          success: false,
          message: "Idempotency key already used for a different request body.",
        });
      }

      // Completed cache hit
      if (record.status === "COMPLETED") {
        res.setHeader("X-Cache-Hit", "true");
        return res.status(record.responseStatus || 200).json(record.responseBody);
      }

      // In-Flight block logic 
      if (record.status === "IN_PROGRESS") {
        return new Promise<void>((resolve) => {
          eventEmitter.once(
            idempotencyKey,
            (finishedRecord: IdempotencyRecord | null) => {
              res.setHeader("X-Cache-Hit", "true");
              if (finishedRecord) {
                res
                  .status(finishedRecord.responseStatus || 200)
                  .json(finishedRecord.responseBody);
              } else {
                res
                  .status(500)
                  .json({ success: false, message: "Internal server error" });
              }
              resolve();
            },
          );
        });
      }
    }
  }

  // Mark first request as IN_PROGRESS
  idempotencyStore.set(idempotencyKey, {
    status: "IN_PROGRESS",
    requestBodyHash: currentPayloadHash,
    createdAt: new Date(),
  });

  (req as any).idempotencyKey = idempotencyKey;
  (req as any).currentPayloadHash = currentPayloadHash;

  next();
};
