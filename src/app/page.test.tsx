import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch,
    ...props
  }: React.ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a href={String(href)} data-prefetch={String(prefetch)} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/analytics/mount-event", () => ({
  MountEvent: () => null,
}));

import Home, { metadata } from "@/app/page";

describe("homepage metadata", () => {
  it("defines one intent-led title, canonical, and matching OpenGraph URL", () => {
    const title = "Подбор сноуборда онлайн по параметрам — EdgeFit";
    const description =
      "Подбери сноуборд по росту, весу, размеру ботинка, уровню и стилю катания. EdgeFit рассчитает ростовку и ширину, оценит риск зацепа ботинком и покажет подходящие модели.";

    expect(metadata).toMatchObject({
      title: { absolute: title },
      description,
      alternates: { canonical: "/" },
      openGraph: { title, description, url: "/" },
    });
    expect(JSON.stringify(metadata)).not.toContain("EdgeFit | EdgeFit");
  });

  it("owns the broad selection intent with one H1 and unchanged destinations", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup.match(/<h1\b/gu)).toHaveLength(1);
    expect(markup).toContain("<h1");
    expect(markup).toContain("Подбор сноуборда по параметрам</h1>");
    expect(markup).toContain("Как подобрать сноуборд по параметрам");
    expect(markup).toContain("Почему нельзя выбирать доску только по росту");
    expect(markup.match(/href="\/quiz"/gu)).toHaveLength(2);
    expect(markup.match(/Подобрать сноуборд/gu)).toHaveLength(2);
    expect(markup).toContain('href="/catalog"');
  });

  it("keeps the visible FAQ aligned with FAQPage structured data", () => {
    const markup = renderToStaticMarkup(<Home />);
    const questions = [
      "Как подобрать сноуборд?",
      "Что важнее при подборе сноуборда — рост или вес?",
      "Как определить подходящую ростовку?",
      "Как понять, нужен ли сноуборд Wide?",
      "Можно ли подобрать сноуборд онлайн?",
    ];
    const scriptMatch = markup.match(
      /<script type="application\/ld\+json">([^<]+)<\/script>/u,
    );

    expect(scriptMatch).not.toBeNull();
    const schema = JSON.parse(scriptMatch![1]) as {
      "@type": string;
      mainEntity: Array<{
        name: string;
        acceptedAnswer: { text: string };
      }>;
    };
    expect(schema["@type"]).toBe("FAQPage");
    expect(schema.mainEntity).toHaveLength(5);
    expect(schema.mainEntity.map((item) => item.name)).toEqual(questions);

    for (const item of schema.mainEntity) {
      expect(markup).toContain(item.name);
      expect(markup).toContain(item.acceptedAnswer.text);
    }
  });
});
