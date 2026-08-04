import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Comparação insensível a acentos e a maiúsculas.
 *
 * Num catálogo português, obrigar a escrever «café» com acento para encontrar
 * «Café» é obrigar a abrir o teclado de símbolos a meio de uma pesquisa — num
 * tablet, de pé, isso é o suficiente para o agente desistir de pesquisar.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}
