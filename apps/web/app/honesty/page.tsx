import type { Metadata } from 'next';
import Link from 'next/link';
import baseline from '../../../../docs/coverage-baseline.json';
import published from '../../../../bench/identity/published.json';
import provenance from '../../../../fixtures/corpus/provenance.json';
import { SOURCE } from '../source';

export const metadata: Metadata = {
  title: 'What this does not do',
  description:
    'Measured limits: what share of SBOM components carry a usable identifier, how often this resolver declines to answer, and what no rule pack can tell you.',
};

interface Summary {
  n: number;
  purl: number;
  cpe: number;
  supplier: number;
  version: number;
  license: number;
  hash: number;
  files: number;
  with_deps: number;
  with_comp: number;
}

interface Row {
  resolver: string;
  precision: number;
  abstentionRate: number;
  unknownClass: number;
  unknownObserved: number;
  unknownFalsePositives: number;
}

export default function Honesty() {
  const s = baseline.summary as Summary;
  const all = (published.subsets as Record<string, Row[]>)['all'] as Row[];
  const ours = all.find((r) => r.resolver === 'stratifypro-deterministic')!;

  const share = (n: number): string => ((n / s.n) * 100).toFixed(1) + '%';

  // Derived, not written out. Two numbers on this page were prose the first
  // time ("21 different tools", when the corpus records 13 across 18 files),
  // which is the failure this page is named after.
  const entries = provenance as { file: string; tool?: string }[];
  const withTool = entries.filter((e) => typeof e.tool === 'string' && e.tool.trim() !== '');
  const distinctTools = new Set(withTool.map((e) => e.tool)).size;

  return (
    <main>
      <h1>What this does not do</h1>
      <p className="lede">
        Every number on this page was measured, and each one is a limit rather than a feature. A
        tool that only publishes what it is good at is asking to be taken on trust, and this one is
        asking to be checked.
      </p>

      <h2>What the files actually contain</h2>
      <div className="cover">
        <div className="big">
          {share(s.purl)} of components carry a package URL. {share(s.supplier)} name a supplier.
        </div>
        <div className="counts">
          {s.n.toLocaleString()} components across {s.files} real SBOMs
        </div>
        <div className="note">
          The first number is higher than this project assumed before measuring, and it is stated
          first for that reason. Package URLs are largely present. What is missing is everything
          else: supplier is an NTIA minimum element and appears on {share(s.supplier)} of
          components, and CPE, the identifier most published advisory data was matched on, appears
          on {share(s.cpe)}.
        </div>
        <div className="note">
          A component with neither a purl nor a CPE is invisible to every advisory database. No
          vulnerability tool can say anything true about it, including this one. That is a property
          of the files the industry produces rather than of any checker.
        </div>
      </div>

      <h2>Element by element</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Element</th>
              <th scope="col" className="num">Present</th>
              <th scope="col" className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Package URL', s.purl],
                ['CPE', s.cpe],
                ['Version', s.version],
                ['Supplier', s.supplier],
                ['License', s.license],
                ['Hash', s.hash],
              ] as [string, number][]
            ).map(([label, n]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td className="num">{n.toLocaleString()}</td>
                <td className="num">{share(n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="lede">
        {s.with_deps} of {s.files} files carry a dependency graph at all, and {s.with_comp} declare
        that graph incomplete. A file that is silent about its own completeness is the common case,
        not the exception.
      </p>
      <p className="lede">
        The corpus is {s.files} files. {withTool.length} of them record the tool that produced
        them, naming {distinctTools} distinct generator versions; {s.files - withTool.length}{' '}
        record nothing. It is a sample, and a small one. Treat these as the shape of the problem
        rather than as industry figures.
      </p>

      <h2>This resolver declines to answer most of the time</h2>
      <div className="cover">
        <div className="big">
          It abstains on {(ours.abstentionRate * 100).toFixed(1)}% of benchmark rows
        </div>
        <div className="note">
          When it does answer, it is right {(ours.precision * 100).toFixed(1)}% of the time, and it
          assigns an identifier to {ours.unknownFalsePositives} of the {ours.unknownClass}{' '}
          unknown-class rows, {ours.unknownObserved} of which are real components carrying no
          identifier and the rest names from which none can be recovered.
          Those three numbers are one decision: a wrong identifier produces a confident clean
          verdict on a component nobody identified, and an abstention produces a gap somebody can
          see. The full table, including the baselines that beat us on F1, is on{' '}
          <Link href="/bench">the benchmark page</Link>.
        </div>
      </div>

      <h2>What a passing check does not mean</h2>
      <dl className="fields">
        <div>
          <dt>Not a regulatory opinion</dt>
          <dd>
            No regulator has reviewed this tool. A rule pack is one reading of a published document,
            written down so you can disagree with it in specific places.
          </dd>
        </div>
        <div>
          <dt>Not a submission outcome</dt>
          <dd>
            Clearing every rule does not mean a submission will be accepted. The rules check what a
            document states, not whether what it states is true.
          </dd>
        </div>
        <div>
          <dt>Not a vulnerability report</dt>
          <dd>
            The free checker matches nothing against advisory sources. It reads your file against a
            rule pack and stops there.
          </dd>
        </div>
        <div>
          <dt>Not a claim your file is complete</dt>
          <dd>
            A rule can only see what is present. A component omitted from the file entirely is
            invisible to every rule in every pack, and no checker can tell you what is missing from
            a list it was handed.
          </dd>
        </div>
      </dl>

      <h2>Where the numbers come from</h2>
      <p className="lede">
        Coverage is <code>scripts/coverage.py</code> over {s.files} SBOMs, with its counting rules
        stated in its own docstring; NOASSERTION and NONE are not counted as values, which is what
        keeps the supplier figure at {share(s.supplier)} rather than the much higher number a
        non-empty check produces. It is re-checked by{' '}
        <code>scripts/coverage.py --check</code> inside <code>./verify.sh</code>, which fails the
        build if it stops reproducing.
      </p>
      <p className="lede">
        The resolver figures come from <code>bench/identity/published.json</code>, produced by{' '}
        <code>scripts/bench-publish.py</code> and re-checked by the same script in the CI build job
        and in <code>pnpm ci</code>. Not in <code>./verify.sh</code>: scoring the resolver needs
        built TypeScript and that script gates the build. This sentence used to say verify.sh
        checked both, which was not true of either half, on the page named for not doing that.
      </p>

      <footer>
        Measured {(baseline as { measuredAt?: string }).measuredAt ?? 'on an unrecorded date'}{' '}
        against the corpus in <code>fixtures/corpus</code>. The date comes from the file
        scripts/coverage.py writes, not from this sentence. These are numbers about a sample of
        real files, not about yours.
      </footer>
    </main>
  );
}
