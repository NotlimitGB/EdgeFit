import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { publicApiError } from "./public-api-error";

afterEach(() => vi.restoreAllMocks());
describe("safe public API errors", () => {
  it.each(["recommendation", "analytics", "email-leads"] as const)("sanitizes %s infrastructure failures including logs", async (endpoint) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = publicApiError(endpoint, new Error("audit-private-db-detail"), false, "Проверь ввод.");
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("audit-private-db-detail");
    expect(JSON.stringify(log.mock.calls)).not.toContain("audit-private-db-detail");
    expect(log).toHaveBeenCalledWith(JSON.stringify({ event: "public_api_failure", endpoint, category: "unexpected_server_error" }));
  });
  it("keeps malformed JSON a safe 400", async () => {
    const response = publicApiError("recommendation", new SyntaxError("private-body"), true, "Проверь ввод.");
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("private-body");
  });
  it("keeps useful validation messages without reflecting input", async () => {
    const result = z.object({ email: z.string().email("Укажите корректный адрес почты.") }).safeParse({ email: "private-input" });
    if (result.success) throw new Error("Expected validation failure");
    const response = publicApiError("email-leads", result.error, true, "Проверь ввод.");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ message: "Укажите корректный адрес почты." });
  });
});
