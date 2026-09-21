import type { Metadata } from 'next';
import published from '../../../../bench/identity/published.json';

export const metadata: Metadata = {
  title: 'Identity benchmark',
  description:
    'Four baselines and this resolver, scored on the same rows by the same scorer. The result is published whichever way it goes.',
};

interface Row {
  resolver: string;
  rows: number;
  answered: number;
  precision: number;
  recall: number;
  f1: number;
  abstentionRate: number;
  unknownClass: number;
  unknownObserved: number;
  unknownDerived: number;
  unknownCorrectlyAbstained: number;
  unknownFalsePositives: number;
}

const SUBSETS: { key: 'clean' | 'perturbed' | 'all'; label: string; what: string }[] = [
  {
    key: 'clean',
    label: 'Clean',
    what: 'Names exactly as their tools wrote them, with no perturbation applied.',
  },
  {
    key: 'perturbed',
    label: 'Perturbed',
    what: 'The same names after one of seven documented shape changes: an archive extension, a vendor prefix, a parenthetical, a case change, added spaces, a version, or a stripped path.',
  },
  {
    key: 'all',
    label: 'All rows',
    what: 'Both of the above together. This is the headline set.',
  },
];

const OURS = 'stratifypro-deterministic';

function pct(n: number): string {
  return (n * 100).toFixed(1) + '%';
}

function Table({ rows }: { rows: Row[] }) {
  // Ties are ties. A reduce keeping the first on equality decided the badge by
  // the order of run.py's BASELINES list, and the clean subset has one:
  // normalised-match and prefix-strip both score 0.1641. Badging one of them
  // told a reader it was the stronger baseline when it is not.
  const others = rows.filter((r) => r.resolver !== OURS);
  const bestF1 = Math.max(...others.map((r) => r.f1));
  const isBest = (r: Row): boolean => r.resolver !== OURS && r.f1 >= bestF1 - 1e-9;
  const tied = others.filter(isBest).length > 1;
  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th scope="col">Resolver</th>
            <th scope="col" className="num">Precision</th>
            <th scope="col" className="num">Recall</th>
            <th scope="col" className="num">F1</th>
            <th scope="col" className="num">Abstained</th>
            <th scope="col" className="num">Wrong on unknowns</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.resolver}>
              <th scope="row">
                {r.resolver === OURS ? <b>StratifyPro</b> : r.resolver}
                {isBest(r) ? (
                  <span className="meta"> {tied ? 'best baseline, tied' : 'best baseline'}</span>
                ) : null}
              </th>
              <td className="num">{r.precision.toFixed(3)}</td>
              <td className="num">{r.recall.toFixed(3)}</td>
              <td className="num">{r.f1.toFixed(4)}</td>
              <td className="num">{pct(r.abstentionRate)}</td>
              <td className="num">{r.unknownFalsePositives}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Bench() {
  const subsets = published.subsets as Record<string, Row[]>;
  const all = subsets['all'] as Row[];
  const ours = all.find((r) => r.resolver === OURS)!;
  const others = all.filter((r) => r.resolver !== OURS);
  const bestF1 = Math.max(...others.map((r) => r.f1));
  const best = others.find((r) => r.f1 >= bestF1 - 1e-9)!;
  // Derived, not asserted. This page said "We lose on the headline metric" in
  // prose beside a number read from a file, so a wrong file would have produced
  // a page claiming to lose while showing a winning score.
  const weLose = ours.f1 < bestF1;

  return (
    <main>
      <h1>Identity benchmark</h1>
      <p className="lede">
        Resolving a component name written one way to the identifier an advisory database uses.
        Four baselines and this resolver, scored on the same rows by the same scorer.
      </p>

      <div className="cover">
        <div className="big">
          Our F1 is {ours.f1.toFixed(4)}. The best baseline is {bestF1.toFixed(4)}.
        </div>
        <div className="note">
          {weLose
            ? 'We lose on the headline metric. The result is published because a benchmark whose author always comes first is marketing, and worth nothing as evidence.'
            : 'We are ahead on the headline metric here. The same page would be published either way: a benchmark whose author always comes first is marketing, and worth nothing as evidence.'}
        </div>
        <div className="note">
          What we win on is the column on the right. Across all rows this resolver assigns an
          identifier to {ours.unknownFalsePositives} of the {ours.unknownClass} unknown-class rows.{' '}
          {best.resolver} assigns one to {best.unknownFalsePositives}. In a tool whose output is
          submission evidence, a confident wrong identifier produces a clean vulnerability verdict
          for a component nobody actually identified, and that is a worse failure than declining to
          answer.
        </div>
        <div className="note">
          Those {ours.unknownClass} rows are not {ours.unknownClass} components.{' '}
          {ours.unknownObserved} are real components from the corpus that carry no identifier at
          all. The other {ours.unknownDerived} are path-stripped names built from components that
          do have one, where the identifier cannot be recovered from the final segment alone. Both
          are rows a resolver must decline, and the smaller number is the one to quote.
        </div>
      </div>

      <h2>What the columns mean</h2>
      <dl className="fields">
        <div>
          <dt>Precision</dt>
          <dd>
            Of the answers given, how many were right. An abstention is never counted as a wrong
            answer.
            <div className="note">
              Ours is {ours.precision.toFixed(3)} on every subset. That is the number this product
              is built around.
            </div>
          </dd>
        </div>
        <div>
          <dt>Recall</dt>
          <dd>Of the rows with a right answer available, how many were answered correctly.</dd>
        </div>
        <div>
          <dt>F1</dt>
          <dd>
            The harmonic mean of the two, which weights them equally.
            <div className="note">
              We do not think they are equal here, and saying so while losing on F1 is the only
              honest order to say it in.
            </div>
          </dd>
        </div>
        <div>
          <dt>Abstained</dt>
          <dd>
            How often the resolver declined to answer. High abstention is the cost of high
            precision, and it is a deliberate one.
          </dd>
        </div>
        <div>
          <dt>Wrong on unknowns</dt>
          <dd>
            How many rows with no correct identifier were nonetheless assigned one.
            <div className="note">
              The benchmark has an unknown class for exactly this. A resolver that always guesses
              scores well on the other columns and fails here.
            </div>
          </dd>
        </div>
      </dl>

      {SUBSETS.map((s) => (
        <section key={s.key}>
          <h2>{s.label}</h2>
          <p className="lede">{s.what}</p>
          <Table rows={subsets[s.key] as Row[]} />
        </section>
      ))}

      <h2>Reproducing this</h2>
      <p className="lede">
        The dataset is generated, not committed by hand:{' '}
        <code>python3 bench/identity/build.py</code> rebuilds it and{' '}
        <code>--check</code> fails if it would change. <code>scripts/bench-publish.py</code>{' '}
        produces this page&rsquo;s numbers by emitting one prediction per row and scoring them with{' '}
        <code>bench/identity/run.py</code>, the same scorer that produced the baselines. There is
        deliberately no second scorer.
      </p>

      <footer>
        {ours.rows.toLocaleString()} rows. No regulator has reviewed this tool. A benchmark score is
        not a claim about any particular file.
      </footer>
    </main>
  );
}
