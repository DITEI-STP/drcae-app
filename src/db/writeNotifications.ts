import Dexie from 'dexie';

// Notificado após qualquer escrita, para invalidar caches derivadas destas
// tabelas (ver lib/operadoresCache). Registado aqui, num único ponto, em vez de
// em cada local de escrita — assim nenhuma escrita futura pode esquecer-se de o
// fazer.
type WriteListener = () => void;
const writeListeners = new Set<WriteListener>();

export function onDatabaseWrite(listener: WriteListener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function dispatchWrite() {
  Dexie.ignoreTransaction(() => {
    writeListeners.forEach((listener) => {
      try { listener(); } catch { /* A cache não pode impedir a escrita. */ }
    });
  });
}

export function notifyWrite() {
  const transaction = Dexie.currentTransaction;
  if (transaction) transaction.on('complete', dispatchWrite);
  else dispatchWrite();
}
