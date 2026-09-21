/**
 * Number and size formatting. Deliberately NOT in copy.ts.
 *
 * scripts/check-copy.py holds every string in copy.ts to docs/copy.md, which
 * means copy.ts must contain approved copy and nothing else. A helper that
 * builds "1.4 MB" is a formatter, not a sentence anyone signed off, and leaving
 * it there would have forced the check to carry an exception. A check with an
 * exception list is a check people learn to add exceptions to.
 */
// Decimal, because docs/copy.md says "25 MB" and humanSize renders the same
// units back at the user. With 1024*1024 the cap was 25 MiB, so a 26,214,401
// byte file was refused with "That file is 25.0 MB, which is too large. The
// limit here is 25 MB", a sentence that refuses a file for being exactly the
// limit. Meanwhile 26,000,000 bytes, which is 26 MB by the convention that
// sentence uses, was accepted.
const MB = 1000 * 1000;

/**
 * 25 MB. The reason is in docs/copy.md rather than here: "past that the page
 * stops responding and you would be left guessing". That sentence is a promise
 * that under the cap the page does NOT stop responding, which is why the check
 * runs in a Web Worker.
 */
export const SIZE_CAP = 25 * MB;

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / MB).toFixed(1)} MB`;
}
