import { useState } from "react";
import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  SettingsDraftProvider,
  useSettingsDraftContext,
  useSettingsDraftParticipant,
} from "./settings-save-context";

function Draft({
  save,
  valid = true,
}: {
  save: () => Promise<void>;
  valid?: boolean;
}) {
  const [value, setValue] = useState("saved");
  useSettingsDraftParticipant({
    id: "draft",
    tab: "store",
    dirty: value !== "saved",
    valid,
    validationError: valid ? undefined : "Fix the invalid draft",
    save,
    discard: () => setValue("saved"),
  });
  return (
    <input
      aria-label="Draft"
      value={value}
      onChange={(event) => setValue(event.target.value)}
    />
  );
}

function SaveControls() {
  const { save, isDirty, errors } = useSettingsDraftContext();
  return (
    <>
      <button type="button" onClick={() => void save("store")}>
        Save tab
      </button>
      <output>{isDirty("store") ? "unsaved" : "saved"}</output>
      {errors.length ? <p role="alert">{errors.join(" · ")}</p> : null}
    </>
  );
}

test("keeps a participant dirty when it changes while its save is pending", async () => {
  let finishSave!: () => void;
  const save = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  render(
    <SettingsDraftProvider>
      <Draft save={save} />
      <SaveControls />
    </SettingsDraftProvider>,
  );

  fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), {
    target: { value: "first draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save tab" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), {
    target: { value: "newer draft" },
  });
  finishSave();

  await waitFor(() => expect(screen.getByText("unsaved")).toBeTruthy());
});

test("validates every dirty participant before saving any of them", async () => {
  const save = vi.fn().mockResolvedValue(undefined);
  render(
    <SettingsDraftProvider>
      <Draft save={save} valid={false} />
      <SaveControls />
    </SettingsDraftProvider>,
  );

  fireEvent.change(screen.getByRole("textbox", { name: "Draft" }), {
    target: { value: "invalid draft" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save tab" }));

  await waitFor(() => expect(save).not.toHaveBeenCalled());
  expect(screen.getByRole("alert")).toBeTruthy();
});
