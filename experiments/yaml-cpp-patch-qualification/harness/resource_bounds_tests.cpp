#include <yaml-cpp/eventhandler.h>
#include <yaml-cpp/parser.h>

#include <algorithm>
#include <cstddef>
#include <iostream>
#include <memory>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <unordered_map>
#include <utility>
#include <vector>

namespace {

constexpr std::size_t kMaxFileBytes = 1024 * 1024;
constexpr std::size_t kMaxCollectionDepth = 16;
constexpr std::size_t kMaxSteps = 500;
constexpr std::size_t kMaxButtonsPerStep = 64;
constexpr std::size_t kMaxButtonsPerLesson = 1'024;
constexpr std::size_t kMaxAliasReferences = 128;
constexpr std::size_t kMaxVisitedNodes = 20'000;

class BudgetError final : public std::runtime_error {
public:
    explicit BudgetError(const char* reason) : std::runtime_error(reason) {}
};

struct ScanStats {
    std::size_t eventNodes = 0;
    std::size_t aliases = 0;
    std::size_t expandedVisits = 0;
    std::size_t steps = 0;
    std::size_t buttons = 0;
};

class BoundedEventTree final : public YAML::EventHandler {
public:
    void OnDocumentStart(const YAML::Mark&) override {
        if (++documentCount_ > 1) {
            throw BudgetError("multiple-documents");
        }
    }

    void OnDocumentEnd() override {}

    void OnNull(const YAML::Mark&, YAML::anchor_t anchor) override {
        Add(NodeKind::Null, anchor);
    }

    void OnAlias(const YAML::Mark&, YAML::anchor_t anchor) override {
        if (++stats_.aliases > kMaxAliasReferences) {
            throw BudgetError("alias-reference-limit");
        }
        Node* node = Add(NodeKind::Alias, YAML::NullAnchor);
        node->aliasTarget = anchor;
    }

    void OnScalar(const YAML::Mark&, const std::string&, YAML::anchor_t anchor,
                  const std::string& value) override {
        Node* node = Add(NodeKind::Scalar, anchor);
        node->value = value;
    }

    void OnSequenceStart(const YAML::Mark&, const std::string&, YAML::anchor_t anchor,
                         YAML::EmitterStyle::value) override {
        StartCollection(NodeKind::Sequence, anchor);
    }

    void OnSequenceEnd() override { EndCollection(); }

    void OnMapStart(const YAML::Mark&, const std::string&, YAML::anchor_t anchor,
                    YAML::EmitterStyle::value) override {
        StartCollection(NodeKind::Mapping, anchor);
    }

    void OnMapEnd() override { EndCollection(); }

    ScanStats ValidateExpandedWalk() {
        if (documentCount_ == 0 || root_ == nullptr) {
            return stats_;
        }
        std::vector<const Node*> active;
        Visit(root_, 0, active);
        ValidateLessonActionBounds();
        return stats_;
    }

private:
    enum class NodeKind { Null, Scalar, Alias, Sequence, Mapping };

    struct Node {
        NodeKind kind;
        YAML::anchor_t aliasTarget = YAML::NullAnchor;
        std::string value;
        std::vector<Node*> children;
    };

    Node* Add(NodeKind kind, YAML::anchor_t anchor) {
        if (stats_.eventNodes >= kMaxVisitedNodes) {
            throw BudgetError("event-node-limit");
        }
        ++stats_.eventNodes;

        auto owner = std::make_unique<Node>();
        owner->kind = kind;
        Node* node = owner.get();
        nodes_.push_back(std::move(owner));
        if (anchor != YAML::NullAnchor) {
            anchors_[anchor] = node;
        }
        if (containers_.empty()) {
            if (root_ != nullptr) {
                throw BudgetError("multiple-root-nodes");
            }
            root_ = node;
        } else {
            containers_.back()->children.push_back(node);
        }
        return node;
    }

    void StartCollection(NodeKind kind, YAML::anchor_t anchor) {
        if (containers_.size() >= kMaxCollectionDepth) {
            throw BudgetError("collection-depth-limit");
        }
        Node* node = Add(kind, anchor);
        containers_.push_back(node);
    }

    void EndCollection() {
        if (containers_.empty()) {
            throw BudgetError("collection-stack-underflow");
        }
        containers_.pop_back();
    }

