/**
 * Positioned text to rows and columns.
 *
 * This is the guessing part, and it is isolated here so that it is obvious
 * which part is guessing. syntax.ts, filters.ts, document.ts and text.ts read
 * what the file says. This file infers a structure the file does not contain,
 * because a PDF has no table: it has glyphs at coordinates that a person
 * reading it recognises as one.
 *
 * SO IT REPORTS ITS OWN SHAPE RATHER THAN A CONFIDENCE SCORE. A number
 * between zero and one invites somebody to pick a threshold and stop looking.
 * What comes back instead is countable: how many rows, how many columns, how
 * many text runs did not land in any column, and how many rows had a different
 * number of cells than the header. A caller that wants a threshold can build
 * one from those; a person reading the output can see which rows to check.
 *
 * ROWS BY Y, COLUMNS BY X, AND COLUMNS ARE THE HARD ONE. Rows are reliable:
 * a table row is drawn at one vertical position, and clustering on y with a
 * tolerance derived from the font size finds them. Columns are not, because
 * one cell wrapping onto two lines, a merged heading, or a right-aligned
 * number all move x. Columns are therefore found from x positions that RECUR
 * down the page, which a stray run cannot create on its own.
 */
import type { TextRun } from './text.js';

export interface Cell {
  text: string;
  column: number;
}

export interface TableRow {
  cells: string[];
  /** Page this row was read from, 1-based. */
  page: number;
  /** Vertical position, for anyone who needs to look at the original. */
  y: number;
}

export interface TableShape {
  header: string[];
  rows: TableRow[];
  /** x position of each column boundary, in the order the columns appear. */
  columnStarts: number[];
  /** Runs that landed in no column. Each one is text that was dropped. */
  orphans: Array<{ page: number; text: string; x: number; y: number }>;
  /** Rows whose cell count did not match the header. */
  ragged: Array<{ page: number; y: number; cells: number }>;
}

/** One visual line of text: runs sharing a vertical position. */
interface Line {
  y: number;
  page: number;
  runs: TextRun[];
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] as number;
}

/**
 * Join runs that are visually contiguous, IN THE ORDER THE PAGE DRAWS THEM.
 *
 * TWO THINGS MAKE THIS NECESSARY, and both were found by running a real file
 * rather than by reasoning about the format.
 *
 * Chrome emits one show operation per character, so `openssl` arrives as seven
 * runs. Without joining them, column detection sees the x of every letter as a
 * candidate boundary and a four-column table produces thirty-seven.
 *
 * Excel draws a cell's FULL text and then clips it to the cell. A supplier
 * column holding "The OpenSSL Project" in a narrow cell is drawn across the
 * two columns to its right, so sorting a line's runs by x interleaves it with
 * its neighbours and produces "The OpenSSApL Pachrojece-2t.0". Emission order
 * does not have that problem, because a producer draws one cell's text before
 * it starts the next one. So the runs are never sorted: the order the content
 * stream puts them in is the grouping, and x is used only to decide where each
 * finished cell belongs.
 *
 * Keeping the clipped overflow is deliberate. What a viewer shows is the
 * truncated string; what the spreadsheet holds is the whole one, and the whole
 * one is what a supplier meant to send.
 */
function mergeRuns(runs: TextRun[]): TextRun[] {
  if (runs.length === 0) return [];
  const out: TextRun[] = [];
  let cur = { ...runs[0] } as TextRun;
  for (let i = 1; i < runs.length; i++) {
    const next = runs[i] as TextRun;
    const gap = next.x - (cur.x + cur.width);
    const size = Math.max(cur.size, next.size) || 1;
    // A small negative gap is kerning. A large one means the producer went
    // back to the left to start something else, which ends the cell.
    if (gap < -size * 0.3) {
      out.push(cur);
      cur = { ...next };
      continue;
    }
    if (gap < size * 0.25) {
      cur.text += next.text;
    } else if (gap < size * 0.9) {
      cur.text += ' ' + next.text;
    } else {
      out.push(cur);
      cur = { ...next };
      continue;
    }
    cur.width = next.x + next.width - cur.x;
    cur.size = Math.max(cur.size, next.size);
  }
  out.push(cur);
  return out;
}

