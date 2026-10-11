import { afterEach, expect, it, vi } from "vitest";
import {
  createQuizRequestId,
  isQuizRequestId,
  reportQuizLifecycleEvent,
} from "./quiz-lifecycle-diagnostics";

afterEach(() => vi.restoreAllMocks());

it("creates and validates opaque UUIDv4 request identifiers", () => {
  const requestId = createQuizRequestId();

  expect(requestId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
  );
  expect(isQuizRequestId(requestId)).toBe(true);
  expect(isQuizRequestId("private-user-value")).toBe(false);
});

it("emits only allowlisted lifecycle fields and safe categories", () => {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  const requestId = "9f9cf976-b611-4ec7-81e1-106931a16313";

  reportQuizLifecycleEvent(
    requestId,
    "response_body",
    12.7,
    "body_read_failure",
  );
  reportQuizLifecycleEvent(
    "sentinel-private-value",
    "response_body",
    12,
    "body_read_failure",
  );

  expect(info).toHaveBeenCalledOnce();
  const line = String(info.mock.calls[0][0]);
  expect(JSON.parse(line)).toEqual({
    event: "quiz_lifecycle",
    requestId,
    stage: "response_body",
    durationMs: 13,
    category: "body_read_failure",
  });
  expect(line).not.toContain("sentinel-private-value");
});
