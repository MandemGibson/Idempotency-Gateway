import type { NextFunction, Request, Response } from "express";
export declare const idempotencyMiddleware: (req: Request, res: Response, next: NextFunction) => Promise<void | Response<any, Record<string, any>>>;
//# sourceMappingURL=idempotency.middleware.d.ts.map