// Shared as-you-type input formatters for the Registration Dashboard's
// fixed-format fields. Both always re-derive the formatted string from the
// underlying digits (rather than tracking raw/formatted state separately),
// so backspacing at the end of the string naturally removes the last digit
// and re-formats — the standard trade-off for this kind of masked input;
// mid-string edits are less clean, which is the same trade-off every
// common phone/EIN input mask makes.

// (XXX) XXX-XXXX, capped at 10 digits so typing can't run past a real US
// phone number.
export function formatPhoneInput(rawValue) {
  const digits = rawValue.replace(/\D/g, '').slice(0, 10);
  const len = digits.length;
  if (len === 0) return '';
  if (len < 4) return `(${digits}`;
  if (len < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// XX-XXXXXXX, capped at 9 digits (a standard EIN).
export function formatEinInput(rawValue) {
  const digits = rawValue.replace(/\D/g, '').slice(0, 9);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}-${digits.slice(2)}`;
}
