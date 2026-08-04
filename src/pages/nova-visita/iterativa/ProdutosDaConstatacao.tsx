import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useNovaVisitaForm } from '../context';
import PickerSheet from '../../../components/PickerSheet';
import MotivosPendentes from '../MotivosPendentes';
import FundamentoDaApreensao from './FundamentoDaApreensao';
import LinhaProdutoCard from './LinhaProdutoCard';
import { useLinhasDeProduto } from './useLinhasDeProduto';
import { motivosDe } from '../../../lib/apreensaoValidacao';
import { precoDeOutraOrigem } from '../../../lib/produtosDaConstatacao';

/**
 * Produtos levantados numa constatação (SPEC-10 §5).
 *
 * Uma linha por produto, com o preço que se leu e o que se levou dele. Antes
 * eram dois botões da paleta e dois formulários — «Preço» e «Apreensão» — e o
 * agente que encontrava um produto acima do tecto e o apreendia escolhia-o duas
 * vezes, em dois sítios, no mesmo catálogo.
 *
 * Por baixo continuam a ser duas estruturas, e tinham de ser: `produtosPrices` é
 * um mapa de uma entrada por produto, partilhado com a check list da cesta
 * básica, e `apreensaoItens` é uma lista onde o mesmo produto aparece uma vez
 * por parte apreendida. A reconciliação é pura e testada
 * (`lib/produtosDaConstatacao.ts`); a escrita vive em `useLinhasDeProduto`.
 *
 * A apreensão deixou de se declarar: liga-se o interruptor de um produto, e isso
 * é a declaração. `apreensaoActiva` passou a ser derivado de haver item, o que
 * dispensa perguntar ao agente se fez o que acabou de fazer.
 *
 * O que aqui se regista da apreensão é **quantidade e unidade**. O destino de
 * cada parte — recolhida ou entregue a fiel depositário — e a identificação do
 * depositário são a tarefa «Destino da apreensão», da fiscalização inteira:
 * decidem-se quando o agente sabe o que a viatura leva, e não enquanto conta
 * sacos na prateleira.
 */
export default function ProdutosDaConstatacao() {
  const { infracoes, motivosApreensao } = useNovaVisitaForm();
  const {
    linhas,
    produtosPrices,
    apreensaoItens,
    supplyProducts,
    constatacaoActivaId,
    unitOptions,
    opcoesDeProduto,
    semLivro,
    temApreensao,
    escreverPreco,
    avaliarPreco,
    removerApreensao,
    acrescentarParte,
    editarParte,
    removerParte,
    removerLinha,
    adicionarDoCatalogo,
    adicionarNaoCatalogado,
  } = useLinhasDeProduto();

  const [picker, setPicker] = useState(false);

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
        <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
          Produtos desta constatação
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
          Registe o preço praticado e, se apreendeu o produto, a quantidade e a
          unidade. O que registar aqui aparece também na verificação da cesta
          básica; o que registar na cesta básica não vem para aqui.
        </p>
      </div>

      {linhas.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center py-4">
          Nenhum produto registado nesta constatação.
        </p>
      )}

      <div className="space-y-2.5">
        {linhas.map((linha) => (
          <LinhaProdutoCard
            key={linha.chave}
            linha={linha}
            preco={linha.assetSupply != null ? produtosPrices[linha.assetSupply] : undefined}
            precoDoLivro={
              supplyProducts.find((p) => p.id === linha.assetSupply)?.retailPrice ?? null
            }
            precoDeOutraOrigem={precoDeOutraOrigem(produtosPrices, linha, constatacaoActivaId)}
            semLivro={semLivro}
            partes={linha.partes.map((index) => ({ index, item: apreensaoItens[index] }))}
            unitOptions={unitOptions}
            onPreco={(campo, valor) => escreverPreco(linha.assetSupply!, campo, valor)}
            onAvaliar={(campo, valor) => avaliarPreco(linha.assetSupply!, campo, valor)}
            onAcrescentarParte={() => acrescentarParte(linha)}
            onEditarParte={editarParte}
            onRemoverParte={removerParte}
            onRemoverApreensao={() => removerApreensao(linha)}
            onRemover={() => removerLinha(linha)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setPicker(true)}
        className="w-full py-3.5 rounded-xl border-2 border-dashed border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Adicionar produto
      </button>

      {/* Ao nível do auto, e não do produto: vale para a fiscalização inteira. */}
      {temApreensao && infracoes.length === 0 && <FundamentoDaApreensao />}

      {/* Só o que se resolve aqui: o destino e o depositário pedem-se na tarefa
          própria, e mostrá-los neste ecrã mandava o agente procurar um campo
          que ele não ia encontrar. */}
      <MotivosPendentes
        motivos={motivosDe(motivosApreensao, [
          'justificacao',
          'item-produto',
          'item-quantidade',
          'item-unidade',
        ])}
      />

      <PickerSheet
        open={picker}
        title="Produto"
        options={opcoesDeProduto}
        value={null}
        onSelect={(value) => {
          adicionarDoCatalogo(Number(value));
          setPicker(false);
        }}
        onClose={() => setPicker(false)}
        searchPlaceholder="Procurar produto..."
        emptyLabel="Sem produtos por registar."
        freeText={{
          prompt: 'Produto fora do catálogo',
          label: (query) => `Usar «${query}» como produto não catalogado`,
          onCreate: (query) => {
            adicionarNaoCatalogado(query);
            setPicker(false);
          },
        }}
      />
    </div>
  );
}
