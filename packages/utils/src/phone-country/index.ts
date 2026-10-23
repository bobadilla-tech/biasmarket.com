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

// National-number length after the dial code. Peru is the strict case
// (WhatsApp mobiles: exactly 9 digits starting with 9). Every other country
// in PHONE_COUNTRIES is accepted when its national number falls in the range
// below — no carrier-prefix rules. A number that matches no dial code is
// normalized as Peru and then judged by the Peru rules.
const NATIONAL_LENGTH: Record<string, { min: number; max: number }> = {
  PE: { min: 9, max: 9 },
  MX: { min: 10, max: 10 },
  AR: { min: 10, max: 11 },
  CO: { min: 10, max: 10 },
  CL: { min: 9, max: 9 },
  BR: { min: 10, max: 11 },
  EC: { min: 9, max: 9 },
  BO: { min: 8, max: 8 },
  PY: { min: 9, max: 9 },
  UY: { min: 8, max: 8 },
  VE: { min: 10, max: 10 },
  US: { min: 10, max: 10 },
  ES: { min: 9, max: 9 },
};

export type PhoneValidation =
  | { ok: true; phone: string }
  | { ok: false; message: string };

export function validatePhone(value: string): PhoneValidation {
  if (/[a-zA-Z]/.test(value)) {
    return { ok: false, message: "El número no puede contener letras" };
  }

  const phone = normalizePhone(value);
  const { country, nationalNumber } = parsePhoneValue(phone);

  if (country.iso === "PE") {
    if (!nationalNumber.startsWith("9")) {
      return {
        ok: false,
        message: "Un celular de Perú debe empezar con 9",
      };
    }
    if (nationalNumber.length !== 9) {
      return { ok: false, message: "El número no tiene un largo válido" };
    }
    return { ok: true, phone };
  }

  const range = NATIONAL_LENGTH[country.iso];
  if (
    !range ||
    nationalNumber.length < range.min ||
    nationalNumber.length > range.max
  ) {
    return { ok: false, message: "El número no tiene un largo válido" };
  }

  return { ok: true, phone };
}
