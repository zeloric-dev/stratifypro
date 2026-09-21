import type { Metadata } from 'next';
import Link from 'next/link';
import { AnswerCard } from '../../Answer';
import { indexedNames, slugPath, unslug } from '../../names';
import { answer } from '../../resolver';

/**
 * A permanent, indexable page per component name.
 *
 * A file upload is not shareable. A resolved name is. These pages answer the
 * questions people already type into a search box, and they are citable, which
 * is the evidence class that is hardest to manufacture any other way.
 */
/**
 * Prerendered for every name that has an answer.
 *
 * 444 of the 1,854 dictionary aliases resolve. The rest still render on request
 * and still say why they could not be identified; they are simply not asked to
 * be indexed. See indexedNames.
 */
export function generateStaticParams(): { slug: string[] }[] {
  return indexedNames().map((name) => ({ slug: slugPath(name) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const name = unslug(slug);
  const a = answer(name);
  return {
    title: a.resolution ? `${name} is ${a.resolution.purlBase}` : `${name} could not be identified`,
    description: a.resolution
      ? `${name} resolves to ${a.resolution.purlBase}, established by ${a.resolution.method}.`
      : `${name} could not be resolved to a canonical identifier. ${a.reason ?? ''}`,
  };
}

export default async function NamePage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const name = unslug(slug);
  const a = answer(name);

  return (
    <main>
      <h1>{name}</h1>
      <p className="lede">
        {a.resolution
          ? 'This name resolves to a canonical identifier. The method below is how, and it is the whole of the confidence claim.'
          : 'This name could not be resolved. That is a stated result, not a missing one.'}
      </p>

      <AnswerCard answer={a} />

      <h2>What this page is</h2>
      <p className="lede">
        A permanent record of how this tool reads one component name, so the answer can be
        linked to and checked rather than taken on trust. Resolution is deterministic: the
        same name gives the same answer, and the method says which evidence produced it.
      </p>

      <p className="meta">
        <Link href="/">Resolve another name</Link>
      </p>

      <footer>
        Checks against published minimum elements. No regulator has reviewed this tool.
      </footer>
    </main>
  );
}
