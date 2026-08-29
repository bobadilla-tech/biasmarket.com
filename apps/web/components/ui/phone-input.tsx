"use client";

import type * as React from "react";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  parsePhoneValue,
  PHONE_COUNTRIES,
} from "@biasmarket/utils/phone-country";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  selectClassName?: string;
  inputClassName?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  label?: string;
  countryLabel?: string;
  countryId?: string;
  countryName?: string;
  "aria-label"?: React.InputHTMLAttributes<HTMLInputElement>["aria-label"];
  "aria-describedby"?: React.InputHTMLAttributes<HTMLInputElement>["aria-describedby"];
  "aria-invalid"?: React.InputHTMLAttributes<HTMLInputElement>["aria-invalid"];
  autoComplete?: React.InputHTMLAttributes<HTMLInputElement>["autoComplete"];
  disabled?: boolean;
  required?: boolean;
}

export function PhoneInput({
  value,
  onChange,
  className,
  selectClassName,
  inputClassName,
  placeholder,
  id,
  name,
  label,
  countryLabel,
  countryId,
  countryName,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  autoComplete = "tel",
  disabled,
  required,
}: PhoneInputProps) {
  const t = useTranslations("common");
  const { country, nationalNumber } = useMemo(
    () => parsePhoneValue(value),
    [value],
  );

  return (
    <div className={cn("flex gap-2", className)}>
      <Select
        id={countryId ?? (id ? `${id}-country` : undefined)}
        name={countryName ?? (name ? `${name}-country` : undefined)}
        aria-label={countryLabel ?? t("countryCode")}
        aria-invalid={ariaInvalid}
        disabled={disabled}
        value={country.iso}
        onChange={(event) => {
          const nextCountry =
            PHONE_COUNTRIES.find(
              (candidate) => candidate.iso === event.target.value,
            ) ?? country;
          onChange(`${nextCountry.dialCode}${nationalNumber}`);
        }}
        className="w-32 shrink-0"
        selectClassName={selectClassName}
      >
        {PHONE_COUNTRIES.map((option) => (
          <option key={option.iso} value={option.iso} title={option.name}>
            {option.flag} {option.dialCode}
          </option>
        ))}
      </Select>
      <input
        id={id}
        name={name}
        type="tel"
        aria-label={ariaLabel ?? label ?? t("phoneNumber")}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        autoComplete={autoComplete}
        disabled={disabled}
        required={required}
        value={nationalNumber}
        onChange={(event) =>
          onChange(`${country.dialCode}${event.target.value}`)
        }
        placeholder={placeholder}
        className={cn("min-w-0 flex-1", inputClassName)}
      />
    </div>
  );
}