    void Visit(const Node* node, std::size_t parentDepth,
               std::vector<const Node*>& active) {
        if (stats_.expandedVisits >= kMaxVisitedNodes) {
            throw BudgetError("expanded-node-limit");
        }
        ++stats_.expandedVisits;

        if (node->kind == NodeKind::Alias) {
            const auto target = anchors_.find(node->aliasTarget);
            if (target == anchors_.end()) {
                throw BudgetError("unresolved-alias-target");
            }
            if (std::find(active.begin(), active.end(), target->second) != active.end()) {
                throw BudgetError("cyclic-alias");
            }
            Visit(target->second, parentDepth, active);
            return;
        }

        const bool collection = node->kind == NodeKind::Sequence || node->kind == NodeKind::Mapping;
        const std::size_t childDepth = parentDepth + (collection ? 1 : 0);
        if (childDepth > kMaxCollectionDepth) {
            throw BudgetError("expanded-collection-depth-limit");
        }
        if (!collection) {
            return;
        }

        active.push_back(node);
        for (const Node* child : node->children) {
            Visit(child, childDepth, active);
        }
        active.pop_back();
    }

    const Node* ResolveAlias(const Node* node) const {
        std::vector<const Node*> seen;
        while (node != nullptr && node->kind == NodeKind::Alias) {
            if (std::find(seen.begin(), seen.end(), node) != seen.end()) {
                throw BudgetError("cyclic-alias");
            }
            seen.push_back(node);
            const auto target = anchors_.find(node->aliasTarget);
            if (target == anchors_.end()) {
                throw BudgetError("unresolved-alias-target");
            }
            node = target->second;
        }
        return node;
    }

    const Node* FindField(const Node* mapping, const char* name) const {
        mapping = ResolveAlias(mapping);
        if (mapping == nullptr || mapping->kind != NodeKind::Mapping) {
            return nullptr;
        }
        for (std::size_t i = 0; i + 1 < mapping->children.size(); i += 2) {
            const Node* key = ResolveAlias(mapping->children[i]);
            if (key != nullptr && key->kind == NodeKind::Scalar && key->value == name) {
                return mapping->children[i + 1];
            }
        }
        return nullptr;
    }

    void ValidateLessonActionBounds() {
        const Node* steps = ResolveAlias(FindField(root_, "steps"));
        if (steps == nullptr || steps->kind != NodeKind::Sequence) {
            return; // Schema validation reports shape errors after this safety walk.
        }
        if (steps->children.size() > kMaxSteps) {
            throw BudgetError("step-count-limit");
        }
        stats_.steps = steps->children.size();
        for (const Node* step : steps->children) {
            const Node* buttons = ResolveAlias(FindField(step, "buttons"));
            if (buttons == nullptr || buttons->kind != NodeKind::Sequence) {
                continue; // Schema validation reports invalid button shapes.
            }
            if (buttons->children.size() > kMaxButtonsPerStep) {
                throw BudgetError("buttons-per-step-limit");
            }
            if (stats_.buttons > kMaxButtonsPerLesson - buttons->children.size()) {
                throw BudgetError("buttons-per-lesson-limit");
            }
            stats_.buttons += buttons->children.size();
        }
    }

