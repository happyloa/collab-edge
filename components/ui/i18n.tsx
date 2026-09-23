'use client';
import { createContext, useContext, useState } from 'react';
import {
  localeCookie,
  parseLocale,
  translate,
  type Locale,
} from '../../src/i18n/messages';
import { translateError } from '../../src/i18n/errors';
import { useHydrated } from './use-hydrated';

const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
}>({ locale: 'en', setLocale: () => {} });

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: React.ReactNode;
}) {
  const [locale, updateLocale] = useState(initialLocale);
  function setLocale(next: Locale) {
    updateLocale(next);
    document.documentElement.lang = next;
    document.cookie = `${localeCookie}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
  }
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useI18n() {
  const { locale, setLocale } = useContext(LocaleContext);
  return {
    locale,
    setLocale,
    t: (key: string, values?: Record<string, string | number>) =>
      translate(locale, key, values),
    errorText: (message?: string) => translateError(locale, message),
  };
}

export function LanguageSelect() {
  const { locale, setLocale } = useI18n();
  const ready = useHydrated();
  return (
    <select
      className="w-auto text-sm"
      aria-label="Language / 語言"
      value={locale}
      disabled={!ready}
      onChange={(event) => setLocale(parseLocale(event.target.value))}
    >
      <option value="en" lang="en">
        English
      </option>
      <option value="zh-TW" lang="zh-TW">
        繁體中文
      </option>
    </select>
  );
}
