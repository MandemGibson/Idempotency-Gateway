import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import { Server } from "http";
import { app } from "../app.js";

describe("Idempotency Gateway Integration Tests", () => {
  let server: Server;
  let baseUrl: string;

  before(() => {
    return new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://localhost:${address.port}`;
        }
        resolve();
      });
    });
  });

  after(() => {
    return new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test("Happy Path: First payment is processed successfully after delay", async () => {
    const key = `key-happy-${Date.now()}`;
    const response = await fetch(`${baseUrl}/process-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({ amount: 100, currency: "GHS" }),
    });

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("X-Cache-Hit"), null);

    const body = await response.json() as any;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.message, "Charged 100 GHS");
  });

  test("Deduplication: Duplicate request returns cached response immediately", async () => {
    const key = `key-dedup-${Date.now()}`;
    const payload = { amount: 200, currency: "GHS" };

    // First request
    const res1 = await fetch(`${baseUrl}/process-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.headers.get("X-Cache-Hit"), null);

    // Duplicate request
    const startTime = Date.now();
    const res2 = await fetch(`${baseUrl}/process-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(payload),
    });
    const duration = Date.now() - startTime;

    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.headers.get("X-Cache-Hit"), "true");
    assert.ok(duration < 200, `Expected instant cache response, but took ${duration}ms`);

    const body = await res2.json() as any;
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.message, "Charged 200 GHS");
  });

  test("Fraud check: Reject request with same key but different body", async () => {
    const key = `key-collision-${Date.now()}`;

    // First request
    await fetch(`${baseUrl}/process-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({ amount: 100, currency: "GHS" }),
    });

    // Mismatched body request
    const res = await fetch(`${baseUrl}/process-payment`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify({ amount: 150, currency: "GHS" }),
    });

    assert.strictEqual(res.status, 422);
    const body = await res.json() as any;
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.message, "Idempotency key already used for a different request body.");
  });

  test("In-Flight Block Check: Concurrent requests are synchronized", async () => {
    const key = `key-concurrent-${Date.now()}`;
    const payload = { amount: 300, currency: "GHS" };

    const startTime = Date.now();

    // Trigger both concurrently
    const [res1, res2] = await Promise.all([
      fetch(`${baseUrl}/process-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      }),
      fetch(`${baseUrl}/process-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(payload),
      }),
    ]);

    const totalDuration = Date.now() - startTime;

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res2.status, 200);
    assert.ok(totalDuration >= 2000 && totalDuration < 2500, `Expected total duration to be around 2000ms, got ${totalDuration}ms`);

    const hit1 = res1.headers.get("X-Cache-Hit") === "true";
    const hit2 = res2.headers.get("X-Cache-Hit") === "true";
    assert.ok(hit1 || hit2, "At least one request should have hit the cache");
    assert.ok(!(hit1 && hit2), "Only one request should be the cached hit");
  });
});
