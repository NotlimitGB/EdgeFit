import http from "node:http";
import { describe, expect, it } from "vitest";
import {
  CATALOG_HTTP_TIMEOUT_CODE,
  fetchCatalogWithRetries,
  requestCatalogBuffer,
} from "./catalog-http.mjs";

async function withTestServer(handler, run) {
  const sockets = new Set();
  const server = http.createServer(handler);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    await run({ baseUrl, sockets });
  } finally {
    for (const socket of sockets) {
      socket.destroy();
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("bounded catalog HTTP requests", () => {
  it("returns a fast response before the deadline", async () => {
    await withTestServer((_request, response) => response.end("ok"), async ({ baseUrl }) => {
      const result = await requestCatalogBuffer(baseUrl, {}, { timeoutMs: 100 });
      expect(result.toString("utf8")).toBe("ok");
    });
  });

  it("bounds a request whose server never responds", async () => {
    await withTestServer(() => {}, async ({ baseUrl, sockets }) => {
      const startedAt = Date.now();
      await expect(requestCatalogBuffer(baseUrl, {}, { timeoutMs: 30 })).rejects.toMatchObject({ code: CATALOG_HTTP_TIMEOUT_CODE });
      expect(Date.now() - startedAt).toBeLessThan(250);
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(sockets.size).toBe(0);
    });
  });

  it("bounds a response body that starts but never ends", async () => {
    await withTestServer((_request, response) => {
      response.writeHead(200, { "content-type": "text/plain" });
      response.write("partial");
    }, async ({ baseUrl }) => {
      await expect(requestCatalogBuffer(baseUrl, {}, { timeoutMs: 30 })).rejects.toMatchObject({ code: CATALOG_HTTP_TIMEOUT_CODE });
    });
  });

  it("retries timeout attempts and can eventually succeed", async () => {
    let requestCount = 0;
    await withTestServer((_request, response) => {
      requestCount += 1;
      if (requestCount >= 3) response.end("recovered");
    }, async ({ baseUrl }) => {
      const result = await fetchCatalogWithRetries(baseUrl, {}, (buffer) => buffer.toString("utf8"), { timeoutMs: 25, attempts: 3, retryDelayMs: 1 });
      expect(result).toBe("recovered");
      expect(requestCount).toBe(3);
    });
  });

  it("returns a classified timeout after the exact retry ceiling", async () => {
    let requestCount = 0;
    await withTestServer(() => { requestCount += 1; }, async ({ baseUrl }) => {
      const startedAt = Date.now();
      await expect(fetchCatalogWithRetries(baseUrl, {}, (buffer) => buffer, { timeoutMs: 20, attempts: 3, retryDelayMs: 1 })).rejects.toMatchObject({ code: CATALOG_HTTP_TIMEOUT_CODE });
      expect(requestCount).toBe(3);
      expect(Date.now() - startedAt).toBeLessThan(300);
    });
  });

  it("keeps one total deadline across a redirect chain", async () => {
    await withTestServer((request, response) => {
      if (request.url === "/start") {
        setTimeout(() => { response.writeHead(302, { location: "/finish" }); response.end(); }, 60);
        return;
      }
      setTimeout(() => response.end("too late"), 60);
    }, async ({ baseUrl }) => {
      await expect(requestCatalogBuffer(`${baseUrl}/start`, {}, { timeoutMs: 100 })).rejects.toMatchObject({ code: CATALOG_HTTP_TIMEOUT_CODE });
    });
  });
});
