import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Camera, Plus, Trash2, Check, ChevronRight, AlertTriangle, Users, Loader2 } from 'lucide-react';
import { db, generateId, AtividadeEconomica } from '../db/db';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { confirmDialog, toast } from '../lib/notifications';
import { triggerFullSyncIfReachable } from '../lib/sync';
import { isDatabaseLockedError, isDatabaseUnlocked } from '../lib/unlock';
import { addAppLog } from '../lib/appLogs';
import UnlockDialog from '../components/UnlockDialog';
import ChipGroup from '../components/ChipGroup';
import { readNationalities } from '../lib/nationalities';
import { findAssetInGroup, readAssetGroup } from '../lib/assetGroup';
import { useBackIntent } from '../hooks/useBackIntent';
import { useEnterKeyNavigation } from '../hooks/useEnterKeyNavigation';

// Alternativas usadas só enquanto os grupos `district`/`nationality` não
// estiverem sincronizados. A fonte de verdade é a base de dados: estes nomes
// existem para o formulário não ficar intransponível num dispositivo acabado
// de configurar, e não substituem o catálogo.
const DISTRITOS_FALLBACK = ['Água Grande', 'Cantagalo', 'Caué', 'Lembá', 'Lobata', 'Mé-Zóchi', 'RAP'];
const NACIONALIDADES_FALLBACK = ['Santomense', 'Angolana', 'Cabo-verdiana', 'Portuguesa', 'Brasileira'];
const getCachedRamos = (): string[] => {
  try {
    const cached = localStorage.getItem('drcae_branches');
    if (cached) {
      const parsed = JSON.parse(cached) as { name: string }[];
      if (parsed.length > 0) {
        return parsed.map(b => b.name);
      }
    }
  } catch (e) {
    console.error('[drcae] Falha ao ler ramos de atividade do cache:', e);
  }
  return ['Restauração', 'Comércio Misto', 'Alojamento', 'Prestação de Serviço', 'Indústria', 'Outro'];
};

const RAMOS = getCachedRamos();

const DRAFT_KEY = 'drcae_nova_firma_draft';
// O logótipo vive à parte porque é base64 e pode ter centenas de KB: mantê-lo
// fora do objecto gravado a cada tecla deixa a escrita frequente pequena.
const DRAFT_LOGO_KEY = 'drcae_nova_firma_draft_logo';
const DRAFT_STEP_LABELS = ['Identificação', 'Localização', 'Responsável', 'Atividades'];

function describeFirmaDraft(draft: { savedAt?: number; step?: number; name?: string }): string {
  const partes: string[] = [];
  if (draft.name?.trim()) partes.push(`«${draft.name.trim()}»`);
  if (typeof draft.savedAt === 'number') {
    partes.push(`ficou a ${format(new Date(draft.savedAt), 'dd/MM')} às ${format(new Date(draft.savedAt), 'HH:mm')}`);
  }
  const label = draft.step ? DRAFT_STEP_LABELS[draft.step - 1] : undefined;
  if (label) partes.push(`no passo «${label}»`);
  const onde = partes.length > 0 ? `O registo ${partes.join(', ')}.\n\n` : '';
  return `${onde}Recuperar o que ficou por terminar, ou começar um registo novo? Começar novo apaga o rascunho.`;
}

