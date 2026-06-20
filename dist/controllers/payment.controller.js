import { eventEmitter, idempotencyStore } from "../store/idempotency.store.js";
export const processPayment = async (req, res) => {
    const { amount, currency } = req.body || {};
    const idempotencyKey = req.idempotencyKey;
    const currentPayloadHash = req.currentPayloadHash;
    try {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const responseStatus = 200;
        const responseBody = {
            success: true,
            message: `Charged ${amount} ${currency}`,
        };
        const completedRecord = {
            status: "COMPLETED",
            requestBodyHash: currentPayloadHash,
            responseBody,
            responseStatus,
            createdAt: new Date(),
        };
        idempotencyStore.set(idempotencyKey, completedRecord);
        eventEmitter.emit(idempotencyKey, completedRecord);
        return res.status(responseStatus).json(responseBody);
    }
    catch (error) {
        idempotencyStore.delete(idempotencyKey);
        eventEmitter.emit(idempotencyKey, null);
        return res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};
//# sourceMappingURL=payment.controller.js.map