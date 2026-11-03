/**
 * Anything with Zod's `safeParse` shape: classic Zod, zod/mini, or a hand-written
 * validator. Tools pass these to validate decrypted data, so the shared packages
 * don't force a particular validation library on them.
 */
export interface Schema<T> {
  safeParse(input: unknown): { success: true; data: T } | { success: false }
}
