import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Splits copy like "The *science* of taste." into segments so components can
 * render the *starred* parts in italic without dangerouslySetInnerHTML.
 */
export function parseItalics(text: string): { text: string; italic: boolean }[] {
  return text
    .split('*')
    .map((segment, i) => ({ text: segment, italic: i % 2 === 1 }))
    .filter((segment) => segment.text.length > 0);
}
