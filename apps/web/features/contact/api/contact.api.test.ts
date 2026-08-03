import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { contactApi } = await import("./contact.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("submit POSTs to /contact and omits an empty company", async () => {
  apiFetch.mockResolvedValue({});

  await contactApi.submit({
    name: "Jane",
    email: "jane@example.com",
    company: "",
    inquiryType: "general",
    message: "Hello",
  });

  expect(apiFetch).toHaveBeenCalledWith(
    "/contact",
    {
      method: "POST",
      body: JSON.stringify({
        name: "Jane",
        email: "jane@example.com",
        company: undefined,
        inquiryType: "general",
        message: "Hello",
      }),
    },
    undefined,
  );
});

test("submit includes company when set", async () => {
  apiFetch.mockResolvedValue({});

  await contactApi.submit({
    name: "Jane",
    email: "jane@example.com",
    company: "Acme",
    inquiryType: "pricing",
    message: "Hello",
  });

  const body = JSON.parse((apiFetch.mock.calls[0][1] as { body: string }).body);
  expect(body.company).toBe("Acme");
});
