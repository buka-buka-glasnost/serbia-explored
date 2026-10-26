import { useMemo } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { computeProgress } from '../logic/progress';

const TIERS = [1, 2, 3] as const;

export function ProgressSummary({ compact = false }: { compact?: boolean }) {
  const places = useApp((s) => s.places);
  const visits = useApp((s) => s.visits);
  const kosovoShown = useApp((s) => s.settings.kosovoShown);
  const lang = useApp((s) => s.settings.lang);
  const { overall, byTier } = useMemo(
    () => computeProgress(places, new Set(Object.keys(visits)), kosovoShown),
    [places, visits, kosovoShown],
  );
  return (
    <section className={compact ? 'progress compact' : 'progress'} aria-label={t('visitedCounter', lang)}>
      <div className="progress-overall">
        {overall.visited} / {overall.total} {t('visitedOf', lang)}
      </div>
      {!compact && (
        <ul>
          {TIERS.map((n) => (
            <li key={n}>
              {t(`tierShort${n}`, lang)}: {byTier[n].visited} / {byTier[n].total}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
