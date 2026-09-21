import os
_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CW = os.path.join(_ROOT, "docs", "crosswalk")
# -*- coding: utf-8 -*-
"""Derive the machine-readable crosswalk from the workbook so the two can never drift."""
import json, csv, re
from openpyxl import load_workbook

wb = load_workbook(os.path.join(_CW, "AI-SBOM-crosswalk.xlsx"), data_only=True)
ws = wb["AI SBOM crosswalk"]

CLUSTER_META = {
 "Metadata": ("metadata", 10,
   "Information about the AI bill of materials itself, not about the components it describes."),
 "System Level Properties": ("system-level-properties", 9,
   "The AI system as a whole, including systems composed of several AI elements such as classifiers, large language models or agents. Covers software dependencies and frameworks, and how components interact and process user data."),
 "Models": ("models", 13,
   "Identifies the models used by the system, describes how each model's weights were produced, and outlines their properties and limitations."),
 "Datasets Properties": ("datasets-properties", 10,
   "Datasets used during the whole lifecycle of the model, including the information that documents identity and provenance."),
 "Infrastructure": ("infrastructure", 2,
   "Physical and virtual infrastructure critical to running and supporting the AI system, including a link to a hardware bill of materials where one exists."),
 "Security Properties": ("security-properties", 4,
   "Cybersecurity measures that apply to the AI models and systems."),
 "Key Performance Indicators": ("key-performance-indicators", 2,
   "Indicators for the AI system and its components, focusing on their lifecycle phases."),
}
FIT = {"Direct":"direct","Partial":"partial","Properties":"properties-only","None":"none"}

def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def split_paths(s):
    if not s or s.strip().lower().startswith(("no ","none")):
        return []
    parts = re.split(r";\s*", s)
    return [p.strip() for p in parts if p.strip()]

clusters, order, rows_csv = {}, [], []
for r in range(2, ws.max_row + 1):
    n, cl, el, mean, cons, cdx, cdxf, spdx, spdxf, note = [ws.cell(row=r, column=c).value for c in range(1, 11)]
    cid, ccount, cscope = CLUSTER_META[cl]
    if cid not in clusters:
        clusters[cid] = {"id": cid, "name": cl, "elementCount": ccount, "scope": cscope, "elements": []}
        order.append(cid)
    eid = f"{cid}.{slug(el)}"
    clusters[cid]["elements"].append({
        "id": eid,
        "index": n,
        "name": el,
        "captures": mean,
        "statedConstraint": cons,
        "conformance": "unspecified",
        "mappings": {
            "cyclonedx-1.7": {"fit": FIT[cdxf], "paths": split_paths(cdx)},
            "spdx-3.0.1":    {"fit": FIT[spdxf], "paths": split_paths(spdx)},
        },
        "note": note or "",
    })
    rows_csv.append([eid, cl, el, mean, cons, cdx, FIT[cdxf], spdx, FIT[spdxf], note or ""])

doc = {
  "$comment": "Machine-readable crosswalk between the G7 AI bill of materials minimum elements and the two SBOM formats. Data only. No conformance policy is expressed here.",
  "crosswalkVersion": "0.1.0",
  "compiled": "2026-08-29",
  "specification": {
    "title": "Software Bill of Materials for AI - Minimum Elements",
    "publishedBy": ["BSI (Germany)","ACN (Italy)","ANSSI (France)","CSE (Canada)","CISA (United States)","NCSC (United Kingdom)","NCO (Japan)"],
    "inCollaborationWith": ["European Commission"],
    "authoringBody": "G7 Cybersecurity Working Group",
    "published": "2026-05-12",
    "dateNote": "The document itself carries no date beyond the year 2026 and no version number. 2026-05-12 is the publication date on the BSI landing page; CISA announced it on 2026-05-13. The 2026-06-16 date seen in some write-ups is a law firm client alert, not the guidance.",
    "sourceUrl": "https://www.bsi.bund.de/SharedDocs/Downloads/EN/BSI/KI/SBOM-for-AI_minimum-elements.pdf",
    "accessNote": "cisa.gov returns HTTP 403 to automated requests. BSI is a co-publisher and hosts the identical original.",
    "mandatory": False,
    "mandatoryQuote": "These minimum elements are not mandatory; do not create requirements, standards, or legislation.",
    "totalElements": 50,
    "totalClusters": 7,
    "sitsOnTopOf": {
      "title": "2026 Minimum Elements for a Software Bill of Materials (SBOM)",
      "version": "2.1",
      "published": "2026-07-29",
      "sourceUrl": "https://www.ic3.gov/CSA/2026/260729.pdf",
      "quote": "The minimum elements in an SBOM for AI are in addition to the general SBOM minimum elements."
    }
  },
  "targets": {
    "cyclonedx-1.7": {
      "name": "CycloneDX", "version": "1.7", "released": "2025-10-21",
      "standard": "ECMA-424, 2nd Edition",
      "schema": "https://raw.githubusercontent.com/CycloneDX/specification/master/schema/bom-1.7.schema.json",
      "note": "The AI object graph is structurally identical between 1.6 and 1.7. modelCard arrived in 1.5, environmentalConsiderations in 1.6."
    },
    "spdx-3.0.1": {
      "name": "SPDX", "version": "3.0.1", "released": "2024-12-17",
      "standard": "ISO/IEC 5962:2021 covers version 2.2.1 only; 3.x is not yet published as an ISO standard",
      "schema": "https://spdx.org/schema/3.0.1/spdx-json-schema.json",
      "ontology": "https://spdx.org/rdf/3.0.1/spdx-model.ttl",
      "note": "Version 3.1 is a release candidate only as of 2026-08-29."
    }
  },
  "fitScale": {
    "direct": "The format has a purpose-built field that carries this element.",
    "partial": "A field exists but is narrower, differently scoped, or uses an incompatible vocabulary.",
    "properties-only": "Expressible only through a free-form property bag or an external link. Not interoperable.",
    "none": "No representation at all."
  },
  "conformanceNote": "The source specification assigns no required, optional or recommended level to any element, and uses no RFC 2119 keywords. Every element here is marked 'unspecified'. Any conformance policy is the implementer's own and should be declared as such.",
  "clusters": [clusters[c] for c in order],
}

with open(os.path.join(_CW, "data", "ai-sbom-crosswalk.json"), "w", encoding="utf-8") as f:
    json.dump(doc, f, indent=2, ensure_ascii=False)
    f.write("\n")

with open(os.path.join(_CW, "data", "ai-sbom-crosswalk.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["element_id","cluster","element","captures","stated_constraint",
                "cyclonedx_1_7_paths","cyclonedx_fit","spdx_3_0_1_paths","spdx_fit","note"])
    w.writerows(rows_csv)

tot = sum(len(c["elements"]) for c in doc["clusters"])
fits = {}
for c in doc["clusters"]:
    for e in c["elements"]:
        for t, m in e["mappings"].items():
            fits.setdefault(t, {}).setdefault(m["fit"], 0)
            fits[t][m["fit"]] += 1
print("elements:", tot, "clusters:", len(doc["clusters"]))
print(json.dumps(fits, indent=2))
