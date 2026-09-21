'use client';

import { useState } from 'react';
import { AnswerCard } from './Answer';
import { answer, EXAMPLES, FIRST_PAINT, type Answer as A } from './resolver';

/**
 * The entry point: one box, one answer, no account and no upload.
 *
 * The result for FIRST_PAINT is computed during render, so the page arrives
 * with a real answer already on screen. A new user must never meet an empty
 * box asking them to do work, and the cheapest way to break that rule is to
 * initialise this state to null.
 */
export function Checker() {
  const [value, setValue] = useState<string>(FIRST_PAINT);
  const [result, setResult] = useState<A>(() => answer(FIRST_PAINT));

  function run(next: string) {
    setValue(next);
    setResult(answer(next));
  }

  return (
    <>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(value);
        }}
      >
        <label htmlFor="component" className="visually-hidden" style={{ position: 'absolute', left: '-9999px' }}>
          Component name
        </label>
        <input
          id="component"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Apache Log4j (core) 2.14"
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit">Resolve</button>
      </form>

      <AnswerCard answer={result} />

      <div className="examples">
        Try:{' '}
        {EXAMPLES.map((ex) => (
          <button key={ex} type="button" onClick={() => run(ex)}>
            {ex}
          </button>
        ))}
      </div>
    </>
  );
}
