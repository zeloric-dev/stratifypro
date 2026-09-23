#!/usr/bin/env python3
"""Regenerate the PDF fixtures with real PDF producers.

NOT RUN BY CI, and not expected to succeed everywhere. It needs Chrome, and
the Excel fixture needs Excel on Windows. That is the point: the fixtures are
committed precisely because they cannot be produced on demand, and a fixture a
developer can regenerate from a script they wrote is a fixture that tests the
script.

WHY TWO PRODUCERS. Chrome's Skia writes PDF 1.4 with a classic cross-reference
table and CID fonts. Excel writes PDF 1.7 with cross-reference streams and
object streams, and it CLIPS text that overflows a cell rather than shortening
it. The second one earned its place: it is what showed that sorting a line's
text by horizontal position interleaves an overflowing cell with its
neighbours, so the first component's supplier came out as
"The OpenSSApL Pachrojece-2t.0". Nothing in the Chrome file could reveal that,
because Chrome never overflows a cell.

The Excel fixture is packages/draft's own supplier.xlsx, printed to PDF, so one
test can assert that the same sheet read as xlsx and as PDF gives the same
components.

THE OUTPUT IS NOT BYTE-REPRODUCIBLE. Both producers stamp a creation time and a
document identifier, so a regenerated fixture never matches the committed one
byte for byte. The suite passes on either, which is the useful property: it
means the tests are pinned to what the reader extracts and not to one exact
sequence of bytes that happened to be committed.

    python3 scripts/make-pdf-fixtures.py
"""
import base64
import io
import os
import shutil
import struct
import subprocess
import sys
import tempfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "packages", "pdf", "src", "fixtures")
XLSX = os.path.join(ROOT, "packages", "draft", "src", "fixtures", "supplier.xlsx")

CHROMES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]

STYLE = """
body { font-family: Arial, Helvetica, sans-serif; font-size: 10pt; margin: 20mm; }
h1 { font-size: 14pt; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #999; padding: 4px 8px; text-align: left; }
th { background: #eee; }
"""

PARTS = [
    ("openssl", "3.0.11", "The OpenSSL Project", "Apache-2.0"),
    ("zlib", "1.2.13", "Jean-loup Gailly", "Zlib"),
    ("libcurl", "8.4.0", "Haxx AB", "curl"),
    ("FreeRTOS", "10.5.1", "Amazon Web Services", "MIT"),
    ("lwIP", "2.1.3", "Swedish Institute of Computer Science", "BSD-3-Clause"),
    ("mbedTLS", "3.4.1", "Arm Limited", "Apache-2.0"),
    ("SQLite", "3.43.2", "Hwaci", "blessing"),
    ("libpng", "1.6.40", "PNG Development Group", "libpng-2.0"),
    ("Newlib", "4.3.0", "Red Hat", "BSD-3-Clause"),
    ("STM32Cube HAL", "1.28.0", "STMicroelectronics", "BSD-3-Clause"),
    ("TinyUSB", "0.15.0", "Ha Thach", "MIT"),
    ("CMSIS", "5.9.0", "Arm Limited", "Apache-2.0"),
    ("protobuf-c", "1.4.1", "Dave Benson", "BSD-2-Clause"),
    ("wolfSSL", "5.6.4", "wolfSSL Inc", "GPL-2.0-or-later"),
    ("littlefs", "2.8.1", "Arm Limited", "BSD-3-Clause"),
    ("cJSON", "1.7.16", "Dave Gamble", "MIT"),
    ("micro-ecc", "1.0", "Ken MacKay", "BSD-2-Clause"),
    ("nanopb", "0.4.7", "Petteri Aimonen", "Zlib"),
    ("u8g2", "2.34.22", "Oliver Kraus", "BSD-2-Clause"),
    ("SEGGER RTT", "7.92", "SEGGER Microcontroller", "SEGGER-BSD"),
    ("Unity", "2.5.2", "ThrowTheSwitch", "MIT"),
    ("libsodium", "1.0.19", "Frank Denis", "ISC"),
    ("tinycbor", "0.6.0", "Intel Corporation", "MIT"),
    ("Mongoose", "7.12", "Cesanta Software", "GPL-2.0-only"),
]


def parts_html():
    rows = "\n".join("<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>" % p for p in PARTS)
    return """<!doctype html><meta charset="utf-8"><style>%s</style>
<h1>Software Bill of Materials</h1>
<p>Haldane Instruments Ltd, model HX-4100 infusion controller, firmware 4.2.0.</p>
<table>
<thead><tr><th>Component Name</th><th>Version</th><th>Supplier</th><th>License</th></tr></thead>
<tbody>%s</tbody>
</table>
""" % (STYLE, rows)


