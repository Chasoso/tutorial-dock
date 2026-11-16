# yaml-cpp 0.9.0 patch qualification

This isolated qualification harness tests the approved one-line fix from upstream [PR #1512](https://github.com/jbeder/yaml-cpp/pull/1512) against the exact yaml-cpp base commit `56e3bb550c91fd7005566f19c079cb7a503223cf`. It is not product code and does not integrate the dependency into Tutorial Dock.

## Fixed inputs

- Upstream repository: `https://github.com/jbeder/yaml-cpp`
- Base version: 0.9.0
- Base commit: `56e3bb550c91fd7005566f19c079cb7a503223cf`
- Local patch: [`patches/preserve-quoted-scalar-trailing-newlines.patch`](patches/preserve-quoted-scalar-trailing-newlines.patch)
- Patch SHA-256: `6DF0A52FB8133677A9F1E30F48105F9571CC31AE95E0A92EEFFDE64D694D38DD`
- Patch content: change only `Scanner::ScanQuotedScalar` from `params.chomp = CLIP` to `params.chomp = KEEP`. The pinned upstream source is checked out twice; the patch is applied only to the second clean checkout. The script verifies both source HEADs, patch hash, changed path, and one-line replacement before either build.

The corresponding upstream PR was still open and unmerged when this qualification was prepared. The test never checks out the PR head as a dependency. The pinned source includes the MIT license. The [upstream security policy](https://github.com/jbeder/yaml-cpp/blob/master/SECURITY.md) says only the latest release receives security updates and maintenance is best-effort; the [0.9.0 release page](https://github.com/jbeder/yaml-cpp/releases/tag/yaml-cpp-0.9.0) currently marks this tag as latest and shows its commit as verified. The [GitHub advisories page](https://github.com/jbeder/yaml-cpp/security/advisories) currently lists no published repository advisories. This does not negate CVEs recorded elsewhere or establish that the library has no vulnerabilities.

## CVE-2026-75432 applicability reassessment

The earlier note that the pinned 0.9.0 commit was affected was incorrect and is superseded by this source-level reassessment. Debian corrected its tracker entry: the vulnerable call path was introduced by `c7a86c0e1f4868abebab474a6a3e19cf27ebfaac` after the 0.9.0 tag (`56e3bb550c91fd7005566f19c079cb7a503223cf`). In the pinned `Scanner::ScanNextToken()`, the block-scalar branch goes directly to `ScanBlockScalar()` and has no conditional call to `PopIndent()` based on an unverified simple key. That conditional call is added in `c7a86c0`; the fix at `8b2e6ba` adds the matching-indent check/invalidation and an empty-stack guard. The fact that `PopIndent()` itself uses `m_indents.top()` without a guard in 0.9.0 is not, by itself, proof that this CVE path is reachable there.

The corrected [Debian tracker](https://security-tracker.debian.org/tracker/CVE-2026-75432) marks yaml-cpp as not affected because the vulnerable code was introduced later. Debian's [correction report](https://www.mail-archive.com/debian-bugs-dist%40lists.debian.org/msg2124628.html) states that its public input is rejected with `ParserException` on the archive's 0.9.0 build, while it triggers UB on an upstream snapshot after the introducing change and before the fix. This assessment is limited to CVE-2026-75432 and does not establish that yaml-cpp 0.9.0 has no other security issues.

An isolated sanitizer workflow now compares the exact pinned 0.9.0 commit, upstream `3eb39d5808c33aa93a113cb6c668fa2435ff3ecd` (after introduction, before the fix), and fix commit `8b2e6ba3288de15ed7a61d5c89cde2ed47327c1e` using the public 96-byte input from upstream [Issue #1475](https://github.com/jbeder/yaml-cpp/issues/1475). Expected outcomes are respectively safe `YAML::ParserException`, sanitizer-detected UB, and safe `YAML::ParserException`. The vulnerable revision's expected crash is a successful reproduction of the historical bug, not a security pass. Runtime statuses remain **NOT_RUN** until the workflow completes.

No part of upstream PR #1476 is added to the approved dependency patch. The newline-retention patch remains the only proposed source patch and is independently hash-checked.

## Compatibility comparison

The Windows workflow builds the same independent test program twice against static yaml-cpp with MSVC x64 and `/MT`:

1. **Baseline:** exact upstream commit, unmodified. It must reproduce the known quoted-scalar trailing-newline mismatch for both quote styles and trailing newline counts 2–4. All other cases must match their explicit expected values.
2. **Patched:** the exact base commit plus the hash-checked one-line patch. Every case must match its expected value.

The expected values are encoded independently in [`harness/compatibility_tests.cpp`](harness/compatibility_tests.cpp), based on YAML scalar folding and chomping rules. Coverage includes single- and double-quoted multiline scalars, trailing newline counts 0–4, escaped line breaks and escaped `\\n`, literal `|`/`|+`/`|-`, folded `>`/`>+`/`>-`, Japanese UTF-8, empty strings, and ordinary single-line text. The baseline mismatch is expected evidence of the defect, not a passing patched result.

## Resource-bound qualification

[`harness/resource_bounds_tests.cpp`](harness/resource_bounds_tests.cpp) qualifies a bounded event-parser path without calling `YAML::Load` or building yaml-cpp's ordinary `Node` graph:

- Check the 1 MiB byte limit before copying the bytes, constructing a stream, or invoking the parser.
- Use `YAML::Parser::HandleNextDocument(EventHandler&)`. Count collection starts and event nodes in callbacks, aborting before depth 17 or event 20,001. The 1 MiB input cap also bounds scanner/token/scalar storage.
- Count alias occurrences in `OnAlias` and abort before occurrence 129. The event callback stores at most the source event nodes and alias references; it does not expand aliases.
- After the bounded event stream has been collected, walk the retained anchor/alias graph with an active-path cycle check, counting the alias occurrence and every target node on every expansion; abort before visit 20,001 and when expansion depth exceeds 16.
- Only after this bounded parse/walk, count the lesson's steps and buttons before any typed lesson model is built. The tests cover 500/501 steps, 64/65 buttons per step, and 1,024/1,025 buttons per lesson.

The tests exercise exact and one-over boundaries, multiple documents, a cycle, and a nested-alias expansion input. This is a qualification prototype for the bounded parser path; production integration still requires applying the same order of checks and retaining the OS-independent tests. CI runs only this test executable, never the product executable, AppBar APIs, or work-area mutations.

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

- CVE-2026-75432 applicability for the pinned 0.9.0 source: **NOT_AFFECTED by source provenance; isolated sanitizer confirmation is NOT_RUN until Actions completes**. This does not assert that the parser is free of other vulnerabilities.
- Newline-patch Windows x64 compilation and compatibility/resource-bound tests: **NOT_RUN** until Actions completes.
- Product code, product build, product executable, and Windows/AppBar runtime operation: **NOT_RUN / out of scope**.
