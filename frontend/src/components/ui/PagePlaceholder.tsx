import { Link } from 'react-router-dom';
import { Container } from './Container';

/** Temporary body for routes whose feature is built in a later step. */
export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <Container className="py-10">
      <div className="rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-slate-600">{description}</p>
        <Link to="/" className="mt-4 inline-block text-link hover:underline">
          Back to home
        </Link>
      </div>
    </Container>
  );
}
