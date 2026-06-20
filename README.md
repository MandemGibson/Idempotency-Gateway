# Idempotency Gateway (The "Pay-Once" Protocol)

This is a production-grade **Idempotency Layer** built as a middleware service for an Express RESTful API mimicking a payment processor backend. It ensures that no matter how many times a client retries or duplicates a payment request (e.g., due to network lags), the payment is processed **exactly once**.

---

## 1. Architecture Diagram

The gateway operates as a state machine coordinate using an in-memory database and Node.js `EventEmitter` to prevent double charging and resolve concurrent race conditions:

![Architecture Diagram](./src/assets/idempotency.svg)

---

## 2. Setup & Execution Instructions

Ensure you have Node.js (version 20 or higher) installed on your system.

### Installation

Clone this repository and install the development dependencies:

```bash
npm install
```

### Environment Variables

Configure your environment variables by copying `.env.example`:

```bash
cp .env.example .env
```

### Running the Server

To run the server in development mode (with hot reloading via `nodemon` and auto-compilation):

```bash
npm run dev
```

To build and run in production mode:

```bash
npm start
```

The server will bind to `http://localhost:3000` by default.

### Running Tests

To run the native integration test suite:

```bash
npm test
```

---

## 3. API Documentation

### Payment Endpoint

Processes a payment transaction.

- **URL:** `/process-payment`
- **Method:** `POST`
- **Headers:**
  - `Content-Type: application/json`
  - `Idempotency-Key: <unique-uuid-or-string>` (Required)
- **Request Body:**
  ```json
  {
    "amount": 100,
    "currency": "GHS"
  }
  ```

### Expected Responses

#### 1. First Time Processing (Happy Path)

- **Status Code:** `200 OK`
- **Headers:** (Normal express headers)
- **Body:**
  ```json
  {
    "success": true,
    "message": "Charged 100 GHS"
  }
  ```

#### 2. Duplicate Request (Cache Hit)

- **Status Code:** `200 OK`
- **Headers:**
  - `X-Cache-Hit: true`
- **Body:**
  ```json
  {
    "success": true,
    "message": "Charged 100 GHS"
  }
  ```

#### 3. Payload Mismatch (Fraud/Error Check)

If the same key is reused for a different payment (e.g., different amount or currency).

- **Status Code:** `422 Unprocessable Entity`
- **Body:**
  ```json
  {
    "success": false,
    "message": "Idempotency key already used for a different request body."
  }
  ```

#### 4. Invalid Requests

If required fields or header is missing.

- **Status Code:** `400 Bad Request`
- **Body:**
  ```json
  {
    "success": false,
    "message": "Amount and currency are required"
  }
  ```

---

## 4. Design Decisions

1.  **Strict Modular Architecture:**
    - [app.ts]: Declares the routing configurations so it can be imported in the test environment without port collisions.
    - [index.ts]: Dedicated app listener.
    - [idempotency.middleware.ts]: Decouples request pre-processing and validation from core payment business logic.
    - [payment.controller.ts]: Core payment processor simulation and completion cache update logic.
    - [idempotency.store.ts]: Houses the global in-memory maps.
2.  **In-Flight Lock / Blocking Coordination:**
    Rather than rejecting concurrent requests with a `409 Conflict` (which breaks retry protocols), duplicate requests entering while the initial request state is still `IN_PROGRESS` are parked into a `Promise` hooked to a Node.js `EventEmitter` (`eventEmitter.once`). As soon as the first handler completes, it resolves the waiting requests instantly with the cached result.
3.  **SHA-256 Payload Hashing:**
    Request bodies are compared deterministically by creating a SHA-256 hash of the JSON payloads. This guarantees uniform comparison length, saves storage space, and shields PCI-DSS sensitive data.
4.  **Native Test Suite:**
    I leveraged Node's native runner (`node:test` and `node:assert`) rather than importing massive test harnesses (Jest/Mocha), ensuring fast, zero-dependency executions.

---

## 5. Developer's Choice: Expiration TTL (Time-To-Live)

### The Feature

I implemented a **Key Expiration TTL** checker inside the cache lookup path.

### Why I added it

In fintech systems, idempotency keys should not reside in memory/databases indefinitely. Retries of dropped payment requests almost always occur within minutes of the failure. Storing keys indefinitely leads to memory leakage (for in-memory solutions) or database bloat.

### How it works

Every idempotency record is timestamped (`createdAt: new Date()`). Upon subsequent request validation, the middleware computes the age of the record. If it exceeds **24 hours** (`24 * 60 * 60 * 1000` ms), the record is discarded from the store, and the request is allowed to execute as a brand new transaction.
