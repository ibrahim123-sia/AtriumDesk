"""
==========================================================
RETRIEVAL_EVAL.PY - Golden-set check of retrieval alone, no LLM calls
==========================================================
For every golden case, gets the context the chatbot would hand the model
(`rag.retrieve_context` — knowledge-base chunks plus listing blocks, the
same call `ask()` makes) and checks whether each expected keyword appears
in it. A keyword missing from the context can't be in the answer, so this
separates "retrieval didn't find it" from "the model didn't use it" — and
costs nothing, so a retrieval or chunking change can be checked as often
as needed before one full `eval.py` run confirms it.

No-info cases are skipped (only the model decides those), and so is the
assistant side of sequences: retrieval only looks at the previous user
turn (`rag._build_retrieval_query`).

Usage (from python/eval, with python/.env loadable):
    python retrieval_eval.py
    python retrieval_eval.py --out retrieval_report.json
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.chdir(os.path.dirname(HERE))  # config.py resolves paths relative to python/

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import rag  # noqa: E402
from eval import _normalize, load_golden_set  # noqa: E402  (same keyword matching as eval.py)


# Words the answer says but the source text needn't ("Yes, MAJU has evening
# classes"): not a retrieval miss.
ANSWER_ONLY = {"yes", "no"}


def check(question, expected, tenant_slug, history, user_type):
    context = rag.retrieve_context(question, tenant_slug=tenant_slug, history=history, user_type=user_type or "guest")
    text = _normalize("\n".join(context["chunks"])).lower()
    missed = [kw for kw in expected if kw.lower() not in ANSWER_ONLY and _normalize(kw).lower() not in text]
    return {
        "question": question,
        "passed": not missed,
        "missed_keywords": missed,
        "confidence_tier": context["confidence_tier"],
        "sources": [(s or {}).get("source", "") for s in context["sources"]],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default=None, help="Optional path to write a full JSON report")
    args = parser.parse_args()

    golden = load_golden_set()
    tenant_slug = golden.get("tenant_slug", "maju")
    results, checked, found = [], 0, 0
    for case in golden["cases"]:
        turns = case["turns"] if case["type"] == "sequence" else [case]
        history = []
        for turn in turns:
            if turn.get("expect_no_info") or not turn.get("expected_keywords"):
                history.append({"role": "user", "content": turn["question"]})
                continue
            result = check(turn["question"], turn["expected_keywords"], tenant_slug, history, case.get("user_type"))
            result["id"] = case["id"]
            results.append(result)
            checked += 1
            found += result["passed"]
            mark = "FOUND " if result["passed"] else "MISSED"
            extra = "" if result["passed"] else f"  missing {result['missed_keywords']}"
            print(f"  [{mark}] {case['id']}{extra}")
            history.append({"role": "user", "content": turn["question"]})

    print(f"\n{found}/{checked} questions have every expected fact in the retrieved context")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump({"found": found, "checked": checked, "results": results}, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
