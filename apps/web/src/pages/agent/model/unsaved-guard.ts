import { useEffect } from 'react';
import { useBlocker } from 'react-router';

const LEAVE_WARNING = 'Leave without saving? Your persona edits will be lost.';

/** Warns before the page is left with unsaved edits: a reload or closed tab, or a link inside the app. */
export function useUnsavedGuard(unsaved: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => unsaved && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(LEAVE_WARNING)) blocker.proceed();
    else blocker.reset();
  }, [blocker]);

  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsaved]);
}
