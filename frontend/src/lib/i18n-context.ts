import { createContext, useContext } from 'react'

export type Language = 'uk' | 'en'
export type TranslationKey =
  | 'loading' | 'language' | 'workspace' | 'navigation' | 'myClubs' | 'publicClubs'
  | 'movieClubs' | 'bookClubs' | 'sportClubs' | 'boardGameClubs' | 'clubType'
  | 'profile' | 'viewProfile' | 'signOut' | 'yourSpace' | 'clubs'
  | 'welcomeBack' | 'yourClubs' | 'chooseCategory' | 'createAccount' | 'startTracking'
  | 'signInToManage' | 'yourName' | 'email' | 'password' | 'yourPassword'
  | 'authenticationFailed' | 'googleSignInFailed' | 'signIn' | 'createAccountAction' | 'or'
  | 'connecting' | 'continueWithGoogle' | 'alreadyHaveAccount' | 'noAccount' | 'settings'
  | 'noBio' | 'member' | 'displayName' | 'avatarUrl' | 'dateOfBirth' | 'bio' | 'save'
  | 'saving' | 'cancel' | 'notSet' | 'role' | 'adminRole' | 'memberRole' | 'editProfile'
  | 'profileUnavailable' | 'backToMenu' | 'sessionExpired' | 'failedToLoadProfile'
  | 'failedToSaveProfile'
  | 'theme' | 'switchToLight' | 'switchToDark' | 'ukrainian' | 'english'
  | 'homeTitle' | 'homeIntroOne' | 'homeIntroTwo' | 'homeIntroThree'
  | 'searchClubs' | 'search' | 'createClub' | 'clubTitle' | 'clubAvatarUrl'
  | 'publicClub' | 'publicClubHelp' | 'privateClub' | 'privateClubHelp'
  | 'noClubsFound' | 'couldNotLoadClubs' | 'couldNotCreateClub' | 'loadingMore' | 'loadMoreClubs'
  | 'publicLabel' | 'privateLabel'
  | 'joinPrivateClub' | 'inviteCode' | 'joinClub' | 'joinedClub' | 'joinedPrivateClub'
  | 'couldNotJoinClub' | 'manageInviteCode' | 'hideInviteCode' | 'createInviteCode'
  | 'revokeInviteCode' | 'inviteCodeCreated' | 'inviteCodeShownOnce' | 'inviteCodeActive'
  | 'inviteCodeRevoked' | 'inviteCodeFailed' | 'deleteClub' | 'confirmDeleteClub'
  | 'deletionRequestCreated' | 'couldNotDeleteClub' | 'clubDeleted' | 'clubDeletionRequests'
  | 'noDeletionRequests' | 'deletionRequestClub' | 'requestedBy'
  | 'approveDeletionRequest' | 'rejectDeletionRequest' | 'couldNotLoadDeletionRequests'
  | 'couldNotReviewDeletionRequest' | 'clubManagement' | 'editClub' | 'saveClubChanges'
  | 'clubUpdated' | 'couldNotLoadClub' | 'couldNotUpdateClub' | 'backToMyClubs' | 'clubManagerOnly'
  | 'copyInviteCode' | 'inviteCodeCopied' | 'inviteCodeCopyFailed' | 'inviteCodeNeedsReplacement'
  | 'eventsEyebrow' | 'clubEvents' | 'createEvent' | 'eventTitle' | 'linkedItemId'
  | 'eventAvatarUrl' | 'startDate' | 'endDate' | 'startTime' | 'endTime' | 'noEvents'
  | 'clubEvent' | 'allDay' | 'eventStatus' | 'eventStatus_scheduled' | 'eventStatus_delayed'
  | 'eventStatus_cancelled' | 'eventStatus_held' | 'eventStatus_deleted' | 'deleteEvent'
  | 'confirmDeleteEvent' | 'eventCreated' | 'eventDeleted' | 'eventsLoadError'
  | 'eventSaveError' | 'eventUpdateError' | 'eventDeleteError'
  | 'clubDetails' | 'backToClubDetails' | 'clubMembers' | 'ownerRole' | 'moderatorRole'
  | 'memberRoleLabel' | 'couldNotLoadMembers' | 'couldNotUpdateMemberRole'

export interface I18nContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey) => string
}

export const I18nContext = createContext<I18nContextValue | null>(null)

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used within an I18nProvider')
  return context
}
