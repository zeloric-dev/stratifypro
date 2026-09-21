import Link from 'next/link';
import { slugify } from './names';
import { METHOD_EXPLAINS, type Answer } from './resolver';

/**
 * One resolution, shown with its evidence.
 *
 * No confidence percentage. The benchmark measures precision, recall, F1 and
 * abstention; it does not measure calibration, so a displayed "73%" would
 * assert a calibrated probability to a regulatory reader that nothing here
 * supports. The method is strictly more informative and it is defensible.
 */
export function AnswerCard({ answer }: { answer: Answer }) {
  const { input, resolution, reason } = answer;

  if (!resolution) {
    return (
      <div className="card">
        <div className="purl">{input}</div>
        <p className="abstain-why">
          <span className="chip m-abstain">could not identify</span>
        </p>
        <p className="abstain-why">{reason}</p>
        <p className="meta">
          That is an answer, not a failure. A component we cannot identify is one we will not
          claim to have checked against advisory sources.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="purl">{resolution.purlBase}</div>
      <p className="meta">
        <span className={`chip m-${resolution.method}`}>{resolution.method}</span>{' '}
        {METHOD_EXPLAINS[resolution.method]}
      </p>
      <p className="meta">
        Matched on <code>{resolution.matchedOn}</code>
        {resolution.observations > 0
          ? `, seen ${resolution.observations} ${resolution.observations === 1 ? 'time' : 'times'} in the corpus`
          : null}
        {' · '}
        <Link href={`/name/${slugify(input)}`}>permanent link</Link>
      </p>
    </div>
  );
}
