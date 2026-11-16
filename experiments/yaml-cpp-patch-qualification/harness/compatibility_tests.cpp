#include <yaml-cpp/yaml.h>

#include <cstdlib>
#include <iostream>
#include <string>
#include <utility>
#include <vector>

namespace {

struct Case {
    std::string name;
    std::string input;
    std::string expected;
    bool knownQuotedTrailingCase = false;
    std::size_t trailingNewlines = 0;
};

std::string RepeatNewline(std::size_t count) {
    return std::string(count, '\n');
}

std::vector<Case> BuildCases() {
    std::vector<Case> cases{
        {"single-quoted-folding", "value: 'first\n  second'\n", "first second"},
        {"double-quoted-folding", "value: \"first\n  second\"\n", "first second"},
        {"double-quoted-escaped-break", "value: \"first\\\n  second\"\n", "firstsecond"},
        {"double-quoted-escaped-newline", R"(value: "first\nsecond")" "\n", "first\nsecond"},
        {"literal-default-clip", "value: |\n  alpha\n  beta\n", "alpha\nbeta\n"},
        {"literal-keep", "value: |+\n  alpha\n  beta\n\n\n", "alpha\nbeta\n\n\n"},
        {"literal-strip", "value: |-\n  alpha\n  beta\n\n", "alpha\nbeta"},
        {"folded-default-clip", "value: >\n  alpha\n  beta\n", "alpha beta\n"},
        {"folded-keep", "value: >+\n  alpha\n  beta\n\n\n", "alpha beta\n\n\n"},
        {"folded-strip", "value: >-\n  alpha\n  beta\n\n", "alpha beta"},
        {"japanese-utf8", "value: \"日本語\n  の説明\"\n", "日本語 の説明"},
        {"empty-double-quoted", "value: \"\"\n", ""},
        {"empty-single-quoted", "value: ''\n", ""},
        {"single-line", "value: ordinary text\n", "ordinary text"},
    };

    for (char quote : {'\'', '"'}) {
        for (std::size_t trailing = 0; trailing <= 4; ++trailing) {
            std::string input = "value: ";
            input += quote;
            input += "a\n\n  b";
            if (trailing > 0) {
                input += std::string(trailing + 1, '\n');
                input += "  ";
            }
            input += quote;
            input += '\n';

            cases.push_back({
                std::string("quoted-trailing-") + (quote == '\'' ? "single-" : "double-") + std::to_string(trailing),
                std::move(input),
                std::string("a\nb") + RepeatNewline(trailing),
                true,
                trailing});
        }
    }
    return cases;
}

bool RunCompatibilityTests() {
    std::size_t knownBaselineMismatches = 0;
    std::size_t expectedBaselineMismatches = 0;
    bool failed = false;

    for (const auto& test : BuildCases()) {
        try {
            const std::string actual = YAML::Load(test.input)["value"].as<std::string>();
            if (actual == test.expected) {
                std::cout << "PASS " << test.name << '\n';
                continue;
            }

#if !defined(QUALIFY_PATCHED)
            if (test.knownQuotedTrailingCase && test.trailingNewlines >= 2) {
                const std::string knownClipped = "a\nb\n";
                if (actual == knownClipped) {
                    ++knownBaselineMismatches;
                    std::cout << "EXPECTED_BASELINE_MISMATCH " << test.name
                              << " expected_bytes=" << test.expected.size()
                              << " actual_bytes=" << actual.size() << '\n';
                    continue;
                }
            }
#endif

            std::cerr << "FAIL " << test.name << " expected_bytes=" << test.expected.size()
                      << " actual_bytes=" << actual.size() << '\n';
            failed = true;
        } catch (const std::exception& error) {
            std::cerr << "FAIL " << test.name << " threw: " << error.what() << '\n';
            failed = true;
        }
    }

#if defined(QUALIFY_PATCHED)
    if (knownBaselineMismatches != 0) {
        std::cerr << "FAIL patched build unexpectedly recorded baseline mismatches\n";
        failed = true;
    }
#else
    for (char quote : {'\'', '"'}) {
        for (std::size_t trailing = 2; trailing <= 4; ++trailing) {
            (void)quote;
            (void)trailing;
            ++expectedBaselineMismatches;
        }
    }
    if (knownBaselineMismatches != expectedBaselineMismatches) {
        std::cerr << "FAIL expected " << expectedBaselineMismatches
                  << " known baseline mismatches, observed " << knownBaselineMismatches << '\n';
        failed = true;
    } else if (failed) {
        std::cout << "EXPECTED_BASELINE_MISMATCHES=" << knownBaselineMismatches
                  << "; additional compatibility failure(s) detected; see FAIL lines\n";
    } else {
        std::cout << "PASS baseline reproduced " << knownBaselineMismatches
                  << " known trailing-newline mismatch(es); all other compatibility cases passed\n";
    }
#endif
    return !failed;
}

} // namespace

void RunResourceBoundsQualificationTests();

int main() {
    if (!RunCompatibilityTests()) {
        return EXIT_FAILURE;
    }
    try {
        RunResourceBoundsQualificationTests();
    } catch (const std::exception& error) {
        std::cerr << "FAIL resource bounds: " << error.what() << '\n';
        return EXIT_FAILURE;
    }
    return EXIT_SUCCESS;
}
