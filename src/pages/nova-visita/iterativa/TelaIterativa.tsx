import { useEffect, useRef, useState } from 'react';
import { Lightbulb, Package, Plus, Tag } from 'lucide-react';
import { useNovaVisitaForm } from '../context';
import CartaoConstatacao from './CartaoConstatacao';
import DestinoDaApreensao from './DestinoDaApreensao';
import CartaoTarefa from './CartaoTarefa';
import AlertaPendencias from '../AlertaPendencias';
import FolhaAccao from './FolhaAccao';
import ProdutosDaConstatacao from './ProdutosDaConstatacao';
import { useContagens } from './useContagens';
import { useDraftSession } from './useDraftSession';
import { useFolhaTransaccional } from './useFolhaTransaccional';
import { progressoDestinos } from '../../../lib/destinoApreensao';
import type { Pendencia } from '../../../lib/pendenciasDaTela';
import { produtosVerificados } from '../../../lib/priceOwnership';
import { contarPendentesPorResponder } from '../../../lib/recomendacoes';
import type { AccaoConstatacao } from './PaletaAccoes';
import StepInfracoes from '../steps/StepInfracoes';
import StepProvas from '../steps/StepProvas';
import StepCestaBasica from '../steps/StepCestaBasica';
import StepRecomendacoes from '../steps/StepRecomendacoes';
import RecomendacoesAnteriores from '../steps/RecomendacoesAnteriores';

/**
 * Folha aberta sobre a tela.
 *
 * O estado vive no `NovaVisita` e desce por prop: o guard de saída da tela —
 * que pergunta pelas recomendações anteriores por responder — corre lá, e
 * «Rever agora» tem de conseguir abrir a folha que responde à pergunta. Um
 * botão que só fecha o diálogo e deixa o agente onde estava não é um convite a
 * rever; é uma pergunta feita duas vezes.
 */
export type Folha =
  | AccaoConstatacao
  | 'tarefa-precos'
  | 'tarefa-recomendacoes'
  | 'tarefa-apreensao'
  | null;

interface Props {
  folha: Folha;
  onFolha: (proxima: Folha) => void;
  /** O que falta para sair da tela, derivado no formulário. */
  pendencias: Pendencia[];
  alerta: boolean;
  onFecharAlerta: () => void;
  /** Avança mesmo assim — só chega aqui quando nada impede. */
  onContinuar: () => void;
}

const TITULO_FOLHA: Record<Exclude<Folha, null>, string> = {
  foto: 'Provas',
  infraccao: 'Infracções',
  produtos: 'Produtos',
  recomendacao: 'Recomendações',
  'tarefa-precos': 'Preços da cesta básica',
  'tarefa-recomendacoes': 'Recomendações anteriores',
  'tarefa-apreensao': 'Destino da apreensão',
};

/**
 * Tela iterativa — o miolo da modalidade nova (SPEC-10 §6).
 *
 * Duas coisas, e apenas duas: **tarefas** que o agente tem de fechar, e
 * **constatações** que ele cria à medida que percorre o espaço. É explicável a
 * um agente em trinta segundos, que é o melhor teste que uma interface de campo
 * pode passar.
 */
