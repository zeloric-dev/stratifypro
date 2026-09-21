# fixtures/corpus

21 real SBOMs, 5,088 components. **Never edit these files.** Their bytes are the
evidence, and `verify.sh` recomputes every SHA-256 against `provenance.json`.

`.gitattributes` excludes this directory from line-ending conversion. Without that, a
clone on Windows rewrites the bytes and all 21 hashes break, which reads as corruption
rather than as the checkout doing what it was configured to do.

## What provenance.json records

| Field | Meaning |
|---|---|
| `file`, `format`, `spec` | The document and which standard it follows |
| `components`, `bytes`, `sha256` | Measured, recomputed on every run |
| `tool` | What generated the SBOM, read from the artifact's own declaration |
| `upstream` | Where this exact file came from, **proved by hash** |
| `upstreamVerified` | How and when that proof was obtained |

## The standard for `upstream`

**A plausible source is not provenance.** Knowing that Grype lives on GitHub does not
establish that this file came from there.

A URL is recorded only when the bytes downloaded from it hash to the SHA-256 already
recorded for that file. That makes the claim checkable by anyone:

```bash
curl -sL -o /tmp/candidate "$URL"
sha256sum /tmp/candidate     # must equal provenance.json's sha256 for that file
```

Four files were verified this way on 20 September 2026, all Flux controllers, each an
exact match at the byte level.

## Why 14 are still empty, and how to finish them

Not for lack of trying. What was attempted, and what it found:

- **Guessed release URLs.** Worked for the four Flux controllers. Returned 404 for
  kawipiko, harp and the guessed jx versions.
- **The GitHub releases API**, querying each repository for an asset matching the
  corpus filename. `volution/kawipiko`, `ascii-boxes/boxes` and
  `joeferner/redis-commander` publish no SBOM asset at all.
- **Dating the artifact from its own contents.** The jx document records
  `created: 2022-11-22T06:18:08Z`, and jx release v3.10.16 was published ten minutes
  earlier, which looked conclusive. The asset 404s: jx did not attach SBOMs to releases
  until the v3.17 series.

That last result is the useful one. **Some of these files were probably generated
locally rather than downloaded**, with syft or an equivalent, from an artifact the
collector had on disk. If so there is no upstream URL to find, and the honest record is
not a URL at all but a note saying how the file was produced and from what.

Only the person who assembled this corpus knows which files those are. Until they say,
each of those fields carries an explicit declaration that it is not known, rather than a
blank. See "Stated gaps, not silent ones" below for how that is recorded and enforced.

Be clear about what that does and does not mean. The repository claims every number is
re-runnable by a third party. For these 14 files that is still not true, and no
bookkeeping changes it. What changed is that the shortfall is now stated, counted and
checked instead of sitting invisibly in an empty string.

- **harp** is close. `elastic/harp` publishes `harp-darwin-amd64.sbom.json.tar.gz`,
  a compressed form of the file here. Extract it and compare hashes to finish that one.

## Stated gaps, not silent ones

The 14 unresolved `upstream` fields and 3 unresolved `tool` fields are recorded as
`null` with an `upstreamUnknown` / `toolUnknown` reason, not left blank.

That distinction is the whole point of rule CISA-PR-004 in this repository, which grades
an SBOM on whether it states its gaps or leaves them silent. Holding our own records to a
weaker standard than the documents we grade would be indefensible.

`check-claims.py` enforces it in both directions:

- a blank field fails, and so does a declaration with an empty reason
- a stated gap passes, and the count of stated gaps is itself asserted at
  `upstream=14, tool=3`

So the gaps are countable and greppable rather than invisible, and the count cannot drift
upward without a check going red. **This is not the same as having the provenance.** It is
an honest record of not having it. Replace each declaration with a hash-verified URL as
they are established, and lower the asserted count as you go.
