import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { explainRule } from '@stratifypro/engine';
import { allRules, findRule } from '../../packs';

/**
 * One rule, rendered from the same source the CLI prints.
 *
 * Doc 3 flow C: "`explain <ruleId>` in the CLI and `/rules/<ruleId>` on the web
 * render the same content from the same source. Two renderings of one rule is
 * the drift pattern this project has already been bitten by twice." Neither
 * surface holds a field list; both walk explainRule's.
 */
export function generateStaticParams(): { id: string }[] {
  return allRules().map(({ rule }) => ({ id: rule.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const found = findRule(id);
  if (!found) return { title: 'Unknown rule' };
  // Through the view, like everything else on this page. Reaching into the rule
  // for one convenient string is exactly how two renderings of one rule start.
  const view = explainRule(found.rule, found.pack);
  const why = view.fields.find((f) => f.label === 'Severity')?.note ?? view.title;
  return {
    title: `${view.ruleId}: ${view.title}`,
    description: why.slice(0, 180),
  };
}

export default async function RulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = findRule(id);
  if (!found) notFound();

  const view = explainRule(found.rule, found.pack);

  return (
    <main>
      <p className="meta">
        <Link href="/rules">All rules</Link>
      </p>
      <h1>
        {view.ruleId} <span className={`chip sev-${view.severity}`}>{view.severity}</span>
      </h1>
      <p className="lede">{view.title}</p>
      <p className="meta">
        Pack <code>{view.packId}</code> {view.packVersion}
      </p>

      <dl className="fields">
        {view.fields.map((f) => (
          <div key={f.label}>
            <dt>{f.label}</dt>
            <dd>
              {f.mono ? <code>{f.value}</code> : f.value}
              {f.note ? <div className="note">{f.note}</div> : null}
            </dd>
          </div>
        ))}
      </dl>

      <h2>Check a file against this</h2>
      <p className="lede">
        <code>
          npx stratifypro check sbom.json --pack {view.packId}
        </code>
        <br />
        <code>npx stratifypro explain {view.ruleId} --pack {view.packId}</code> prints this page.
      </p>

      <footer>
        This rule and its justification come from the source named above. No regulator has reviewed
        this tool, and a rule passing does not mean a submission will be accepted.
      </footer>
    </main>
  );
}
