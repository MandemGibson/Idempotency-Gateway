import crypto from "crypto";
export const hashPayload = (payload) => {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify(payload || {}))
        .digest("hex");
};
//# sourceMappingURL=crypto.util.js.map