    std::size_t documentCount_ = 0;
    ScanStats stats_;
    std::vector<std::unique_ptr<Node>> nodes_;
    std::vector<Node*> containers_;
    std::unordered_map<YAML::anchor_t, Node*> anchors_;
    Node* root_ = nullptr;
};

ScanStats ScanBounded(std::string_view bytes) {
    if (bytes.size() > kMaxFileBytes) {
        throw BudgetError("file-byte-limit");
    }

    // Copying and parser construction happen only after the byte limit check.
    const std::string input(bytes);
    std::istringstream stream(input);
    YAML::Parser parser(stream);
    BoundedEventTree sink;
    while (parser.HandleNextDocument(sink)) {
    }
    return sink.ValidateExpandedWalk();
}

void Require(bool condition, const char* message) {
    if (!condition) {
        throw std::runtime_error(message);
    }
}

template <typename Builder>
void ExpectBudgetError(Builder&& builder, const char* expected) {
    try {
        (void)ScanBounded(builder());
    } catch (const BudgetError& error) {
        Require(std::string(error.what()) == expected, "unexpected budget error reason");
        return;
    }
    throw std::runtime_error(std::string("expected budget error: ") + expected);
}

std::string NestedSequences(std::size_t count) {
    std::string yaml = "root: ";
    yaml.append(count, '[');
    yaml += "x";
    yaml.append(count, ']');
    yaml += '\n';
    return yaml;
}

std::string AliasList(std::size_t count) {
    std::string yaml = "anchor: &a value\nrefs: [";
    for (std::size_t i = 0; i < count; ++i) {
        if (i != 0) yaml += ", ";
        yaml += "*a";
    }
    yaml += "]\n";
    return yaml;
}

std::string ScalarSequence(std::size_t count) {
    std::string yaml = "items:\n";
    for (std::size_t i = 0; i < count; ++i) {
        yaml += "  - x\n";
    }
    return yaml;
}

std::string AliasExpansionBomb() {
    std::string yaml = "a0: &a0 [x]\n";
    for (int level = 1; level <= 14; ++level) {
        const std::string prior = std::to_string(level - 1);
        const std::string current = std::to_string(level);
        yaml += "a" + current + ": &a" + current + " [*a" + prior + ", *a" + prior + "]\n";
    }
    yaml += "root: *a14\n";
    return yaml;
}

std::string LessonWithCounts(std::size_t steps, std::size_t buttonsPerStep) {
    std::string yaml = "title: Test\nsteps:\n";
    for (std::size_t step = 0; step < steps; ++step) {
        yaml += "  - buttons: [";
        for (std::size_t button = 0; button < buttonsPerStep; ++button) {
            if (button != 0) yaml += ", ";
            yaml += "x";
        }
        yaml += "]\n";
    }
    return yaml;
}

void RunResourceBudgetTests() {
    std::string exactFile = "root: value\n#";
    exactFile.append(kMaxFileBytes - exactFile.size(), 'x');
    (void)ScanBounded(exactFile);
    ExpectBudgetError([&] { return exactFile + "x"; }, "file-byte-limit");

    (void)ScanBounded(NestedSequences(kMaxCollectionDepth - 1));
    ExpectBudgetError([&] { return NestedSequences(kMaxCollectionDepth); }, "collection-depth-limit");

    const ScanStats aliasesAtLimit = ScanBounded(AliasList(kMaxAliasReferences));
    Require(aliasesAtLimit.aliases == kMaxAliasReferences, "alias boundary was not counted exactly");
    ExpectBudgetError([&] { return AliasList(kMaxAliasReferences + 1); }, "alias-reference-limit");

    const ScanStats stepsAtLimit = ScanBounded(LessonWithCounts(kMaxSteps, 0));
    Require(stepsAtLimit.steps == kMaxSteps, "step boundary was not counted exactly");
    ExpectBudgetError([&] { return LessonWithCounts(kMaxSteps + 1, 0); }, "step-count-limit");

    const ScanStats buttonsAtLimit = ScanBounded(LessonWithCounts(1, kMaxButtonsPerStep));
    Require(buttonsAtLimit.buttons == kMaxButtonsPerStep, "per-step button boundary was not counted exactly");
    ExpectBudgetError([&] { return LessonWithCounts(1, kMaxButtonsPerStep + 1); }, "buttons-per-step-limit");
    const ScanStats lessonButtonsAtLimit = ScanBounded(LessonWithCounts(16, kMaxButtonsPerStep));
    Require(lessonButtonsAtLimit.buttons == kMaxButtonsPerLesson, "per-lesson button boundary was not counted exactly");
    ExpectBudgetError([&] { return LessonWithCounts(17, kMaxButtonsPerStep); }, "buttons-per-lesson-limit");

    const ScanStats nodesAtLimit = ScanBounded(ScalarSequence(kMaxVisitedNodes - 3));
    Require(nodesAtLimit.eventNodes == kMaxVisitedNodes, "event-node boundary was not counted exactly");
    Require(nodesAtLimit.expandedVisits == kMaxVisitedNodes, "expanded-node boundary was not counted exactly");
    ExpectBudgetError([&] { return ScalarSequence(kMaxVisitedNodes - 2); }, "event-node-limit");

    ExpectBudgetError([] { return std::string("---\nroot: one\n---\nroot: two\n"); }, "multiple-documents");
    ExpectBudgetError([] { return std::string("loop: &loop [*loop]\n"); }, "cyclic-alias");
    ExpectBudgetError([] { return AliasExpansionBomb(); }, "expanded-node-limit");

    std::cout << "PASS resource bounds: file bytes, collection depth, steps, per-step/per-lesson buttons, aliases, event nodes, expanded visits, multiple documents, and cycles\n";
}

} // namespace

void RunResourceBoundsQualificationTests() {
    RunResourceBudgetTests();
}
