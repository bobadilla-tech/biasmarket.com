import { useState } from "react";
import { expect, test } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../test-utils/render-with-providers";
import { OrdersTabs } from "./orders-tabs";

const labels = {
  all: "Todos",
  pending: "Pendientes",
  transit: "En camino",
  delivered: "Entregados",
};

test("exposes an accessible tab list and moves selection with arrow keys", () => {
  function TabsHarness() {
    const [activeTab, setActiveTab] = useState<keyof typeof labels>("all");
    return (
      <>
        <OrdersTabs
          activeTab={activeTab}
          onChange={setActiveTab}
          labels={labels}
          ariaLabel="Filtrar pedidos por estado"
        />
        <output>{activeTab}</output>
      </>
    );
  }
  renderWithProviders(<TabsHarness />);

  const tablist = screen.getByRole("tablist", {
    name: "Filtrar pedidos por estado",
  });
  const allTab = screen.getByRole("tab", { name: "Todos" });
  expect(tablist).toBeTruthy();
  expect(allTab.getAttribute("aria-selected")).toBe("true");

  fireEvent.keyDown(allTab, { key: "ArrowRight" });
  expect(document.activeElement).toBe(
    screen.getByRole("tab", { name: "Pendientes" }),
  );
  expect(
    screen.getByRole("tab", { name: "Pendientes" }).getAttribute("tabindex"),
  ).toBe("0");
  expect(screen.getByText("pending")).toBeTruthy();
});
