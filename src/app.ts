import express from "express";
import dotenv from "dotenv";

import { idempotencyMiddleware } from "./middleware/idempotency.middleware.js";
import { processPayment } from "./controllers/payment.controller.js";

dotenv.config();

export const app = express();
app.use(express.json());

app.post("/process-payment", idempotencyMiddleware, processPayment);
