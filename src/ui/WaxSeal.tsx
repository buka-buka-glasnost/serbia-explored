/** A wax seal's uneven rim: a circle whose radius wobbles a little, as poured wax does. */
const RIM = (() => {
  const points: string[] = [];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const r = 28 + 1.6 * Math.sin(a * 7) + 0.9 * Math.sin(a * 13 + 1.3);
    points.push(`${(32 + r * Math.cos(a)).toFixed(1)} ${(32 + r * Math.sin(a)).toFixed(1)}`);
  }
  return `M${points.join('L')}Z`;
})();

/** The stamp on a visited place: red wax pressed with a kilim rhomb and a tick. Decorative; the date beside it says it. */
export function WaxSeal() {
  return (
    <svg className="wax-seal" viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <radialGradient id="wax-seal-wax" cx="38%" cy="34%" r="72%">
          <stop offset="0" stopColor="#b9453c" />
          <stop offset="0.65" stopColor="#8e2722" />
          <stop offset="1" stopColor="#661a16" />
        </radialGradient>
      </defs>
      <path d={RIM} fill="url(#wax-seal-wax)" />
      {/* the pressed ring and the kilim rhomb with a tick */}
      <circle cx="32" cy="32" r="19.5" fill="none" stroke="#5c1612" strokeWidth="1.6" opacity="0.6" />
      <circle cx="32.6" cy="32.6" r="19.5" fill="none" stroke="#e7a49a" strokeWidth="0.8" opacity="0.35" />
      <path d="M32 19.5 44.5 32 32 44.5 19.5 32Z" fill="none" stroke="#f3cfc6" strokeWidth="1.6" strokeLinejoin="round" opacity="0.85" />
      <path d="m26.8 32.4 3.6 3.6 7-7.6" fill="none" stroke="#f8e3dd" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
