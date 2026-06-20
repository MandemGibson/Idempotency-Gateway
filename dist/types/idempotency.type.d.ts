export interface IdempotencyRecord {
    status: "IN_PROGRESS" | "COMPLETED";
    requestBodyHash: string;
    responseStatus?: number;
    responseBody?: any;
    createdAt: Date;
}
//# sourceMappingURL=idempotency.type.d.ts.map