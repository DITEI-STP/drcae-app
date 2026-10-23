export function preservePending<T extends {synced?: boolean}>(remote: T, local: T | undefined): T {
  return local && local.synced !== true ? local : remote;
}
