import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '../ui/Button';
import { XIcon } from '../ui/icons';

interface FilterDrawerProps {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  onClearAll: () => void;
  children: ReactNode;
}

/**
 * Mobile/tablet filter drawer on the native <dialog>: the browser provides the focus trap, Esc to close and the
 * inert background. Edits are a draft held by the parent and only take effect on "Apply".
 */
export function FilterDrawer({ open, onClose, onApply, onClearAll, children }: FilterDrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="filter-drawer-title"
      onClose={onClose}
      // Clicking the dimmed backdrop (the dialog element itself, outside its content) closes the drawer.
      onClick={(e) => e.target === ref.current && onClose()}
      className="fixed inset-y-0 left-0 right-auto m-0 h-full max-h-none w-[min(22rem,92vw)] max-w-none flex-col bg-white p-0 text-slate-900 shadow-card-hover backdrop:bg-slate-900/50 open:flex"
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id="filter-drawer-title" className="text-lg font-bold">
          Filters
        </h2>
        <button type="button" onClick={onClose} aria-label="Close filters" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-md hover:bg-slate-100">
          <XIcon />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
      <div className="flex gap-3 border-t border-line bg-white px-4 py-3">
        <Button variant="ghost" onClick={onClearAll} className="flex-1">
          Clear all
        </Button>
        <Button onClick={onApply} className="flex-1">
          Apply filters
        </Button>
      </div>
    </dialog>
  );
}
