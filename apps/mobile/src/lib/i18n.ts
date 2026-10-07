import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager, Platform } from 'react-native';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from '../locales/en.json';
import ar from '../locales/ar.json';

export type Lang = 'en' | 'ar';
const KEY = 'vertex_locale';

/** The language chosen in the app, else the phone's when it is Arabic, else English. */
export async function startI18n(): Promise<Lang> {
  let lang: Lang | null = null;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved === 'en' || saved === 'ar') lang = saved;
  } catch {
    // no saved choice
  }
  lang ??= Localization.getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: lang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  applyDirection(lang);
  return lang;
}

/** Arabic reads right to left. On a phone the layout flips on the next start, as React Native requires. */
function applyDirection(lang: Lang) {
  const rtl = lang === 'ar';
  if (Platform.OS === 'web') {
    if (typeof document !== 'undefined') {
      document.documentElement.dir = rtl ? 'rtl' : 'ltr';
      document.documentElement.lang = lang;
    }
    return;
  }
  I18nManager.allowRTL(true);
  if (I18nManager.isRTL !== rtl) I18nManager.forceRTL(rtl);
}

/** Whether the layout already reads in this language's direction (else it does after a restart). */
export function directionReady(lang: Lang): boolean {
  if (Platform.OS === 'web') return true;
  return I18nManager.isRTL === (lang === 'ar');
}

export async function setLang(lang: Lang) {
  await AsyncStorage.setItem(KEY, lang).catch(() => undefined);
  await i18n.changeLanguage(lang);
  applyDirection(lang);
}

export function currentLang(): Lang {
  return i18n.language === 'ar' ? 'ar' : 'en';
}

export default i18n;
