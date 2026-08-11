import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { quizFlowRender } = vi.hoisted(() => ({
  quizFlowRender: vi.fn(() => null),
}));

vi.mock("@/components/quiz/quiz-flow", () => ({
  QuizFlow: quizFlowRender,
}));

import { InlineQuizLauncher } from "@/components/seo/inline-quiz-launcher";
import { getSeoLandingPage, seoLandingPages } from "@/lib/seo-pages";

describe("inline calculator SEO experience", () => {
  it("enables the quiz only for the calculator landing", () => {
    expect(getSeoLandingPage("kalkulyator-snouborda")?.interactiveExperience).toBe("quiz");

    const otherPages = seoLandingPages.filter((page) => page.slug !== "kalkulyator-snouborda");
    expect(otherPages).toHaveLength(7);
    expect(otherPages.every((page) => page.interactiveExperience === undefined)).toBe(true);
  });

  it("renders the launcher without mounting QuizFlow", () => {
    quizFlowRender.mockClear();

    const markup = renderToStaticMarkup(createElement(InlineQuizLauncher));

    expect(markup).toContain("Открыть калькулятор");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-controls="inline-quiz-content"');
    expect(quizFlowRender).not.toHaveBeenCalled();
  });
});