def prose_html():
    """A document with no table. The reader must not invent one."""
    return """<!doctype html><meta charset="utf-8"><style>%s</style>
<h1>Supplier declaration</h1>
<p>Haldane Instruments Ltd confirms that the HX-4100 infusion controller is built
from commercially available components. A detailed parts list is available on
request from your account manager.</p>
<p>This declaration is provided for information only and does not constitute a
software bill of materials as defined by the Cybersecurity and Infrastructure
Security Agency.</p>
""" % STYLE


def scan_html():
    """Ink and no text: a PDF of a scan, which must be refused."""
    return """<!doctype html><meta charset="utf-8">
<body style="margin:0"><img src="data:image/png;base64,%s" style="width:100%%">
""" % base64.b64encode(bars_png()).decode("ascii")


def bars_png():
    """A greyscale PNG of horizontal bars. Looks like lines of type, is not."""
    w, h = 600, 800
    rows = []
    for y in range(h):
        row = bytearray([0])  # PNG filter type 0
        for x in range(w):
            bar = (y // 24) % 2 == 0 and 40 < x < 560 and (y % 24) < 14
            row.append(60 if bar else 255)
        rows.append(bytes(row))

    def chunk(tag, data):
        return (struct.pack(">I", len(data)) + tag + data
                + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))

    return (b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 0, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
            + chunk(b"IEND", b""))


def find_chrome():
    for c in CHROMES:
        if os.path.exists(c):
            return c
    return shutil.which("google-chrome") or shutil.which("chromium")


def print_with_chrome(chrome, html, dest):
    tmp = tempfile.mkdtemp()
    try:
        src = os.path.join(tmp, "page.html")
        io.open(src, "w", encoding="utf-8").write(html)
        pdf = os.path.join(tmp, "out.pdf")
        p = subprocess.run(
            [chrome, "--headless", "--disable-gpu", "--no-sandbox",
             "--no-pdf-header-footer", "--print-to-pdf=" + pdf, src],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=180,
        )
        if not os.path.exists(pdf):
            print(p.stdout.decode("utf-8", "replace")[-1000:])
            return False
        shutil.copyfile(pdf, dest)
        print("  %-30s %7d bytes" % (os.path.basename(dest), os.path.getsize(dest)))
        return True
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


EXCEL_PS = r"""
$ErrorActionPreference = 'Stop'
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
try {
  $wb = $excel.Workbooks.Open('%s', $false, $true)
  $wb.ExportAsFixedFormat(0, '%s', 0, $true, $false)
  $wb.Close($false)
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
"""


def print_with_excel(dest):
    if sys.platform != "win32":
        return False
    tmp = tempfile.mkdtemp()
    try:
        ps = os.path.join(tmp, "export.ps1")
        io.open(ps, "w", encoding="utf-8").write(EXCEL_PS % (XLSX, dest))
        subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ps],
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=300)
        if not os.path.exists(dest):
            return False
        print("  %-30s %7d bytes" % (os.path.basename(dest), os.path.getsize(dest)))
        return True
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    missing = []

    chrome = find_chrome()
    if chrome:
        print("Chrome: %s" % chrome)
        for html, name in (
            (parts_html(), "supplier-parts-list.pdf"),
            (prose_html(), "supplier-declaration.pdf"),
            (scan_html(), "scanned-page.pdf"),
        ):
            if not print_with_chrome(chrome, html, os.path.join(OUT, name)):
                missing.append(name)
    else:
        print("Chrome not found; three fixtures left as committed")
        missing += ["supplier-parts-list.pdf", "supplier-declaration.pdf", "scanned-page.pdf"]

    excel_pdf = os.path.join(OUT, "supplier-sheet-excel.pdf")
    if not print_with_excel(excel_pdf):
        print("Excel not available; supplier-sheet-excel.pdf left as committed")
        missing.append("supplier-sheet-excel.pdf")

    # Not an error. The committed files are the fixtures; this script is only
    # how they were made, and saying which ones it could not remake is more
    # use than a non-zero exit on a machine without Office.
    if missing:
        print("\nnot regenerated: %s" % ", ".join(sorted(set(missing))))
    return 0


if __name__ == "__main__":
    sys.exit(main())
