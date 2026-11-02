"use client";

import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import type { RegisterSetting } from "@biasmarket/utils/register";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { Field, SectionCard } from "./section-primitives";

const REGISTER_SETTINGS: RegisterSetting[] = ["auto", "tuteo", "voseo"];

export function RegisterPreferenceSection() {
  const t = useTranslations("dashboard.settings.accountRegister");
  const [setting, setSetting] = useState<RegisterSetting>("auto");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    let active = true;
    void authClient.getSession().then(({ data }) => {
      if (!active) return;
      const value = data?.user.uiRegister;
      if (REGISTER_SETTINGS.includes(value as RegisterSetting)) {
        setSetting(value as RegisterSetting);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    const { error } = await authClient.updateUser({ uiRegister: setting });
    setSaving(false);
    setStatus(error ? "error" : "saved");
  };

  return (
    <SectionCard
      icon={Languages}
      title={t("title")}
      description={t("description")}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <Field id="account-register" label={t("label")}>
          <Select
            value={setting}
            onChange={(event) =>
              setSetting(event.target.value as RegisterSetting)
            }
            disabled={loading || saving}
            className="h-12 w-full sm:max-w-sm"
            selectClassName="h-full rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55] outline-none"
          >
            <option value="auto">{t("auto")}</option>
            <option value="tuteo">{t("tuteo")}</option>
            <option value="voseo">{t("voseo")}</option>
          </Select>
        </Field>
        <Button
          type="button"
          onClick={() => void save()}
          disabled={loading || saving}
        >
          {saving ? t("saving") : t("save")}
        </Button>
      </div>
      {status ? (
        <p
          className="mt-3 text-sm"
          role={status === "error" ? "alert" : "status"}
        >
          {status === "error" ? t("error") : t("saved")}
        </p>
      ) : null}
    </SectionCard>
  );
}