/** Group runs on one page into visual lines. */
function linesOf(runs: TextRun[], page: number): Line[] {
  if (runs.length === 0) return [];
  // Half the median font size. Tight enough to keep two table rows apart,
  // loose enough to survive a cell whose baseline is a point off because it
  // uses a different font.
  const tol = Math.max(1, median(runs.map((r) => r.size)) * 0.5);
  const out: Line[] = [];
  // Walked in emission order, and each run joins whichever line already sits
  // at its vertical position. Sorting first would be simpler and would destroy
  // the within-line ordering that mergeRuns depends on.
  for (const r of runs) {
    const line = out.find((l) => Math.abs(l.y - r.y) <= tol);
    if (line) {
      line.runs.push(r);
      // The line's y is the mean of its runs, so one superscript does not drag
      // the whole line off the row it belongs to.
      line.y = (line.y * (line.runs.length - 1) + r.y) / line.runs.length;
    } else {
      out.push({ y: r.y, page, runs: [r] });
    }
  }
  // The runs stay raw and in emission order. mergeRuns is applied only inside
  // columnStarts, which needs cell-shaped candidates; cellsFor needs the
  // individual runs so it can see exactly where each one landed.
  // Top of the page first, which is the order a person reads them in.
  out.sort((a, b) => b.y - a.y);
  return out;
}

/**
 * Column starts: x positions that recur down the page.
 *
 * A position shared by at least a quarter of the lines, and by at least three,
 * is a column. One line that happens to start a word there is not, which is
 * what keeps a paragraph above the table from inventing columns.
 */
function columnStarts(lines: Line[]): number[] {
  if (lines.length === 0) return [];
  const tol = Math.max(2, median(lines.flatMap((l) => l.runs.map((r) => r.size))) * 0.4);
  const buckets: Array<{ x: number; lines: Set<number> }> = [];

  lines.forEach((line, li) => {
    for (const r of mergeRuns(line.runs)) {
      const hit = buckets.find((b) => Math.abs(b.x - r.x) <= tol);
      if (hit) {
        // Keep the leftmost x in the bucket: a column's true edge is where its
        // shortest cell starts, not the average of its contents.
        hit.x = Math.min(hit.x, r.x);
        hit.lines.add(li);
      } else {
        buckets.push({ x: r.x, lines: new Set([li]) });
      }
    }
  });

  const need = Math.max(3, Math.ceil(lines.length * 0.25));
  return buckets
    .filter((b) => b.lines.size >= need)
    .map((b) => b.x)
    .sort((a, b) => a - b);
}

/**
 * The column whose start this x sits exactly on, or -1.
 *
 * THE TOLERANCE HERE IS MUCH TIGHTER THAN THE BUCKETING ONE, on purpose.
 * Grouping x positions into columns has to be loose, because two cells in a
 * column can be set in different fonts and land a point or two apart. Deciding
 * that a run BEGINS a cell has to be tight, because a producer positions every
 * cell in a column at the same coordinate, while a letter in the middle of an
 * overflowing word lands wherever the previous letter ended.
 *
 * With the loose tolerance the `L` of "OpenSSL" fell within four points of the
 * next column's start and began a new cell there, splitting one supplier into
 * "The OpenSS" and "L Project Apache-2.0, OpenSSL".
 */
