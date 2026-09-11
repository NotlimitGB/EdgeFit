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
    const title = "Подбор сноуборда по росту, весу и размеру ноги — EdgeFit";
    const description =
      "Подбери ростовку, ширину и модели сноубордов по росту, весу, размеру ботинка, уровню и стилю катания. EdgeFit объяснит выбор и риск зацепа ботинком.";

    expect(metadata).toMatchObject({
      title: { absolute: title },
      description,
      alternates: { canonical: "/" },
      openGraph: { title, description, url: "/" },
    });
    expect(JSON.stringify(metadata)).not.toContain("EdgeFit | EdgeFit");
  });

  it("keeps the existing visible homepage heading and primary actions", () => {
    const markup = renderToStaticMarkup(<Home />);

    expect(markup).toContain(
      "Подберём сноуборд под рост, вес, ботинок и стиль катания.",
    );
    expect(markup).toContain('href="/quiz"');
    expect(markup).toContain('href="/catalog"');
  });
});
