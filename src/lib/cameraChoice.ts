/**
 * Escolha da câmara traseira principal (SPEC-10, correcção #4).
 *
 * Um tablet robusto traz mais do que uma lente traseira, e `facingMode:
 * { ideal: 'environment' }` é **sugestão**: com duas traseiras, o motor escolhe
 * a que quiser. No Blackview Active 7 usado em campo escolhia a auxiliar — a
 * única das três sem `BURST_CAPTURE` —, e as fotografias saíam do sensor errado.
 *
 * O discriminador é o **torch**: a lanterna está montada ao lado do sensor
 * principal, não das auxiliares. Não se lê antes de abrir a câmara, pelo que a
 * sondagem é feita uma vez e o resultado memorizado por dispositivo.
 */

const CHAVE_ESCOLHA = 'drcae_camera_traseira';

/** Restrições da traseira, exigidas e não sugeridas. */
export function restricoesTraseira(deviceId?: string | null): MediaTrackConstraints {
  const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
  return deviceId
    ? { ...base, deviceId: { exact: deviceId } }
    : { ...base, facingMode: { exact: 'environment' } };
}

export function lerEscolhaMemorizada(): string | null {
  try {
    return localStorage.getItem(CHAVE_ESCOLHA);
  } catch {
    return null;
  }
}

export function memorizarEscolha(deviceId: string): void {
  try {
    localStorage.setItem(CHAVE_ESCOLHA, deviceId);
  } catch {
    // Memorizar é conforto: perder a preferência só custa uma sondagem a mais.
  }
}

export function esquecerEscolha(): void {
  try {
    localStorage.removeItem(CHAVE_ESCOLHA);
  } catch {
    /* idem */
  }
}

/**
 * Traseiras candidatas, pela ordem em que devem ser sondadas.
 *
 * `enumerateDevices` só preenche `label` depois de haver permissão concedida;
 * antes disso a lista vem anónima e a ordem do motor é o único critério
 * disponível — o que é aceitável, porque a sondagem seguinte corrige-a.
 */
export function traseirasCandidatas(dispositivos: MediaDeviceInfo[]): MediaDeviceInfo[] {
  const camaras = dispositivos.filter((d) => d.kind === 'videoinput');
  const traseiras = camaras.filter((d) => /back|rear|traseir|environment/i.test(d.label));
  return traseiras.length > 0 ? traseiras : camaras;
}

/**
 * Escolhe a traseira principal sondando cada candidata até encontrar torch.
 *
 * @param abrir abre um fluxo para o `deviceId` dado; o chamador é dono do
 *   ciclo de vida e fecha-o.
 * @returns o `deviceId` escolhido, ou `null` quando nenhuma candidata abre.
 */
export async function escolherTraseiraPrincipal(
  dispositivos: MediaDeviceInfo[],
  abrir: (deviceId: string) => Promise<MediaStreamTrack | null>,
): Promise<string | null> {
  const candidatas = traseirasCandidatas(dispositivos);
  let primeiraQueAbriu: string | null = null;

  for (const candidata of candidatas) {
    let track: MediaStreamTrack | null = null;
    try {
      track = await abrir(candidata.deviceId);
    } catch {
      continue;
    }
    if (!track) continue;
    primeiraQueAbriu ??= candidata.deviceId;

    const caps = track.getCapabilities?.() as { torch?: boolean } | undefined;
    if (caps?.torch) return candidata.deviceId;
  }

  // Nenhuma anunciou torch: fica a primeira que abriu, que é sempre melhor do
  // que deixar a escolha ao motor.
  return primeiraQueAbriu;
}
