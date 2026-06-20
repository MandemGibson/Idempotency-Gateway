export interface IdempotencyRecord {
  status: "IN_PROGRESS" | "COMPLETED";
  requestBodyHash: string;
  responseStatus?: number;
  responseBody?: any;
  createdAt: Date;
}