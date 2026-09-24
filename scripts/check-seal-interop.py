#!/usr/bin/env python3
"""A sealed bundle verifies with tools that know nothing about this repository.

SPEC.md 2.5 accepts on one command: `cosign verify-blob` succeeds against the
published public key. That acceptance cannot be met by a test that signs with
our code and verifies with our code, because both halves can share a mistake
and still agree: signing the wrong bytes, hashing with the wrong algorithm, or
emitting a signature in a container nothing else reads all produce a perfectly
self-consistent seal that cosign would reject.

So this drives the real CLI end to end and hands the result to somebody else:

  1. `stratifypro keygen` writes an EC P-256 key pair.
  2. `stratifypro bundle --key` writes a sealed evidence bundle.
  3. OPENSSL verifies the seal, following README.txt's own instructions
     literally rather than a paraphrase of them.
  4. The fingerprint README.txt prints is recomputed by openssl and compared.
  5. One byte is added to the manifest and the verification must FAIL. Without
     this, step 3 would pass against a verifier that accepts anything.
  6. COSIGN does the same, when it is installed.

COSIGN IS OPTIONAL AND ITS ABSENCE IS REPORTED, NOT SWALLOWED. It is a 189 MB
binary and is not present on every machine. OpenSSL implements the same
primitive, so its verdict establishes the format; cosign establishes the
literal acceptance sentence. The script prints which of the two ran, so a
green line never implies more than what happened.

    python3 scripts/check-seal-interop.py
"""
import base64
import io
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CLI = os.path.join(ROOT, "apps", "cli", "dist", "index.js")
SAMPLE = os.path.join(ROOT, "fixtures", "corpus", "cyclonedx__ascii-boxes-sbom-cdx.json")


def run(cmd, **kw):
    return subprocess.run(cmd, cwd=ROOT, stdout=subprocess.PIPE,
                          stderr=subprocess.STDOUT, **kw)


def have(tool):
    return shutil.which(tool) is not None


def main():
    if not os.path.exists(CLI):
        print("  the CLI is not built; run pnpm build")
        return 1
    if not have("openssl") and not have("cosign"):
        print("  neither openssl nor cosign is available, so nothing independent can check")
        print("  the seal. This check cannot pass on this machine.")
        return 1

    work = tempfile.mkdtemp(prefix="seal-interop-")
    failures = []
    try:
        keys = os.path.join(work, "keys")
        p = run(["node", CLI, "keygen", "--out", keys])
        if p.returncode != 0:
            print(p.stdout.decode("utf-8", "replace")[-800:])
            return 1
        out = p.stdout.decode("utf-8", "replace")
        fingerprint = ""
        for line in out.splitlines():
            if "fingerprint:" in line:
                fingerprint = line.split("fingerprint:")[1].strip()
        if not fingerprint:
            print("  keygen printed no fingerprint")
            return 1

        priv = os.path.join(keys, "cosign.key")
        pub = os.path.join(keys, "cosign.pub")

        p = run(["node", CLI, "bundle", SAMPLE, "--out", work, "--key", priv])
        if p.returncode != 0:
            print(p.stdout.decode("utf-8", "replace")[-800:])
            return 1

        bundles = [d for d in os.listdir(work) if d.startswith("evidence-")]
        if len(bundles) != 1:
            print("  expected one bundle directory, found %r" % bundles)
            return 1
        bundle = os.path.join(work, bundles[0])
        manifest = os.path.join(bundle, "manifest.json")
        sig_b64 = os.path.join(bundle, "manifest.json.sig")
        if not os.path.exists(sig_b64):
            print("  the bundle carries no manifest.json.sig, so --key did nothing")
            return 1

        # README.txt must name the key a recipient has to fetch. A seal with no
        # stated fingerprint is a seal a recipient cannot tie to anybody.
        readme = io.open(os.path.join(bundle, "README.txt"), encoding="utf-8").read()
        if fingerprint not in readme:
            failures.append("README.txt does not name the signing key's fingerprint")

        sig_der = os.path.join(bundle, "manifest.sig.der")
        io.open(sig_der, "wb").write(
            base64.b64decode(io.open(sig_b64, encoding="utf-8").read().strip()))

        checked_by = []

        if have("openssl"):
            p = run(["openssl", "dgst", "-sha256", "-verify", pub,
                     "-signature", sig_der, manifest])
            if p.returncode != 0 or b"Verified OK" not in p.stdout:
                failures.append("openssl did not verify the seal: %s"
                                % p.stdout.decode("utf-8", "replace").strip()[:200])
            else:
                checked_by.append("openssl")

            # The fingerprint README.txt prints, recomputed by something else.
            der = run(["openssl", "pkey", "-pubin", "-in", pub, "-outform", "DER"])
            digest = run(["openssl", "dgst", "-sha256", "-r"], input=der.stdout)
            got = digest.stdout.decode("utf-8", "replace").split(" ")[0].strip()
            if got != fingerprint:
                failures.append("the fingerprint does not match openssl's: %s vs %s"
                                % (fingerprint, got))
        else:
            print("  openssl not found; skipping the openssl half")

        if have("cosign"):
            p = run(["cosign", "verify-blob", "--key", pub,
                     "--signature", sig_b64, manifest])
            if p.returncode != 0:
                failures.append("cosign did not verify the seal: %s"
                                % p.stdout.decode("utf-8", "replace").strip()[:300])
            else:
                checked_by.append("cosign")
        else:
            print("  cosign not installed; SPEC.md 2.5's literal acceptance sentence was")
            print("  not executed here. openssl implements the same primitive and did run.")

        # The negative case. Without it, everything above passes against a
        # verifier that accepts anything at all.
        original = io.open(manifest, "rb").read()
        io.open(manifest, "wb").write(original + b" ")
        caught = 0
        if have("openssl"):
            p = run(["openssl", "dgst", "-sha256", "-verify", pub,
                     "-signature", sig_der, manifest])
            if p.returncode == 0 and b"Verified OK" in p.stdout:
                failures.append("openssl accepted a manifest that had changed")
            else:
                caught += 1
        if have("cosign"):
            p = run(["cosign", "verify-blob", "--key", pub,
                     "--signature", sig_b64, manifest])
            if p.returncode == 0:
                failures.append("cosign accepted a manifest that had changed")
            else:
                caught += 1
        io.open(manifest, "wb").write(original)
        if caught == 0:
            failures.append("nothing rejected the altered manifest")

        if failures:
            for f in failures:
                print("  %s" % f)
            return 1
        print("  sealed bundle verified by: %s" % ", ".join(checked_by))
        print("  altered manifest rejected by all %d of them" % caught)
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
