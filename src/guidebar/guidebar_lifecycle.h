#pragma once

#include "reservation_update.h"

namespace tutorial_dock {

enum class GuideBarLifecycle {
    Unregistered,
    Registering,
    Registered,
    Updating,
    ReservationUnverified,
    Removing,
    RemovalUnverified,
    Released,
    Fallback
};

struct ReservationUpdateTransition {
    GuideBarLifecycle lifecycle;
    bool reservationConfirmed;
    bool showDegradedFallback;
};

constexpr ReservationUpdateTransition TransitionAfterReservationUpdate(
    ReservationUpdateResult result) noexcept {
    switch (result) {
    case ReservationUpdateResult::Applied:
    case ReservationUpdateResult::RolledBack:
        return {GuideBarLifecycle::Registered, true, false};
    case ReservationUpdateResult::Unconfirmed:
        return {GuideBarLifecycle::ReservationUnverified, false, true};
    }
    return {GuideBarLifecycle::ReservationUnverified, false, true};
}

constexpr bool CanUseGuideLessonControls(GuideBarLifecycle lifecycle) noexcept {
    return lifecycle == GuideBarLifecycle::Registered ||
           lifecycle == GuideBarLifecycle::ReservationUnverified ||
           lifecycle == GuideBarLifecycle::Fallback;
}

constexpr bool ShouldAttemptRemovalBeforeExit(
    bool mayBeRegistered, bool removalAttempted) noexcept {
    return mayBeRegistered && !removalAttempted;
}

constexpr bool CanDestroyGuideBarWindow(
    bool mayBeRegistered, GuideBarLifecycle lifecycle) noexcept {
    return !mayBeRegistered &&
           (lifecycle == GuideBarLifecycle::Unregistered ||
            lifecycle == GuideBarLifecycle::Fallback ||
            lifecycle == GuideBarLifecycle::Released);
}

} // namespace tutorial_dock
