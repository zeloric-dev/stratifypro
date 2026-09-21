# Contributing

The point of publishing a crosswalk is to have it corrected.

## Correcting a mapping

Open an issue with:

1. The element ID, for example `models.model-hash-algorithm`.
2. Which format you are correcting.
3. The path you would use instead, exactly as it appears in the schema.
4. Why. A link to the schema line or the model source is ideal.

Mapping disagreements are expected and welcome. The ratings most likely to be wrong are the `partial` ones, because that rating covers a lot of ground.

## Adding a format

If you want to map a third format, open an issue before doing the work so we can agree the shape. Each target lives under `targets` in the JSON with its own key and version, and each element gets a matching entry under `mappings`.

## What will not be merged

- **Conformance levels.** The source specification assigns none. Adding required or optional flags would be inventing a standard rather than mapping one. If you need a policy, layer it on top in your own tool and say it is yours.
- **Mappings to free-text fields that do not name the concept.** Almost anything can be crammed into a description string. That is not a mapping.
- **Ratings without a schema path.** If you cannot point at the field, it is not `direct` or `partial`.

## Editing the data

`data/ai-sbom-crosswalk.json` is the source of record. The CSV is generated from it. Please edit the JSON and note in your pull request that the CSV needs regenerating.
