#include "guide_model.h"

namespace tutorial_dock {

bool GuideModel::LoadSampleLesson() {
    steps_ = {
        {L"connect-data", L"Connect to data",
         L"Choose a data source and confirm that the fields are available.",
         L"Demo: show a local data-source tip"},
        {L"build-view", L"Build a view",
         L"Place a dimension and a measure in the view to create a first chart.",
         L"Demo: show a local chart tip"},
        {L"review-result", L"Review the result",
         L"Check the marks and labels, then save your work when it is ready.",
         L"Demo: show a local review tip"}
    };
    currentIndex_ = 0;
    return true;
}

bool GuideModel::HasLesson() const noexcept {
    return !steps_.empty();
}

const GuideStep* GuideModel::CurrentStep() const noexcept {
    return HasLesson() && currentIndex_ < steps_.size()
        ? &steps_[currentIndex_]
        : nullptr;
}

std::size_t GuideModel::CurrentIndex() const noexcept {
    return currentIndex_;
}

std::size_t GuideModel::StepCount() const noexcept {
    return steps_.size();
}

bool GuideModel::CanGoPrevious() const noexcept {
    return HasLesson() && currentIndex_ > 0;
}

bool GuideModel::CanGoNext() const noexcept {
    return HasLesson() && currentIndex_ + 1 < steps_.size();
}

bool GuideModel::Previous() noexcept {
    if (!CanGoPrevious()) {
        return false;
    }
    --currentIndex_;
    return true;
}

bool GuideModel::Next() noexcept {
    if (!CanGoNext()) {
        return false;
    }
    ++currentIndex_;
    return true;
}

} // namespace tutorial_dock
