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

The Windows workflow is intended to build the same independent test program twice against static yaml-cpp with MSVC x64 and `/MT`:

1. **Baseline:** exact upstream commit, unmodified. The run at `dea5fc58fed62b5eb26ae92f04a7d4cc0e8cbf02` built this test program and reproduced the six known quoted-scalar trailing-newline mismatches for both quote styles and trailing newline counts 2–4. It also found an additional mismatch in `folded-keep`: YAML 1.2.2 §8.1.1.2 says `+` keeps the final line break and all trailing empty lines ([specification](https://yaml.org/spec/1.2.2/)); for the fixture's three trailing line feeds, the expected value has three, while the measured scalar was one byte shorter. The log does not expose the actual escaped scalar bytes, so its exact line-break count is not confirmed. This is an unresolved compatibility discrepancy outside the PR #1512 quoted-scalar patch, so the baseline suite **FAILS**.
2. **Patched:** the exact base commit plus the hash-checked one-line patch. Every case must match its expected value.

The expected values are encoded independently in [`harness/compatibility_tests.cpp`](harness/compatibility_tests.cpp), based on YAML scalar folding and chomping rules. Coverage includes single- and double-quoted multiline scalars, trailing newline counts 0–4, escaped line breaks and escaped `\\n`, literal `|`/`|+`/`|-`, folded `>`/`>+`/`>-`, Japanese UTF-8, empty strings, and ordinary single-line text. The six quoted-scalar mismatches are expected baseline evidence; the additional folded-block mismatch is not.

The baseline CTest failure stops the script before the patched build and resource-bound tests. Those results are **NOT_RUN**; the quoted-scalar patch is not qualified by this run.

## Resource-bound qualification

[`harness/resource_bounds_tests.cpp`](harness/resource_bounds_tests.cpp) qualifies a bounded event-parser path without calling `YAML::Load` or building yaml-cpp's ordinary `Node` graph:

- Check the 1 MiB byte limit before copying the bytes, constructing a stream, or invoking the parser.
- Use `YAML::Parser::HandleNextDocument(EventHandler&)`. Count collection starts and event nodes in callbacks, aborting before depth 17 or event 20,001. The 1 MiB input cap also bounds scanner/token/scalar storage.
- Count alias occurrences in `OnAlias` and abort before occurrence 129. The event callback stores at most the source event nodes and alias references; it does not expand aliases.
- After the bounded event stream has been collected, walk the retained anchor/alias graph with an active-path cycle check, counting the alias occurrence and every target node on every expansion; abort before visit 20,001 and when expansion depth exceeds 16.
- Only after this bounded parse/walk, count the lesson's steps and buttons before any typed lesson model is built. The tests cover 500/501 steps, 64/65 buttons per step, and 1,024/1,025 buttons per lesson.

The test code is designed to exercise exact and one-over boundaries, multiple documents, a cycle, and a nested-alias expansion input. Because compatibility fails first, none of these resource-bound cases has run. This is a qualification prototype for the bounded parser path; production integration still requires applying the same order of checks and retaining the OS-independent tests. CI runs only this test executable, never the product executable, AppBar APIs, or work-area mutations.

## Reproduction

The `yaml-cpp pinned patch qualification` GitHub Actions workflow has two isolated jobs:

- `ubuntu-24.04` builds the public CVE PoC with ASan/UBSan against the three pinned revisions above and records each outcome in a separate artifact.
- `windows-2022` checks out two copies of the fixed 0.9.0 base, verifies the newline patch SHA-256, applies it to the second copy, then builds and runs the baseline and patched compatibility/resource-bound harness using x64, static yaml-cpp, and `/MT`.

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

Recorded qualification run: HEAD `f423655326636a7385488d4de77ebe42bbf766df` — [GitHub Actions run 43930688246](https://github.com/Chasoso/tutorial-dock/actions/runs/43930688246). The baseline compatibility finding originated on `dea5fc58fed62b5eb26ae92f04a7d4cc0e8cbf02` and was confirmed at this recorded HEAD. This run also verifies the harness now reports the extra compatibility failure without claiming the other cases passed.

- CVE-2026-75432 applicability for pinned 0.9.0: **NOT_AFFECTED by source provenance**. The three-revision ASan/UBSan matrix **PASS**ed: pinned 0.9.0 and the fix commit returned the expected parser exception; the post-introduction/pre-fix revision produced the expected sanitizer finding. This is specific to this CVE and does not establish that the parser has no other vulnerabilities.
- Patch SHA-256 `CC023C13AF13A4F836922B87DA72BB51EA7A7C752AAC861A75F7A066E0EA3141`, hunk integrity, and application to the pinned source: **PASS** on Windows CI.
- Windows x64 baseline build: **PASS** with MSVC 19.44.35230.0 and Windows SDK 10.0.26100.0; static yaml-cpp and `/MT` configuration checks passed.
- Baseline scalar compatibility: **FAIL** because of the additional `folded-keep` discrepancy described above. The six quoted-scalar baseline mismatches were expected reproductions.
- Patched parser build and compatibility tests: **NOT_RUN** because the baseline suite stopped first.
- Resource-bound runtime tests: **NOT_RUN** because the compatibility suite stopped first. Resource enforcement is therefore not qualified.
- T001: **NOT_PASSED / STOPPED**. The new block-scalar discrepancy is unresolved and resource-limit execution is outstanding; do not resume T002–T008 or integrate yaml-cpp into product code.
- T002–T008: **NOT_STARTED**.
- Product code, product build/executable, and Windows/AppBar runtime operation: **NOT_RUN / out of scope**.
