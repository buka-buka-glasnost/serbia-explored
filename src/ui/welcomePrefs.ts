const KEY = 'serbia-explored:welcome-dismissed';

/** Whether this browser asked not to see the welcome message again. Storage may be blocked (private mode). */
export function isWelcomeDismissed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setWelcomeDismissed(dismissed: boolean): void {
  try {
    if (dismissed) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    /* not remembered; the message will show again next time */
  }
}
