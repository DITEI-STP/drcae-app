import { db, type Visita } from '../db/db';

/**
 * Rascunhos de fiscalização (SPEC-10 §8).
 *
 * A modalidade iterativa escreve no Dexie à medida que o agente trabalha, para
 * que uma bateria a acabar a meio de um armazém não leve consigo seis
 * constatações e catorze fotos. O preço é que passam a existir, na mesma
 * tabela, visitas que ainda **não são fiscalizações**.
 *
 * Um rascunho não pode aparecer em listagens, não pode contar para indicadores,
 * não pode alimentar o risco do operador e — sobretudo — não pode ser
 * empurrado para o servidor. Este ficheiro é o sítio único onde essa regra é
 * escrita; espalhá-la por dezassete consultas garantiria que uma delas ficava
 * para trás.
 */

/**
 * `draftState` ausente é submetido, não rascunho.
 *
 * Toda a fiscalização anterior à SPEC-10 não tem o campo. Escrever a regra ao
 * contrário — «é submetido quem tem `'submitted'`» — apagaria de uma só vez o
 * histórico inteiro de cada dispositivo em campo.
 */
export function isRascunho(visita: Pick<Visita, 'draftState'>): boolean {
  return visita.draftState === 'draft';
}

export function semRascunhos<T extends Pick<Visita, 'draftState'>>(visitas: T[]): T[] {
  return visitas.filter((v) => !isRascunho(v));
}

/**
 * Ids das visitas em rascunho, para filtrar os registos-filho.
 *
 * As infracções, provas, constatações e autos de um rascunho vivem nas tabelas
 * partilhadas e trazem `synced: false` como qualquer outro registo por
 * sincronizar — é por eles pertencerem a um rascunho, e não por si próprios,
 * que não podem seguir no push.
 */
export async function rascunhoIds(): Promise<Set<string>> {
  // Tabela **em bruto**, e não `db.visitas`: o envolvente de cifra expõe
  // `toArray`, `modify` e `count`, mas não `primaryKeys` — chamá-lo lançava
  // `TypeError` na primeira linha do push e derrubava a sincronização inteira,
  // em silêncio.
  //
  // Ler em bruto é aqui a escolha certa e não um contorno: `id` e `draftState`
  // são campos em claro (não estão em `visitaFields`), pelo que a consulta não
  // precisa de decifrar nada e funciona mesmo com a base bloqueada.
  const ids = await db
    .table('visitas')
    .where('draftState')
    .equals('draft')
    .primaryKeys();
  return new Set(ids as string[]);
}
