/**
 * Interface copy, verbatim from docs/copy.md version 1.0.
 *
 * That document says: "These are the exact strings. Claude Code writes them as
 * given. They are not placeholders." So they live in one module rather than
 * scattered through components, which is what lets a check compare them against
 * the document instead of trusting that nobody paraphrased one.
 *
 * Three rules govern every string here, from the same document:
 *   1. Say what happened, then what to do. Never an apology, never a shrug.
 *   2. Never use a banned word. The list is docs/banned-phrases.txt.
 *   3. Never describe the file as having held anything. StratifyPro does not keep it.
 *
 * Rule 3 is why several of these are worded awkwardly. "This file parsed, but
 * it lists no components", rather than a phrasing that treats the file as a
 * container this tool still holds, is deliberate: the tool is describing a
 * document it read and discarded.
 *
 * scripts/check-copy.py holds every string in this file to docs/copy.md, so
 * nothing but approved copy belongs here. Formatting helpers live in format.ts.
 */

export interface Message {
  heading: string;
  body: string;
}

export const COPY = {
  /** Under the drop zone, verbatim. The whole free tier rests on this being true. */
  privacy: 'Your file is checked in this browser. It is never uploaded.',

  notJson: (offset: number, snippet: string): Message => ({
    heading: 'That file is not valid JSON',
    body:
      `The problem is at byte ${offset}, near ${snippet}. Most often this is a truncated ` +
      `download or a file that was edited by hand. Try re-exporting it from the tool that made it.`,
  }),

  /**
   * The same failure when the parser gave no position.
   *
   * The alternative was printing byte 0, which is what the approved string did
   * when there was no position to report, sending a reader to the start of a
   * file whose problem is at the end.
   *
   * Worded for both shapes. The first draft said "the file ends before the JSON
   * does", which is true of a truncated export and false of a stray token in
   * the middle of one, and V8 reports no position for both.
   */
  notJsonNoPosition: (snippet: string): Message => ({
    heading: 'That file is not valid JSON',
    body:
      `Something is wrong near ${snippet}, and the parser reported no position. Most often ` +
      `this is a truncated download. Try re-exporting it from the tool that made it.`,
  }),

  notAnSbom: (): Message => ({
    heading: 'This does not look like a bill of materials',
    body:
      'The file parsed, but it has no CycloneDX or SPDX markers. StratifyPro reads CycloneDX ' +
      '1.2 to 1.7 and SPDX 2.2 to 2.3. If this is a supplier’s own spreadsheet or PDF, ' +
      'that is a different job and the workspace can take a run at it.',
  }),

  unsupportedVersion: (format: string, version: string): Message => ({
    heading: `That is ${format} ${version}, which this engine does not read yet`,
    body:
      'Supported today: CycloneDX 1.2 to 1.7, SPDX 2.2 to 2.3. Nothing was sent anywhere. ' +
      'If you need this version, say so and it moves up the list.',
  }),

  tooLarge: (size: string, filename: string, pack: string): Message => ({
    heading: `That file is ${size}, which is too large for a browser tab`,
    body:
      'The limit here is 25 MB, because past that the page stops responding and you would be ' +
      `left guessing. The command line tool has no limit: npx stratifypro check ${filename} --pack ${pack}`,
  }),

  empty: (): Message => ({
    heading: 'That file is empty',
    body: 'Zero bytes. Check the export finished before it was copied.',
  }),

  noComponents: (): Message => ({
    heading: 'This file parsed, but it lists no components',
    body:
      'A bill of materials with no components is either a template or an export that failed ' +
      'part way. Nothing was sent anywhere.',
  }),

  packFailed: (id: string, version: string, reason: string): Message => ({
    heading: 'A rule pack failed to load, so nothing was checked',
    body:
      `Pack ${id} version ${version} did not pass its own validation: ${reason}. This is a ` +
      'defect on our side, not in your file. Nothing was checked, and a partial result would ' +
      'be worse than none.',
  }),

  // Numbers are grouped. docs/copy.md gives the wording, not the formatting, and
  // an unformatted 3484 in the heading sitting directly under a formatted 3,484
  // in the summary bar reads as two different numbers.
  findings: (n: number, r: number, errors: number, warnings: number, infos: number): Message => ({
    heading: `${n.toLocaleString()} findings across ${r} rules`,
    body:
      `${errors.toLocaleString()} errors, ${warnings.toLocaleString()} warnings, ` +
      `${infos.toLocaleString()} for information. Every finding shows ` +
      'where it is in the file and what to change.',
  }),

  /**
   * Load-bearing, and docs/copy.md says so in as many words: "A clean pass and
   * a broken tool must never look the same, which is why the rule list is shown
   * rather than a tick."
   */
  zeroFindings: (r: number, pack: string): Message => ({
    heading: `${r} rules ran. Nothing flagged.`,
    body:
      `This file cleared every rule in ${pack}. That is a real result, not a failure to load: ` +
      'the rules that ran are listed below. It does not mean the file is complete, and it does ' +
      'not mean a submission will be accepted.',
  }),

  allSkipped: (pack: string, format: string): Message => ({
    heading: 'No rules applied to this file',
    body: `Pack ${pack} has no rules for ${format}. Try a different pack.`,
  }),
} as const;
