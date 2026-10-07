import { ValueTransformer } from 'typeorm';

/** Postgres returns NUMERIC as a string; the API should expose plain numbers. */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value === null || value === undefined ? value : parseFloat(value)),
};
