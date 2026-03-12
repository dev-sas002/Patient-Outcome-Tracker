import { useEffect } from 'react';

/** Calls `onEscape` when Escape is pressed anywhere, while the caller is mounted. */
export function useEscapeKey(onEscape) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') onEscape();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onEscape]);
}
