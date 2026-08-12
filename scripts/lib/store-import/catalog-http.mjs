import http from "node:http";
import https from "node:https";

export const HTTP_ATTEMPT_TIMEOUT_MS = 15_000;
export const CATALOG_HTTP_RETRY_ATTEMPTS = 3;
export const CATALOG_HTTP_TIMEOUT_CODE = "CATALOG_HTTP_TIMEOUT";

export class CatalogHttpTimeoutError extends Error {
  constructor() {
    super("Catalog source request timed out.");
    this.name = "CatalogHttpTimeoutError";
    this.code = CATALOG_HTTP_TIMEOUT_CODE;
  }
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export function requestCatalogBuffer(
  url,
  headers,
  {
    timeoutMs = HTTP_ATTEMPT_TIMEOUT_MS,
    maxRedirects = 5,
  } = {},
) {
  const normalizedTimeoutMs = Math.max(1, Math.floor(timeoutMs));

  return new Promise((resolve, reject) => {
    let settled = false;
    let activeRequest = null;
    let activeResponse = null;

    function finish(error, buffer) {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(deadlineTimer);

      if (error) {
        activeResponse?.destroy();
        activeRequest?.destroy();
        reject(error);
        return;
      }

      resolve(buffer);
    }

    function startRequest(targetUrl, redirectDepth) {
      if (settled) {
        return;
      }

      const parsedUrl = new URL(targetUrl);
      const transport = parsedUrl.protocol === "https:" ? https : http;
      const request = transport.request(
        parsedUrl,
        {
          method: "GET",
          headers,
        },
        (response) => {
          if (settled) {
            response.destroy();
            return;
          }

          activeResponse = response;
          const statusCode = response.statusCode ?? 0;

          if (
            statusCode >= 300 &&
            statusCode < 400 &&
            response.headers.location &&
            redirectDepth < maxRedirects
          ) {
            const redirectUrl = new URL(
              response.headers.location,
              parsedUrl,
            ).toString();
            response.destroy();
            activeResponse = null;
            activeRequest = null;
            startRequest(redirectUrl, redirectDepth + 1);
            return;
          }

          if (statusCode < 200 || statusCode >= 300) {
            finish(new Error(`HTTP ${statusCode}`));
            return;
          }

          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.once("end", () => finish(null, Buffer.concat(chunks)));
          response.once("error", finish);
          response.once("aborted", () =>
            finish(new Error("Catalog source response was aborted.")),
          );
        },
      );

      activeRequest = request;
      request.once("error", finish);
      request.end();
    }

    const deadlineTimer = setTimeout(() => {
      finish(new CatalogHttpTimeoutError());
    }, normalizedTimeoutMs);

    startRequest(url, 0);
  });
}

export async function fetchCatalogWithRetries(
  url,
  headers,
  parseBuffer,
  {
    timeoutMs = HTTP_ATTEMPT_TIMEOUT_MS,
    attempts = CATALOG_HTTP_RETRY_ATTEMPTS,
    retryDelayMs = 700,
    maxRedirects = 5,
  } = {},
) {
  const normalizedAttempts = Math.max(1, Math.floor(attempts));
  let lastError = null;

  for (let attempt = 1; attempt <= normalizedAttempts; attempt += 1) {
    try {
      const buffer = await requestCatalogBuffer(url, headers, {
        timeoutMs,
        maxRedirects,
      });
      return parseBuffer(buffer);
    } catch (error) {
      lastError = error;

      if (attempt < normalizedAttempts) {
        await wait(attempt * retryDelayMs);
      }
    }
  }

  throw lastError;
}
