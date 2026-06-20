import express from "express";
import crypto from "crypto";
import EventEmitter from "events";

interface IdempotencyRecord {
  status: "IN_PROGRESS" | "COMPLETED";
  requestBodyHash: string;
  responseStatus?: number;
  responseBody?: any;
  createdAt: Date;
}

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

const idempotencyStore = new Map<string, IdempotencyRecord>();
const eventEmitter = new EventEmitter();

const hashPayload = (payload: any) => {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload || {}))
    .digest("hex");
};

app.post("/process-payment", async (req, res) => {
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
    const record = idempotencyStore.get(idempotencyKey);

    if (record?.requestBodyHash !== currentPayloadHash) {
      return res.status(422).json({
        success: false,
        message: "Idempotency key already used for a different request body.",
      });
    }

    if (record.status === "COMPLETED") {
      res.setHeader("X-Cache-Hit", "true");
      return res.status(record.responseStatus || 200).json(record.responseBody);
    }

    if (record.status === "IN_PROGRESS") {
      return new Promise((resolve) => {
        eventEmitter.once(
          idempotencyKey,
          (finishedRecord: IdempotencyRecord) => {
            res.setHeader("X-Cache-Hit", "true");

            resolve(
              res
                .status(finishedRecord.responseStatus || 200)
                .json(finishedRecord.responseBody),
            );
          },
        );
      });
    }
  }

  idempotencyStore.set(idempotencyKey, {
    status: "IN_PROGRESS",
    requestBodyHash: currentPayloadHash,
    createdAt: new Date(),
  });

  try {
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });

    const responseStatus = 200;
    const responseBody = {
      success: true,
      message: `Charged ${amount} ${currency}`,
    };

    const completedRecord: IdempotencyRecord = {
      status: "COMPLETED",
      requestBodyHash: currentPayloadHash,
      responseBody,
      responseStatus,
      createdAt: new Date(),
    };

    idempotencyStore.set(idempotencyKey, completedRecord);
    eventEmitter.emit(idempotencyKey, completedRecord);

    return res.status(responseStatus).json(responseBody);
  } catch (error) {
    idempotencyStore.delete(idempotencyKey);
    eventEmitter.emit(idempotencyKey, null);
    return res
      .status(500)
      .json({ success: false, message: "Internal server error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
