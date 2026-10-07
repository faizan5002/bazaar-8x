import { Link, type LinkProps } from 'react-router-dom';
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline-light';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-400 text-slate-900 hover:bg-accent-500 shadow-sm',
  secondary: 'bg-brand-800 text-white hover:bg-brand-700',
  ghost: 'bg-white text-slate-800 hover:bg-slate-50 border border-slate-300',
  // For use on dark photography / navy surfaces.
  'outline-light': 'bg-white/10 text-white hover:bg-white/20 border border-white/60',
};

const base = 'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
}

export function Button({ variant = 'primary', fullWidth, className = '', ...props }: ButtonProps) {
  return <button {...props} className={`${base} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`} />;
}

/** Same look as <Button>, rendered as a router link. */
export function ButtonLink({ variant = 'primary', className = '', ...props }: LinkProps & { variant?: Variant }) {
  return <Link {...props} className={`${base} ${variants[variant]} ${className}`} />;
}
