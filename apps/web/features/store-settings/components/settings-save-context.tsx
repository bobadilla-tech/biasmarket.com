"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export type SettingsTabId =
  "store" | "payments" | "delivery" | "appearance" | "messages";

export type SettingsDraftParticipant = {
  id: string;
  tab: SettingsTabId;
  dirty: boolean;
  valid?: boolean;
  validationError?: string;
  save: () => Promise<void>;
  discard: () => void;
};

type SettingsDraftContextValue = {
  register: (participant: SettingsDraftParticipant) => void;
  unregister: (id: string) => void;
  isDirty: (tab: SettingsTabId) => boolean;
  canSave: (tab: SettingsTabId) => boolean;
  save: (tab: SettingsTabId) => Promise<boolean>;
  discard: (tab: SettingsTabId) => void;
  isSaving: boolean;
  errors: string[];
};

const SettingsDraftContext = createContext<SettingsDraftContextValue | null>(
  null,
);
const noopRegister: SettingsDraftContextValue["register"] = () => {};
const noopUnregister: SettingsDraftContextValue["unregister"] = () => {};

export function SettingsDraftProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const participants = useRef(new Map<string, SettingsDraftParticipant>());
  const cleanAfterSave = useRef(new Set<string>());
  const [revision, setRevision] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  const register = useCallback((participant: SettingsDraftParticipant) => {
    const previous = participants.current.get(participant.id);
    participants.current.set(participant.id, participant);
    if (
      previous?.dirty !== participant.dirty ||
      previous?.valid !== participant.valid ||
      previous?.validationError !== participant.validationError
    ) {
      if (!participant.dirty) cleanAfterSave.current.delete(participant.id);
      setRevision((value) => value + 1);
    }
  }, []);
  const unregister = useCallback((id: string) => {
    participants.current.delete(id);
    cleanAfterSave.current.delete(id);
    setRevision((value) => value + 1);
  }, []);
  const isDirty = useCallback(
    (tab: SettingsTabId) => {
      void revision;
      return [...participants.current.values()].some(
        (participant) =>
          participant.tab === tab &&
          participant.dirty &&
          !cleanAfterSave.current.has(participant.id),
      );
    },
    [revision],
  );
  const canSave = useCallback(
    (tab: SettingsTabId) => {
      void revision;
      return ![...participants.current.values()].some(
        (participant) =>
          participant.tab === tab &&
          participant.dirty &&
          participant.valid === false,
      );
    },
    [revision],
  );
  const save = useCallback(async (tab: SettingsTabId) => {
    setIsSaving(true);
    setErrors([]);
    const dirty = [...participants.current.values()].filter(
      (participant) =>
        participant.tab === tab &&
        participant.dirty &&
        !cleanAfterSave.current.has(participant.id),
    );
    const invalid = dirty.filter((participant) => participant.valid === false);
    if (invalid.length > 0) {
      setErrors(
        invalid.map(
          (participant) =>
            participant.validationError ??
            `Revisa ${participant.id} antes de guardar.`,
        ),
      );
      setIsSaving(false);
      return false;
    }
    const results = await Promise.allSettled(
      dirty.map(async (participant) => {
        await participant.save();
        cleanAfterSave.current.add(participant.id);
      }),
    );
    const failures: string[] = [];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        failures.push(
          result.reason instanceof Error
            ? result.reason.message
            : `No se pudo guardar ${dirty[index]?.id ?? "la sección"}.`,
        );
      }
    });
    setErrors(failures);
    setIsSaving(false);
    setRevision((value) => value + 1);
    return failures.length === 0;
  }, []);
  const discard = useCallback((tab: SettingsTabId) => {
    for (const participant of participants.current.values()) {
      if (participant.tab !== tab) continue;
      participant.discard();
      cleanAfterSave.current.delete(participant.id);
    }
    setErrors([]);
    setRevision((value) => value + 1);
  }, []);

  const value = useMemo(
    () => ({
      register,
      unregister,
      isDirty,
      canSave,
      save,
      discard,
      isSaving,
      errors,
    }),
    [register, unregister, isDirty, canSave, save, discard, isSaving, errors],
  );
  return (
    <SettingsDraftContext.Provider value={value}>
      {children}
    </SettingsDraftContext.Provider>
  );
}

export function useSettingsDraftContext() {
  const context = useContext(SettingsDraftContext);
  if (!context) throw new Error("SettingsDraftProvider is missing");
  return context;
}

export function useSettingsDraftParticipant(
  participant: SettingsDraftParticipant,
) {
  const context = useContext(SettingsDraftContext);
  const register = context?.register ?? noopRegister;
  const unregister = context?.unregister ?? noopUnregister;
  const { id, tab, dirty, valid, validationError, save, discard } = participant;
  useEffect(() => {
    register({ id, tab, dirty, valid, validationError, save, discard });
  }, [register, id, tab, dirty, valid, validationError, save, discard]);
  useEffect(() => () => unregister(id), [unregister, id]);
}
