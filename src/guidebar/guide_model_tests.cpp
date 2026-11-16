#include "guide_model.h"
#include "reservation_update.h"

#include <iostream>
#include <string>
#include <vector>

namespace {

int g_failures = 0;

void Check(bool condition, const char* description) {
    if (!condition) {
        std::cerr << "FAIL: " << description << '\n';
        ++g_failures;
    }
}

struct FakeReservation {
    int currentHeight = 90;
    bool requestedUpdateSucceeds = false;
    bool rollbackSucceeds = true;
    std::vector<int> attempts;

    bool ApplyAndVerify(int height) {
        attempts.push_back(height);
        if (height == 34) {
            // Simulate a request that may have changed OS state before failing.
            currentHeight = 34;
            return requestedUpdateSucceeds;
        }
        if (height == 90) {
            if (rollbackSucceeds) {
                currentHeight = 90;
                return true;
            }
            return false;
        }
        return false;
    }
};

void TestEmptyAndSampleNavigation() {
    tutorial_dock::GuideModel model;
    Check(!model.HasLesson(), "model starts empty");
    Check(model.CurrentStep() == nullptr, "empty model has no current step");
    Check(!model.Previous(), "previous is unavailable when empty");
    Check(!model.Next(), "next is unavailable when empty");

    Check(model.LoadSampleLesson(), "sample lesson loads");
    Check(model.HasLesson(), "sample lesson is present");
    Check(model.StepCount() >= 3, "sample lesson has at least three steps");
    Check(model.CurrentIndex() == 0, "sample starts at the first step");
    Check(model.CurrentStep() && model.CurrentStep()->id == L"connect-data",
          "first step is deterministic");
    Check(!model.Previous(), "previous is blocked at the first step");

    Check(model.Next(), "next advances from the first step");
    Check(model.CurrentStep() && model.CurrentStep()->id == L"build-view",
          "second step is selected");
    Check(model.Next(), "next advances to the last step");
    Check(model.CurrentStep() && model.CurrentStep()->id == L"review-result",
          "third step is selected");
    Check(!model.Next(), "next is blocked at the last step");
    Check(model.Previous(), "previous moves back from the last step");
    Check(model.CurrentStep() && model.CurrentStep()->id == L"build-view",
          "previous restores the expected step");
}

void TestReservationUpdateRollback() {
    FakeReservation confirmed;
    const auto rolledBack = tutorial_dock::ApplyReservationUpdateWithRollback(
        90, 34, [&confirmed](int height) { return confirmed.ApplyAndVerify(height); });
    Check(rolledBack == tutorial_dock::ReservationUpdateResult::RolledBack,
          "failed size update reports confirmed rollback");
    Check(confirmed.currentHeight == 90, "confirmed rollback restores last height");
    Check(confirmed.attempts == std::vector<int>({34, 90}),
          "failed update attempts requested height, then rollback once");

    FakeReservation unconfirmed;
    unconfirmed.rollbackSucceeds = false;
    const auto uncertain = tutorial_dock::ApplyReservationUpdateWithRollback(
        90, 34, [&unconfirmed](int height) { return unconfirmed.ApplyAndVerify(height); });
    Check(uncertain == tutorial_dock::ReservationUpdateResult::Unconfirmed,
          "failed rollback remains explicitly unconfirmed");
    Check(unconfirmed.attempts == std::vector<int>({34, 90}),
          "unconfirmed path does not retry or loop");

    FakeReservation success;
    success.requestedUpdateSucceeds = true;
    const auto applied = tutorial_dock::ApplyReservationUpdateWithRollback(
        90, 34, [&success](int height) { return success.ApplyAndVerify(height); });
    Check(applied == tutorial_dock::ReservationUpdateResult::Applied,
          "successful update reports applied");
    Check(success.currentHeight == 34, "successful update keeps requested height");
    Check(success.attempts == std::vector<int>({34}),
          "successful update does not invoke rollback");
}

void TestHeightChangesDoNotMutateLessonPosition() {
    tutorial_dock::GuideModel model;
    model.LoadSampleLesson();
    Check(model.Next(), "select a noninitial step before height updates");
    const std::size_t selectedIndex = model.CurrentIndex();

    FakeReservation collapsed;
    collapsed.requestedUpdateSucceeds = true;
    const auto collapseResult = tutorial_dock::ApplyReservationUpdateWithRollback(
        90, 34, [&collapsed](int height) { return collapsed.ApplyAndVerify(height); });
    Check(collapseResult == tutorial_dock::ReservationUpdateResult::Applied,
          "collapse reservation update is confirmed");
    Check(model.CurrentIndex() == selectedIndex,
          "confirmed height update preserves the current lesson step");

    FakeReservation failedExpand;
    const auto expandResult = tutorial_dock::ApplyReservationUpdateWithRollback(
        34, 90, [&failedExpand](int height) {
            failedExpand.attempts.push_back(height);
            if (height == 90) {
                failedExpand.currentHeight = 90;
                return false;
            }
            return false;
        });
    Check(expandResult == tutorial_dock::ReservationUpdateResult::Unconfirmed,
          "unconfirmed expand rollback is surfaced separately");
    Check(model.CurrentIndex() == selectedIndex,
          "failed height update does not reset the current lesson step");
}

} // namespace

int main() {
    TestEmptyAndSampleNavigation();
    TestReservationUpdateRollback();
    TestHeightChangesDoNotMutateLessonPosition();
    if (g_failures != 0) {
        std::cerr << g_failures << " test(s) failed.\n";
        return 1;
    }
    std::cout << "GuideModel and reservation rollback checks passed.\n";
    return 0;
}
