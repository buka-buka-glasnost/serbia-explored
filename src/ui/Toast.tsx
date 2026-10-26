import { useEffect } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { usePresence } from './usePresence';

export function Toast() {
  const toast = useApp((s) => s.toast);
  const lang = useApp((s) => s.settings.lang);
  const { shown, closing } = usePresence(toast, 150);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => useApp.setState({ toast: null }), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  if (!shown) return null;
  return (
    <div
      className={`toast toast-${shown.kind}`}
      role={shown.kind === 'error' ? 'alert' : 'status'}
      data-state={closing ? 'closing' : 'open'}
    >
      {t(shown.key, lang)}
    </div>
  );
}
