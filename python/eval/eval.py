"""
==========================================================
EVAL.PY - Golden-set scoring for the RAG chatbot (Rev 5 §13.2)
==========================================================

Runs golden_set.json against the live /ask endpoint and reports a pass/fail
per case plus an overall pass rate. This is Rev 5 §13.2's "simpler manual
scoring" — deliberately not RAGAS: "the golden set is the valuable part, the
tooling is secondary." Any change to the RAG prompt, retrieval, or chunking
logic should be scored against this set before and after (§13.2's whole
point: treat the prompt as code that needs a regression test).

Scoring method: case-insensitive keyword containment. A case with
`expected_keywords` passes if every keyword appears somewhere in the
returned answer; a case with `expect_no_info: true` passes if the answer
matches one of the known no-info fallback phrases. This is a proxy for
correctness, not a semantic check — it catches the failure mode that
actually matters here (a fact silently disappearing from the answer after a
prompt/retrieval change), without needing an LLM-as-judge call per case.

Usage:
    python eval.py                          # scores against http://localhost:8000
    python eval.py --api-base http://host:port
    python eval.py --out report.json        # also writes a full JSON report
"""

import argparse
import json
import os
import re
import sys

import requests

# Windows consoles default to a cp1252 stream that can't encode characters
# LLMs routinely emit (narrow no-break spaces, em-dashes, curly quotes) —
# without this, a crash on printing one case's answer takes the whole run
# down before the report ever gets written.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

GOLDEN_SET_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "golden_set.json")

# Mirrors rag.py's NO_INFO_FALLBACK strings — kept as a substring check
# rather than an import so this script never depends on the server's
# internals, only its HTTP contract.
NO_INFO_MARKERS = [
    "don't have information",
    "koi maloomat nahi",
]


def load_golden_set():
    with open(GOLDEN_SET_PATH, encoding="utf-8") as f:
        return json.load(f)


def ask(api_base, tenant_slug, question, language, history=None):
    resp = requests.post(
        f"{api_base}/ask",
        json={
            "question": question,
            "tenant_slug": tenant_slug,
            "language": language,
            "history": history or [],
        },
        # /ask now requires the same internal-secret header every other
        # cross-service Python endpoint does (it used to be unauthenticated
        # and reachable by anyone who could hit port 8000 directly).
        headers={"x-internal-secret": os.getenv("INTERNAL_SECRET", "")},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()["answer"]


def _normalize(text):
    """Collapses the Unicode-space variants LLMs use around a '%' sign (e.g.
    a narrow no-break space in "80 %") so keyword matching isn't
    fooled by formatting differences that carry the same fact."""
    text = text.replace(" ", " ").replace(" ", " ")
    return re.sub(r"\s+%", "%", text)


def score_answer(answer, expected_keywords=None, expect_no_info=False):
    """Returns (passed, matched_keywords, missed_keywords)."""
    if expect_no_info:
        passed = any(marker.lower() in answer.lower() for marker in NO_INFO_MARKERS)
        return passed, [], [] if passed else ["<no-info fallback>"]

    lowered = _normalize(answer).lower()
    matched = [kw for kw in expected_keywords if _normalize(kw).lower() in lowered]
    missed = [kw for kw in expected_keywords if _normalize(kw).lower() not in lowered]
    return len(missed) == 0, matched, missed


def run_single_case(api_base, tenant_slug, case):
    answer = ask(api_base, tenant_slug, case["question"], case["language"])
    passed, matched, missed = score_answer(
        answer,
        expected_keywords=case.get("expected_keywords", []),
        expect_no_info=case.get("expect_no_info", False),
    )
    return {
        "id": case["id"],
        "passed": passed,
        "question": case["question"],
        "answer": answer,
        "matched_keywords": matched,
        "missed_keywords": missed,
    }


def run_sequence_case(api_base, tenant_slug, case):
    history = []
    turn_results = []
    all_passed = True
    for i, turn in enumerate(case["turns"]):
        answer = ask(api_base, tenant_slug, turn["question"], turn["language"], history=history)
        passed, matched, missed = score_answer(
            answer,
            expected_keywords=turn.get("expected_keywords", []),
            expect_no_info=turn.get("expect_no_info", False),
        )
        all_passed = all_passed and passed
        turn_results.append(
            {
                "turn": i + 1,
                "passed": passed,
                "question": turn["question"],
                "answer": answer,
                "matched_keywords": matched,
                "missed_keywords": missed,
            }
        )
        history.append({"role": "user", "content": turn["question"]})
        history.append({"role": "assistant", "content": answer})
    return {"id": case["id"], "passed": all_passed, "turns": turn_results}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base", default="http://localhost:8000")
    parser.add_argument("--out", default=None, help="Optional path to write a full JSON report")
    args = parser.parse_args()

    golden = load_golden_set()
    tenant_slug = golden.get("tenant_slug", "maju")
    results = []

    for case in golden["cases"]:
        try:
            if case["type"] == "sequence":
                result = run_sequence_case(args.api_base, tenant_slug, case)
            else:
                result = run_single_case(args.api_base, tenant_slug, case)
        except requests.RequestException as exc:
            result = {"id": case["id"], "passed": False, "error": str(exc)}
        results.append(result)

    passed_count = sum(1 for r in results if r["passed"])
    total = len(results)

    print(f"\nGolden-set evaluation — {total} cases against {args.api_base}\n")
    for r in results:
        status = "PASS" if r["passed"] else "FAIL"
        print(f"  [{status}] {r['id']}")
        if not r["passed"]:
            if "error" in r:
                print(f"         error: {r['error']}")
            elif "turns" in r:
                for t in r["turns"]:
                    if not t["passed"]:
                        print(f"         turn {t['turn']}: missing {t['missed_keywords']}")
                        print(f"         answer: {t['answer'][:200]}")
            else:
                print(f"         missing: {r['missed_keywords']}")
                print(f"         answer: {r['answer'][:200]}")

    print(f"\n{passed_count}/{total} passed ({100 * passed_count / total:.0f}%)\n")

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(
                {"api_base": args.api_base, "passed": passed_count, "total": total, "results": results},
                f,
                indent=2,
                ensure_ascii=False,
            )
        print(f"Full report written to {args.out}")

    sys.exit(0 if passed_count == total else 1)


if __name__ == "__main__":
    main()