export default function NovaFirma() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || '/firmas';

  const [equipeNaoDefinida] = useState(() => localStorage.getItem('drcae_equipe_definida') !== 'true');

  const [step, setStep] = useState(1);

  const [type, setType] = useState('Revendedor');

  const [logo, setLogo] = useState<string | null>(null);
  const [nif, setNif] = useState('');
  const [name, setName] = useState('');
  const [district, setDistrict] = useState('Água Grande');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  
  const [constituicao, setConstituicao] = useState('');
  const [emissoraLicenca, setEmissoraLicenca] = useState('');
  const [numLicenca, setNumLicenca] = useState('');
  const [numAlvara, setNumAlvara] = useState('');
  
  const [representant, setRepresentant] = useState('');
  const [representantCargo, setRepresentantCargo] = useState('');
  const [representantNacionalidade, setRepresentantNacionalidade] = useState('Santomense');
  
  const [atividades, setAtividades] = useState<AtividadeEconomica[]>([]);

  // Catálogos sincronizados. Os valores continuam a ser nomes — é o que a UI
  // mostra e o que o registo guarda por legibilidade — e o `asset.id`
  // correspondente é resolvido de uma só vez ao gravar (ver `handleSubmit`).
  //
  // Cada lista cai numa alternativa fixa quando o grupo ainda não sincronizou,
  // para o formulário continuar preenchível num dispositivo acabado de
  // configurar. Nesse caso não há id a enviar e o backend resolve por nome,
  // agora limitado ao grupo certo.
  const nacionalidadeOptions = useMemo(() => {
    const catalog = readNationalities();
    const names = catalog.length > 0 ? catalog.map((a) => a.name) : NACIONALIDADES_FALLBACK;
    return names.map((nac) => ({ value: nac, label: nac }));
  }, []);

  const distritoOptions = useMemo(() => {
    const catalog = readAssetGroup('district');
    const names = catalog.length > 0 ? catalog.map((a) => a.name) : DISTRITOS_FALLBACK;
    return names.map((d) => ({ value: d, label: d }));
  }, []);

  // Sem alternativa fixa: são campos opcionais e só do operador formal, pelo
  // que um catálogo por sincronizar não bloqueia ninguém — e inventar valores
  // aqui só produziria escolhas sem correspondência na base de dados.
  const constituicaoOptions = useMemo(
    () => readAssetGroup('constitution').map((a) => ({ value: a.name, label: a.name })),
    [],
  );
  const emissoraOptions = useMemo(
    () => readAssetGroup('issuer').map((a) => ({ value: a.name, label: a.name })),
    [],
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gate do autosave: até haver resposta sobre o rascunho pendente, gravar
  // sobrescreveria com o formulário vazio aquilo que se está a perguntar se
  // quer recuperar.
  const [draftChecked, setDraftChecked] = useState(false);

  // Este formulário não tinha rascunho nenhum: sair a meio — por engano, por
  // chamada, ou porque o Android matou o processo — deitava fora o registo
  // inteiro, que no terreno pode ser meia hora de trabalho.
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) { setDraftChecked(true); return; }

    let draft: any;
    try {
      draft = JSON.parse(raw);
    } catch {
      localStorage.removeItem(DRAFT_KEY);
      localStorage.removeItem(DRAFT_LOGO_KEY);
      setDraftChecked(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const recuperar = await confirmDialog({
        title: 'Registo por terminar',
        message: describeFirmaDraft(draft),
        confirmLabel: 'Recuperar',
        cancelLabel: 'Começar novo',
        tone: 'info',
      });
      if (cancelled) return;

      if (!recuperar) {
        localStorage.removeItem(DRAFT_KEY);
        localStorage.removeItem(DRAFT_LOGO_KEY);
        setDraftChecked(true);
        return;
      }

      if (typeof draft.step === 'number') setStep(Math.min(4, Math.max(1, draft.step)));
      if (draft.type) setType(draft.type);
      if (draft.nif) setNif(draft.nif);
      if (draft.name) setName(draft.name);
      if (draft.district) setDistrict(draft.district);
      if (draft.address) setAddress(draft.address);
      if (draft.contact) setContact(draft.contact);
      if (draft.email) setEmail(draft.email);
      if (draft.constituicao) setConstituicao(draft.constituicao);
      if (draft.emissoraLicenca) setEmissoraLicenca(draft.emissoraLicenca);
      if (draft.numLicenca) setNumLicenca(draft.numLicenca);
      if (draft.numAlvara) setNumAlvara(draft.numAlvara);
      if (draft.representant) setRepresentant(draft.representant);
      if (draft.representantCargo) setRepresentantCargo(draft.representantCargo);
      if (draft.representantNacionalidade) setRepresentantNacionalidade(draft.representantNacionalidade);
      if (Array.isArray(draft.atividades)) setAtividades(draft.atividades);
      setLogo(localStorage.getItem(DRAFT_LOGO_KEY));
      setDraftChecked(true);
    })();

    return () => { cancelled = true; };
  }, []);

  // Estado de texto: barato, gravado com atraso curto a cada alteração.
  useEffect(() => {
    if (!draftChecked || isSubmitting) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify({
          savedAt: Date.now(), step, type, nif, name, district, address, contact, email,
          constituicao, emissoraLicenca, numLicenca, numAlvara,
          representant, representantCargo, representantNacionalidade, atividades,
        }));
      } catch (err) {
        // Quota esgotada: o rascunho anterior mantém-se e o registo em curso
        // não é interrompido por causa disto.
        console.warn('[drcae] Não foi possível gravar o rascunho do operador.', err);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [
    draftChecked, isSubmitting, step, type, nif, name, district, address, contact, email,
    constituicao, emissoraLicenca, numLicenca, numAlvara,
    representant, representantCargo, representantNacionalidade, atividades,
  ]);

  // Logótipo: caro e raramente alterado, por isso só quando muda.
  useEffect(() => {
    if (!draftChecked) return;
    try {
      if (logo) localStorage.setItem(DRAFT_LOGO_KEY, logo);
      else localStorage.removeItem(DRAFT_LOGO_KEY);
    } catch (err) {
      console.warn('[drcae] Não foi possível gravar o logótipo do rascunho.', err);
    }
  }, [draftChecked, logo]);

  const clearFirmaDraft = () => {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_LOGO_KEY);
  };

  if (equipeNaoDefinida) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 min-h-screen font-sans">
         <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full overflow-hidden p-8 space-y-6 text-center">
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto shadow-sm animate-bounce">
               <AlertTriangle className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-2">
               <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Definição de Equipa Obrigatória</h3>
               <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                  De acordo com os protocolos jurídicos da <b className="dark:text-slate-300">DRCAE</b>, é estritamente obrigatório definir e validar a composição da equipa de agentes destacados para o serviço diário, pelo menos uma vez, antes de registar novos operadores económicos ou lavrar atas de fiscalização.
               </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-start gap-3">
               <div className="w-6 h-6 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center shrink-0 text-amber-700 dark:text-amber-400 font-bold text-xs font-mono">!</div>
               <p className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold text-left leading-normal">
                  Esta medida garante que todas as ações e coimas aplicadas têm validade de fé pública e carimbo oficial do Estado.
               </p>
            </div>
            <button
               onClick={() => navigate('/equipe', { state: { returnTo: '/firmas/nova' } })}
               className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
               <Users className="w-4 h-4 text-white" />
               Configurar Equipa Técnica
            </button>
         </div>
      </div>
    );
  }

  const isInformal = type === 'Informal';

  const addAtividade = () => {
    setAtividades([...atividades, { id: generateId(), ramo: RAMOS[0], atividade: '', local: '' }]);
  };

  const updateAtividade = (index: number, field: keyof AtividadeEconomica, value: string) => {
    const newAtividades = [...atividades];
    newAtividades[index] = { ...newAtividades[index], [field]: value };
    setAtividades(newAtividades);
  };

  const removeAtividade = (index: number) => {
    setAtividades(atividades.filter((_, i) => i !== index));
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => setLogo(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  /**
   * Regista a firma e navega para o detalhe dela.
   *
   * Toda a submissão passa por `try/catch` e por `isSubmitting`: este ecrã
   * falhava em silêncio — `handleSubmit` era `async` sem tratamento de erro e
   * `nextStep` chamava-o sem `await`, pelo que qualquer excepção (tipicamente
   * a base cifrada bloqueada) virava uma rejeição não tratada e o botão
   * «Cadastrar» não fazia rigorosamente nada.
   */
  const handleSubmit = async () => {
    if (isSubmitting) return;
    if (!name || (!isInformal && !nif) || !contact.trim()) {
      toast.error('Preencha os campos obrigatórios (Nome, NIF e Contacto).');
      return;
    }

    // Verificação prévia: se a chave de cifra caiu (sessão expirada, app
    // retomada depois de o Android matar o processo), pedir a palavra-passe e
    // retomar — em vez de deixar o `add` lançar e o ecrã ficar mudo.
    if (!isDatabaseUnlocked()) {
      setNeedsUnlock(true);
      return;
    }

    setIsSubmitting(true);
    const newFirmaId = generateId();

    // Resolução dos `asset.id` num só ponto, à saída do formulário. A UI
    // trabalha com nomes — é o que se lê e o que continua gravado — mas o que
    // liga o registo ao catálogo é o id, que sobrevive a uma renomeação na
    // área administrativa. `undefined` quando o grupo não sincronizou: nesse
    // caso o backend resolve pelo nome, limitado ao grupo certo.
    const assetDistrict = findAssetInGroup('district', district)?.id;
    const assetNationality = findAssetInGroup('nationality', representantNacionalidade)?.id;
    const assetToperator = findAssetInGroup('type', type)?.id;
    const assetConstitution = !isInformal ? findAssetInGroup('constitution', constituicao)?.id : undefined;
    const assetIssuer = !isInformal ? findAssetInGroup('issuer', emissoraLicenca)?.id : undefined;
    const atividadesComAsset = atividades.map((a) => ({
      ...a,
      assetBranch: findAssetInGroup('branch', a.ramo)?.id ?? null,
    }));

    try {
      await db.firmas.add({
        id: newFirmaId,
        logo: logo || undefined,
        nif,
        name,
        district,
        address,
        contact,
        email,
        type,
        constituicao: !isInformal ? constituicao : undefined,
        emissoraLicenca: !isInformal ? emissoraLicenca : undefined,
        numLicenca: !isInformal ? numLicenca : undefined,
        numAlvara: !isInformal ? numAlvara : undefined,
        representant,
        representantCargo,
        representantNacionalidade,
        assetDistrict,
        assetNationality,
        assetToperator,
        assetConstitution,
        assetIssuer,
        atividades: atividadesComAsset,
        synced: false,
        createdAt: Date.now()
      });
    } catch (err) {
      setIsSubmitting(false);
      addAppLog('error', 'nova-firma', 'Falha ao registar operador', err);

      // A base pode ter sido bloqueada entre a verificação e a escrita.
      if (isDatabaseLockedError(err)) {
        setNeedsUnlock(true);
        return;
      }
      toast.error(
        err instanceof Error
          ? `Não foi possível registar o operador: ${err.message}`
          : 'Não foi possível registar o operador. Tente novamente.',
      );
      return;
    }

    // Gravado com sucesso: o rascunho deixou de ter dono. Só aqui e no
    // «Começar novo» — sair do formulário mantém-no, que é o propósito.
    clearFirmaDraft();

    if (returnTo === '/visitas/nova') {
      navigate('/visitas/nova', { state: { firmaId: newFirmaId }, replace: true });
    } else {
      navigate(`/firmas/${newFirmaId}`, { replace: true });
    }
    triggerFullSyncIfReachable().catch((err) => {
      console.warn('[drcae] Sync imediato após operador falhou; registo ficará pendente.', err);
    });
  };

  const nextStep = () => {
    if (step === 1 && (!name || (!isInformal && !nif) || !contact.trim())) {
      return toast.error('Preencha os campos obrigatórios (Nome, NIF e Contacto).');
    }
    // Validar cedo o que era só verificado no fim — chegar ao passo 4 com
    // dados insuficientes é um percurso inútil.
    if (step === 2 && !district) return toast.error('Seleccione o distrito.');
    // As actividades vivem no passo 4; a guarda estava no 3 («Responsável /
    // Proprietário») e exigia o que ainda não tinha sido mostrado, bloqueando
    // o formulário num passo que não tem forma de o satisfazer.
    if (step === 4) {
      if (atividades.length === 0) {
        return toast.error('Registe pelo menos uma actividade económica.');
      }
      // Contar linhas não chega: `addAtividade` cria a entrada em branco, pelo
      // que uma linha por preencher satisfazia a guarda e o operador ficava
      // gravado com uma actividade vazia.
      if (atividades.some((a) => !a.atividade.trim() || !a.local.trim())) {
        return toast.error('Complete a actividade e o local de cada entrada.');
      }
    }
    if (step < 4) setStep(step + 1);
    else void handleSubmit();
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
    else navigate(-1);
  };

  const formRef = useEnterKeyNavigation({
    onAdvance: nextStep,
    lastFieldHint: step === 4 ? 'go' : 'done',
    enabled: !isSubmitting,
  });

  // Botão «voltar» do Android: recua um passo em vez de sair do formulário.
  // No primeiro passo confirma — e a mensagem deixou de dizer que os dados se
  // perdem, porque com o rascunho deixou de ser verdade.
  useBackIntent(() => {
    if (needsUnlock) { setNeedsUnlock(false); return; }
    if (step > 1) { setStep(step - 1); return; }
    void (async () => {
      const sair = await confirmDialog({
        title: 'Sair do registo de operador?',
        message: 'O rascunho fica guardado e poderá retomá-lo quando voltar a registar um operador.',
        confirmLabel: 'Sair',
        cancelLabel: 'Continuar aqui',
      });
      if (sair) navigate('/');
    })();
  }, true, true);

  return (
    // A tecla de acção do teclado percorre os campos e, no último, faz o mesmo
    // que o botão do rodapé. `nextStep` já valida e explica por toast o que
    // falta, pelo que o teclado só encaminha — não valida por si.
    <div ref={formRef} className="flex flex-col h-full bg-[#F5F7FA] dark:bg-slate-950">
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 bg-white dark:bg-slate-900 z-10 flex flex-col shadow-sm">
         <div className="flex items-center">
             <button onClick={prevStep} className="mr-3 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5" />
             </button>
             <h2 className="font-bold text-slate-900 dark:text-white tracking-tight">Nova Firma</h2>
         </div>
         {/* Progress */}
         <div className="flex gap-1 mt-4">
            {[1, 2, 3, 4].map(s => (
               <div key={s} className={cn("h-1 flex-1 rounded-full", step >= s ? "bg-blue-600 dark:bg-blue-500" : "bg-slate-200 dark:bg-slate-800")} />
            ))}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar flex flex-col text-slate-800 dark:text-slate-200">
          {/* STEP 1 */}
          {step === 1 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
                    <div className="space-y-3">
                       <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Tipo de Firma *</label>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {['Revendedor', 'Importador', 'Informal'].map(t => (
                             <div 
                               key={t}
                               onClick={() => setType(t)}
                               className={cn(
                                  "p-4 border rounded-xl cursor-pointer transition-all flex items-center gap-3",
                                  type === t ? "bg-blue-50 border-blue-600 shadow-sm dark:bg-blue-900/30 dark:border-blue-500" : "bg-white dark:bg-slate-850 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                               )}
                             >
                                <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0", type === t ? "bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500" : "border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900")}>
                                   {type === t && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <span className={cn("font-bold text-sm", type === t ? "text-blue-900 dark:text-blue-200" : "text-slate-800 dark:text-slate-200")}>{t}</span>
                             </div>
                          ))}
                       </div>
                    </div>

                    <div className="flex flex-col justify-center items-center gap-4">
                       <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex flex-col items-center justify-center overflow-hidden relative cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" onClick={() => fileInputRef.current?.click()}>
                          {logo ? (
                             <img src={logo} alt="Logo" className="w-full h-full object-cover" />
                          ) : (
                             <>
                               <Camera className="w-6 h-6 text-slate-400 dark:text-slate-500 mb-1" />
                               <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">Logotipo</span>
                             </>
                          )}
                       </div>
                       <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Nome da Firma *</label>
                          <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium outline-none text-slate-900 dark:text-white" />
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">NIF {isInformal ? '' : '*'}</label>
                          {/* `inputMode` numérico abre o teclado de dígitos no
                              Android — o NIF não tem letras e o teclado
                              alfabético obriga a trocar de mapa a cada campo. */}
                          <input required={!isInformal} type="text" inputMode="numeric" pattern="[0-9]*" value={nif} onChange={e => setNif(e.target.value)} className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium outline-none text-slate-900 dark:text-white" />
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Contacto *</label>
                          {/* `tel` em vez de `numeric`: o teclado telefónico
                              traz o `+` do indicativo, que o de dígitos não
                              tem. Obrigatório mesmo no operador informal — sem
                              NIF, é o único meio de lá voltar a chegar. */}
                          <input required type="tel" inputMode="tel" value={contact} onChange={e => setContact(e.target.value)} className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium outline-none text-slate-900 dark:text-white" />
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Email</label>
                          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium outline-none text-slate-900 dark:text-white" />
                       </div>
                    </div>
                </div>
             </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-6">
                   <ChipGroup
                      label="Distrito"
                      options={distritoOptions}
                      value={district || null}
                      onChange={setDistrict}
                      sheetTitle="Distrito"
                   />

                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Morada Complementar</label>
                      <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, Bairro, Edifício..." className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium outline-none text-slate-900 dark:text-white" />
                   </div>
                </div>
             </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                   <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 mb-4">Responsável / Proprietário</h3>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Nome do Representante</label>
                      <input type="text" value={representant} onChange={e => setRepresentant(e.target.value)} className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium outline-none text-slate-900 dark:text-white" />
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Cargo</label>
                         <input type="text" value={representantCargo} onChange={e => setRepresentantCargo(e.target.value)} placeholder="Gerente, Proprietário..." className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium outline-none text-slate-900 dark:text-white" />
                      </div>
                      <ChipGroup
                         label="Nacionalidade"
                         options={nacionalidadeOptions}
                         value={representantNacionalidade || null}
                         onChange={setRepresentantNacionalidade}
                         sheetTitle="Nacionalidade"
                         searchPlaceholder="Pesquisar nacionalidade…"
                      />
                   </div>
                </div>

                {!isInformal && (
                  <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                     <h3 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-2 mb-4">Informação Legal</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Escolhidos do catálogo (`constitution` / `issuer`) e
                            não escritos à mão: eram texto livre, pelo que a
                            coluna `asset_constitution`/`asset_issuer` nunca
                            chegava a ser preenchida e o mesmo valor entrava com
                            grafias diferentes. */}
                        <ChipGroup
                           label="Constituição"
                           options={constituicaoOptions}
                           value={constituicao || null}
                           onChange={setConstituicao}
                           sheetTitle="Constituição empresarial"
                        />
                        <ChipGroup
                           label="Entidade Emissora da Licença"
                           options={emissoraOptions}
                           value={emissoraLicenca || null}
                           onChange={setEmissoraLicenca}
                           sheetTitle="Entidade emissora"
                        />
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Nº Licença</label>
                           <input type="text" value={numLicenca} onChange={e => setNumLicenca(e.target.value)} className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium outline-none text-slate-900 dark:text-white" />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Nº Alvará</label>
                           <input type="text" value={numAlvara} onChange={e => setNumAlvara(e.target.value)} className="w-full p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium outline-none text-slate-900 dark:text-white" />
                        </div>
                     </div>
                  </div>
                )}
             </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
                   <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2 mb-4">
                      <h3 className="font-bold text-slate-900 dark:text-white">Atividades Económicas</h3>
                      <button type="button" onClick={addAtividade} className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors">
                         <Plus className="w-4 h-4" /> Adicionar
                      </button>
                   </div>
                   
                   {atividades.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 dark:bg-slate-850 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                         <p className="text-sm font-bold text-slate-600 dark:text-slate-400">Nenhuma atividade registada</p>
                         <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">Carregue no botão Adicionar para registar locais e atividades.</p>
                      </div>
                   ) : (
                      <div className="space-y-4">
                         {atividades.map((ativ, i) => (
                            <div key={i} className="p-4 bg-slate-50 dark:bg-slate-850 rounded-xl border border-slate-200 dark:border-slate-700 relative group">
                               <button type="button" onClick={() => removeAtividade(i)} className="absolute top-2 right-2 p-1.5 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-full hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors shadow-sm">
                                  <Trash2 className="w-4 h-4" />
                               </button>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 pr-8">
                                  <div className="md:col-span-2 space-y-2">
                                     <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Selecione o Ramo *</label>
                                     <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {RAMOS.map(r => {
                                           const isSelected = ativ.ramo === r;
                                           return (
                                              <button
                                                 key={r}
                                                 type="button"
                                                 onClick={() => updateAtividade(i, 'ramo', r)}
                                                 className={cn(
                                                    "p-3.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between",
                                                    isSelected ? "bg-blue-50 dark:bg-blue-900/30 border-blue-500 dark:border-blue-400 text-blue-950 dark:text-blue-100 shadow-sm" : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-750"
                                                 )}
                                              >
                                                 <span>{r}</span>
                                                 {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 stroke-[3]" />}
                                              </button>
                                           );
                                        })}
                                     </div>
                                  </div>
                                  <div className="space-y-1">
                                     <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Atividade</label>
                                     <input type="text" value={ativ.atividade} onChange={e => updateAtividade(i, 'atividade', e.target.value)} placeholder="Ex: Venda de Sapatos" className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400" />
                                  </div>
                                  <div className="md:col-span-2 space-y-1 mt-2">
                                     <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">Local Específico</label>
                                     <input type="text" value={ativ.local} onChange={e => updateAtividade(i, 'local', e.target.value)} placeholder="Ex: Loja 3 - Mercado Municipal" className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium outline-none text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400" />
                                  </div>
                               </div>
                            </div>
                         ))}
                      </div>
                   )}
                </div>
             </div>
          )}
      </div>

      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 shrink-0 flex gap-4 sticky bottom-0">
         {/* Mesmo par de acções do NovaVisita: a seta do cabeçalho é um alvo
             pequeno e o botão físico do Android não existe em browser/PWA. */}
         {step > 1 && (
            <button
              onClick={prevStep}
              className="px-6 py-4 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors uppercase tracking-wide"
            >
              Anterior
            </button>
         )}
         <button
           onClick={nextStep}
           disabled={isSubmitting}
           className={cn(
             'flex-1 py-4 text-white rounded-xl font-bold uppercase tracking-wide transition-colors shadow-xl shadow-blue-200 dark:shadow-none flex items-center justify-center gap-2',
             isSubmitting
               ? 'bg-slate-400 dark:bg-slate-700 cursor-not-allowed shadow-none'
               : 'bg-blue-600 hover:bg-blue-700 dark:hover:bg-blue-500'
           )}
         >
           {isSubmitting ? (
              <>A registar… <Loader2 className="w-5 h-5 animate-spin"/></>
           ) : step === 4 ? (
              <>Concluir Registo <Check className="w-5 h-5"/></>
           ) : (
              <>Continuar <ChevronRight className="w-5 h-5"/></>
           )}
         </button>
      </div>

      {needsUnlock && (
        <UnlockDialog
          reason="A base local ficou bloqueada. Introduza a palavra-passe para concluir o registo — os dados preenchidos mantêm-se."
          onUnlocked={() => {
            setNeedsUnlock(false);
            void handleSubmit();
          }}
          onCancel={() => setNeedsUnlock(false)}
        />
      )}
    </div>
  );
}
