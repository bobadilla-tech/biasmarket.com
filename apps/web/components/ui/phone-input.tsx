import { useMemo } from "react";
import { PHONE_COUNTRIES, parsePhoneValue } from "@biasmarket/utils/phone-country";
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
}: PhoneInputProps) {
  const { country, nationalNumber } = useMemo(() => parsePhoneValue(value), [value]);

  return (
    <div className={cn("flex gap-2", className)}>
      <Select
        aria-label="Country code"
        value={country.iso}
        onChange={(event) => {
          const nextCountry =
            PHONE_COUNTRIES.find((candidate) => candidate.iso === event.target.value) ?? country;
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
        value={nationalNumber}
        onChange={(event) => onChange(`${country.dialCode}${event.target.value}`)}
        placeholder={placeholder}
        className={cn("min-w-0 flex-1", inputClassName)}
      />
    </div>
  );
}
