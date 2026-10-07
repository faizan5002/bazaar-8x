import { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/Button';

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure origins: fall back to selecting a hidden field.
    try {
      const field = document.createElement('textarea');
      field.value = text;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.appendChild(field);
      field.select();
      const done = document.execCommand('copy');
      field.remove();
      return done;
    } catch {
      return false;
    }
  }
}

/** Copies the public link to the test (/coming-soon/:id) and says so for a moment. No sharing integrations. */
export function CopyLinkButton({ path }: { path: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const url = `${window.location.origin}${path}`;

  const onClick = async () => {
    const done = await copy(url);
    setState(done ? 'copied' : 'failed');
    window.clearTimeout(timer.current);
    if (done) timer.current = window.setTimeout(() => setState('idle'), 2500);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="ghost" onClick={onClick} className="min-h-11">
        Copy link
      </Button>
      <span role="status" aria-live="polite" className="text-sm font-semibold text-success" data-testid="copy-status">
        {state === 'copied' ? 'Link copied' : ''}
      </span>
      {state === 'failed' && (
        <span className="basis-full text-sm text-slate-700">
          Couldn&apos;t copy automatically. Copy it from here:{' '}
          <input readOnly value={url} aria-label="Public link" onFocus={(e) => e.currentTarget.select()} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </span>
      )}
    </div>
  );
}
