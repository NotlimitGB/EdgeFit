import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/email-leads", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/email-leads")>();
  return { ...original, saveEmailLead: vi.fn() };
});
import { saveEmailLead } from "@/lib/email-leads";
import { POST } from "./route";
const request = (body: string) => new Request("https://example.com/api/email-leads", { method: "POST", body });
beforeEach(() => { vi.mocked(saveEmailLead).mockReset(); });
afterEach(() => vi.restoreAllMocks());
describe("email lead compatibility boundary", () => {
  it("retains the successful persistence response contract", async () => {
    vi.mocked(saveEmailLead).mockResolvedValue(null);
    const response = await POST(request(JSON.stringify({ email: "fixture@example.com", consent: true, source: "fixture" })));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ leadId: null, quizResultId: null });
  });
  it("sanitizes unexpected storage failures", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(saveEmailLead).mockRejectedValue(new Error("audit-private-db-detail"));
    const response = await POST(request(JSON.stringify({ email: "fixture@example.com", consent: true, source: "fixture" })));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("audit-private-db-detail");
    expect(JSON.stringify(log.mock.calls)).not.toContain("fixture@example.com");
  });
  it.each(["{", JSON.stringify({ email: "invalid-private-value", consent: true, source: "fixture" }),
    JSON.stringify({ email: "fixture@example.com", consent: false, source: "fixture" })])("keeps bad input a safe 400", async (body) => {
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.text()).not.toContain("invalid-private-value");
    expect(saveEmailLead).not.toHaveBeenCalled();
  });
});
