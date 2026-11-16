#pragma once

namespace tutorial_dock {

enum class ReservationUpdateResult {
    Applied,
    RolledBack,
    Unconfirmed
};

// The callback must return true only after both the requested reservation and
// its observable work-area/window state have been confirmed.
template <typename ApplyAndVerify>
ReservationUpdateResult ApplyReservationUpdateWithRollback(
    int lastConfirmedHeight,
    int requestedHeight,
    ApplyAndVerify&& applyAndVerify) {
    if (applyAndVerify(requestedHeight)) {
        return ReservationUpdateResult::Applied;
    }
    if (applyAndVerify(lastConfirmedHeight)) {
        return ReservationUpdateResult::RolledBack;
    }
    return ReservationUpdateResult::Unconfirmed;
}

} // namespace tutorial_dock
