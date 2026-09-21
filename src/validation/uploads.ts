import { z } from 'zod';
import { LIMITS } from '../lib/limits';
import { assert } from '../lib/errors';
export const uploadMetadata = z.object({
  filename: z
    .string()
    .min(1)
    .max(180)
    .refine((s) =>
      [...s].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
    ),
  mime: z.enum([
    'image/png',
    'image/jpeg',
    'image/webp',
    'application/pdf',
    'text/plain',
  ]),
  size: z.number().int().min(1).max(LIMITS.attachmentBytes),
});
export function validateBytes(bytes: ArrayBuffer, mime: string) {
  const b = new Uint8Array(bytes);
  const starts = (...values: number[]) =>
    values.every((value, index) => b[index] === value);
  const ascii = (start: number, end: number) =>
    new TextDecoder().decode(b.slice(start, end));
  const valid =
    mime === 'image/png'
      ? starts(137, 80, 78, 71, 13, 10, 26, 10)
      : mime === 'image/jpeg'
        ? starts(255, 216, 255)
        : mime === 'image/webp'
          ? ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
          : mime === 'application/pdf'
            ? ascii(0, 5) === '%PDF-'
            : !b.includes(0);
  assert(valid, 400, 'File contents do not match the declared type');
}