export default function TelaIterativa({
  folha,
  onFolha,
  pendencias,
  alerta,
  onFecharAlerta,
  onContinuar,
}: Props) {
  const {
    visitaId,
    location,
    produtosPrices,
    supplyProducts,
    groupedHistoricoRecomendacoes,
    recomendacoesHistoricas,
    apreensaoItens,
    constatacaoActivaId,
    setConstatacaoActivaId,
  } = useNovaVisitaForm();

  const sessao = useDraftSession(visitaId, location);
  const transaccao = useFolhaTransaccional();
  const { contar, resumir, vazia } = useContagens();

  const verificados = produtosVerificados(produtosPrices).length;
  // A tarefa do destino nasce da apreensão e desaparece com ela: sem nada
  // apreendido não há cartão, e é por isso que o total vem dos itens.
  const destinos = progressoDestinos(apreensaoItens);
  const pendentesPorResponder = contarPendentesPorResponder(
    groupedHistoricoRecomendacoes.length,
    recomendacoesHistoricas,
  );
  // Derivado do que falta, e não contado à parte: a mesma recomendação repetida
  // em três visitas traz três respostas para um só grupo, e a contagem directa
  // mostrava «4 de 3».
  const pendentesRespondidas = groupedHistoricoRecomendacoes.length - pendentesPorResponder;

  /**
   * O que a folha já tinha lá dentro, no momento em que abriu.
   *
   * Distingue preencher de raiz de mexer no que estava feito — é essa
   * diferença, e não o facto de haver texto no ecrã, que decide se o botão de
   * saída promete «Reverter».
   */
  const conteudoDaFolha = (aberta: Exclude<Folha, null>): number => {
    // As tarefas contam sobre a fiscalização inteira; as acções contam sobre a
    // constatação em aberto, que é a quem pertence o que a folha vai registar.
    switch (aberta) {
      case 'tarefa-precos':
        return verificados;
      case 'tarefa-recomendacoes':
        return pendentesRespondidas;
      case 'tarefa-apreensao':
        return destinos.definidos;
      default:
        return contar(constatacaoActivaId ?? undefined)[aberta] ?? 0;
    }
  };

  // Instantâneo da transacção tirado num só sítio, seja a folha aberta pela
  // paleta, por um cartão de tarefa ou pelo «Rever agora» do passo seguinte.
  // Espalhá-lo por cada chamador deixava sempre um caminho sem instantâneo, e
  // esse fechava a folha sem nada para reverter.
  const folhaAnterior = useRef<Folha>(null);
  const [editaExistente, setEditaExistente] = useState(false);
  useEffect(() => {
    if (folha && !folhaAnterior.current) {
      setEditaExistente(conteudoDaFolha(folha) > 0);
      transaccao.abrir();
    }
    folhaAnterior.current = folha;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folha]);

  const abrirAccao = async (accao: AccaoConstatacao) => {
    const id = await sessao.abrir();
    setConstatacaoActivaId(id);
    onFolha(accao);
  };

  const fecharFolha = (aplicar: boolean) => {
    if (aplicar) transaccao.confirmar();
    else transaccao.reverter();
    onFolha(null);
  };

  /** Fecha a constatação em aberto, apagando-a quando ficou sem nada. */
  const fecharActiva = async () => {
    const activa = sessao.activa;
    if (activa?.id) await sessao.fechar(activa.id, vazia(activa));
  };

  const trocarPara = async (id: string) => {
    // Tocar noutra constatação fecha a que está aberta e abre essa. É o gesto
    // que o agente faz por instinto ao mudar de sítio na loja; obrigá-lo a
    // fechar primeiro seria um toque a mais em cada mudança.
    if (sessao.activa?.id !== id) await fecharActiva();
    await sessao.reabrir(id);
    setConstatacaoActivaId(id);
  };

  /**
   * Leva o agente ao ecrã onde a pendência se resolve.
   *
   * A folha de Produtos é de uma constatação só, e os motivos são calculados
   * sobre a fiscalização inteira: sem comutar para a que contém o problema, o
   * atalho abriria uma lista onde ele não está — e a conclusão do agente seria
   * que o alerta mente. Comutar reabre essa constatação e deixa-a aberta, tal
   * como tocar no cartão faria.
   */
  const resolver = async (pendencia: Pendencia) => {
    onFecharAlerta();
    if (pendencia.alvo !== 'produtos') {
      onFolha(pendencia.alvo);
      return;
    }
    if (pendencia.constatacaoId) await trocarPara(pendencia.constatacaoId);
    // Sem dona conhecida (o cartão foi descartado e o item sobreviveu), a folha
    // abre na constatação em aberto; não havendo nenhuma, abre-se uma.
    else if (!sessao.activa) {
      await abrirAccao('produtos');
      return;
    }
    onFolha('produtos');
  };

  // Um só toque para passar à constatação seguinte: fechar a corrente e abrir a
  // próxima eram dois botões para um gesto só.
  const novaConstatacao = async () => {
    await fecharActiva();
    const id = await sessao.abrir();
    setConstatacaoActivaId(id);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="space-y-2.5">
        {supplyProducts.length > 0 && (
          <CartaoTarefa
            icone={Tag}
            titulo="Preços da cesta básica"
            feitos={verificados}
            total={supplyProducts.length}
            onAbrir={() => onFolha('tarefa-precos')}
          />
        )}
        {groupedHistoricoRecomendacoes.length > 0 && (
          <CartaoTarefa
            icone={Lightbulb}
            titulo="Recomendações anteriores"
            feitos={pendentesRespondidas}
            total={groupedHistoricoRecomendacoes.length}
            onAbrir={() => onFolha('tarefa-recomendacoes')}
          />
        )}
        {destinos.total > 0 && (
          <CartaoTarefa
            icone={Package}
            titulo="Destino da apreensão"
            feitos={destinos.definidos}
            total={destinos.total}
            onAbrir={() => onFolha('tarefa-apreensao')}
          />
        )}
      </div>

      {sessao.constatacoes.length === 0 && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-center space-y-1">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Ainda sem constatações
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Percorra o espaço e registe cada coisa que encontrar, com as provas e as
            consequências juntas.
          </p>
        </div>
      )}

      <div className="space-y-2.5">
        {[...sessao.constatacoes].reverse().map((c) => (
          <CartaoConstatacao
            key={c.id}
            constatacao={c}
            resumo={resumir(c)}
            totais={contar(c.id)}
            onAccao={(accao) => void abrirAccao(accao)}
            onDescrever={(texto) => void sessao.descrever(c.id!, texto)}
            onFechar={() => {
              void sessao.fechar(c.id!, vazia(c));
              setConstatacaoActivaId(null);
            }}
            onReabrir={() => void trocarPara(c.id!)}
            onDescartar={() => {
              void sessao.descartar(c.id!);
              setConstatacaoActivaId(null);
            }}
          />
        ))}
      </div>

      {/* Sempre visível, mesmo com uma constatação em aberto: é ele que a fecha
          e abre a seguinte. Escondê-lo obrigava a concluir primeiro, e era esse
          passo intermédio que fazia o cartão parecer não estar guardado. */}
      <button
        type="button"
        onClick={() => void novaConstatacao()}
        className="w-full py-4 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Nova constatação
      </button>

      {pendentesPorResponder > 0 && (
        <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest text-center">
          {pendentesPorResponder === 1
            ? '1 recomendação anterior por responder'
            : `${pendentesPorResponder} recomendações anteriores por responder`}
        </p>
      )}


      <AlertaPendencias
        pendencias={pendencias}
        aberto={alerta}
        onFechar={onFecharAlerta}
        onResolver={(pendencia) => void resolver(pendencia)}
        onContinuar={onContinuar}
      />

      <FolhaAccao
        titulo={folha ? TITULO_FOLHA[folha] : ''}
        aberta={folha !== null}
        alterada={transaccao.alterada}
        editaExistente={editaExistente}
        onConfirmar={() => fecharFolha(true)}
        onReverter={() => fecharFolha(false)}
      >
        {folha === 'foto' && <StepProvas />}
        {folha === 'infraccao' && <StepInfracoes />}
        {folha === 'produtos' && <ProdutosDaConstatacao />}
        {folha === 'recomendacao' && <StepRecomendacoes />}
        {folha === 'tarefa-precos' && <StepCestaBasica />}
        {folha === 'tarefa-recomendacoes' && <RecomendacoesAnteriores />}
        {folha === 'tarefa-apreensao' && <DestinoDaApreensao />}
      </FolhaAccao>
    </div>
  );
}
