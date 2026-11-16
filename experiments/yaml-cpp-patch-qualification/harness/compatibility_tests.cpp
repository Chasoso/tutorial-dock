#include <yaml-cpp/yaml.h>

#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <sstream>
#include <stdexcept>
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

std::string ReadHexFixture(const char* name) {
    std::ifstream input(name, std::ios::binary);
    if (!input) {
        throw std::runtime_error(std::string("could not open hex fixture: ") + name);
    }
    std::string encoded;
    encoded.assign(std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>());
    const auto nibble = [](char value) -> unsigned int {
        if (value >= '0' && value <= '9') return static_cast<unsigned int>(value - '0');
        if (value >= 'a' && value <= 'f') return static_cast<unsigned int>(value - 'a' + 10);
        if (value >= 'A' && value <= 'F') return static_cast<unsigned int>(value - 'A' + 10);
        throw std::runtime_error("hex fixture contains a non-hexadecimal character");
    };
    std::string decoded;
    decoded.reserve(encoded.size() / 2);
    bool haveHighNibble = false;
    unsigned int highNibble = 0;
    for (char character : encoded) {
        if (character == ' ' || character == '\t' || character == '\r' || character == '\n') {
            continue;
        }
        const unsigned int value = nibble(character);
        if (!haveHighNibble) {
            highNibble = value;
            haveHighNibble = true;
        } else {
            decoded.push_back(static_cast<char>((highNibble << 4) | value));
            haveHighNibble = false;
        }
    }
    if (haveHighNibble) {
        throw std::runtime_error("hex fixture has an odd number of hexadecimal digits");
    }
    return decoded;
}

std::size_t CountTerminalLineFeeds(const std::string& value) {
    std::size_t count = 0;
    for (auto it = value.rbegin(); it != value.rend() && *it == '\n'; ++it) {
        ++count;
    }
    return count;
}

std::string EscapeBytes(const std::string& value) {
    std::ostringstream escaped;
    escaped << '"';
    for (unsigned char byte : value) {
        switch (byte) {
            case '\\': escaped << "\\\\"; break;
            case '"': escaped << "\\\""; break;
            case '\n': escaped << "\\n"; break;
            case '\r': escaped << "\\r"; break;
            case '\t': escaped << "\\t"; break;
            default:
                if (byte >= 0x20 && byte <= 0x7e) {
                    escaped << static_cast<char>(byte);
                } else {
                    escaped << "\\x" << std::hex << std::setw(2) << std::setfill('0')
                            << static_cast<unsigned int>(byte) << std::dec;
                }
        }
    }
    escaped << '"';
    return escaped.str();
}

std::string HexBytes(const std::string& value) {
    std::ostringstream hex;
    hex << std::hex << std::uppercase << std::setfill('0');
    for (std::size_t i = 0; i < value.size(); ++i) {
        if (i != 0) hex << ' ';
        hex << std::setw(2) << static_cast<unsigned int>(static_cast<unsigned char>(value[i]));
    }
    return hex.str();
}

void PrintFoldedKeepObservation(const Case& test, const std::string& actual) {
    std::cout << "OBSERVATION " << test.name
              << " input_bytes=" << test.input.size()
              << " input_terminal_lf=" << CountTerminalLineFeeds(test.input)
              << " expected_bytes=" << test.expected.size()
              << " actual_bytes=" << actual.size() << '\n'
              << "INPUT_ESCAPED=" << EscapeBytes(test.input) << '\n'
              << "INPUT_HEX=" << HexBytes(test.input) << '\n'
              << "EXPECTED_ESCAPED=" << EscapeBytes(test.expected) << '\n'
              << "EXPECTED_HEX=" << HexBytes(test.expected) << '\n'
              << "ACTUAL_ESCAPED=" << EscapeBytes(actual) << '\n'
              << "ACTUAL_HEX=" << HexBytes(actual) << '\n';
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
        {"folded-keep", "", "alpha beta\n\n\n"},
        {"folded-strip", "value: >-\n  alpha\n  beta\n\n", "alpha beta"},
        {"japanese-utf8", "value: \"日本語\n  の説明\"\n", "日本語 の説明"},
        {"empty-double-quoted", "value: \"\"\n", ""},
        {"empty-single-quoted", "value: ''\n", ""},
        {"single-line", "value: ordinary text\n", "ordinary text"},
    };

    bool loadedFoldedFixture = false;
    for (auto& test : cases) {
        if (test.name == "folded-keep") {
            test.input = ReadHexFixture("folded-keep-input.hex");
            loadedFoldedFixture = true;
            break;
        }
    }
    if (!loadedFoldedFixture) {
        throw std::runtime_error("folded-keep case is missing");
    }

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
#if !defined(QUALIFY_PATCHED)
    std::size_t knownBaselineMismatches = 0;
    std::size_t expectedBaselineMismatches = 0;
#endif
    bool failed = false;

    for (const auto& test : BuildCases()) {
        try {
            const std::string actual = YAML::Load(test.input)["value"].as<std::string>();
            if (test.name == "folded-keep") {
                PrintFoldedKeepObservation(test, actual);
            }
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
                              << " actual_bytes=" << actual.size()
                              << " expected_escaped=" << EscapeBytes(test.expected)
                              << " actual_escaped=" << EscapeBytes(actual)
                              << " expected_hex=" << HexBytes(test.expected)
                              << " actual_hex=" << HexBytes(actual) << '\n';
                    continue;
                }
            }
#endif

            std::cerr << "FAIL " << test.name << " expected_bytes=" << test.expected.size()
                      << " actual_bytes=" << actual.size()
                      << " expected_escaped=" << EscapeBytes(test.expected)
                      << " actual_escaped=" << EscapeBytes(actual)
                      << " expected_hex=" << HexBytes(test.expected)
                      << " actual_hex=" << HexBytes(actual) << '\n';
            failed = true;
        } catch (const std::exception& error) {
            std::cerr << "FAIL " << test.name << " threw: " << error.what() << '\n';
            failed = true;
        }
    }

#if !defined(QUALIFY_PATCHED)
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
    try {
        return RunCompatibilityTests() ? EXIT_SUCCESS : EXIT_FAILURE;
    } catch (const std::exception& error) {
        std::cerr << "FAIL compatibility harness: " << error.what() << '\n';
        return EXIT_FAILURE;
    }
}
