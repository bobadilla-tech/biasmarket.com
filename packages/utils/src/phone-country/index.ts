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

// Buyers type phone numbers in whatever shape they like across checkout,
// login, forgot-password, and account settings — "+51987654321",
// "987654321", "51987654321", "+51 987 654 321" all mean the same phone.
// Storage/lookups (Customer.storeId_phone) must key on one canonical shape.
// Reuses parsePhoneValue's dial-code detection rather than reimplementing
// it: strips every non-digit character (embedded or repeated "+" included)
// and prepends exactly one leading "+", so a bare "51987654321" resolves to
// the same PE + "987654321" split a "+51987654321" input already gets, and
// a bare national number with no recognizable dial-code prefix (e.g.
// "987654321") falls back to DEFAULT_PHONE_COUNTRY exactly like
// parsePhoneValue already does for a "+"-prefixed unmatched value.
export function normalizePhone(value: string): string {
  const digitsOnly = value.replace(/\D/g, "");
  const { country, nationalNumber } = parsePhoneValue(`+${digitsOnly}`);
  return `${country.dialCode}${nationalNumber}`;
}
