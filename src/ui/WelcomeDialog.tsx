import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import type { StringKey } from '../i18n/strings';
import { usePresence } from './usePresence';
import { isWelcomeDismissed, setWelcomeDismissed } from './welcomePrefs';

const SECTIONS: { icon: string; title: StringKey; body: StringKey }[] = [
  { icon: '🗺️', title: 'welcomeMapTitle', body: 'welcomeMap' },
  { icon: '🔍', title: 'welcomeListTitle', body: 'welcomeList' },
  { icon: '✓', title: 'welcomeVisitTitle', body: 'welcomeVisit' },
  { icon: '🧭', title: 'welcomeTripTitle', body: 'welcomeTrip' },
  { icon: '💾', title: 'welcomeDataTitle', body: 'welcomeData' },
];

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** First-visit introduction; reopened any time from the map's "i" button. */
export function WelcomeDialog() {
  const lang = useApp((s) => s.settings.lang);
  const open = useApp((s) => s.welcomeOpen);
  const setOpen = useApp((s) => s.setWelcomeOpen);
  const { shown, closing } = usePresence(open ? true : null, 200);
  const [dontShow, setDontShow] = useState(isWelcomeDismissed);
  const dialog = useRef<HTMLDivElement>(null);
  const start = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDontShow(isWelcomeDismissed());
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    start.current?.focus({ preventScroll: true }); // keep the dialog scrolled to its title
  }, [open]);

  const close = () => {
    setWelcomeDismissed(dontShow);
    setOpen(false);
    returnFocus.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    // keep keyboard focus inside the dialog
    const items = Array.from(dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!shown) return null;
  const state = closing ? 'closing' : 'open';
  return (
    <div className="welcome-layer" data-state={state} aria-hidden={closing || undefined} inert={closing || undefined}>
      <div className="welcome-backdrop" onClick={close} />
      <div
        ref={dialog}
        className="welcome"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onKeyDown={onKeyDown}
      >
        <button type="button" className="welcome-close" aria-label={t('close', lang)} onClick={close}>×</button>
        <header className="welcome-head">
          <svg className="brand-mark" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2.5c-4 0-7 3-7 6.9 0 5 7 12.1 7 12.1s7-7.1 7-12.1C19 5.5 16 2.5 12 2.5z" fill="currentColor" />
            <circle cx="12" cy="9.4" r="2.6" fill="#fffdf9" />
          </svg>
          <div>
            <h2 id="welcome-title">{t('welcomeTitle', lang)}</h2>
            <p className="welcome-app">{t('appTitle', lang)}</p>
          </div>
        </header>
        <p className="welcome-intro">{t('welcomeIntro', lang)}</p>
        <ul className="welcome-sections">
          {SECTIONS.map((s) => (
            <li key={s.title}>
              <span className="welcome-icon" aria-hidden="true">{s.icon}</span>
              <div>
                <h3>{t(s.title, lang)}</h3>
                <p>{t(s.body, lang)}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="welcome-reopen">{t('welcomeReopen', lang)}</p>
        <footer className="welcome-foot">
          <label className="welcome-dontshow">
            <input type="checkbox" checked={dontShow} onChange={(e) => setDontShow(e.target.checked)} />
            {t('welcomeDontShow', lang)}
          </label>
          <button ref={start} type="button" className="btn btn-primary" onClick={close}>
            {t('welcomeStart', lang)}
          </button>
        </footer>
      </div>
    </div>
  );
}
