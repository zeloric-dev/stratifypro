#!/usr/bin/env python3
"""Build the g7-ai-2026 rule pack and its fixtures from the crosswalk.

SPEC.md 3.1: "g7-ai-2026 rule pack, all 50 elements, built from the existing
crosswalk JSON". Generated rather than hand-written, for the reason the
crosswalk itself is generated from a spreadsheet: the source of truth is
docs/crosswalk/data/ai-sbom-crosswalk.json, and a hand-maintained copy of 50
elements drifts from it the first time an element is reworded.

WHAT COMES FROM THE CROSSWALK AND WHAT IS JUDGEMENT. The element id, its name,
what it captures, its stated constraint and its format mappings are taken
verbatim. The selector, the assertion, the severity and the fix are
StratifyPro's judgement and live in the RULES table below, one entry per
element, so a reviewer can read the translation from a crosswalk path to a
JSONPath in one place instead of inferring it from fifty files.

CYCLONEDX ONLY, FOR NOW, AND THE REASON IS MECHANICAL. The crosswalk maps 44
of the 50 elements into SPDX 3.0.1, and packages/engine reads SPDX 3 by
normalising it into the shape the rules address. packages/rules'
reference-engine.py evaluates a selector against the RAW fixture file and does
not normalise, so an SPDX 3.0.1 fixture would match nothing and the fixture
proof would be a formality. CycloneDX 1.7 carries all 50 elements -- the
crosswalk records no `none` fit for it -- so the pack is complete against the
element list either way. Teaching the reference engine to normalise is the
next change, and the SPDX selectors land with it.

NO RULE MAY BE AN ERROR. The G7 document says of itself: "These minimum
elements are not mandatory; do not create requirements, standards, or
legislation." normativeLanguage is false, the loader refuses `error` on any
rule citing such a source, and this pack is the clearest case of that rule
working rather than failing.

EVERY FIXTURE IS THE SAME DOCUMENT WITH ONE THING REMOVED. The pass fixture is
a complete AI SBOM that satisfies all fifty rules. Each fail fixture is that
document with exactly the field the rule asks about taken out, named in the
`breaks` column. That makes a fixture pair impossible to write dishonestly:
the difference between passing and failing is visible as one deletion.

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

SOURCE_ID = "g7-ai-2026"
MODEL_REF = "model-1"
DATASET_REF = "dataset-1"


# --------------------------------------------------------------------------
# The document every fixture is cut from.
# --------------------------------------------------------------------------

def base_document():
    """A complete CycloneDX 1.7 AI SBOM: one system, one model, one dataset.

    It satisfies all fifty rules. Nothing here is decoration; every field is
    the thing some rule asks about, which is why the file is large.
    """
    return {
        "bomFormat": "CycloneDX",
        "specVersion": "1.7",
        "version": 1,
        "serialNumber": "urn:uuid:6f4d1f7a-2c33-4a19-9f0e-8b2a1d5c77e1",
        "metadata": {
            "timestamp": "2026-05-12T10:00:00Z",
            "lifecycles": [{"phase": "build"}],
            "authors": [{"name": "Haldane Instruments Regulatory Affairs"}],
            "manufacturer": {"name": "Haldane Instruments Ltd"},
            "tools": {
                "components": [
                    {
                        "type": "application",
                        "name": "stratifypro-cli",
                        "version": "1.0.0",
                    }
                ]
            },
            "component": {
                "type": "application",
                "bom-ref": "system-1",
                "name": "HX-4100 triage assistant",
                "version": "2.1.0",
                "manufacturer": {"name": "Haldane Instruments Ltd"},
                "supplier": {"name": "Haldane Instruments Ltd"},
                "externalReferences": [
                    {"type": "bom", "url": "urn:cdx:hardware-bom/1#HX-4100-board"}
                ],
                "properties": [
                    {
                        "name": "stratifypro:system-timestamp",
                        "value": "2026-05-11T18:00:00Z",
                    }
                ],
            },
            "properties": [
                {
                    "name": "stratifypro:operational-kpi",
                    "value": "median inference latency 240ms at p50, 410ms at p95",
                },
                {
                    "name": "stratifypro:cybersecurity-policy",
                    "value": "https://example.invalid/security/vulnerability-disclosure",
                },
                {
                    "name": "stratifypro:security-controls",
                    "value": "input validation, model output bounds check, audit logging",
                },
            ],
        },
        "components": [
            {
                "type": "machine-learning-model",
                "bom-ref": MODEL_REF,
                "name": "haldane-triage-net",
                "version": "2.1.0",
                "description": "Chest radiograph triage classifier used to order a worklist.",
                "purl": "pkg:generic/haldane-triage-net@2.1.0",
                "cpe": "cpe:2.3:a:haldane:triage_net:2.1.0:*:*:*:*:*:*:*",
                "publisher": "Haldane Instruments Ltd",
                "manufacturer": {"name": "Haldane Instruments Ltd"},
                "supplier": {"name": "Haldane Instruments Ltd"},
                "authors": [{"name": "Haldane Clinical AI group"}],
                "licenses": [{"license": {"id": "Apache-2.0"}}],
                "hashes": [{"alg": "SHA-256", "content": "a" * 64}],
                "releaseNotes": {"timestamp": "2026-05-04T09:00:00Z"},
                "externalReferences": [
                    {"type": "model-card", "url": "https://example.invalid/models/triage-net"},
                    {"type": "threat-model", "url": "https://example.invalid/threat-model"},
                    {"type": "certification-report", "url": "https://example.invalid/cert"},
                    {"type": "vulnerability-assertion", "url": "https://example.invalid/vex"},
                ],
                "properties": [
                    {"name": "cdx:ai-ml:model:parameter:count", "value": "11400000"},
                    {"name": "cdx:ai-ml:model:parameter:tune_method", "value": "sft"},
                ],
                "modelCard": {
                    "modelParameters": {
                        "approach": {"type": "supervised"},
                        "task": "image-classification",
                        "architectureFamily": "convolutional",
                        "modelArchitecture": "ResNet-50",
                        "datasets": [{"ref": DATASET_REF}],
                        "inputs": [{"format": "image/dicom"}],
                        "outputs": [{"format": "application/json"}],
                    },
                    "quantitativeAnalysis": {
                        "performanceMetrics": [
                            {
                                "type": "false negative rate",
                                "value": "0.021",
                                "slice": "all studies",
                            }
                        ]
                    },
                    "considerations": {
                        "useCases": ["Ordering a radiology worklist by likelihood of finding."],
                        "technicalLimitations": [
                            "Not validated on paediatric patients or portable films."
                        ],
                    },
                },
            },
            {
                "type": "data",
                "bom-ref": DATASET_REF,
                "name": "chest-xray-corpus",
                "version": "2026.03",
                "purl": "pkg:generic/chest-xray-corpus@2026.03",
                "licenses": [{"license": {"id": "CC-BY-4.0"}}],
                "hashes": [{"alg": "SHA-256", "content": "b" * 64}],
                "data": [
                    {
                        "bom-ref": "dataset-1-contents",
                        "type": "dataset",
                        "name": "chest-xray-corpus",
                        "description": "120,000 de-identified adult chest radiographs, two sites.",
                        "contents": {"url": "https://example.invalid/data/chest-xray-corpus"},
                        "classification": "restricted",
                        "sensitiveData": ["de-identified patient imaging"],
                        "governance": {
                            "owners": [{"organization": {"name": "Haldane Instruments Ltd"}}],
                            "custodians": [{"organization": {"name": "Haldane Data Platform"}}],
                            "stewards": [{"organization": {"name": "Haldane Clinical AI group"}}],
                        },
                        "properties": [
                            {
                                "name": "stratifypro:dataset-statistics",
                                "value": "class balance 0.31 positive; age 18-94, median 57",
                            }
                        ],
                    }
                ],
            },
            {
                "type": "library",
                "bom-ref": "lib-1",
                "name": "onnxruntime",
                "version": "1.17.1",
                "purl": "pkg:pypi/onnxruntime@1.17.1",
            },
            {
                "type": "device",
                "bom-ref": "device-1",
                "name": "HX-4100 inference board",
                "version": "rev-C",
            },
        ],
        "services": [
            {
                "bom-ref": "svc-1",
                "name": "study-intake",
                "endpoints": ["https://example.invalid/api/studies"],
                "data": [
                    {
                        "flow": "inbound",
                        "classification": "restricted",
                        "name": "DICOM study upload",
                    },
                    {
                        "flow": "outbound",
                        "classification": "restricted",
                        "name": "worklist ordering",
                    },
                ],
            }
        ],
        "dependencies": [
            {"ref": "system-1", "dependsOn": [MODEL_REF, "lib-1", "device-1"]},
            {"ref": MODEL_REF, "dependsOn": [DATASET_REF, "lib-1"]},
            {"ref": DATASET_REF, "dependsOn": []},
        ],
        "vulnerabilities": [
            {
                "bom-ref": "vuln-1",
                "id": "CVE-2026-00000",
                "affects": [{"ref": "lib-1"}],
                "analysis": {"state": "not_affected", "justification": "code_not_reachable"},
            }
        ],
        "externalReferences": [
            {"type": "security-contact", "url": "https://example.invalid/security"},
            {"type": "vulnerability-assertion", "url": "https://example.invalid/vex"},
        ],
        "declarations": {
            "signature": {"algorithm": "ES256", "value": "placeholder"},
            "assessors": [{"bom-ref": "assessor-1", "organization": {"name": "Haldane QA"}}],
            "attestations": [
                {
                    "summary": "Assessed against the standard named in definitions.",
                    "assessor": "assessor-1",
                }
            ],
        },
        "definitions": {
            "standards": [
                {
                    "bom-ref": "std-1",
                    "name": "G7 SBOM for AI minimum elements",
                    "version": "2026",
                }
            ]
        },
        "formulation": [
            {
                "bom-ref": "training-run-1",
                "components": [{"type": "library", "name": "pytorch", "version": "2.4.0"}],
                "workflows": [
                    {
                        "bom-ref": "wf-1",
                        "uid": "train-2026-03",
                        "name": "supervised fine-tune",
                        "taskTypes": ["build"],
                    }
                ],
            }
        ],
        "signature": {"algorithm": "ES256", "value": "placeholder"},
    }


# --------------------------------------------------------------------------
# Removing exactly one thing.
# --------------------------------------------------------------------------

# Looked up by TYPE, not by bom-ref. G7-MOD-002 and G7-DS-004 delete the
# identifier fields, bom-ref among them, and a later deletion in the same list
# then could not find the component it had just edited. Type is the one thing
# no rule removes from these two.
COMPONENT_TYPE = {"model": "machine-learning-model", "dataset": "data"}


def _component(doc, kind):
    for c in doc.get("components", []):
        if c.get("type") == COMPONENT_TYPE[kind]:
            return c
    raise KeyError(kind)


def drop(doc, spec):
    """Delete one field, named by a dotted path.

    `model.` and `dataset.` are rooted at those components rather than at the
    document. A `*` segment applies the rest of the path to every member of a
    list, which is how "no tool states a version" is expressed without caring
    how many tools there are.
    """
    if spec.startswith("model."):
        node, path = _component(doc, "model"), spec[len("model."):]
    elif spec.startswith("dataset."):
        node, path = _component(doc, "dataset"), spec[len("dataset."):]
    elif spec.startswith("type:"):
        kind = spec[len("type:"):]
        doc["components"] = [c for c in doc["components"] if c.get("type") != kind]
        return
    else:
        node, path = doc, spec

    parts = path.split(".")
    _walk_delete(node, parts)


def _walk_delete(node, parts):
    head, rest = parts[0], parts[1:]
    if head == "*":
        if isinstance(node, list):
            for item in node:
                _walk_delete(item, rest)
        return
    if not rest:
        if isinstance(node, dict):
            node.pop(head, None)
        return
    if isinstance(node, dict) and head in node:
        _walk_delete(node[head], rest)


# --------------------------------------------------------------------------
# The judgement layer: one row per crosswalk element.
#
# Columns: rule id, crosswalk element id, severity, selector, assertion, fix,
# why that severity, and what to delete to make the rule fire.
#
# SEVERITY IS NEVER `error`, and cannot be. The source says of itself that its
# elements are not mandatory, so `normativeLanguage` is false and the loader
# refuses `error` on any rule citing it. The split between `warning` and `info`
# is StratifyPro's judgement about what a consumer of the SBOM cannot work
# around, never a claim about what the document requires.
# --------------------------------------------------------------------------

MODEL_SEL = "$.components[?(@.type=='machine-learning-model')]"
DATA_SEL = "$.components[?(@.type=='data')]"
DOC = "$"

# Reused justifications, so 50 rows do not restate the same argument 50 times.
WHY_CONSUMER = (
    "Warning rather than info because a consumer of this SBOM cannot work around the "
    "absence: there is no other field to read it from and no inference that recovers it. "
    "Never error, because the source document states that its elements are not mandatory."
)
WHY_ADVISORY = (
    "Info because the element is useful and its absence is recoverable: a reader can ask "
    "for it, or proceed without it, without misreading the document. The source assigns no "
    "conformance level to any element, so nothing here is a finding about obligation."
)
EMPTY_FIRE = (
    "The selector walks a collection and the assertion asks whether each member carries "
    "something. A document with zero members has not satisfied that, it has avoided being "
    "measured against it, and reporting nothing would let an absent collection read as a "
    "clean result."
)
EMPTY_MODEL = (
    "Fires on a document with no model component at all. That is the intended reading: this "
    "pack's subject is an SBOM for an AI system, and a document listing no model has not "
    "described one. Run a software pack against a software SBOM."
)

RULES = [
    # ---- metadata (10) ---------------------------------------------------
    ("G7-MD-001", "metadata.sbom-author", "warning", DOC,
     {"exists": "metadata.authors[*].name|metadata.manufacturer.name"},
     "Name the organisation or person that generated this SBOM, in full. This is distinct "
     "from the producer of the system it describes.",
     WHY_CONSUMER, ["metadata.authors", "metadata.manufacturer"]),

    ("G7-MD-002", "metadata.sbom-version", "info", DOC,
     {"exists": "version"},
     "State which revision of this SBOM this is, so a later one can be told from an earlier.",
     WHY_ADVISORY, ["version"]),

    ("G7-MD-003", "metadata.sbom-data-format-name", "info", DOC,
     {"exists": "bomFormat|spdxVersion|@context"},
     "State the format this document is written in.",
     WHY_ADVISORY, ["bomFormat"]),

    ("G7-MD-004", "metadata.sbom-data-format-version", "info", DOC,
     {"exists": "specVersion|spdxVersion"},
     "State which version of the format this document follows.",
     WHY_ADVISORY, ["specVersion"]),

    ("G7-MD-005", "metadata.sbom-author-signature", "info", DOC,
     {"exists": "signature|declarations.signature"},
     "Attach the author's signature over the document, so a recipient can tell it has not "
     "been altered since it was issued.",
     WHY_ADVISORY, ["signature", "declarations.signature"]),

    ("G7-MD-006", "metadata.sbom-tool-name", "info", DOC,
     {"exists": "metadata.tools.components[*].name"},
     "Name the tool that produced this SBOM. A reader weighing how much to trust it needs "
     "to know what generated it.",
     WHY_ADVISORY, ["metadata.tools.components.*.name"]),

    ("G7-MD-007", "metadata.sbom-tool-version", "info", DOC,
     {"exists": "metadata.tools.components[*].version"},
     "State the version of the generating tool, because two versions of one tool do not "
     "produce the same document.",
     WHY_ADVISORY, ["metadata.tools.components.*.version"]),

    ("G7-MD-008", "metadata.sbom-generation-context", "info", DOC,
     {"exists": "metadata.lifecycles[*].phase"},
     "State the lifecycle phase this SBOM describes. A build-time inventory and a "
     "runtime one answer different questions.",
     WHY_ADVISORY, ["metadata.lifecycles"]),

    ("G7-MD-009", "metadata.sbom-timestamp", "warning", DOC,
     {"exists": "metadata.timestamp"},
     "Timestamp the document. Without it an SBOM cannot be placed against a vulnerability "
     "disclosure date, which is most of what it is read for.",
     WHY_CONSUMER, ["metadata.timestamp"]),

    ("G7-MD-010", "metadata.sbom-dependency-relationship", "warning", DOC,
     {"exists": "dependencies[*].ref|relationships[*].spdxElementId"},
     "State how the listed things relate to each other. A flat list of components does not "
     "say which is part of what.",
     WHY_CONSUMER, ["dependencies"]),

    # ---- system-level properties (9) -------------------------------------
    ("G7-SYS-001", "system-level-properties.system-name", "warning", DOC,
     {"exists": "metadata.component.name"},
     "Name the AI system this SBOM is about, at the top of the document.",
     WHY_CONSUMER, ["metadata.component.name"]),

    ("G7-SYS-002", "system-level-properties.system-components", "warning", DOC,
     {"minLength": {"field": "components|packages", "min": 1}},
     "List the components the system is built from. An SBOM listing none describes nothing.",
     WHY_CONSUMER, ["components"]),

    ("G7-SYS-003", "system-level-properties.system-producer", "warning", DOC,
     {"exists": "metadata.component.manufacturer.name|metadata.component.supplier.name"},
     "Name who produces the system, separately from who wrote this SBOM.",
     WHY_CONSUMER, ["metadata.component.manufacturer", "metadata.component.supplier"]),

    ("G7-SYS-004", "system-level-properties.system-version", "warning", DOC,
     {"exists": "metadata.component.version"},
     "State the system's version. Without it this document cannot be tied to a release.",
     WHY_CONSUMER, ["metadata.component.version"]),

    ("G7-SYS-005", "system-level-properties.system-timestamp", "info", DOC,
     {"exists": "metadata.component.properties[?(@.name=='stratifypro:system-timestamp')]"
                "|metadata.timestamp"},
     "Record when the system itself was built or released, which is not the same moment as "
     "when this SBOM was written.",
     WHY_ADVISORY + " CycloneDX has no field for this at the system level, so it is read "
     "from a property and falls back to the document timestamp.",
     ["metadata.component.properties", "metadata.timestamp"]),

    ("G7-SYS-006", "system-level-properties.system-data-flow", "info", DOC,
     {"exists": "services[*].data[*].flow|services[*].endpoints[*]"},
     "Describe what data enters and leaves the system, and in which direction.",
     WHY_ADVISORY, ["services"]),

    ("G7-SYS-007", "system-level-properties.system-data-usage", "info", DOC,
     {"exists": "services[*].data[*].classification"},
     "State how the data the system handles is classified, so a reader knows what is at "
     "stake if it leaks.",
     WHY_ADVISORY, ["services.*.data.*.classification"]),

    ("G7-SYS-008", "system-level-properties.system-input-output-properties", "info", MODEL_SEL,
     {"exists": "modelCard.modelParameters.inputs[*].format"
                "|modelCard.modelParameters.outputs[*].format"},
     "State what the system takes in and gives out, in formats a reader can act on.",
     WHY_ADVISORY, ["model.modelCard.modelParameters.inputs",
                    "model.modelCard.modelParameters.outputs"]),

    ("G7-SYS-009", "system-level-properties.intended-application-area", "warning", MODEL_SEL,
     {"exists": "modelCard.considerations.useCases[*]"},
     "State what the system is for. An AI component with no stated intended use cannot be "
     "assessed for use outside it, which is the question a reviewer actually asks.",
     WHY_CONSUMER, ["model.modelCard.considerations.useCases"]),

    # ---- models (13) -----------------------------------------------------
    ("G7-MOD-001", "models.model-name", "warning", MODEL_SEL,
     {"exists": "name"},
     "Name every model the system uses.",
     WHY_CONSUMER, ["model.name"]),

    ("G7-MOD-002", "models.model-identifier", "warning", MODEL_SEL,
     {"exists": "purl|cpe|swid|omniborId|swhid|bom-ref"},
     "Give each model an identifier somebody else can resolve, not only a name.",
     WHY_CONSUMER, ["model.purl", "model.cpe", "model.bom-ref"]),

    ("G7-MOD-003", "models.model-version", "warning", MODEL_SEL,
     {"exists": "version"},
     "State each model's version. Two weights files under one name are two different models.",
     WHY_CONSUMER, ["model.version"]),

    ("G7-MOD-004", "models.model-timestamp", "info", MODEL_SEL,
     {"exists": "releaseNotes.timestamp"},
     "Record when the model was released or last trained.",
     WHY_ADVISORY, ["model.releaseNotes"]),

    ("G7-MOD-005", "models.model-producer", "warning", MODEL_SEL,
     {"exists": "manufacturer.name|supplier.name|publisher|authors[*].name"},
     "Name who produced each model. For a model obtained from a third party this is the "
     "only route back to whoever can answer questions about it.",
     WHY_CONSUMER, ["model.manufacturer", "model.supplier", "model.publisher", "model.authors"]),

    ("G7-MOD-006", "models.model-description", "info", MODEL_SEL,
     {"exists": "description|modelCard.considerations.technicalLimitations[*]"},
     "Describe what the model does and where it should not be used.",
     WHY_ADVISORY, ["model.description",
                    "model.modelCard.considerations.technicalLimitations"]),

    ("G7-MOD-007", "models.model-hash-value", "warning", MODEL_SEL,
     {"exists": "hashes[*].content"},
     "Record a hash of the model artifact. It is the only way a recipient can confirm the "
     "weights they hold are the weights this document describes.",
     WHY_CONSUMER, ["model.hashes"]),

    ("G7-MOD-008", "models.model-hash-algorithm", "info", MODEL_SEL,
     {"exists": "hashes[*].alg"},
     "State which algorithm produced each hash. A bare digest cannot be checked.",
     WHY_ADVISORY, ["model.hashes.*.alg"]),

    ("G7-MOD-009", "models.model-properties", "info", MODEL_SEL,
     {"exists": "modelCard.modelParameters.approach.type|modelCard.modelParameters.task"
                "|modelCard.modelParameters.architectureFamily"},
     "State what kind of model this is: its learning approach, its task, its architecture.",
     WHY_ADVISORY, ["model.modelCard.modelParameters.approach",
                    "model.modelCard.modelParameters.task",
                    "model.modelCard.modelParameters.architectureFamily"]),

    ("G7-MOD-010", "models.model-input-output-properties", "info", MODEL_SEL,
     {"exists": "modelCard.modelParameters.inputs[*]|modelCard.modelParameters.outputs[*]"},
     "State the model's input and output shapes or formats.",
     WHY_ADVISORY, ["model.modelCard.modelParameters.inputs",
                    "model.modelCard.modelParameters.outputs"]),

    ("G7-MOD-011", "models.model-training-properties", "info", MODEL_SEL,
     {"exists": "modelCard.modelParameters.datasets[*]"
                "|properties[?(@.name=='cdx:ai-ml:model:parameter:tune_method')]"},
     "Say what the model was trained or tuned on, and how.",
     WHY_ADVISORY, ["model.modelCard.modelParameters.datasets", "model.properties"]),

    ("G7-MOD-012", "models.model-license", "info", MODEL_SEL,
     {"exists": "licenses[*].license|licenses[*].expression"},
     "State each model's licence. Model weights carry terms that are often narrower than "
     "the surrounding code's.",
     WHY_ADVISORY, ["model.licenses"]),

    ("G7-MOD-013", "models.model-external-references", "info", MODEL_SEL,
     {"exists": "externalReferences[*].url"},
     "Link out to the model card, documentation or assessment that sits behind this entry.",
     WHY_ADVISORY, ["model.externalReferences"]),

    # ---- datasets (10) ---------------------------------------------------
    ("G7-DS-001", "datasets-properties.dataset-name", "warning", DATA_SEL,
     {"exists": "data[*].name|name"},
     "Name every dataset the models were trained or evaluated on.",
     WHY_CONSUMER, ["dataset.data.*.name", "dataset.name"]),

    ("G7-DS-002", "datasets-properties.dataset-description", "info", DATA_SEL,
     {"exists": "data[*].description"},
     "Describe what each dataset contains.",
     WHY_ADVISORY, ["dataset.data.*.description"]),

    ("G7-DS-003", "datasets-properties.dataset-content", "info", DATA_SEL,
     {"exists": "data[*].type|data[*].contents"},
     "State what kind of data this is and where it can be found.",
     WHY_ADVISORY, ["dataset.data.*.type", "dataset.data.*.contents"]),

    ("G7-DS-004", "datasets-properties.dataset-identifier", "warning", DATA_SEL,
     {"exists": "purl|bom-ref|data[*].bom-ref"},
     "Give each dataset a resolvable identifier, so a later document can refer to the same "
     "one rather than to a name that has been reused.",
     WHY_CONSUMER, ["dataset.purl", "dataset.bom-ref", "dataset.data.*.bom-ref"]),

    ("G7-DS-005", "datasets-properties.dataset-hash", "info", DATA_SEL,
     {"exists": "hashes[*].content"},
     "Record a hash of the dataset, so a reader can tell whether they hold the same corpus.",
     WHY_ADVISORY, ["dataset.hashes"]),

    ("G7-DS-006", "datasets-properties.dataset-provenance", "info", DATA_SEL,
     {"exists": "data[*].governance|data[*].contents.url"},
     "State where the data came from and who is responsible for it.",
     WHY_ADVISORY, ["dataset.data.*.governance", "dataset.data.*.contents"]),

    ("G7-DS-007", "datasets-properties.dataset-statistical-properties", "info", DATA_SEL,
     {"exists": "data[*].properties[*]|data[*].graphics"},
     "Describe the shape of the data: size, balance, distribution across the groups that "
     "matter for the task.",
     WHY_ADVISORY + " CycloneDX has no purpose-built field, so this is read from the "
     "dataset's property bag, which the crosswalk records as properties-only.",
     ["dataset.data.*.properties", "dataset.data.*.graphics"]),

    ("G7-DS-008", "datasets-properties.dataset-sensitivity", "warning", DATA_SEL,
     {"exists": "data[*].sensitiveData[*]|data[*].classification"},
     "State whether the training data contains sensitive or personal information. A reader "
     "cannot infer this from a dataset name, and getting it wrong has consequences outside "
     "the software.",
     WHY_CONSUMER, ["dataset.data.*.sensitiveData", "dataset.data.*.classification"]),

    ("G7-DS-009", "datasets-properties.dataset-dependency-relationship", "info", DOC,
     {"exists": "dependencies[*].dependsOn[*]|relationships[*].relatedSpdxElement"},
     "Say which model was trained on which dataset, rather than listing both and leaving "
     "the link to be guessed.",
     WHY_ADVISORY, ["dependencies.*.dependsOn"]),

    ("G7-DS-010", "datasets-properties.dataset-license", "info", DATA_SEL,
     {"exists": "licenses[*].license|licenses[*].expression"},
     "State each dataset's licence. Training-data terms frequently restrict redistribution "
     "of anything derived from them.",
     WHY_ADVISORY, ["dataset.licenses"]),

    # ---- infrastructure (2) ----------------------------------------------
    ("G7-INF-001", "infrastructure.infrastructure-software", "info", DOC,
     {"exists": "components[?(@.type=='library')].name|components[?(@.type=='framework')].name"
                "|components[?(@.type=='container')].name"
                "|components[?(@.type=='operating-system')].name"},
     "List the runtime the model executes on. An inference stack is where most of the "
     "reachable vulnerabilities actually are.",
     WHY_ADVISORY, ["type:library", "type:framework", "type:container",
                    "type:operating-system"]),

    ("G7-INF-002", "infrastructure.infrastructure-hardware", "info", DOC,
     {"exists": "components[?(@.type=='device')].name"
                "|metadata.component.externalReferences[?(@.type=='bom')]"},
     "Identify the hardware the system runs on, or link to the bill of materials that does.",
     WHY_ADVISORY, ["type:device", "metadata.component.externalReferences"]),

    # ---- security properties (4) -----------------------------------------
    ("G7-SEC-001", "security-properties.security-controls", "info", DOC,
     {"exists": "declarations"
                "|metadata.properties[?(@.name=='stratifypro:security-controls')]"
                "|components[?(@.type=='machine-learning-model')].externalReferences"
                "[?(@.type=='threat-model')]"},
     "State what protects the system, or link to the threat model that does.",
     WHY_ADVISORY + " The crosswalk records this as properties-only in CycloneDX: there is "
     "no purpose-built field, so a property bag or an external reference is the honest "
     "place for it and the rule accepts either.",
     ["declarations", "metadata.properties",
      "model.externalReferences"]),

    ("G7-SEC-002", "security-properties.security-compliance", "info", DOC,
     {"exists": "declarations.attestations[*]|definitions.standards[*].name"},
     "Name the standard the system has been assessed against, and who assessed it.",
     WHY_ADVISORY, ["declarations.attestations", "definitions"]),

    ("G7-SEC-003", "security-properties.cybersecurity-policy-information", "info", DOC,
     {"exists": "externalReferences[?(@.type=='security-contact')]"
                "|metadata.properties[?(@.name=='stratifypro:cybersecurity-policy')]"},
     "Link to the vulnerability disclosure policy, so somebody who finds a problem knows "
     "where to send it.",
     WHY_ADVISORY, ["externalReferences", "metadata.properties"]),

    ("G7-SEC-004", "security-properties.vulnerability-referencing", "warning", DOC,
     {"exists": "vulnerabilities[*].id"
                "|externalReferences[?(@.type=='vulnerability-assertion')]"},
     "Say where the vulnerability statements for this system live, or carry them here. An "
     "AI SBOM with no route to vulnerability data cannot be used for the thing SBOMs are "
     "mainly used for.",
     WHY_CONSUMER, ["vulnerabilities", "externalReferences"]),

    # ---- key performance indicators (2) ----------------------------------
    ("G7-KPI-001", "key-performance-indicators.security-metrics", "info", MODEL_SEL,
     {"exists": "modelCard.quantitativeAnalysis.performanceMetrics[*].type"},
     "Record the measured performance of the model, including the failure rate that matters "
     "for its intended use.",
     WHY_ADVISORY + " The crosswalk records this as properties-only: CycloneDX carries "
     "performance metrics as free-text type and a string value, so nothing here is "
     "comparable across vendors and the rule asks only that a figure is stated.",
     ["model.modelCard.quantitativeAnalysis"]),

    ("G7-KPI-002", "key-performance-indicators.operational-performance-kpis", "info", DOC,
     {"exists": "metadata.properties[?(@.name=='stratifypro:operational-kpi')]"
                "|components[?(@.type=='machine-learning-model')].properties[*]"},
     "Record the operational figures an integrator needs: latency, throughput, resource "
     "envelope.",
     WHY_ADVISORY + " Properties-only in CycloneDX, so this reads a property bag and says "
     "so rather than implying the format has a home for it.",
     ["metadata.properties", "model.properties"]),
]


# --------------------------------------------------------------------------
# Emit.
# --------------------------------------------------------------------------

def crosswalk():
    return json.load(io.open(CROSSWALK, encoding="utf-8"))


def element_index(cw):
    out = {}
    for cluster in cw["clusters"]:
        for el in cluster["elements"]:
            out[el["id"]] = (cluster, el)
    return out


def build_pack(cw, index):
    spec = cw["specification"]
    rules = []
    for rid, eid, severity, selector, assertion, fix, why, _breaks in RULES:
        cluster, el = index[eid]
        cdx = el["mappings"].get("cyclonedx-1.7", {})
        empty_why = EMPTY_MODEL if selector != "$" and "machine-learning-model" in selector else EMPTY_FIRE
        rules.append({
            "id": rid,
            # The element's name plus what the rule actually asserts about it.
            # The bare name reads as a topic rather than a check, and three of
            # the fifty are shorter than the schema's minimum title length for
            # exactly that reason: "SBOM author" is not a statement.
            "title": el["name"] + " is stated",
            "severity": severity,
            "severityJustification": why,
            "onEmptySelector": "fire",
            "onEmptySelectorJustification": empty_why,
            "appliesTo": ["cyclonedx"],
            "selector": {"cyclonedx": selector},
            "assert": assertion,
            "fix": fix,
            "sourceDocument": SOURCE_ID,
            # The cluster and the element's own number, which is how the source
            # document is navigated: it has no section numbering of its own.
            "sourceLocation": "%s cluster, element %d of 50: %s"
                              % (cluster["name"], el["index"], el["name"]),
            "element": {
                "id": el["id"],
                "index": el["index"],
                "cluster": cluster["id"],
                "captures": el["captures"],
                "statedConstraint": el["statedConstraint"],
                "conformance": el["conformance"],
                "formatFit": cdx.get("fit"),
                "formatPaths": cdx.get("paths", []),
            },
        })

    return {
        "$schema": "../schema/rule-pack-1.json",
        "id": SOURCE_ID,
        "version": "1.0.0",
        "title": "G7 SBOM for AI, minimum elements",
        "compiled": cw["compiled"],
        "generatedBy": "scripts/build-g7-pack.py",
        "generatedFrom": "docs/crosswalk/data/ai-sbom-crosswalk.json",
        "sourceDocuments": [{
            "id": SOURCE_ID,
            "title": spec["title"],
            "publisher": spec["authoringBody"] + ", published by " + ", ".join(spec["publishedBy"]),
            "published": spec["published"],
            "version": cw["crosswalkVersion"],
            "url": spec["sourceUrl"],
            "retrievedNote": spec["accessNote"],
            "normativeLanguage": False,
            "normativeLanguageEvidence":
                "The document states of itself: " + json.dumps(spec["mandatoryQuote"]) +
                " It assigns no required, optional or recommended level to any element and "
                "uses no RFC 2119 keywords, so every element in the crosswalk is marked "
                "'unspecified'. The loader must refuse severity 'error' on any rule citing it.",
            "sitsOnTopOf": spec["sitsOnTopOf"],
        }],
        "severityModel": {
            "default": "advisory",
            "justification":
                "The source assigns no conformance level to any of its 50 elements and says "
                "in terms that they are not mandatory. Every severity here is StratifyPro's "
                "judgement about what a consumer of the SBOM cannot work around, never a "
                "quotation of an obligation. Firms may override any of them.",
            "overridable": True,
            "maxSeverityFromThisSource": "warning",
            "maxSeverityNote":
                "normativeLanguage is false, so the loader refuses 'error' on every rule in "
                "this pack. Nothing here escalates by citing a different source: a rule that "
                "needs 'error' is making a claim this document does not support.",
        },
        "conformanceNote": cw["conformanceNote"],
        "coverageNote":
            "One rule per element, 50 of 50. CycloneDX only: the crosswalk maps 44 elements "
            "into SPDX 3.0.1, and the engine reads SPDX 3 by normalising it, which the "
            "reference engine used to prove fixtures does not yet do. CycloneDX carries all "
            "50 elements, so the element list is complete either way.",
        "rules": rules,
    }


def build_fixtures():
    """One pass document, and one fail document per rule with a single deletion."""
    out = {}
    for rid, _eid, _sev, _sel, _a, _fix, _why, breaks in RULES:
        doc = base_document()
        for spec in breaks:
            drop(doc, spec)
        out[rid] = {"pass": base_document(), "fail": doc}
    return out


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    io.open(path, "w", encoding="utf-8", newline="\n").write(
        json.dumps(obj, indent=2, ensure_ascii=False) + "\n")


def same(path, obj):
    if not os.path.exists(path):
        return False
    want = json.dumps(obj, indent=2, ensure_ascii=False) + "\n"
    return io.open(path, encoding="utf-8").read() == want


def main():
    check = "--check" in sys.argv
    cw = crosswalk()
    index = element_index(cw)

    missing = [eid for _r, eid, *_ in RULES if eid not in index]
    if missing:
        print("    crosswalk elements named by a rule but absent: %s" % ", ".join(missing))
        return 1
    covered = {eid for _r, eid, *_ in RULES}
    uncovered = [e for e in index if e not in covered]
    if uncovered:
        print("    %d crosswalk element(s) with no rule: %s" % (len(uncovered), ", ".join(uncovered)))
        return 1

    pack = build_pack(cw, index)
    fixtures = build_fixtures()

    if check:
        drift = []
        if not same(PACK, pack):
            drift.append("packages/rules/packs/g7-ai-2026.json")
        for rid, pair in fixtures.items():
            for kind, doc in (("pass", pair["pass"]), ("fail", pair["fail"])):
                p = os.path.join(FIXTURES, rid, "%s.cyclonedx.json" % kind)
                if not same(p, doc):
                    drift.append(os.path.relpath(p, ROOT))
        if drift:
            print("    %d generated file(s) differ from the crosswalk:" % len(drift))
            for d in drift[:10]:
                print("      %s" % d)
            print("    run python3 scripts/build-g7-pack.py")
            return 1
        print("    %d rules, %d elements, pack and %d fixtures match the crosswalk"
              % (len(RULES), len(index), len(fixtures) * 2))
        return 0

    write_json(PACK, pack)
    for rid, pair in fixtures.items():
        write_json(os.path.join(FIXTURES, rid, "pass.cyclonedx.json"), pair["pass"])
        write_json(os.path.join(FIXTURES, rid, "fail.cyclonedx.json"), pair["fail"])
    print("    wrote %s" % os.path.relpath(PACK, ROOT))
    print("    wrote %d fixture file(s) for %d rules" % (len(fixtures) * 2, len(fixtures)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
