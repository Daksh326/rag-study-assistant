"""Retrieval evaluation: hit rate@k and MRR against a hand-written question set.

Each line of the questions file is JSON:
    {"question": "...", "expected_doc": "BOE 302_Unit 1", "expected_page": 4}

`expected_doc` matches any document whose name contains it (case-insensitive).
A retrieved chunk counts as a hit when both the document and the page match.

Usage (with the dev server running):
    python eval/run_eval.py eval/questions.jsonl
    python eval/run_eval.py eval/questions.jsonl --modes vector hybrid --k 5 --label "chunk 400"

Only uses the Python standard library.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path


def search(base_url: str, query: str, mode: str, k: int) -> list[dict]:
    req = urllib.request.Request(
        f"{base_url}/api/search",
        data=json.dumps({"query": query, "mode": mode, "k": k}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.load(res)["results"]


def first_hit_rank(results: list[dict], expected_doc: str, expected_page: int) -> int | None:
    for rank, r in enumerate(results, start=1):
        if expected_doc.lower() in r["documentName"].lower() and r["page"] == expected_page:
            return rank
    return None


def load_questions(path: Path) -> list[dict]:
    questions = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        q = json.loads(line)
        missing = {"question", "expected_doc", "expected_page"} - q.keys()
        if missing:
            sys.exit(f"{path}:{n}: missing {', '.join(sorted(missing))}")
        questions.append(q)
    return questions


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("questions", type=Path)
    parser.add_argument("--base-url", default="http://localhost:3000")
    parser.add_argument("--modes", nargs="+", default=["vector", "hybrid"], choices=["vector", "hybrid"])
    parser.add_argument("--k", type=int, default=5)
    parser.add_argument("--label", default="", help="Name for this configuration, e.g. 'chunk 400'")
    parser.add_argument("--show-misses", action="store_true")
    args = parser.parse_args()

    questions = load_questions(args.questions)
    if not questions:
        sys.exit("No questions found.")

    rows = []
    for mode in args.modes:
        hits = 0
        reciprocal_ranks = 0.0
        misses = []
        for q in questions:
            results = search(args.base_url, q["question"], mode, args.k)
            rank = first_hit_rank(results, q["expected_doc"], int(q["expected_page"]))
            if rank is None:
                misses.append((q, results))
            else:
                hits += 1
                reciprocal_ranks += 1 / rank
        n = len(questions)
        rows.append((mode, hits / n, reciprocal_ranks / n))

        if args.show_misses and misses:
            print(f"\nMisses ({mode}):")
            for q, results in misses:
                got = ", ".join(f"{r['documentName'][:25]} p{r['page']}" for r in results)
                print(f"  - {q['question']!r}\n      expected {q['expected_doc']} p{q['expected_page']}; got {got}")

    label = f" ({args.label})" if args.label else ""
    print(f"\n{len(questions)} questions, k={args.k}{label}\n")
    print(f"| Configuration | Hit rate@{args.k} | MRR |")
    print("|---|---|---|")
    for mode, hit_rate, mrr in rows:
        name = f"{args.label}, {mode}" if args.label else mode
        print(f"| {name} | {hit_rate:.1%} | {mrr:.3f} |")


if __name__ == "__main__":
    main()
