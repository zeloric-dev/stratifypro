import type { Metadata } from 'next';
import crosswalk from '../../../../docs/crosswalk/data/ai-sbom-crosswalk.json';

export const metadata: Metadata = {
  title: 'AI SBOM crosswalk',
  description:
    'The G7 AI bill of materials minimum elements mapped against CycloneDX 1.7 and SPDX 3.0.1, element by element, with the gaps named. CC BY 4.0.',
};

interface Mapping {
  fit: string;
  paths: string[];
}

interface Element {
  id: string;
  index: number;
  name: string;
  captures: string;
  statedConstraint?: string;
  conformance: string;
  mappings: Record<string, Mapping>;
  note?: string;
}

interface Cluster {
  name: string;
  elements: Element[];
}

interface Crosswalk {
  crosswalkVersion: string;
  compiled: string;
  conformanceNote: string;
  fitScale: Record<string, string>;
  targets: Record<string, unknown>;
  clusters: Cluster[];
}

const CW = crosswalk as unknown as Crosswalk;
const TARGETS = Object.keys(CW.targets);

/**
 * Refuse to render a crosswalk that cannot be rendered truthfully.
 *
 * The cell used to default a missing mapping to 'none', which fitScale defines
 * as "No representation at all". That is an assertion about a standard, made
 * from the absence of data. Deleting one mapping for SBOM author produced a
 * page stating SPDX has no representation for it, when it has a direct one, and
 * the headline tally silently summed to 49 instead of 50 because the tally used
 * a different default from the cell.
 *
 * At module scope, so it fails the build rather than shipping a false claim.
 */
const ALL_ELEMENTS = CW.clusters.flatMap((c) => c.elements);
for (const e of ALL_ELEMENTS) {
  for (const t of TARGETS) {
    const m = e.mappings[t];
    if (!m) throw new Error(`crosswalk: element ${e.id} has no mapping for ${t}`);
    if (!(m.fit in CW.fitScale)) {
      throw new Error(`crosswalk: element ${e.id} has fit "${m.fit}" for ${t}, which is not in fitScale`);
    }
  }
}
for (const t of TARGETS) {
  const summed = Object.keys(CW.fitScale).reduce(
    (n, fit) => n + ALL_ELEMENTS.filter((e) => e.mappings[t]!.fit === fit).length,
    0,
  );
  if (summed !== ALL_ELEMENTS.length) {
    throw new Error(`crosswalk: ${t} tallies to ${summed} of ${ALL_ELEMENTS.length} elements`);
  }
}

/** A fit is carried by its word, never by colour alone. design.md accessibility. */
function Fit({ fit }: { fit: string }) {
  return <span className={`chip fit-${fit}`}>{fit}</span>;
}

export default function CrosswalkPage() {
  const elements = ALL_ELEMENTS;
  // No optional chain: a missing mapping is impossible by the assertion above,
  // and writing it as if it were possible is what let the tally and the cell
  // disagree.
  const tally = (target: string, fit: string): number =>
    elements.filter((e) => e.mappings[target]!.fit === fit).length;

  return (
    <main>
      <h1>AI SBOM crosswalk</h1>
      <p className="lede">
        The {elements.length} G7 AI bill of materials minimum elements, mapped element by element
        against {TARGETS.join(' and ')}. Data only. No conformance policy is expressed here.
      </p>

      <div className="cover">
        <div className="big">
          {TARGETS.map((t) => (
            <div key={t}>
              {t}: {tally(t, 'direct')} direct, {tally(t, 'partial')} partial,{' '}
              {tally(t, 'properties-only')} properties only, {tally(t, 'none')} absent
            </div>
          ))}
        </div>
        <div className="note">{CW.conformanceNote}</div>
      </div>

      <h2>What the fits mean</h2>
      <dl className="fields">
        {Object.entries(CW.fitScale).map(([fit, meaning]) => (
          <div key={fit}>
            <dt>
              <Fit fit={fit} />
            </dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>

      {CW.clusters.map((cluster) => (
        <section key={cluster.name}>
          <h2>{cluster.name}</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Element</th>
                  {TARGETS.map((t) => (
                    <th scope="col" key={t}>
                      {t}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cluster.elements.map((e) => (
                  <tr key={e.id}>
                    <th scope="row">
                      {e.name}
                      <div className="meta">{e.captures}</div>
                      {e.note ? <div className="meta">{e.note}</div> : null}
                    </th>
                    {TARGETS.map((t) => {
                      const m = e.mappings[t]!;
                      return (
                        <td key={t}>
                          <Fit fit={m.fit} />
                          {m.paths?.length ? (
                            <div className="meta">
                              {m.paths.map((p) => (
                                <div key={p}>
                                  <code>{p}</code>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <h2>Take it</h2>
      <p className="lede">
        Version {CW.crosswalkVersion}, compiled {CW.compiled}, released under CC BY 4.0. The machine
        readable copies live at <code>docs/crosswalk/data/</code> as JSON and CSV, with the method
        in <code>docs/crosswalk/METHODOLOGY.md</code>. Corrections are the point: if a mapping here
        is wrong, the file to change is in the repository and the change is visible in its history.
      </p>

      <footer>
        This maps what each format can express. It does not say what any regulator requires, and no
        regulator has reviewed it.
      </footer>
    </main>
  );
}
