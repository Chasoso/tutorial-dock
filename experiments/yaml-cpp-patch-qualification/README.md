# yaml-cpp 0.9.0 patch qualification

This isolated qualification harness tests the approved one-line fix from upstream [PR #1512](https://github.com/jbeder/yaml-cpp/pull/1512) against the exact yaml-cpp base commit `56e3bb550c91fd7005566f19c079cb7a503223cf`. It is not product code and does not integrate the dependency into Tutorial Dock.

## Fixed inputs

- Upstream repository: `https://github.com/jbeder/yaml-cpp`
- Base version: 0.9.0
- Base commit: `56e3bb550c91fd7005566f19c079cb7a503223cf`
- Local patch: [`patches/preserve-quoted-scalar-trailing-newlines.patch`](patches/preserve-quoted-scalar-trailing-newlines.patch)
- Patch SHA-256: `CC023C13AF13A4F836922B87DA72BB51EA7A7C752AAC861A75F7A066E0EA3141` (LF-normalized file; `.gitattributes` preserves LF on Windows)
- Patch content: change only `Scanner::ScanQuotedScalar` from `params.chomp = CLIP` to `params.chomp = KEEP`. The pinned upstream source is checked out twice; the patch is applied only to the second clean checkout. The script verifies both source HEADs, patch hash, changed path, and one-line replacement before either build.

The corresponding upstream PR was still open and unmerged when this qualification was prepared. The test never checks out the PR head as a dependency. The pinned source includes the MIT license. The [upstream security policy](https://github.com/jbeder/yaml-cpp/blob/master/SECURITY.md) says only the latest release receives security updates and maintenance is best-effort; the [0.9.0 release page](https://github.com/jbeder/yaml-cpp/releases/tag/yaml-cpp-0.9.0) currently marks this tag as latest and shows its commit as verified. The [GitHub advisories page](https://github.com/jbeder/yaml-cpp/security/advisories) currently lists no published repository advisories. This does not negate CVEs recorded elsewhere or establish that the library has no vulnerabilities.

## CVE-2026-75432 applicability reassessment

The earlier note that the pinned 0.9.0 commit was affected was incorrect and is superseded by this source-level reassessment. Debian corrected its tracker entry: the vulnerable call path was introduced by `c7a86c0e1f4868abebab474a6a3e19cf27ebfaac` after the 0.9.0 tag (`56e3bb550c91fd7005566f19c079cb7a503223cf`). In the pinned `Scanner::ScanNextToken()`, the block-scalar branch goes directly to `ScanBlockScalar()` and has no conditional call to `PopIndent()` based on an unverified simple key. That conditional call is added in `c7a86c0`; the fix at `8b2e6ba` adds the matching-indent check/invalidation and an empty-stack guard. The fact that `PopIndent()` itself uses `m_indents.top()` without a guard in 0.9.0 is not, by itself, proof that this CVE path is reachable there.

The corrected [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2026-75432) marks yaml-cpp as not affected because the vulnerable code was introduced later. Debian's [correction report](https://www.mail-archive.com/debian-bugs-dist%40lists.debian.org/msg2124628.html) states that its public input is rejected with `ParserException` on the archive's 0.9.0 build, while it triggers UB on an upstream snapshot after the introducing change and before the fix. This assessment is limited to CVE-2026-75432 and does not establish that yaml-cpp 0.9.0 has no other security issues.

An isolated sanitizer workflow compares the exact pinned 0.9.0 commit, upstream `3eb39d5808c33aa93a113cb6c668fa2435ff3ecd` (after introduction, before the fix), and fix commit `8b2e6ba3288de15ed7a61d5c89cde2ed47327c1e` using the public 96-byte input from upstream [Issue #1475](https://github.com/jbeder/yaml-cpp/issues/1475). Expected outcomes are respectively safe `YAML::ParserException`, sanitizer-detected UB, and safe `YAML::ParserException`. The vulnerable revision's expected crash is a successful reproduction of the historical bug, not a security pass. Runtime outcomes for the recorded run are listed in the Verification status section; later commits must be evaluated using their exact-head Actions run.

No part of upstream PR #1476 is added to the approved dependency patch. The newline-retention patch remains the only proposed source patch and is independently hash-checked.

## Compatibility comparison

The Windows workflow builds separate compatibility and resource-bound test executables against two independent checkouts of the pinned source (MSVC x64, static yaml-cpp, `/MT`). The scalar fixture [`harness/fixtures/folded-keep-input.hex`](harness/fixtures/folded-keep-input.hex) is a hex representation of the exact YAML bytes, shared by the C++ harness and the independent PyYAML job. This representation preserves the three terminal LFs without a blank line at EOF in the tracked text file.

The `folded-keep` input bytes are exactly `value: >+\n  alpha\n  beta\n\n\n` (27 bytes; three LF bytes after `beta`). YAML 1.2.2 §8.1.1.2 defines keep chomping to retain the final line break and all trailing empty lines, while §8.1.3 folds the break between `alpha` and `beta` to one space; the scalar expected value is therefore `alpha beta\n\n\n` (13 UTF-8 bytes). The expected value follows the normative rule, not the previous yaml-cpp measurement. See the [YAML 1.2.2 block chomping rules](https://yaml.org/spec/1.2.2/#8112-block-chomping-indicator).

The C++ report prints the fixture's escaped bytes, hex, terminal-LF count, expected scalar, actual scalar, and lengths for both variants. The PyYAML report independently parses the same file and records the same input/expected/actual fields. Compatibility coverage also includes single- and double-quoted multiline scalars, trailing newline counts 0–4, escaped line breaks and escaped `\\n`, literal `|`/`|+`/`|-`, folded `>`/`>`-strip, Japanese UTF-8, empty strings, and ordinary single-line text.

The six known baseline quoted-scalar differences (both quote styles, terminal newline counts 2–4) are classified as expected baseline findings only when the actual bytes match the recorded legacy result. Any additional difference—including `folded-keep`—is an unexpected compatibility failure. The approved one-line patch affects `ScanQuotedScalar()`; the block-scalar path is selected separately by `ScanBlockScalar()`. No additional parser patch is applied during this qualification.

## Resource-bound qualification

[`harness/resource_bounds_tests.cpp`](harness/resource_bounds_tests.cpp) exercises the bounded event-parser path without calling `YAML::Load` or building yaml-cpp's ordinary `Node` graph. Each resource suite is run as its own CTest test, independently for baseline and patched source:

- Check the 1 MiB byte limit before copying the bytes, constructing a stream, or invoking the parser.
- Use `YAML::Parser::HandleNextDocument(EventHandler&)`. Count collection starts and event nodes in callbacks, aborting before depth 17 or event 20,001. The 1 MiB input cap also bounds scanner/token/scalar storage.
- Count alias occurrences in `OnAlias` and abort before occurrence 129. The event callback stores at most the source event nodes and alias references; it does not expand aliases.
- After the bounded event stream has been collected, walk the retained anchor/alias graph with an active-path cycle check, counting the alias occurrence and every target node on every expansion; abort before visit 20,001 and when expansion depth exceeds 16.
- Only after this bounded parse/walk, count the lesson's steps and buttons before any typed lesson model is built. The tests cover exact/one-over boundaries for 500/501 steps, 64/65 buttons per step, and 1,024/1,025 buttons per lesson.
- Test an exact 20,000-node expanded alias walk and verify rejection before visit 20,001, separately from the physical event-node storage cap. A repeated-target alias graph also records input size and bounded-walk time; CTest imposes a 60-second process timeout.

The event callbacks do not expand aliases. They retain no more than 20,000 physical event nodes and 128 alias occurrences; expansion is a later bounded walk with active-path cycle detection and an independent 20,000-visit counter. The 1 MiB limit is checked before the harness copies input bytes or constructs the parser. This isolates parser/event-path behavior, but does not prove a future product file-reader applies the byte cap before reading or that future integration preserves the same checks. CI executes only qualification harnesses, never Tutorial Dock's product executable, AppBar APIs, or work-area mutations.

## Reproduction

The `yaml-cpp pinned patch qualification` GitHub Actions workflow has three isolated jobs:

- `ubuntu-24.04` builds the public CVE PoC with ASan/UBSan against the three pinned revisions above and records each outcome in a separate artifact.
- `windows-2022` checks out two copies of the fixed 0.9.0 base, verifies the newline patch SHA-256, applies it to the second copy, builds both harnesses using x64, static yaml-cpp, and `/MT`, then runs A/B/C/D as separate invocations. Failures are recorded per check and do not prevent the other buildable checks from running. The job's final exit is nonzero if any required check is `FAIL` or `NOT_RUN`.
- `ubuntu-24.04` installs pinned test-only PyYAML 6.0.2 and parses the canonical `folded-keep` fixture independently; it saves the exact byte report even on mismatch.

For the CVE comparison, the public report's exact 96-byte input is embedded as base64 in [`cve-harness/main.cpp`](cve-harness/main.cpp), decoded with an explicit length check, and passed to `YAML::Load(std::string)`. The matrix checks out the three source revisions independently. The two safe revisions must produce a `YAML::ParserException`; the intermediate vulnerable revision must produce an ASan/UBSan diagnostic and a nonzero process result. Each case has a separate artifact containing the sanitizer output and classification. A crash without a sanitizer diagnostic is not counted as reproducing the reported issue.

The equivalent runner command is:

```powershell
$buildRoot = Join-Path $env:TEMP 'yaml-cpp-patch-qualification'
./experiments/yaml-cpp-patch-qualification/scripts/run-qualification.ps1 `
  -BaselineSource '<clean yaml-cpp 0.9.0 checkout>' `
  -PatchedSource '<second clean yaml-cpp 0.9.0 checkout>' `
  -BuildRoot $buildRoot
```

The script refuses to overwrite an existing build directory. It requires CMake, Git, and an x64 MSVC/Windows SDK developer environment; no source is fetched by the script itself.

## Verification status

The latest run's exact HEAD, A/B/C/D status, PyYAML reference status, per-check artifact links, and actual byte values are recorded here after Actions completes. Until that result is recorded, all new runtime checks remain **NOT_RUN**. The prior run and its limited evidence remain in the PR history; it is not evidence for the updated harness.

- CVE-2026-75432 applicability for pinned 0.9.0: **NOT_AFFECTED by source provenance**. The previously recorded three-revision ASan/UBSan matrix **PASS**ed at the exact then-tested HEAD; this is specific to this CVE and does not establish that the parser has no other vulnerabilities.
- Patch SHA-256 `CC023C13AF13A4F836922B87DA72BB51EA7A7C752AAC861A75F7A066E0EA3141`: **NOT_RUN** for this new workflow revision until its Windows run verifies the hash and hunk.
- A — baseline compatibility: **NOT_RUN** until the updated Windows workflow executes.
- B — patched compatibility: **NOT_RUN** until the updated Windows workflow executes.
- C — baseline resource bounds: **NOT_RUN** until the updated Windows workflow executes.
- D — patched resource bounds: **NOT_RUN** until the updated Windows workflow executes.
- Independent PyYAML `folded-keep` comparison: **NOT_RUN** until its reference job executes.
- T001: **NOT_PASSED / STOPPED** pending the independent results, especially folded-keep and resource-limit safety. Do not resume T002–T008 or integrate yaml-cpp into product code.
- T002–T008: **NOT_STARTED**.
- Product code, product build/executable, and Windows/AppBar runtime operation: **NOT_RUN / out of scope**.
