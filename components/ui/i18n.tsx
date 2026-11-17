'use client';
import { createContext, useContext, useId, useState } from 'react';
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

const languages = [
  { value: 'en', short: 'EN', name: 'English' },
  { value: 'zh-TW', short: '中', name: '繁體中文' },
] as const;

/**
 * Two-way language switch. Native radios keep arrow-key selection and the
 * group semantics; each one covers its segment so the whole cell is the target.
 */
export function LanguageSelect() {
  const { locale, setLocale } = useI18n();
  const ready = useHydrated();
  const name = useId();
  return (
    <div
      role="radiogroup"
      aria-label="Language / 語言"
      className="language-switch inline-flex shrink-0 rounded-md border border-control-border p-0.5"
    >
      {languages.map((language) => (
        <label key={language.value} className="relative">
          <input
            type="radio"
            className="peer absolute inset-0 m-0 size-full cursor-pointer appearance-none border-0 p-0 opacity-0 disabled:cursor-not-allowed"
            name={name}
            value={language.value}
            lang={language.value}
            aria-label={language.name}
            title={language.name}
            checked={locale === language.value}
            disabled={!ready}
            onChange={() => setLocale(parseLocale(language.value))}
          />
          <span
            aria-hidden="true"
            className="flex min-h-10 min-w-10 items-center justify-center rounded-sm px-2 text-xs font-semibold text-muted peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus peer-disabled:opacity-50"
          >
            {language.short}
          </span>
        </label>
      ))}
    </div>
  );
}
