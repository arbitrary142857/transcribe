/**
 * The ids everything is named by.
 *
 * Lived in transcription.ts while transcriptions were the only thing that
 * needed naming; moved here the day users did too, so the two kinds of id
 * cannot drift apart in alphabet or length. Nothing here may touch the DOM or
 * the Workers runtime — both sides import it.
 */

/**
 * Crockford's base 32.
 *
 * `i`, `l` and `o` are gone because a reader sees `1`, `1` and `0`; `u` is
 * gone so that no id accidentally spells an obscenity. What is left is exactly
 * 32 characters, which is the point: 256 divides by it, so `% length` below
 * draws every character as often as every other.
 */
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export const ID_LENGTH = 12;

/** Built from the alphabet so the two cannot drift; it holds no metacharacters. */
const ID_PATTERN = new RegExp(`^[${ALPHABET}]{${ID_LENGTH}}$`);

/**
 * A fresh id: 60 bits, which stays collision-free well past any row count
 * this will see. Random rather than counted, so neither the levels nor the
 * users can be walked from 1 upwards by anyone curious about what is in the
 * database.
 */
export function newId(): string {
  const bytes = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(bytes);
  let id = "";
  for (const byte of bytes) {
    id += ALPHABET[byte % ALPHABET.length]!;
  }
  return id;
}

/**
 * Whether this is an id at all.
 *
 * Ids arrive in URLs, so nothing is assumed about them. The database is safe
 * from a strange one regardless — every query binds its values rather than
 * spelling them into SQL — but a request that cannot name a row should be
 * turned away before it asks.
 */
export function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}
