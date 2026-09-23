#!/usr/bin/env python3
"""No model call can reach a severity assignment, the attestation, or a bundle.

SPEC.md 2A.5, and SPEC.md's own words for it: "Write a CI job that fails the
build if the model module is reachable in the import graph from: the severity
assignment path, the attestation text, or the evidence bundle route. Then plant
a violating import and confirm it goes red."

THE WALL GOES UP BEFORE THE THING IT CONTAINS. The model tier is 2A.1 and does
not exist yet. That is the right moment to build this: a containment test
written after the thing it contains has to be written around whatever was
already done, and every exception it grants is one somebody already depends on.

WHY THESE THREE ROOTS AND NOT "THE PRODUCT".

  severity assignment   A severity is an argument about enforcement
                        consequence, made by a rule pack and defended in
                        writing by `severityJustification`. A model cannot make
                        that argument and must never appear to have made it.

  attestation text      SPEC.md Step 11 wording, which states what a record
                        does and does not claim. A generated variation of it is
                        a different legal representation.

  evidence bundle       What a firm hands to a regulator. Declared here before
                        it is built, so the wall is standing when 2.5 arrives
                        rather than being retrofitted around it.

WHAT COUNTS AS A MODEL CALL. Two things, and the second matters more today:

  1. Anything under the declared model tier path, which does not exist yet.
  2. Any known model SDK, by package name. This one bites NOW: an
     `import OpenAI from 'openai'` in the severity path fails the build today,
     before 2A.1 is written.

HOW THIS CAN LIE, AND WHAT IS DONE ABOUT IT. An import walker that silently
fails to resolve edges reports a clean graph because it walked almost nothing.
That is the failure this repository keeps meeting. So the walk reports how many
files and edges it resolved, refuses to pass if it resolved suspiciously few,
and names every import it could not resolve rather than dropping it.

    python3 scripts/check-model-boundary.py           check
    python3 scripts/check-model-boundary.py --graph   also print the roots' reach
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The protected entry points, by repository path. A path that does not exist
# yet is not an error: it is a wall waiting for its building.
ROOTS = [
    ("severity assignment", os.path.join("packages", "engine", "src", "check.ts")),
    ("attestation text", os.path.join("packages", "report", "src", "attestation.ts")),
    ("evidence bundle route", os.path.join("packages", "ledger", "src", "bundle.ts")),
]

# The model tier, which 2A.1 will create.
MODEL_TIER_PREFIXES = [
    os.path.join("packages", "resolve", "src", "model"),
    os.path.join("packages", "model"),
]

# Model SDKs by package name. This half of the wall is load-bearing today.
MODEL_PACKAGES = {
    "openai", "@anthropic-ai/sdk", "anthropic", "@google/generative-ai",
    "@azure/openai", "cohere-ai", "replicate", "@huggingface/inference",
    "langchain", "@langchain/core", "llamaindex", "ollama", "groq-sdk",
    "@mistralai/mistralai", "ai",
}

WORKSPACE = "@stratifypro/"

IMPORT_RE = re.compile(
    r"""(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*['"]([^'"]+)['"]"""
    r"""|(?:^|\n)\s*import\s*['"]([^'"]+)['"]"""
    r"""|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)""",
    re.MULTILINE,
)


def source_files():
    out = []
    for base in ("packages", "apps"):
        for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, base)):
            dirnames[:] = [d for d in dirnames
                           if d not in ("node_modules", "dist", "build", ".next", ".turbo")]
            for fn in filenames:
                if fn.endswith((".ts", ".tsx")) and not fn.endswith((".test.ts", ".test.tsx")):
                    out.append(os.path.join(dirpath, fn))
    return sorted(out)


def package_entry(spec):
    """Resolve a @stratifypro/x import, including a deep one.

    Deep imports are not unusual here and must not be dropped:
    `@stratifypro/rules/packs/fda-524b.json` names a file in a package that has
    no src/index.ts at all, because `rules` ships data rather than code. The
    first version of this resolver only looked for an entry point, reported six
    unresolved imports, and would have been tempting to silence by ignoring
    them. An import the wall cannot follow is a hole in the wall.
    """
    rest = spec[len(WORKSPACE):]
    name = rest.split("/")[0]
    subpath = rest[len(name) + 1:] if "/" in rest else ""

    for base in (os.path.join(ROOT, "packages", name), os.path.join(ROOT, "apps", name)):
        if not os.path.isdir(base):
            continue
        if subpath:
            for cand in (
                os.path.join(base, subpath),
                os.path.join(base, "src", subpath),
                os.path.join(base, subpath + ".ts"),
                os.path.join(base, "src", subpath + ".ts"),
            ):
                if os.path.exists(cand):
                    return cand
            return None
        entry = os.path.join(base, "src", "index.ts")
        if os.path.exists(entry):
            return entry
    return None


def resolve(spec, from_file):
    """A repo-relative path, the string 'external', or None when unresolvable."""
    if spec.startswith("."):
        base = os.path.normpath(os.path.join(os.path.dirname(from_file), spec))
        # TypeScript ESM imports name the .js that will exist after the build.
        for cand in (
            base,
            base[:-3] + ".ts" if base.endswith(".js") else None,
            base[:-4] + ".tsx" if base.endswith(".jsx") else None,
            base + ".ts",
            base + ".tsx",
            os.path.join(base, "index.ts"),
            base[:-5] + ".json" if base.endswith(".json") else None,
        ):
            if cand and os.path.exists(cand):
                return cand
        if base.endswith(".json") and os.path.exists(base):
            return base
        return None
    if spec.startswith(WORKSPACE):
        return package_entry(spec)
    return "external"


def main():
    files = source_files()
    edges = {}
    unresolved = []
    n_edges = 0

    for f in files:
        src = io.open(f, encoding="utf-8").read()
        targets = []
        for m in IMPORT_RE.finditer(src):
            spec = m.group(1) or m.group(2) or m.group(3)
            if not spec:
                continue
            n_edges += 1
            r = resolve(spec, f)
            if r is None:
                unresolved.append((os.path.relpath(f, ROOT), spec))
            else:
                targets.append((spec, r))
        edges[f] = targets

    # A walker that resolved almost nothing would report every wall intact.
    if n_edges < 50:
        print("    FAILED: only %d imports found across %d files; the walk is not working"
              % (n_edges, len(files)))
        return 1

    def reach(start):
        """Every file reachable from start, with the spec that got there."""
        seen, stack, external = {start: None}, [start], []
        while stack:
            cur = stack.pop()
            for spec, target in edges.get(cur, []):
                if target == "external":
                    external.append((cur, spec))
                    continue
                if target not in seen:
                    seen[target] = cur
                    stack.append(target)
        return seen, external

    fail = 0
    print("    %d source files, %d imports resolved" % (len(files), n_edges - len(unresolved)))

    for label, rel in ROOTS:
        path = os.path.join(ROOT, rel)
        if not os.path.exists(path):
            print("    %-22s not built yet; the wall is declared and waiting" % label)
            continue
        seen, external = reach(path)

        # (1) the model tier, by path
        for f in seen:
            r = os.path.relpath(f, ROOT)
            for prefix in MODEL_TIER_PREFIXES:
                if r.startswith(prefix):
                    print("    FAILED: %s reaches the model tier at %s" % (label, r))
                    fail = 1

        # (2) a model SDK, by package name
        for f, spec in external:
            head = spec if not spec.startswith("@") else "/".join(spec.split("/")[:2])
            if head in MODEL_PACKAGES or spec in MODEL_PACKAGES:
                print("    FAILED: %s reaches %r from %s"
                      % (label, spec, os.path.relpath(f, ROOT)))
                fail = 1

        if not fail:
            print("    %-22s %3d modules reachable, none of them a model" % (label, len(seen)))
        if "--graph" in sys.argv:
            for f in sorted(seen):
                print("        %s" % os.path.relpath(f, ROOT))

    if unresolved:
        # Named rather than dropped. An import this cannot follow is a hole in
        # the wall, and a silent hole is the whole problem.
        print("    %d import(s) could not be resolved, so they were not followed:" % len(unresolved))
        for f, spec in unresolved[:10]:
            print("        %s -> %s" % (f, spec))
        fail = 1

    if fail:
        return 1
    print("    no model call reaches a severity assignment, the attestation, or a bundle")
    return 0


if __name__ == "__main__":
    sys.exit(main())
