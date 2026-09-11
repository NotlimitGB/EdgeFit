import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));

vi.mock("@/lib/canonical-catalog", () => ({
  resolveCanonicalBoardRouteBySlug: (...parameters: unknown[]) =>
    mocks.resolve(...parameters),
}));
vi.mock("@/components/quiz/quiz-flow", () => ({
  QuizFlow: ({ focusedBoard }: { focusedBoard?: unknown }) => (
    <div data-focused={focusedBoard ? JSON.stringify(focusedBoard) : "generic"} />
  ),
}));

import QuizPage from "@/app/quiz/page";

describe("quiz focused board resolution", () => {
  it("passes canonical readonly identity to the client flow", async () => {
    mocks.resolve.mockResolvedValue({
      kind: "redirect",
      canonicalSlug: "jones-mountain-twin",
      item: {
        slug: "jones-mountain-twin",
        brand: "Jones",
        modelName: "Mountain Twin",
      },
    });

    const markup = renderToStaticMarkup(
      await QuizPage({
        searchParams: Promise.resolve({ board: "merchant-alias" }),
      }),
    );

    expect(mocks.resolve).toHaveBeenCalledWith("merchant-alias");
    expect(markup).toContain("jones-mountain-twin");
    expect(markup).toContain("Mountain Twin");
  });

  it.each([
    { board: "../bad" },
    { board: ["one", "two"] },
    { board: "missing-board" },
    {},
  ])("fails invalid or unresolved board queries closed to generic", async (query) => {
    mocks.resolve.mockResolvedValue(undefined);
    const markup = renderToStaticMarkup(
      await QuizPage({ searchParams: Promise.resolve(query) }),
    );

    expect(markup).toContain('data-focused="generic"');
  });
});
