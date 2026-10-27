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
    value.startsWith(country.dialCode),
  );

  if (!match) {
    return {
      country: DEFAULT_PHONE_COUNTRY,
      nationalNumber: value.replace(/^\+/, ""),
    };
  }

  return { country: match, nationalNumber: value.slice(match.dialCode.length) };
}

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

// A leading "+" or "00" is an explicit international prefix. A bare national
// number ("987654321") and a dial code typed without one ("51987654321") are
// not: those keep the default-country fallback below.
function explicitInternational(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return `+${digitsOf(trimmed.slice(1))}`;
  const digits = digitsOf(trimmed);
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  return null;
}

function countryForInternational(e164: string): PhoneCountry | null {
  return (
    COUNTRIES_BY_DIAL_CODE_LENGTH_DESC.find(
      (country) =>
        e164.startsWith(country.dialCode) &&
        e164.length > country.dialCode.length,
    ) ?? null
  );
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
  let digitsOnly = digitsOf(value);
  // "00 51 987654321" is the same number as "+51 987654321". Only drop the
  // trunk prefix when what follows is a dial code we actually support, so an
  // unknown "0044…" does not collapse into a Peru number.
  if (digitsOnly.startsWith("00")) {
    const international = `+${digitsOnly.slice(2)}`;
    if (countryForInternational(international))
      digitsOnly = digitsOnly.slice(2);
  }
  const { country, nationalNumber } = parsePhoneValue(`+${digitsOnly}`);
  return `${country.dialCode}${nationalNumber}`;
}

// National-number length after the dial code. Peru is the strict case
// (WhatsApp mobiles: exactly 9 digits starting with 9). Every other country
// in PHONE_COUNTRIES is accepted when its national number falls in the range
// below — no carrier-prefix rules. A number with no explicit prefix is
// normalized as Peru and then judged by the Peru rules. An explicit "+" or
// "00" prefix that matches no supported dial code is rejected instead.
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
  { ok: true; phone: string } | { ok: false; message: string };

const PHONE_CHARACTERS = /^[0-9+()\-.\s]*$/;

export function validatePhone(value: string): PhoneValidation {
  if (/[a-zA-Z]/.test(value)) {
    return { ok: false, message: "El número no puede contener letras" };
  }
  if (!PHONE_CHARACTERS.test(value)) {
    return { ok: false, message: "El número contiene caracteres no válidos" };
  }

  const international = explicitInternational(value);
  if (
    international !== null &&
    countryForInternational(international) === null
  ) {
    return { ok: false, message: "Prefijo no soportado" };
  }
  if (!digitsOf(value)) {
    return { ok: false, message: "El número no tiene un largo válido" };
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

// Human-readable grouping for confirming a number: +51987654321 becomes
// "+51 987 654 321". Groups of three from the left; a lone trailing digit
// joins the previous group instead of standing alone ("+52 123 456 7890").
export function formatPhone(phone: string): string {
  const normalized = normalizePhone(phone);
  const { country, nationalNumber } = parsePhoneValue(normalized);
  const groups = nationalNumber.match(/\d{1,3}/g) ?? [];
  if (groups.length > 1 && groups[groups.length - 1]!.length === 1) {
    const last = groups.pop()!;
    groups[groups.length - 1] += last;
  }
  return [country.dialCode, ...groups].join(" ");
}

// Shows the dial code, the first national digit, and the last three digits.
// A Peru mobile +51987654321 becomes "+51 9** *** 321".
export function maskPhone(phone: string): string {
  const international = explicitInternational(phone);
  if (
    international !== null &&
    countryForInternational(international) === null
  ) {
    return "***";
  }

  const normalized = normalizePhone(phone);
  const { country, nationalNumber } = parsePhoneValue(normalized);
  // First digit + last three only hides the middle once there is a middle.
  // A 5-digit national number would otherwise show 4 of its 5 digits.
  if (nationalNumber.length < 7) return `${country.dialCode} ***`;

  const first = nationalNumber[0];
  const last = nationalNumber.slice(-3);
  const hidden = nationalNumber.slice(1, -3);
  const groups: string[] = [];
  let rest = "*".repeat(hidden.length);
  while (rest.length > 3) {
    groups.unshift(rest.slice(-3));
    rest = rest.slice(0, -3);
  }
  if (rest) groups.unshift(rest);

  return `${country.dialCode} ${first}${groups[0]} ${groups.slice(1).join(" ")} ${last}`.replace(
    /\s+/g,
    " ",
  );
}
