import { IntlMessageFormat } from "intl-messageformat";
import { expect, test } from "vitest";
import enDashboard from "../../../packages/i18n/en/dashboard.json";
import esDashboard from "../../../packages/i18n/es/dashboard.json";

const descriptions = [
  ["en", enDashboard.settings.whatsappMessages.assistedOrderLink.description],
  ["es", esDashboard.settings.whatsappMessages.assistedOrderLink.description],
] as const;

test.each(descriptions)(
  "%s assisted-order template description is valid ICU and displays its literal token",
  (locale, description) => {
    const formatted = new IntlMessageFormat(description, locale).format();

    expect(formatted).toContain("{{link}}");
  },
);
