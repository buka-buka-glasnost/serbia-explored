import { useEffect } from 'react';
import { useApp } from '../state/store';
import type { Lang } from '../shared/types';

const OPTIONS: { lang: Lang; label: string }[] = [
  { lang: 'sr-Cyrl', label: 'Ћир' },
  { lang: 'sr-Latn', label: 'Lat' },
  { lang: 'en', label: 'EN' },
];

export function LanguageSwitch() {
  const lang = useApp((s) => s.settings.lang);
  const setSettings = useApp((s) => s.setSettings);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return (
    <div className="lang-switch" role="group" aria-label="Language">
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          aria-pressed={lang === o.lang}
          onClick={() => setSettings({ lang: o.lang })}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
