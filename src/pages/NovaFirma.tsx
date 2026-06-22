import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Camera, Plus, Trash2, Check, ChevronRight, AlertTriangle, Users } from 'lucide-react';
import { db, generateId, AtividadeEconomica } from '../db/db';
import { cn } from '../lib/utils';

const DISTRITOS = ['Água Grande', 'Cantagalo', 'Caué', 'Lembá', 'Lobata', 'Mé-Zóchi', 'RAP'];
const NACIONALIDADES = ['Santomense', 'Angolana', 'Cabo-verdiana', 'Galega', 'Chinesa', 'Portuguesa', 'Brasileira', 'Outra'];
const RAMOS = ['Restauração', 'Comércio Misto', 'Alojamento', 'Prestação de Serviço', 'Indústria', 'Outro'];

export default function NovaFirma() {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = location.state?.returnTo || '/firmas';

  const isEquipeDefinida = localStorage.getItem('drcae_equipe_definida') === 'true';

  if (!isEquipeDefinida) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 min-h-screen font-sans">
         <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden p-8 space-y-6 text-center">
            <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm animate-bounce">
               <AlertTriangle className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-2">
               <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Definição de Equipa Obrigatória</h3>
               <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  De acordo com os protocolos jurídicos da <b>DRCAE</b>, é estritamente obrigatório definir e validar a composição da equipa de agentes destacados para o serviço diário, pelo menos uma vez, antes de registar novos operadores económicos ou lavrar atas de fiscalização.
               </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
               <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center shrink-0 text-amber-700 font-bold text-xs font-mono">!</div>
               <p className="text-[11px] text-slate-600 font-semibold text-left leading-normal">
                  Esta medida garante que todas as ações e coimas aplicadas têm validade de fé pública e carimbo oficial do Estado.
               </p>
            </div>
            <button
               onClick={() => navigate('/equipe')}
               className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-100 uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
               <Users className="w-4 h-4 text-white" />
               Configurar Equipa Técnica
            </button>
         </div>
      </div>
    );
  }

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
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSubmit = async () => {
    if (!name || (!isInformal && !nif)) return alert('Preencha os campos obrigatórios (Nome e NIF).');
    
    const newFirmaId = generateId();
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
      atividades,
      synced: false,
      createdAt: Date.now()
    });

    if (returnTo === '/visitas/nova') {
      navigate('/visitas/nova', { state: { firmaId: newFirmaId }, replace: true });
    } else {
      navigate('/firmas', { replace: true });
    }
  };

  const nextStep = () => {
    if (step === 1 && (!name || (!isInformal && !nif))) return alert('Preencha os campos obrigatórios (Nome e NIF).');
    if (step < 4) setStep(step + 1);
    else handleSubmit();
  };

  const prevStep = () => {
    if (step > 1) setStep(step - 1);
    else navigate(-1);
  };

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA]">
      <div className="px-4 py-4 border-b border-slate-200 shrink-0 sticky top-0 bg-white z-10 flex flex-col shadow-sm">
         <div className="flex items-center">
             <button onClick={prevStep} className="mr-3 text-slate-500 hover:text-slate-900">
                <ArrowLeft className="w-5 h-5" />
             </button>
             <h2 className="font-bold text-slate-900 tracking-tight">Nova Firma</h2>
         </div>
         {/* Progress */}
         <div className="flex gap-1 mt-4">
            {[1, 2, 3, 4].map(s => (
               <div key={s} className={cn("h-1 flex-1 rounded-full", step >= s ? "bg-blue-600" : "bg-slate-200")} />
            ))}
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar flex flex-col">
          {/* STEP 1 */}
          {step === 1 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                    <div className="space-y-3">
                       <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Tipo de Firma *</label>
                       <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {['Revendedor', 'Importador', 'Informal'].map(t => (
                             <div 
                               key={t}
                               onClick={() => setType(t)}
                               className={cn(
                                  "p-4 border rounded-xl cursor-pointer transition-all flex items-center gap-3",
                                  type === t ? "bg-blue-50 border-blue-600 shadow-sm" : "bg-white border-slate-200 hover:bg-slate-50"
                               )}
                             >
                                <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0", type === t ? "bg-blue-600 border-blue-600" : "border-slate-300")}>
                                   {type === t && <div className="w-2 h-2 bg-white rounded-full" />}
                                </div>
                                <span className={cn("font-bold text-sm", type === t ? "text-blue-900" : "text-slate-800")}>{t}</span>
                             </div>
                          ))}
                       </div>
                    </div>

                    <div className="flex flex-col justify-center items-center gap-4">
                       <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center overflow-hidden relative cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => fileInputRef.current?.click()}>
                          {logo ? (
                             <img src={logo} alt="Logo" className="w-full h-full object-cover" />
                          ) : (
                             <>
                               <Camera className="w-6 h-6 text-slate-400 mb-1" />
                               <span className="text-[10px] font-bold text-slate-400 uppercase">Logotipo</span>
                             </>
                          )}
                       </div>
                       <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Nome da Firma *</label>
                          <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">NIF {isInformal ? '' : '*'}</label>
                          <input required={!isInformal} type="text" value={nif} onChange={e => setNif(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Contacto</label>
                          <input type="text" value={contact} onChange={e => setContact(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                       </div>
                       <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Email</label>
                          <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                       </div>
                    </div>
                </div>
             </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
                   <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Distrito</label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                         {DISTRITOS.map(d => (
                           <div 
                             key={d}
                             onClick={() => setDistrict(d)}
                             className={cn(
                                "p-3 border rounded-xl cursor-pointer transition-all flex flex-col items-center justify-center text-center gap-2",
                                district === d ? "bg-blue-50 border-blue-600 shadow-sm" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                             )}
                           >
                              <div className={cn("w-4 h-4 rounded-full border flex items-center justify-center shrink-0", district === d ? "bg-blue-600 border-blue-600" : "border-slate-300 bg-white")}>
                                 {district === d && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                              </div>
                              <span className={cn("font-bold text-xs tracking-tight", district === d ? "text-blue-900" : "text-slate-700")}>{d}</span>
                           </div>
                         ))}
                      </div>
                   </div>

                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Morada Complementar</label>
                      <input type="text" value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, Bairro, Edifício..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                   </div>
                </div>
             </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                   <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">Responsável / Proprietário</h3>
                   <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Nome do Representante</label>
                      <input type="text" value={representant} onChange={e => setRepresentant(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Cargo</label>
                         <input type="text" value={representantCargo} onChange={e => setRepresentantCargo(e.target.value)} placeholder="Gerente, Proprietário..." className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Nacionalidade</label>
                         <select value={representantNacionalidade} onChange={e => setRepresentantNacionalidade(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-800">
                            {NACIONALIDADES.map(nac => (
                               <option key={nac} value={nac}>{nac}</option>
                            ))}
                         </select>
                      </div>
                   </div>
                </div>

                {!isInformal && (
                  <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                     <h3 className="font-bold text-slate-900 border-b border-slate-100 pb-2 mb-4">Informação Legal</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Constituição</label>
                           <input type="text" value={constituicao} onChange={e => setConstituicao(e.target.value)} placeholder="Ex: Sociedade por Quotas" className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Entidade Emissora da Licença</label>
                           <input type="text" value={emissoraLicenca} onChange={e => setEmissoraLicenca(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Nº Licença</label>
                           <input type="text" value={numLicenca} onChange={e => setNumLicenca(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                        </div>
                        <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Nº Alvará</label>
                           <input type="text" value={numAlvara} onChange={e => setNumAlvara(e.target.value)} className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
                        </div>
                     </div>
                  </div>
                )}
             </div>
          )}

          {/* STEP 4 */}
          {step === 4 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
                   <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-4">
                      <h3 className="font-bold text-slate-900">Atividades Económicas</h3>
                      <button type="button" onClick={addAtividade} className="text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-blue-100 transition-colors">
                         <Plus className="w-4 h-4" /> Adicionar
                      </button>
                   </div>
                   
                   {atividades.length === 0 ? (
                      <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                         <p className="text-sm font-bold text-slate-600">Nenhuma atividade registada</p>
                         <p className="text-xs text-slate-500 mt-1">Carregue no botão Adicionar para registar locais e atividades.</p>
                      </div>
                   ) : (
                      <div className="space-y-4">
                         {atividades.map((ativ, i) => (
                            <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative group">
                               <button type="button" onClick={() => removeAtividade(i)} className="absolute top-2 right-2 p-1.5 bg-white text-slate-500 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm">
                                  <Trash2 className="w-4 h-4" />
                               </button>
                               <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 pr-8">
                                  <div className="md:col-span-2 space-y-2">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Selecione o Ramo *</label>
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
                                                    isSelected ? "bg-blue-50 border-blue-500 text-blue-950 shadow-sm" : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                                                 )}
                                              >
                                                 <span>{r}</span>
                                                 {isSelected && <Check className="w-3.5 h-3.5 text-blue-600 stroke-[3]" />}
                                              </button>
                                           );
                                        })}
                                     </div>
                                  </div>
                                  <div className="space-y-1">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Atividade</label>
                                     <input type="text" value={ativ.atividade} onChange={e => updateAtividade(i, 'atividade', e.target.value)} placeholder="Ex: Venda de Sapatos" className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium" />
                                  </div>
                                  <div className="md:col-span-2 space-y-1 mt-2">
                                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Local Específico</label>
                                     <input type="text" value={ativ.local} onChange={e => updateAtividade(i, 'local', e.target.value)} placeholder="Ex: Loja 3 - Mercado Municipal" className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-sm font-medium" />
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

      <div className="bg-white border-t border-slate-200 p-4 shrink-0 flex gap-4 sticky bottom-0">
         <button 
           onClick={nextStep}
           className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold uppercase tracking-wide hover:bg-blue-700 transition-colors shadow-xl shadow-blue-200 flex items-center justify-center gap-2"
         >
           {step === 4 ? (
              <>Concluir Registo <Check className="w-5 h-5"/></>
           ) : (
              <>Continuar <ChevronRight className="w-5 h-5"/></>
           )}
         </button>
      </div>
    </div>
  );
}
