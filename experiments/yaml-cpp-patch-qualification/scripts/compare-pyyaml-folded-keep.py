#!/usr/bin/env python3
"""Independent YAML scalar reference check for the canonical folded-keep fixture."""

import json
import pathlib
import sys

import yaml


def escaped(value: str) -> str:
    return json.dumps(value, ensure_ascii=True)


def hex_bytes(value: bytes) -> str:
    return " ".join(f"{byte:02X}" for byte in value)


def main() -> int:
    script = pathlib.Path(__file__).resolve()
    fixture = script.parent.parent / "harness" / "fixtures" / "folded-keep-input.hex"
    report_path = pathlib.Path(sys.argv[1])
    input_bytes = bytes.fromhex(fixture.read_text(encoding="ascii").strip())
    expected = "alpha beta\n\n\n"
    parsed = yaml.safe_load(input_bytes.decode("utf-8"))
    actual = parsed["value"]

    report = {
        "parser": "PyYAML",
        "version": yaml.__version__,
        "input_bytes": len(input_bytes),
        "input_terminal_lf_count": len(input_bytes) - len(input_bytes.rstrip(b"\n")),
        "input_escaped": escaped(input_bytes.decode("utf-8")),
        "input_hex": hex_bytes(input_bytes),
        "expected_bytes": len(expected.encode("utf-8")),
        "expected_escaped": escaped(expected),
        "expected_hex": hex_bytes(expected.encode("utf-8")),
        "actual_bytes": len(actual.encode("utf-8")),
        "actual_escaped": escaped(actual),
        "actual_hex": hex_bytes(actual.encode("utf-8")),
        "result": "PASS" if actual == expected else "FAIL",
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if actual == expected else 1


if __name__ == "__main__":
    raise SystemExit(main())
