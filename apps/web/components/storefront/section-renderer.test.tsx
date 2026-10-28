import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { getMessages } from "@biasmarket/i18n";
import {
  type RenderableSection,
  StoreSectionRenderer,
} from "./section-renderer";

vi.mock("next/navigation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/navigation")>();
  return {
    ...actual,
    usePathname: () => "/es/store/demo",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
  };
});

function renderSections(sections: RenderableSection[]) {
  return render(
    <NextIntlClientProvider locale="es" messages={getMessages("es")}>
      <StoreSectionRenderer slug="demo" sections={sections} />
    </NextIntlClientProvider>,
  );
}

describe("StoreSectionRenderer — TEXT_BLOCK", () => {
  it("splits a body on blank lines into one <p> per paragraph", () => {
    const { container } = renderSections([
      {
        id: "s1",
        type: "TEXT_BLOCK",
        content: { body: "First para.\n\nSecond para.\n\n\nThird para." },
      },
    ]);

    const paragraphs = container.querySelectorAll(".prose p");
    expect(paragraphs).toHaveLength(3);
    expect([...paragraphs].map((p) => p.textContent)).toEqual([
      "First para.",
      "Second para.",
      "Third para.",
    ]);
  });

  it("still renders a single-paragraph body as one <p> (back-compat)", () => {
    const { container } = renderSections([
      { id: "s2", type: "TEXT_BLOCK", content: { body: "Just one line." } },
    ]);

    const paragraphs = container.querySelectorAll(".prose p");
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toBe("Just one line.");
  });

  it("renders nothing inside .prose for an empty body", () => {
    const { container } = renderSections([
      { id: "s3", type: "TEXT_BLOCK", content: { body: "   " } },
    ]);

    expect(container.querySelectorAll(".prose p")).toHaveLength(0);
  });
});