function startsColumnAt(x: number, starts: number[], size: number): number {
  let best = -1;
  let bestD = Math.max(0.6, size * 0.06);
  starts.forEach((s, i) => {
    const d = Math.abs(x - s);
    if (d <= bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** The column this x falls inside: the rightmost start at or before it. */
function columnContaining(x: number, starts: number[], tol: number): number {
  for (let i = starts.length - 1; i >= 0; i--) {
    if (x >= (starts[i] as number) - tol) return i;
  }
  return -1;
}

/**
 * Split one line into cells.
 *
 * A NEW CELL BEGINS WHERE A COLUMN BEGINS, NOT WHERE A GAP IS WIDE. The gap
 * rule alone cannot do this: in the Excel fixture "FreeRTOS" almost fills its
 * column, so the space before the version in the next column is a third of an
 * em, narrower than the space inside "mbed TLS". Reading cell boundaries from
 * the gap therefore produced a component called "FreeRTOS 10.4.3" and shifted
 * every remaining cell in the row one place left.
 *
 * So a run ends the current cell only when it lands ON a column start that is
 * not the current cell's own. Text that has merely overflowed its cell, which
 * is what Excel does whenever a value is wider than the column, carries no
 * such landing: its runs sit at arbitrary positions and stay with the cell
 * they began in. That keeps "The OpenSSL Project" whole even though it is
 * drawn across the two columns to its right.
 */
function cellsFor(
  line: Line,
  starts: number[],
  tol: number,
): { cells: string[]; orphans: TextRun[] } {
  const cells: string[][] = starts.map(() => []);
  const orphans: TextRun[] = [];

  let col = -1;
  let text = '';
  let endX = 0;
  let size = 1;

  const flush = (): void => {
    if (col >= 0 && text.trim() !== '') (cells[col] as string[]).push(text.trim());
    text = '';
  };

  for (const r of line.runs) {
    const gap = r.x - endX;
    const landed = startsColumnAt(r.x, starts, r.size);
    // Landing on no column start at all means this run is a continuation:
    // either the next word of the cell, or text that has overflowed it.
    const continues = col >= 0 && landed < 0 && gap > -size * 0.3 && gap < size * 0.9;

    if (continues) {
      text += (gap < size * 0.25 ? '' : ' ') + r.text;
    } else {
      const idx = landed >= 0 ? landed : columnContaining(r.x, starts, tol);
      if (idx < 0) {
        orphans.push(r);
        continue;
      }
      if (idx === col && gap > -size * 0.3 && gap < size * 0.9) {
        // Same column, still contiguous: a wrapped word, not a new cell.
        text += (gap < size * 0.25 ? '' : ' ') + r.text;
      } else {
        flush();
        col = idx;
        text = r.text;
      }
    }
    endX = r.x + r.width;
    size = Math.max(size, r.size);
  }
  flush();

  return {
    // A cell drawn as several separated pieces keeps a space between them,
    // because joining them bare welds two words together.
    cells: cells.map((parts) => parts.join(' ').replace(/\s+/g, ' ').trim()),
    orphans,
  };
}

/**
 * Read a table out of the text runs of one or more pages.
 *
 * `pages` is one entry per page so a table continuing across a page break is
 * read as one table, which is the normal shape of a supplier's parts list.
 * A repeated header row on the second page is dropped, because the alternative
 * is a component called "Component Name".
 */
export function tableFromRuns(pages: TextRun[][]): TableShape {
  const lines: Line[] = [];
  pages.forEach((runs, i) => lines.push(...linesOf(runs, i + 1)));
  if (lines.length === 0) {
    return { header: [], rows: [], columnStarts: [], orphans: [], ragged: [] };
  }

  const starts = columnStarts(lines);
  if (starts.length < 2) {
    // Fewer than two recurring positions is not a table. Say so by returning
    // no header rather than by inventing a single column.
    return {
      header: [],
      rows: [],
      columnStarts: starts,
      orphans: lines.flatMap((l) =>
        mergeRuns(l.runs).map((r) => ({ page: l.page, text: r.text, x: r.x, y: r.y })),
      ),
      ragged: [],
    };
  }

  const tol = Math.max(2, median(lines.flatMap((l) => l.runs.map((r) => r.size))) * 0.4);
  const orphans: TableShape['orphans'] = [];
  const ragged: TableShape['ragged'] = [];

  const built = lines.map((l) => {
    const { cells, orphans: o } = cellsFor(l, starts, tol);
    for (const r of o) orphans.push({ page: l.page, text: r.text, x: r.x, y: r.y });
    return { line: l, cells };
  });

  // The header is the first line that fills most of the columns. A title or a
  // page number above the table fills one, so it is skipped rather than taken
  // as the header and then blamed for the mismatch.
  const filled = (cells: string[]): number => cells.filter((c) => c !== '').length;
  const headerIdx = built.findIndex((b) => filled(b.cells) >= Math.max(2, starts.length - 1));
  if (headerIdx < 0) {
    for (const b of built) {
      for (const r of mergeRuns(b.line.runs)) {
        orphans.push({ page: b.line.page, text: r.text, x: r.x, y: r.y });
      }
    }
    return { header: [], rows: [], columnStarts: starts, orphans, ragged: [] };
  }

  const header = (built[headerIdx] as { cells: string[] }).cells;
  const headerKey = header.join('\u0000').toLowerCase();
  const rows: TableRow[] = [];

  for (let i = 0; i < built.length; i++) {
    const b = built[i] as { line: Line; cells: string[] };
    if (i === headerIdx) continue;
    if (i < headerIdx) {
      // Anything above the header is a title or a letterhead, not data.
      // Merged first, so a dropped line reads as a sentence somebody can
      // check rather than as a hundred single characters.
      for (const r of mergeRuns(b.line.runs)) {
        orphans.push({ page: b.line.page, text: r.text, x: r.x, y: r.y });
      }
      continue;
    }
    if (b.cells.join('\u0000').toLowerCase() === headerKey) continue; // repeated on a later page
    if (filled(b.cells) === 0) continue;
    if (filled(b.cells) < 2 && starts.length > 2) {
      // A single value on its own line is a page number or a footnote far more
      // often than it is a row, and a row of one cell cannot be a component.
      ragged.push({ page: b.line.page, y: b.line.y, cells: filled(b.cells) });
      continue;
    }
    rows.push({ cells: b.cells, page: b.line.page, y: b.line.y });
  }

  return { header, rows, columnStarts: starts, orphans, ragged };
}
