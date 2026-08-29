import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { FormField } from "./form-a11y";
import { renderWithProviders } from "../../test-utils/render-with-providers";

test("combines help and error descriptions without duplicate IDs", async () => {
  const { container } = renderWithProviders(
    <FormField
      id="example-field"
      label="Example field"
      description="Helpful guidance"
      error="This value is invalid"
    >
      {(props) => <input {...props} />}
    </FormField>,
  );

  const input = screen.getByRole("textbox", { name: "Example field" });
  const describedBy = input.getAttribute("aria-describedby")?.split(" ") ?? [];
  expect(new Set(describedBy).size).toBe(describedBy.length);
  expect(describedBy).toHaveLength(2);
  expect(describedBy.every((id) => container.querySelector(`#${id}`))).toBe(
    true,
  );
  expect(input.getAttribute("aria-invalid")).toBe("true");

  expect(screen.getByRole("alert")).toBeDefined();
});
