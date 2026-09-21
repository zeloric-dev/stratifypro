import type { Metadata } from 'next';
import Link from 'next/link';
import { explainRule } from '@stratifypro/engine';
import { PACKS } from '../packs';

export const metadata: Metadata = {
  title: 'Rules',
  description: 'Every rule in every pack, with its severity and the clause it comes from.',
};

export default function RulesIndex() {
  return (
    <main>
      <h1>Rules</h1>
      <p className="lede">
        Every rule carries a written justification for its severity and names the clause it comes
        from. A rule whose severity rests on nothing is the error this project was built to avoid
        repeating.
      </p>

      {PACKS.map((pack) => (
        <section key={pack.id}>
          <h2>
            {pack.title} <span className="meta">{pack.id} {pack.version}</span>
          </h2>
          <table className="rules">
            <thead>
              <tr>
                <th scope="col">Rule</th>
                <th scope="col">Severity</th>
                <th scope="col">Source</th>
              </tr>
            </thead>
            <tbody>
              {pack.rules.map((r) => {
                // Through explainRule, like /rules/<id>. This cell read
                // r.sourceDocument directly while the detail page rendered
                // "document: clause" from the shared view, which is two
                // renderings of one field shipping in the same commit as the
                // check meant to prevent exactly that. The check did not scan
                // this file.
                const view = explainRule(r, pack);
                const source = view.fields.find((f) => f.label === 'Source')?.value ?? '';
                return (
                  <tr key={r.id}>
                    <th scope="row">
                      <Link href={`/rules/${r.id}`}>{r.id}</Link>
                      <div className="meta">{r.title}</div>
                    </th>
                    <td>
                      <span className={`chip sev-${r.severity}`}>{r.severity}</span>
                    </td>
                    <td className="meta">{source}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <footer>
        No regulator has reviewed this tool. A rule passing does not mean a submission will be
        accepted.
      </footer>
    </main>
  );
}
