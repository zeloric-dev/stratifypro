import type { Metadata } from 'next';
import data from '../../../../packages/eos/src/data/eos.json';

export const metadata: Metadata = {
  title: 'End-of-support dates',
  description:
    'End-of-support dates for the products that appear in real bills of material, every row with the URL it came from and the date it was read. And an honest account of how rarely one is available.',
};

interface Cycle {
  cycle: string;
  eol: string | boolean | null;
  lts: boolean;
  latest?: string | null;
}

interface Product {
  product: string;
  cycles: Cycle[];
  source: string;
  sourceName: string;
  sourceLicence: string;
  capturedAt: string;
}

interface Coverage {
  corpusFiles: number;
  distinctNames: number;
  distinctNamesWithData: number;
  componentInstances: number;
  componentInstancesWithData: number;
  method: string;
}

interface Dataset {
  capturedAt: string;
  source: { name: string; repository: string; licence: string };
  coverage: Coverage;
  matches: Record<string, string>;
  products: Product[];
}

const D = data as unknown as Dataset;

/**
 * Refuse to render a dataset that cannot be rendered truthfully.
 *
 * The same guard the crosswalk page carries, for the same reason. A page that
 * renders an empty or provenance-less dataset as a tidy table is worse than a
 * page that does not build: the reader gets a confident answer from nothing.
 */
function assertRenderable(d: Dataset): void {
  if (!d.products || d.products.length === 0) {
    throw new Error('eos.json carries no products; there is nothing to publish');
  }
  const naked = d.products.find((p) => !p.source || !p.capturedAt);
  if (naked) {
    throw new Error(`${naked.product} has no source or no capture date; a date with no provenance is a rumour`);
  }
  if (!d.coverage || !d.coverage.componentInstances) {
    throw new Error('eos.json states no coverage; the ceiling is the point and it must be published');
  }
}
assertRenderable(D);

const pct = (n: number, of: number): string => `${((100 * n) / of).toFixed(1)}%`;

/** A cycle's end of support, in words, keeping the three cases apart. */
function endOfSupport(c: Cycle): string {
  if (typeof c.eol === 'string') return c.eol;
  if (c.eol === true) return 'still supported, no date published';
  if (c.eol === false) return 'ended, no date published';
  return 'not stated';
}

export default function Page() {
  const products = [...D.products].sort((a, b) => a.product.localeCompare(b.product));
  const cov = D.coverage;

  return (
    <main>
      <h1>End-of-support dates</h1>

      <p className="lede">
        FDA asks for a software level of support and an end-of-support date for every component.
        Neither CycloneDX nor SPDX has a field for either, so both rule packs fire on their
        absence. This is the dataset that can sometimes answer them, and the first thing it says
        is how rarely that is.
      </p>

      <section>
        <h2>How little of a bill of materials this can reach</h2>
        <p>
          Measured across the {cov.corpusFiles} files in the public corpus, with deliberately
          generous matching:
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">Measured over</th>
              <th scope="col">Has a date here</th>
              <th scope="col">Total</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Distinct component names</th>
              <td>{cov.distinctNamesWithData}</td>
              <td>{cov.distinctNames}</td>
              <td>{pct(cov.distinctNamesWithData, cov.distinctNames)}</td>
            </tr>
            <tr>
              <th scope="row">Component instances</th>
              <td>{cov.componentInstancesWithData}</td>
              <td>{cov.componentInstances}</td>
              <td>{pct(cov.componentInstancesWithData, cov.componentInstances)}</td>
            </tr>
          </tbody>
        </table>
        <p>
          One component in forty. The reason is structural rather than a gap somebody can close
          by trying harder: the only public source tracks <strong>products</strong>, meaning
          operating systems, runtimes, databases and frameworks, and real bills of material are
          made of <strong>packages</strong>. The corpus is largely Go modules, npm packages and
          Maven artifacts, and nobody publishes an end-of-support date for{' '}
          <code>go.uber.org/atomic</code>.
        </p>
        <p>
          The {pct(cov.componentInstancesWithData, cov.componentInstances)} is not spread evenly,
          and that is the case for building this at all. What it reaches is OpenSSL, Debian,
          PostgreSQL, Elasticsearch, Rails. A device running an OpenSSL past its end of support is
          a finding a reviewer will raise. A Go module with no end-of-support date is not.
        </p>
        <p className="muted">{cov.method}</p>
      </section>

      <section>
        <h2>Three answers, and only one of them is a date</h2>
        <p>
          A release line here says one of three things, and they are kept apart rather than
          flattened into a single column. A published date is a date. <em>Still supported, no date
          published</em> means the source says the line is current and gives no end. <em>Ended, no
          date published</em> means support has stopped and no date was ever stated. Turning
          either of the last two into a date would invent a fact, and this dataset gets quoted in
          regulatory submissions.
        </p>
      </section>

      <section>
        <h2>The data</h2>
        <p>
          {products.length} products, every row carrying the URL it came from and the date it was
          read.
        </p>
        {products.map((p) => (
          <section key={p.product}>
            <h3>{p.product}</h3>
            <table>
              <thead>
                <tr>
                  <th scope="col">Release line</th>
                  <th scope="col">End of support</th>
                  <th scope="col">Long term</th>
                  <th scope="col">Latest</th>
                </tr>
              </thead>
              <tbody>
                {p.cycles.map((c) => (
                  <tr key={c.cycle}>
                    <th scope="row">
                      <code>{c.cycle}</code>
                    </th>
                    <td>{endOfSupport(c)}</td>
                    <td>{c.lts ? 'yes' : ''}</td>
                    <td>{c.latest ? <code>{c.latest}</code> : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted">
              Read from <code>{p.source}</code> on {p.capturedAt}.
            </p>
          </section>
        ))}
      </section>

      <section>
        <h2>Take it</h2>
        <p className="lede">
          Captured {D.capturedAt}. The machine readable copy is{' '}
          <code>packages/eos/src/data/eos.json</code> in the repository, rebuilt by{' '}
          <code>python3 scripts/eos-build.py --refresh</code>.
        </p>
        <p>
          <strong>Licensing, stated precisely rather than loosely.</strong> The end-of-support rows
          are {D.source.name}&apos;s work, published by them under {D.source.licence} at{' '}
          <code>{D.source.repository}</code>, and they keep that licence here. What is ours is the
          selection, the corpus matching and the coverage measurement above, and that is released
          under <strong>CC BY 4.0</strong>. Saying the whole thing is CC BY would be relicensing
          somebody else&apos;s data, which is not ours to do.
        </p>
        <p>
          A scheduled job re-reads every source URL each week and fails if an answer has moved or a
          page has gone. A capture date nobody re-checks is a timestamp on a claim that has quietly
          stopped being true.
        </p>
      </section>

      <footer>
        These are the dates the source publishes. They are not a statement about whether any
        particular device is supported, and no regulator has reviewed this.
      </footer>
    </main>
  );
}
