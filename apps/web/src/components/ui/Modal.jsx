import { useCallback, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible: rol `dialog`, foco contenido, cierre con Escape,
 * devolución del foco al elemento que lo abrió y bloqueo del desplazamiento de
 * fondo. Se monta en un portal para quedar por encima de toda la aplicación.
 */
export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const restoreFocusRef = useRef(null);

  const handleKeyDown = useCallback(
    (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const container = dialogRef.current;
      if (!container) return;
      const focusable = Array.from(container.querySelectorAll(FOCUSABLE)).filter(
        (element) => element.offsetParent !== null || element === document.activeElement,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusRef.current = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const container = dialogRef.current;
    const focusable = container ? Array.from(container.querySelectorAll(FOCUSABLE)) : [];
    (focusable[0] ?? container)?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      const previous = restoreFocusRef.current;
      if (previous && typeof previous.focus === 'function') previous.focus();
    };
  }, [open]);

  if (!open) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-navy/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={`w-full ${sizes[size] ?? sizes.md} rounded-t-panel border border-slate-200 bg-white shadow-xl outline-none sm:rounded-panel`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-navy">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-1 text-sm leading-6 text-slate-600">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar diálogo"
            className="-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="px-5 py-5 sm:px-6">{children}</div>

        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t border-slate-200 bg-slate-50/70 px-5 py-4 sm:px-6">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
