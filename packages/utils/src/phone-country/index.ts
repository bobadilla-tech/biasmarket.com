export interface PhoneCountry {
  iso: string;
  name: string;
  dialCode: string;
  flag: string;
}

export const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "PE", name: "Peru", dialCode: "+51", flag: "🇵🇪" },
  { iso: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
  { iso: "AR", name: "Argentina", dialCode: "+54", flag: "🇦🇷" },
  { iso: "CO", name: "Colombia", dialCode: "+57", flag: "🇨🇴" },
  { iso: "CL", name: "Chile", dialCode: "+56", flag: "🇨🇱" },
  { iso: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
  { iso: "EC", name: "Ecuador", dialCode: "+593", flag: "🇪🇨" },
  { iso: "BO", name: "Bolivia", dialCode: "+591", flag: "🇧🇴" },
  { iso: "PY", name: "Paraguay", dialCode: "+595", flag: "🇵🇾" },
  { iso: "UY", name: "Uruguay", dialCode: "+598", flag: "🇺🇾" },
  { iso: "VE", name: "Venezuela", dialCode: "+58", flag: "🇻🇪" },
  { iso: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { iso: "ES", name: "Spain", dialCode: "+34", flag: "🇪🇸" },
];

export const DEFAULT_PHONE_COUNTRY = PHONE_COUNTRIES[0];

const COUNTRIES_BY_DIAL_CODE_LENGTH_DESC = [...PHONE_COUNTRIES].sort(
  (a, b) => b.dialCode.length - a.dialCode.length,
);

export function parsePhoneValue(value: string): {
  country: PhoneCountry;
  nationalNumber: string;
} {
  const match = COUNTRIES_BY_DIAL_CODE_LENGTH_DESC.find((country) =>
    value.startsWith(country.dialCode)
  );

  if (!match) {
    return {
      country: DEFAULT_PHONE_COUNTRY,
      nationalNumber: value.replace(/^\+/, ""),
    };
  }

  return { country: match, nationalNumber: value.slice(match.dialCode.length) };
}
