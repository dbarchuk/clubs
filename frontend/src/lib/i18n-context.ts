import { createContext, useContext } from 'react'

export type Language = 'uk' | 'en'
export type TranslationKey =
  | 'loading' | 'language' | 'workspace' | 'navigation' | 'myClubs' | 'publicClubs'
  | 'movieClubs' | 'bookClubs' | 'sportClubs' | 'boardGameClubs' | 'clubType'
  | 'profile' | 'viewProfile' | 'storyEnthusiast' | 'signOut' | 'yourSpace' | 'clubs'
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
