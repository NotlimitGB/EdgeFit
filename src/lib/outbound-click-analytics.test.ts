import { describe, expect, it } from "vitest";
import {
  buildOutboundClickAnalyticsPayload,
  enrichStoreClickClientPayload,
} from "@/lib/outbound-click-analytics";

describe("outbound click analytics", () => {
  it("keeps canonical board and exact Wide offer identities distinct", () => {
    expect(
      buildOutboundClickAnalyticsPayload({
        boardSlug: "bataleon-beyond-medals",
        offerSlug: "bataleon-beyond-medals-wide",
        destinationUrl: "https://store.example/wide",
      }),
    ).toMatchObject({
      board_slug: "bataleon-beyond-medals",
      offer_slug: "bataleon-beyond-medals-wide",
    });
  });

  it("allows singleton board and offer identities to match", () => {
    const payload = buildOutboundClickAnalyticsPayload({
      boardSlug: "singleton-board",
      offerSlug: "singleton-board",
      destinationUrl: "https://store.example/singleton",
    });

    expect(payload.board_slug).toBe(payload.offer_slug);
  });

  it("normalizes absent optional server fields to null", () => {
    expect(
      buildOutboundClickAnalyticsPayload({
        boardSlug: "board",
        offerSlug: "offer",
        destinationUrl: "https://store.example/offer",
        from: "catalog",
      }),
    ).toEqual({
      board_slug: "board",
      offer_slug: "offer",
      destination_url: "https://store.example/offer",
      source: "catalog",
      placement: null,
      size_cm: null,
      size_label: null,
      source_size_label: null,
      width_type: null,
    });
  });

  it("uses unknown when the server source is absent", () => {
    expect(
      buildOutboundClickAnalyticsPayload({
        boardSlug: "board",
        offerSlug: "offer",
        destinationUrl: "https://store.example/offer",
      }).source,
    ).toBe("unknown");
  });

  it("extracts the exact offer slug from an internal store redirect", () => {
    expect(
      enrichStoreClickClientPayload(
        "/go/bataleon-beyond-medals-wide?from=catalog",
        { board_slug: "legacy-board" },
      ),
    ).toMatchObject({
      board_slug: "legacy-board",
      offer_slug: "bataleon-beyond-medals-wide",
    });
  });

  it("decodes an encoded offer slug and safely ignores malformed encoding", () => {
    expect(
      enrichStoreClickClientPayload("/go/board%2Dwide", {}),
    ).toMatchObject({ offer_slug: "board-wide" });

    const malformed = { board_slug: "legacy" };
    expect(enrichStoreClickClientPayload("/go/%E0%A4%A", malformed)).toBe(
      malformed,
    );
  });

  it("does not enrich an external href", () => {
    const payload = { board_slug: "legacy" };
    expect(
      enrichStoreClickClientPayload("https://external.example/go/offer", payload),
    ).toBe(payload);
  });

  it("does not enrich a non-store internal href", () => {
    const payload = { board_slug: "legacy" };
    expect(enrichStoreClickClientPayload("/boards/offer", payload)).toBe(payload);
  });

  it("never replaces the caller board_slug", () => {
    expect(
      enrichStoreClickClientPayload("/go/model-wide", {
        board_slug: "caller-identity",
      }),
    ).toMatchObject({
      board_slug: "caller-identity",
      offer_slug: "model-wide",
    });
  });

  it("treats the clicked href as authoritative for offer_slug", () => {
    expect(
      enrichStoreClickClientPayload("/go/actual-offer", {
        offer_slug: "wrong-offer",
      }),
    ).toMatchObject({ offer_slug: "actual-offer" });
  });

  it("enriches source_size_label from the href when the caller lacks it", () => {
    expect(
      enrichStoreClickClientPayload(
        "/go/model-wide?sourceSizeLabel=161+cm",
        {},
      ),
    ).toMatchObject({ source_size_label: "161 cm" });
  });

  it("preserves an explicit non-null caller source_size_label", () => {
    expect(
      enrichStoreClickClientPayload(
        "/go/model-wide?sourceSizeLabel=161+cm",
        { source_size_label: "caller raw label" },
      ),
    ).toMatchObject({ source_size_label: "caller raw label" });
  });
});
