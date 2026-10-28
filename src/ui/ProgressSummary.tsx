import { useMemo } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { computeProgress } from '../logic/progress';

const TIERS = [1, 2, 3] as const;

const pct = (visited: number, total: number) => (total === 0 ? 0 : Math.round((visited / total) * 100));

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
    <section className={compact ? 'progress compact' : 'progress'} aria-label={t('visited', lang)}>
      {compact ? (
        // phone top bar: a small "✓ 3 / 930" chip
        <div className="progress-overall">
          <span className="progress-check" aria-hidden="true">✓</span>
          <span className="progress-count">{overall.visited}</span>
          <span className="progress-total">/ {overall.total}<span className="sr-only"> {t('visitedOf', lang)}</span></span>
        </div>
      ) : (
        <div className="progress-overall">
          <span className="progress-count">{overall.visited}</span>
          <span className="progress-total">/ {overall.total} {t('visitedOf', lang)}</span>
          <span className="progress-pct">{pct(overall.visited, overall.total)}%</span>
        </div>
      )}
      {!compact && (
        <ul>
          {TIERS.map((n) => (
            <li key={n}>
              <span>{t(`tierShort${n}`, lang)}</span>
              <span
                className={`bar tier${n}`}
                role="progressbar"
                aria-label={t(`tierShort${n}`, lang)}
                aria-valuemin={0}
                aria-valuemax={byTier[n].total}
                aria-valuenow={byTier[n].visited}
              >
                <span style={{ width: `${pct(byTier[n].visited, byTier[n].total)}%` }} />
              </span>
              <span className="progress-num">{byTier[n].visited} / {byTier[n].total}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
