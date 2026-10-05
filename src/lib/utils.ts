import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export { matchesSearch, normalizeSearch, searchTokens } from './search';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
