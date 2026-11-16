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

struct RemovalVerificationTransition {
    GuideBarLifecycle lifecycle;
    bool releaseConfirmed;
    bool windowHidden;
    bool requiresHumanDecision;
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

constexpr RemovalVerificationTransition TransitionAfterRemovalVerification(
    bool removeApiAccepted, bool workAreaRestored, bool windowHidden) noexcept {
    if (!removeApiAccepted || !workAreaRestored) {
        return {GuideBarLifecycle::RemovalUnverified, false, false, true};
    }
    return {GuideBarLifecycle::Released, true, windowHidden, !windowHidden};
}

constexpr bool CanCompleteSafeExitAfterRemoval(
    bool releaseConfirmed, bool windowHidden,
    bool humanApprovedVisibleWindowClose) noexcept {
    return releaseConfirmed && (windowHidden || humanApprovedVisibleWindowClose);
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
