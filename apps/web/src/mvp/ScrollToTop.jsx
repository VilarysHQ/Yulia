import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

const useClientLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

function jumpTo(target) {
  if (target) target.scrollIntoView({ block: 'start', behavior: 'instant' });
  else window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
}

export function ScrollToTop() {
  const { pathname, hash } = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef(pathname);
  const previousHash = useRef(hash);

  useClientLayoutEffect(() => {
    const changedPage = previousPathname.current !== pathname;
    const changedHash = previousHash.current !== hash;
    previousPathname.current = pathname;
    previousHash.current = hash;
    if (navigationType === 'POP' || (!changedPage && !changedHash)) return undefined;

    if (!hash) {
      if (changedPage) jumpTo();
      return undefined;
    }

    const frame = requestAnimationFrame(() => {
      let id = hash.slice(1);
      try { id = decodeURIComponent(id); } catch { /* Keep the original fragment. */ }
      const target = document.getElementById(id);
      jumpTo(target);
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname, hash, navigationType]);

  return null;
}
