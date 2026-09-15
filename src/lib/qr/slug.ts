import { randomBytes } from "node:crypto";

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function generateQrSlug(length = 12): string {
  if (length < 10) {
    throw new RangeError("generarSlugQr: el slug debe tener al menos 10 caracteres.");
  }
  const bytes = randomBytes(length);
  let slug = "";
  for (const byte of bytes) {
    slug += ALPHABET[byte % ALPHABET.length];
  }
  return slug;
}