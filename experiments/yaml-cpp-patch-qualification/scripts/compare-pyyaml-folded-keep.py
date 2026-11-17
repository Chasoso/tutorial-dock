#!/usr/bin/env python3
"""Validate the shared block-scalar vectors with independent PyYAML."""

import json
import pathlib
import sys

import yaml


def escaped(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def hex_bytes(value: bytes) -> str:
    return " ".join(f"{byte:02X}" for byte in value)


def terminal_line_break_count(value: bytes) -> int:
    count = 0
    position = len(value)
    while position:
        if value[position - 1] == 0x0A:
            position -= 1
            if position and value[position - 1] == 0x0D:
                position -= 1
            count += 1
        elif value[position - 1] == 0x0D:
            position -= 1
            count += 1
        else:
            break
    return count


def load_vectors(root: pathlib.Path) -> list[dict[str, str]]:
    fixture = root / "harness" / "fixtures" / "folded-keep-input.hex"
    canonical_input = bytes.fromhex(fixture.read_text(encoding="ascii").strip())
    vectors = [{
        "name": "folded-keep",
        "input": canonical_input,
        "expected": b"alpha beta\n\n\n",
        "baseline_legacy_actual": b"alpha beta\n\n",
    }]
    matrix = root / "harness" / "fixtures" / "block-scalar-cases.tsv"
    for line_number, line in enumerate(matrix.read_text(encoding="ascii").splitlines(), 1):
        if not line or line.startswith("#"):
            continue
        fields = line.split("\t")
        if len(fields) != 4:
            raise ValueError(f"malformed vector at {matrix.name}:{line_number}")
        name, input_hex, expected_hex, legacy_hex = fields
        vectors.append({
            "name": name,
            "input": bytes.fromhex(input_hex),
            "expected": bytes.fromhex(expected_hex),
            "baseline_legacy_actual": b"" if legacy_hex == "-" else bytes.fromhex(legacy_hex),
        })
    if len(vectors) != 50:
        raise ValueError(f"expected 50 total vectors, observed {len(vectors)}")
    legacy_names = {v["name"] for v in vectors if v["baseline_legacy_actual"]}
    if legacy_names != {
        "folded-keep", "simple-folded-keep-tail-2", "simple-folded-keep-tail-4",
        "middle-empty-folded-keep", "more-indented-folded-keep", "crlf-folded-keep",
        "japanese-folded-keep",
    }:
        raise ValueError(f"unexpected baseline exception vectors: {sorted(legacy_names)}")
    for vector in vectors:
        legacy = vector["baseline_legacy_actual"]
        if legacy and (not vector["expected"].endswith(b"\n\n") or legacy != vector["expected"][:-1]):
            raise ValueError(f"baseline exception is not exactly one trailing LF short: {vector['name']}")
    return vectors


def main() -> int:
    script_root = pathlib.Path(__file__).resolve().parent.parent
    report_path = pathlib.Path(sys.argv[1])
    vectors = load_vectors(script_root)
    results = []
    for vector in vectors:
        input_bytes = vector["input"]
        expected = vector["expected"]
        error = None
        try:
            parsed = yaml.safe_load(input_bytes.decode("utf-8"))
            actual = parsed["value"].encode("utf-8")
            status = "PASS" if actual == expected else "FAIL"
        except Exception as exception:  # Keep collecting independent vector evidence.
            actual = None
            status = "FAIL"
            error = f"{type(exception).__name__}: {exception}"
        row = {
            "name": vector["name"],
            "input_bytes": len(input_bytes),
            "input_terminal_line_breaks": terminal_line_break_count(input_bytes),
            "input_escaped": escaped(input_bytes.decode("utf-8")),
            "input_hex": hex_bytes(input_bytes),
            "expected_bytes": len(expected),
            "expected_escaped": escaped(expected.decode("utf-8")),
            "expected_hex": hex_bytes(expected),
            "actual_bytes": len(actual) if actual is not None else None,
            "actual_escaped": escaped(actual.decode("utf-8")) if actual is not None else None,
            "actual_hex": hex_bytes(actual) if actual is not None else None,
            "result": status,
        }
        if error is not None:
            row["error"] = error
        results.append(row)
    report = {
        "parser": "PyYAML",
        "version": yaml.__version__,
        "vector_count": len(results),
        "result": "PASS" if all(row["result"] == "PASS" for row in results) else "FAIL",
        "vectors": results,
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["result"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
