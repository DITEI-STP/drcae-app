import { describe, expect, it } from 'vitest';
import { escolherInstantePoster } from './videoPoster';

describe('escolherInstantePoster', () => {
  it('não usa o primeiro fotograma', () => {
    // Sai quase sempre preto ou queimado: a câmara ainda está a expor quando a
    // gravação arranca, e uma miniatura preta não distingue duas provas.
    expect(escolherInstantePoster(30)).toBeGreaterThan(0);
  });

  it('fica a um segundo num vídeo de duração normal', () => {
    expect(escolherInstantePoster(30)).toBe(1);
    expect(escolherInstantePoster(2)).toBe(1);
  });

  it('usa o meio de um vídeo muito curto', () => {
    // Pedir o segundo 1 de um vídeo de 0,3 s não devolve fotograma nenhum.
    expect(escolherInstantePoster(0.3)).toBeCloseTo(0.15);
  });

  it('cai num instante seguro sem duração conhecida', () => {
    // Acontece com gravações cujo contentor não declara duração — comum em
    // WebM gravado pelo MediaRecorder e interrompido.
    expect(escolherInstantePoster(NaN)).toBe(0.1);
    expect(escolherInstantePoster(Infinity)).toBe(0.1);
    expect(escolherInstantePoster(0)).toBe(0.1);
    expect(escolherInstantePoster(-5)).toBe(0.1);
  });

  it('nunca ultrapassa a duração do vídeo', () => {
    for (const duracao of [0.2, 0.5, 1, 5, 120]) {
      expect(escolherInstantePoster(duracao)).toBeLessThanOrEqual(duracao);
    }
  });
});
