/**
 * The assertion operators, and one path shape that silently meant "no".
 *
 * SPEC.md step 2 asks for "unit tests covering each operator, including the
 * failure case for each", and there was no test file for assert.ts at all.
 * What prompted writing one was a defect rather than the gap: an assertion
 * path with a bracket anywhere after the first segment evaluated false
 * whatever the document contained.
 *
 * `has()` walked the path segment by segment, and on reaching a bracketed
 * segment handed the WHOLE expression back to the JSONPath walker, starting
 * from the node it had already walked to. `metadata.authors[*].name`
 * therefore looked for `metadata.authors[*].name` INSIDE `metadata`.
 *
 * The failure ran one way only, which is why it survived. A false assertion
 * means the rule fires, so a document that carried the element was reported as
 * missing it: a false "you have not met this requirement" on a regulatory
 * submission. No shipped rule used such a path, so no fixture caught it. The
 * G7 AI pack is full of them, because CycloneDX puts model facts three levels
 * down under `modelCard`.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evaluate } from './assert.js';

const DOC = {
  bomFormat: 'CycloneDX',
  version: 1,
  metadata: {
    authors: [{ name: 'Haldane Regulatory Affairs' }],
    component: { name: 'HX-4100', version: '2.1.0' },
    properties: [{ name: 'stratifypro:kind', value: 'device' }],
  },
  components: [
    {
      type: 'machine-learning-model',
      name: 'triage-net',
      hashes: [{ alg: 'SHA-256', content: 'a'.repeat(64) }],
      modelCard: {
        modelParameters: {
          approach: { type: 'supervised' },
          inputs: [{ format: 'image/dicom' }],
        },
      },
    },
    { type: 'data', name: 'corpus', data: [{ name: 'chest-xray', type: 'dataset' }] },
  ],
};

test('THE REGRESSION: a bracket after the first segment resolves', () => {
  // Each of these was false before the fix, whatever the document held.
  assert.equal(evaluate({ exists: 'metadata.authors[*].name' }, DOC, DOC), true);
  assert.equal(
    evaluate({ exists: 'modelCard.modelParameters.inputs[*].format' }, DOC.components[0], DOC),
    true,
  );
  assert.equal(
    evaluate({ exists: "components[?(@.type=='data')].data[*].name" }, DOC, DOC),
    true,
  );
});

test('and it still answers no when the thing really is absent', () => {
  // The other half. A fix that made every bracketed path true would pass the
  // test above and turn every rule into one that never fires, which is the
  // same defect pointing the other way.
  assert.equal(evaluate({ exists: 'metadata.authors[*].email' }, DOC, DOC), false);
  assert.equal(
    evaluate({ exists: 'modelCard.modelParameters.outputs[*].format' }, DOC.components[0], DOC),
    false,
  );
  assert.equal(evaluate({ exists: "components[?(@.type=='service')].name" }, DOC, DOC), false);
});

test('exists, on a plain path and on a missing one', () => {
  assert.equal(evaluate({ exists: 'bomFormat' }, DOC, DOC), true);
  assert.equal(evaluate({ exists: 'metadata.component.version' }, DOC, DOC), true);
  assert.equal(evaluate({ exists: 'metadata.component.supplier' }, DOC, DOC), false);
  assert.equal(evaluate({ exists: 'nothing.here.at.all' }, DOC, DOC), false);
});

test('an alternation passes when any branch does', () => {
  assert.equal(evaluate({ exists: 'nope|bomFormat' }, DOC, DOC), true);
  assert.equal(evaluate({ exists: 'nope|alsoNope' }, DOC, DOC), false);
});

test('a filter matches on the value it names, and not on another', () => {
  assert.equal(
    evaluate({ exists: "metadata.properties[?(@.name=='stratifypro:kind')]" }, DOC, DOC),
    true,
  );
  assert.equal(
    evaluate({ exists: "metadata.properties[?(@.name=='absent')]" }, DOC, DOC),
    false,
  );
});

test('allOf needs every branch, anyOf needs one, not inverts', () => {
  const yes = { exists: 'bomFormat' };
  const no = { exists: 'absent' };
  assert.equal(evaluate({ allOf: [yes, yes] }, DOC, DOC), true);
  assert.equal(evaluate({ allOf: [yes, no] }, DOC, DOC), false);
  assert.equal(evaluate({ anyOf: [no, yes] }, DOC, DOC), true);
  assert.equal(evaluate({ anyOf: [no, no] }, DOC, DOC), false);
  assert.equal(evaluate({ not: no }, DOC, DOC), true);
  assert.equal(evaluate({ not: yes }, DOC, DOC), false);
});

test('equals compares a field to a value', () => {
  assert.equal(evaluate({ equals: { bomFormat: 'CycloneDX' } }, DOC, DOC), true);
  assert.equal(evaluate({ equals: { bomFormat: 'SPDX' } }, DOC, DOC), false);
});

test('matches is a regular expression over the node', () => {
  const node = { name: 'ACME' };
  assert.equal(evaluate({ matches: '^[A-Z]{2,6}$' }, node.name, DOC), true);
  assert.equal(evaluate({ matches: '^[a-z]+$' }, node.name, DOC), false);
});

test('minLength counts a collection, and zero is not enough', () => {
  assert.equal(evaluate({ minLength: { field: 'components', min: 1 } }, DOC, DOC), true);
  assert.equal(evaluate({ minLength: { field: 'components', min: 99 } }, DOC, DOC), false);
  assert.equal(evaluate({ minLength: { field: 'services', min: 1 } }, DOC, DOC), false);
});

test('an empty value is not an existing one', () => {
  // The trap every SBOM checker hits: a field present and blank is how a
  // generator says nothing while appearing to answer.
  const blank = { a: '', b: [], c: null, d: 'x' };
  assert.equal(evaluate({ exists: 'a' }, blank, blank), false);
  assert.equal(evaluate({ exists: 'b' }, blank, blank), false);
  assert.equal(evaluate({ exists: 'c' }, blank, blank), false);
  assert.equal(evaluate({ exists: 'd' }, blank, blank), true);
});
