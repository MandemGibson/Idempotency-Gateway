import express from "express";
import dotenv from "dotenv";

import { idempotencyMiddleware } from "./middleware/idempotency.middleware.js";
import { processPayment } from "./controllers/payment.controller.js";

dotenv.config();

const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

app.post("/process-payment", idempotencyMiddleware, processPayment);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
