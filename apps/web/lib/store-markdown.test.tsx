import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  firstStoreMarkdownImage,
  isAllowedStoreImageSrc,
  isSafeStoreLinkHref,
  renderStoreMarkdown,
  storeMarkdownToPlainText,
} from "./store-markdown";

function html(md: string): string {
  const { container } = render(<div>{renderStoreMarkdown(md)}</div>);
  return container.innerHTML;
}

describe("renderStoreMarkdown — allowlist is the contract", () => {
  it("returns null for empty / whitespace input", () => {
    expect(renderStoreMarkdown("")).toBeNull();
    expect(renderStoreMarkdown("   \n  ")).toBeNull();
    expect(renderStoreMarkdown(null)).toBeNull();
    expect(renderStoreMarkdown(undefined)).toBeNull();
  });

  it("strips raw <script> (no element, no text passthrough)", () => {
    const { container } = render(
      <div>
        {renderStoreMarkdown("Hello\n\n<script>alert('xss')</script>\n\nworld")}
      </div>,
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("alert(");
    expect(container.textContent).toContain("Hello");
    expect(container.textContent).toContain("world");
  });

  it("drops other raw HTML rather than rendering it", () => {
    const out = html('<iframe src="https://evil.example"></iframe>\n\ntext');
    expect(out).not.toContain("<iframe");
    expect(out).toContain("text");
  });

  it("demotes `#` to <h2> and never emits <h1>", () => {
    const { container } = render(
      <div>{renderStoreMarkdown("# Big title\n\nbody")}</div>,
    );
    expect(container.querySelector("h1")).toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Big title");
  });

  it("clamps h5/h6 down to <h4>", () => {
    const { container } = render(
      <div>{renderStoreMarkdown("##### deep\n\n###### deeper")}</div>,
    );
    expect(container.querySelector("h5")).toBeNull();
    expect(container.querySelector("h6")).toBeNull();
    expect(container.querySelectorAll("h4")).toHaveLength(2);
  });

  it("forces rel + target on links and allows only http(s)/mailto", () => {
    const { container } = render(
      <div>{renderStoreMarkdown("[shop](https://example.com/x)")}</div>,
    );
    const a = container.querySelector("a");
    expect(a).not.toBeNull();
    expect(a?.getAttribute("rel")).toBe("nofollow ugc noopener");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("href")).toBe("https://example.com/x");
  });

  it("drops a javascript: link but keeps its text", () => {
    const { container } = render(
      <div>{renderStoreMarkdown("[click](javascript:alert(1))")}</div>,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("click");
  });

  it("drops a relative / protocol-relative link", () => {
    expect(html("[a](/dashboard)")).not.toContain("<a");
    expect(html("[b](//evil.example)")).not.toContain("<a");
  });

  it("keeps an on-CDN image, forcing lazy/async, and requires alt", () => {
    const { container } = render(
      <div>
        {renderStoreMarkdown(
          "![a red hoodie](https://cdn.biasmarket.com/store-content/x.jpg)",
        )}
      </div>,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(
      "https://cdn.biasmarket.com/store-content/x.jpg",
    );
    expect(img?.getAttribute("alt")).toBe("a red hoodie");
    expect(img?.getAttribute("loading")).toBe("lazy");
    expect(img?.getAttribute("decoding")).toBe("async");
  });

  it("drops an off-host image", () => {
    expect(html("![shoe](https://evil.example/track.png)")).not.toContain(
      "<img",
    );
    expect(html("![shoe](https://cdn.evil.example/x.png)")).not.toContain(
      "<img",
    );
  });

  it("drops an on-CDN image with an empty alt", () => {
    expect(
      html("![](https://cdn.biasmarket.com/store-content/x.jpg)"),
    ).not.toContain("<img");
  });

  it("renders the safe block subset (headings, lists, quote, code, emphasis)", () => {
    const { container } = render(
      <div>
        {renderStoreMarkdown(
          [
            "## Heading",
            "",
            "- one",
            "- two",
            "",
            "> a quote",
            "",
            "`inline` and **bold** and _em_",
          ].join("\n"),
        )}
      </div>,
    );
    expect(container.querySelector("h2")).not.toBeNull();
    expect(container.querySelectorAll("li")).toHaveLength(2);
    expect(container.querySelector("blockquote")).not.toBeNull();
    expect(container.querySelector("code")?.textContent).toBe("inline");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
    expect(container.querySelector("em")?.textContent).toBe("em");
  });
});

describe("isSafeStoreLinkHref", () => {
  it.each([
    "https://example.com",
    "http://example.com/path",
    "mailto:hi@example.com",
  ])("accepts %s", (href) => {
    expect(isSafeStoreLinkHref(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:msgbox(1)",
    "/relative",
    "//evil.example",
    "tel:+15555555555",
    "",
    null,
    undefined,
  ])("rejects %s", (href) => {
    expect(isSafeStoreLinkHref(href as string)).toBe(false);
  });
});

describe("isAllowedStoreImageSrc", () => {
  it("accepts the platform CDN over https", () => {
    expect(
      isAllowedStoreImageSrc("https://cdn.biasmarket.com/store-content/x.jpg"),
    ).toBe(true);
  });

  it("accepts localhost outside production (dev MinIO)", () => {
    expect(isAllowedStoreImageSrc("http://localhost:9000/bucket/x.jpg")).toBe(
      true,
    );
  });

  it.each([
    "https://evil.example/x.png",
    "https://cdn.biasmarket.com.evil.example/x.png",
    "http://cdn.biasmarket.com/x.png",
    "data:image/png;base64,AAAA",
    "not a url",
    "",
    null,
  ])("rejects %s", (src) => {
    expect(isAllowedStoreImageSrc(src as string)).toBe(false);
  });
});

describe("storeMarkdownToPlainText", () => {
  it("flattens markdown to a single line of text", () => {
    expect(
      storeMarkdownToPlainText("# Title\n\nSome **bold** copy.\n\n- a\n- b"),
    ).toBe("Title Some bold copy. a b");
  });

  it("returns '' for empty input", () => {
    expect(storeMarkdownToPlainText("")).toBe("");
    expect(storeMarkdownToPlainText(null)).toBe("");
  });

  it("hard-caps length (incl. ellipsis) at `max`", () => {
    const long = `# ${"word ".repeat(80)}`;
    const out = storeMarkdownToPlainText(long, 155);
    expect(out.length).toBeLessThanOrEqual(155);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("firstStoreMarkdownImage", () => {
  it("returns the first on-CDN image URL", () => {
    const md = [
      "intro",
      "![alt](https://evil.example/a.png)",
      "![alt](https://cdn.biasmarket.com/store-content/b.png)",
      "![alt](https://cdn.biasmarket.com/store-content/c.png)",
    ].join("\n\n");
    expect(firstStoreMarkdownImage(md)).toBe(
      "https://cdn.biasmarket.com/store-content/b.png",
    );
  });

  it("returns null when there is no on-CDN image", () => {
    expect(
      firstStoreMarkdownImage("![alt](https://evil.example/a.png)"),
    ).toBeNull();
    expect(firstStoreMarkdownImage("no images here")).toBeNull();
    expect(firstStoreMarkdownImage(null)).toBeNull();
  });
});
