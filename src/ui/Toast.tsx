import { useEffect } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';

export function Toast() {
  const toast = useApp((s) => s.toast);
  const lang = useApp((s) => s.settings.lang);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => useApp.setState({ toast: null }), 4000);
    return () => clearTimeout(id);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      {t(toast.key, lang)}
    </div>
  );
}
