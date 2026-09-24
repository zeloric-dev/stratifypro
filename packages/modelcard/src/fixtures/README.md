# packages/modelcard/src/fixtures

One file, and it is a real published model rather than one this repository
wrote.

## stories15M-q4_0.metadata.gguf

| | |
|---|---|
| What | The first 723,798 bytes of a real GGUF model |
| Upstream | `https://huggingface.co/ggml-org/models/resolve/main/tinyllamas/stories15M-q4_0.gguf` |
| Full file | 19,077,344 bytes |
| This prefix | 723,798 bytes, being exactly the metadata block |
| SHA-256 | `c7e8af7862664bc3b66ed52981e9f21b0caaf172f6cbb786365a44f6eee0eb02` |

**Check it yourself.** The prefix is what a byte-range request returns, so the
claim is verifiable rather than asserted:

```bash
curl -sL -r 0-723797 \
  "https://huggingface.co/ggml-org/models/resolve/main/tinyllamas/stories15M-q4_0.gguf" \
  | sha256sum
# c7e8af7862664bc3b66ed52981e9f21b0caaf172f6cbb786365a44f6eee0eb02
```

## Why a prefix

GGUF is a metadata block followed by tensor weights. `packages/modelcard` reads
only the metadata, so the remaining 18 MB is weight data no test would touch.
The cut is at the exact byte the key-value block ends, which the reader
confirms: `metadataBytes` equals the file length, so this is a complete
metadata block rather than an arbitrary truncation.

## Why not a GGUF written here

Testing a reader against a writer in the same package proves the two agree and
nothing else. Every property of this file that made the reader harder to write
is a choice its producer made:

- **The tokenizer comes first.** `tokenizer.ggml.tokens` is 32,000 strings and
  466 KB, and it sits before `general.name`. A reader that gave up after a few
  kilobytes would find no model name and report a model that does not describe
  itself.
- **Key order is not the documented order.** `general.architecture` is the
  fifth key, not the first.
- **A real published model sets almost nothing.** Of the nine G7 model elements
  this generator can answer, this file answers two. No licence, no producer, no
  version, no description. A hand-written fixture would have had the four keys
  the code wanted, in the order it expected, and the generator's honest
  reporting of what is missing would never have been exercised.

That last point is the finding, not the inconvenience: the metadata a team
needs for a regulatory submission is mostly not in the file they ship.
