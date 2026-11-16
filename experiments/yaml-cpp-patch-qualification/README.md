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

The source-level failure is in the pinned `ScanScalar()` `FOLD_BLOCK` path: it accumulates empty-line breaks in `foldedNewlineCount`, then emits `foldedNewlineCount - 1` when the next line is no longer empty, alongside the current line-break handling. For this terminal `>+` case the result is one LF short. The quoted-scalar patch changes `ScanQuotedScalar()` only, so it does not affect this block-scalar path. This identifies the relevant implementation path for the tested input; it does not authorize or include a fix.

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

Detailed exact-HEAD result set: `178836ab8632fc15788ba9b4691280a8215040e0`; Actions run [#43960681565](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565) completed with overall **FAIL** because both required compatibility checks fail. The Windows job used MSVC 19.44.35230.0, Windows SDK 10.0.26100.0, x64, static yaml-cpp, and `/MT`. Compilation succeeded for both variants; upstream conversion warnings were emitted. This record describes the qualification result at that exact HEAD; subsequent README-only commits do not change the harness and their exact-HEAD workflow result is recorded in the PR.

- Patch integrity: **PASS**. The verified SHA-256 is `CC023C13AF13A4F836922B87DA72BB51EA7A7C752AAC861A75F7A066E0EA3141`, and the applied diff was the approved one-line replacement in `src/scantoken.cpp`.
- Baseline build: **PASS**. Patched build: **PASS**.
- A — baseline compatibility: **FAIL**. `folded-keep` measured 12 bytes instead of the 13-byte YAML 1.2.2 value. The six known quoted-scalar trailing-newline differences (single and double quoted, counts 2–4) were reported as expected baseline mismatches; other listed compatibility cases passed.
- B — patched compatibility: **FAIL**. The approved patch fixed the quoted-scalar trailing-newline cases 0–4, but `folded-keep` remained 12 bytes instead of 13. Other listed compatibility cases passed.
- C — baseline resource bounds: **PASS**. D — patched resource bounds: **PASS**. Both suites recorded: 1 MiB accepted / +1 byte rejected before parser construction; depth 16 / 17; alias occurrences 128 / 129; steps 500 / 501; buttons per step 64 / 65; buttons per lesson 1,024 / 1,025; physical event nodes 20,000 / reject before 20,001; expanded alias visits 20,000 / reject before 20,001; plus multiple-document, cyclic-alias, malformed-input rejection. The 307-byte adversarial alias graph was stopped at the visit budget; measured walk time was 0 ms at millisecond resolution.
- Independent PyYAML 6.0.2 folded-keep reference: **PASS**. It parsed the same 27-byte input with three terminal LF bytes as 13 bytes, matching the YAML 1.2.2 expectation.
- CVE-2026-75432 three-revision ASan/UBSan matrix: **PASS** on this run: pinned 0.9.0 and fixed revision produced the expected safe parser exception; the post-introduction/pre-fix revision reproduced the expected sanitizer finding. This conclusion applies only to this CVE.
- Artifacts for this result set: [summary and logs](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565/artifacts/14274950975), [A baseline compatibility](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565/artifacts/14274031354), [B patched compatibility](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565/artifacts/14274711054), [C baseline resource bounds](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565/artifacts/14274760989), [D patched resource bounds](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565/artifacts/14274536290), [PyYAML reference](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565/artifacts/14273826218), and the [three-revision CVE matrix](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565). The individual CVE artifacts are [pinned 0.9.0](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565/artifacts/14273692138), [vulnerable intermediate revision](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565/artifacts/14275170109), and [fixed revision](https://github.com/Chasoso/tutorial-dock/actions/runs/43960681565/artifacts/14273139629).
- Resource-limit evidence applies to this isolated bounded `EventHandler` qualification harness. It shows the configured callbacks and expanded walk enforcing the tested budgets; it does not prove a future product file reader checks the byte limit before reading, nor does it measure every parser-internal allocation/peak memory under product integration. The 1 MiB input cap bounds parser input; product integration must preserve the pre-read check and bounded event path.
- T001: **NOT_PASSED / STOPPED** because the folded-block compatibility requirement fails in both variants. C/D passing does not override A/B; do not integrate yaml-cpp or start product implementation based on these qualification tests.
- T002–T008: **NOT_STARTED**.
- Product code, product build/executable, and Windows/AppBar runtime operation: **NOT_RUN / out of scope**.
