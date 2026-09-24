#!/usr/bin/env python3
"""Build the g7-ai-2026 rule pack and its fixtures from the crosswalk.

SPEC.md 3.1: "g7-ai-2026 rule pack, all 50 elements, built from the existing
crosswalk JSON". Generated rather than hand-written, for the reason the
crosswalk itself is generated from a spreadsheet: the source of truth is
docs/crosswalk/data/ai-sbom-crosswalk.json, and a hand-maintained copy of 50
elements drifts from it the first time an element is reworded.

WHAT IS GENERATED AND WHAT IS JUDGEMENT. The element id, name, what it
captures, its stated constraint and its format mappings all come from the
crosswalk verbatim. The selector, the assertion, the severity and the fix are
StratifyPro's judgement and live in the RULES table below, one entry per
element, so that a reviewer can read the translation from a crosswalk path to
a JSONPath in one place instead of inferring it from 50 files.

CYCLONEDX ONLY, FOR NOW, AND THE REASON IS MECHANICAL. The crosswalk maps 44
of the 50 elements into SPDX 3.0.1, and packages/engine reads SPDX 3 by
normalising it into the shape the rules address. packages/rules'
reference-engine.py evaluates a rule's selector against the RAW fixture file
and does not normalise, so an SPDX 3.0.1 fixture would match nothing and the
fixture proof would be a formality. CycloneDX 1.7 can express all 50 elements
-- the crosswalk records no `none` fit for it -- so the pack is complete
against the element list either way. Teaching the reference engine to
normalise is the next change, and the SPDX selectors land with it.

NO RULE MAY BE AN ERROR. The G7 document says of itself: "These minimum
elements are not mandatory; do not create requirements, standards, or
legislation." normativeLanguage is false, the loader refuses `error` on any
rule citing such a source, and this pack is the clearest case of that rule
working rather than failing.

    python3 scripts/build-g7-pack.py            # write the pack and fixtures
    python3 scripts/build-g7-pack.py --check    # fail if either has drifted
"""
import copy
import io
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CROSSWALK = os.path.join(ROOT, "docs", "crosswalk", "data", "ai-sbom-crosswalk.json")
PACK = os.path.join(ROOT, "packages", "rules", "packs", "g7-ai-2026.json")
FIXTURES = os.path.join(ROOT, "packages", "rules", "fixtures")

PACK_ID = "g7-ai-2026"
SOURCE_ID = "g7-ai-2026"

# Cluster id -> the middle segment of a rule id.
CLUSTER_CODE = {
    "metadata": "MD",
    "system-level-properties": "SYS",
    "models": "MOD",
    "datasets-properties": "DS",
    "infrastructure": "INF",
    "security-properties": "SEC",
    "key-performance-indicators": "KPI",
}

# Where the model and the dataset live in the fixture, so a break can name them.
MODEL_REF = "model-1"
DATASET_REF = "dataset-1"


def j(*parts):
    return "".join(parts)
