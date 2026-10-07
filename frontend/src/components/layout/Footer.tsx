import { Container } from '../ui/Container';

export function Footer() {
  return (
    <footer className="mt-12 bg-brand-900 text-sm text-slate-300">
      <button
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        className="w-full bg-brand-700 py-3 text-center text-white hover:bg-brand-800"
      >
        Back to top
      </button>
      <Container className="py-8 text-center">
        <p className="text-lg font-extrabold text-white">
          Bazaar<span className="text-accent-400">.</span>
        </p>
        <p className="mt-2">A demo marketplace built for an engineering assignment. No real orders or payments.</p>
      </Container>
    </footer>
  );
}
