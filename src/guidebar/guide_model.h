#pragma once

#include <cstddef>
#include <string>
#include <vector>

namespace tutorial_dock {

struct GuideStep {
    std::wstring id;
    std::wstring title;
    std::wstring description;
    std::wstring demoActionLabel;
};

class GuideModel {
public:
    bool LoadSampleLesson();
    bool HasLesson() const noexcept;
    const GuideStep* CurrentStep() const noexcept;
    std::size_t CurrentIndex() const noexcept;
    std::size_t StepCount() const noexcept;
    bool CanGoPrevious() const noexcept;
    bool CanGoNext() const noexcept;
    bool Previous() noexcept;
    bool Next() noexcept;

private:
    std::vector<GuideStep> steps_;
    std::size_t currentIndex_ = 0;
};

} // namespace tutorial_dock
