import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Radar as RadarIcon, MapPinOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { useGeoLocation } from '../lib/geo';
import { useDeviceHeading, useUnwrappedHeading } from '../lib/deviceHeading';
import { useOperadores } from '../lib/operadoresCache';
import { calculateDistanceKm, calculateBearing } from '../lib/routing';
import { hasPendingRecommendations } from '../lib/firmaRisk';
import {
  RISK_PRESENTATION,
  classifyFirmaRisk,
  buildInfracoesCountByVisita,
  groupVisitasByFirma,
} from '../lib/firmaRisk';

// Operadores mostrados. Acima disto o radar fica ilegível num ecrã de tablet,
// e os mais distantes deixam de ser accionáveis a pé.
const MAX_OPERATORS = 6;

// Alcance máximo. Ao contrário da escala dos anéis — que continua a adaptar-se
// ao conjunto mostrado — este limite é fixo: o radar serve para decidir onde ir
// a seguir a pé, e um operador a vários quilómetros não é uma opção prática.
// Consequência assumida: numa zona sem operadores mapeados dentro de 1 km, o
// radar aparece vazio em vez de mostrar algo distante e inútil.
const MAX_RADIUS_KM = 1;

// Geometria do radar, em unidades de viewBox.
const SIZE = 200;
const CENTER = SIZE / 2;
const MAX_RADIUS = 88;
const RINGS = 3;

// Partilhada pelo terreno e pelo rótulo do norte: as duas rotações só se
// mantêm coerentes durante a animação se percorrerem o mesmo tempo e a mesma
// curva.
const TERRAIN_TRANSITION = 'transform 220ms linear';

function formatDistance(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0)} km`;
}

// Radar dos operadores já mapeados em redor do agente.
//
// Desenhado em SVG puro, sem mapa nem tiles: funciona offline por construção
// (os dados vêm do Dexie local) e não pesa no arranque do ecrã inicial.
//
// O desenho roda com a bússola do aparelho, de forma a que o "N" aponte sempre
// para o norte real: virar o tablet nas mãos não desloca o terreno. A fonte é o
// azimute do sensor de rotação (ver lib/deviceHeading), e não o bearing do GPS
// — este último é a direcção de deslocação, sem significado com o aparelho
// parado, que é justamente quando se consulta o radar. Sem bússola disponível,
// fica fixo a norte.
//
// O rumo é consumido desenrolado (useUnwrappedHeading), porque o valor bruto
// salta de 359 para 1 ao passar o norte e a transição CSS interpreta esse salto
// como uma volta quase completa no sentido contrário.
//
// O azimute e o bearing dos operadores têm de partilhar o mesmo norte para o
// terreno assentar: calculateBearing dá rumo geográfico, pelo que é o lado
// nativo que converte o azimute magnético do sensor em geográfico
// (DeviceHeadingSensor, via GeomagneticField). Num APK anterior a essa
// conversão o desenho fica rodado pela declinação local — poucos graus em São
// Tomé, e é a razão de DRCAE_WEBVIEW_MIN_VERSION passar a exigir o APK novo.
//
// A escala é adaptativa: os anéis ajustam-se ao operador mais distante dos que
// são mostrados, e trazem sempre a distância escrita. Assim o radar é útil
// tanto no centro da cidade (dezenas de operadores em 300 m) como no interior
// (o mais próximo a vários quilómetros), sem nunca aparecer vazio nem
// amontoado — e sem enganar, porque a escala está sempre explícita.
export default function NearbyOperatorsRadar() {
  const navigate = useNavigate();
  const { location: coords } = useGeoLocation();
  const heading = useDeviceHeading();

  // O desenho roda pelo rumo desenrolado, nunca pelo rumo bruto: o bruto salta
  // de 359 para 1 ao passar o norte e a transição CSS lê esse salto como meia
  // volta no sentido contrário (ver useUnwrappedHeading).
  const angle = useUnwrappedHeading(heading) ?? 0;

  // Fonte partilhada com o Dashboard: ler as tabelas aqui outra vez duplicaria
  // ~1760 desencriptações por render (ver operadoresCache).
  const { data, loading } = useOperadores();

  const nearby = useMemo(() => {
    if (!coords) return [];

    const visitasByFirma = groupVisitasByFirma(data.visitas);
    const infracoesByVisita = buildInfracoesCountByVisita(data.infracoes);

    return data.firmas
      .filter((firma) => firma.geolocation?.lat != null && firma.geolocation?.lng != null)
      .map((firma) => {
        const target = { lat: firma.geolocation!.lat, lng: firma.geolocation!.lng };
        const visitas = visitasByFirma.get(firma.id!) || [];
        const { risk } = classifyFirmaRisk(visitas, infracoesByVisita);
        return {
          id: firma.id as string,
          name: firma.name,
          risk,
          pendingRecommendations: hasPendingRecommendations(visitas),
          distanceKm: calculateDistanceKm(coords, target),
          bearing: calculateBearing(coords, target),
        };
      })
      .filter((operator) => operator.distanceKm <= MAX_RADIUS_KM)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, MAX_OPERATORS);
  }, [data, coords]);

  // A escala acompanha o mais distante mostrado, com uma margem para o ponto
  // não ficar colado ao anel exterior.
  const scaleKm = useMemo(() => {
    if (nearby.length === 0) return 1;
    return Math.max(nearby[nearby.length - 1].distanceKm * 1.15, 0.05);
  }, [nearby]);

  if (!coords) {
    return (
      <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-white/5 flex items-center gap-3">
        <MapPinOff className="w-5 h-5 text-slate-400 shrink-0" />
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          Sem posição para localizar operadores próximos.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-white/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-200">
          <RadarIcon className="w-4 h-4 text-indigo-500" />
          Operadores próximos
        </h3>
        <span className="text-[10px] font-bold text-slate-400">{nearby.length}</span>
      </div>

      {loading ? (
        // Distinguir "ainda não carregou" de "carregou e está vazio": dizer
        // que não há operadores enquanto os dados vêm a caminho seria falso.
        <p className="text-[11px] font-semibold text-slate-400 py-6 text-center animate-pulse">
          A carregar operadores…
        </p>
      ) : nearby.length === 0 ? (
        <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-6 text-center">
          Nenhum operador mapeado a menos de {MAX_RADIUS_KM} km. Registe a localização nas fichas
          para os ver aqui.
        </p>
      ) : (
        // Lado a lado a partir de 640px — todos os tablets e telefones em
        // paisagem — para o cartão não ocupar duas alturas de ecrã. Abaixo
        // disso empilha: seis nomes de operador ao lado de um radar não cabem
        // legivelmente na largura de um telefone em retrato.
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-5">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="w-full max-w-[220px] mx-auto sm:mx-0 shrink-0"
          >
            {/* Anéis de distância, sempre rotulados — é o rótulo que impede a
                escala adaptativa de enganar. */}
            {Array.from({ length: RINGS }, (_, index) => {
              const ratio = (index + 1) / RINGS;
              const radius = MAX_RADIUS * ratio;
              return (
                <g key={ratio}>
                  <circle
                    cx={CENTER}
                    cy={CENTER}
                    r={radius}
                    fill="none"
                    className="stroke-slate-200 dark:stroke-slate-700"
                    strokeWidth={1}
                  />
                  <text
                    x={CENTER + 2}
                    y={CENTER - radius - 2}
                    className="fill-slate-400 dark:fill-slate-500"
                    style={{ fontSize: 7, fontWeight: 700 }}
                  >
                    {formatDistance(scaleKm * ratio)}
                  </text>
                </g>
              );
            })}

            {/* Tudo o que representa o terreno — eixos, marcador de norte e
                operadores — roda em bloco pelo simétrico do rumo do aparelho.
                Assim o "N" aponta sempre para o norte real: se o agente vira o
                tablet 90° para a direita, o desenho gira 90° para a esquerda e
                o terreno mantém-se fixo debaixo dele.

                Os anéis de distância ficam de fora por serem circunferências
                concêntricas: rodá-las não teria efeito visível e faria os seus
                rótulos de distância virarem-se ao contrário. */}
            <g
              transform={`rotate(${-angle} ${CENTER} ${CENTER})`}
              style={{ transition: TERRAIN_TRANSITION }}
            >
              <line x1={CENTER} y1={CENTER - MAX_RADIUS} x2={CENTER} y2={CENTER + MAX_RADIUS}
                className="stroke-slate-150 dark:stroke-slate-800" strokeWidth={1} />
              <line x1={CENTER - MAX_RADIUS} y1={CENTER} x2={CENTER + MAX_RADIUS} y2={CENTER}
                className="stroke-slate-150 dark:stroke-slate-800" strokeWidth={1} />
              {/* O texto contra-roda para se manter direito e legível — só a
                  sua posição acompanha o norte, não a inclinação. Leva a mesma
                  transição do grupo de propósito: sem ela o rótulo saltava
                  para o ângulo final enquanto o terreno ainda ia a meio da
                  animação, e via-se o "N" tombado durante cada rotação. */}
              <text
                x={CENTER}
                y={CENTER - MAX_RADIUS - 6}
                textAnchor="middle"
                transform={`rotate(${angle} ${CENTER} ${CENTER - MAX_RADIUS - 6})`}
                className={heading === null ? 'fill-slate-400 dark:fill-slate-500' : 'fill-blue-500'}
                style={{ fontSize: 8, fontWeight: 800, transition: TERRAIN_TRANSITION }}
              >
                N
              </text>

              {nearby.map((operator) => {
                // Bearing é medido a partir do norte no sentido horário; o eixo
                // Y do SVG cresce para baixo, daí o seno em X e o cosseno
                // negado em Y. O rumo do aparelho não entra aqui: é aplicado
                // uma só vez, na rotação do grupo.
                const radians = (operator.bearing * Math.PI) / 180;
                const radius = Math.min(operator.distanceKm / scaleKm, 1) * MAX_RADIUS;
                const x = CENTER + Math.sin(radians) * radius;
                const y = CENTER - Math.cos(radians) * radius;

                return (
                  <g
                    key={operator.id}
                    onClick={() => navigate(`/firmas/${operator.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <title>
                      {`${operator.name} — ${formatDistance(operator.distanceKm)} — ${RISK_PRESENTATION[operator.risk].label}`}
                    </title>
                    {/* Alvo de toque generoso, invisível: os pontos são
                        pequenos demais para um dedo. */}
                    <circle cx={x} cy={y} r={10} fill="transparent" />
                  {/* Halo pulsante para recomendações por averiguar. Fica por
                      baixo do ponto para não lhe alterar a cor: a pulsação diz
                      "há algo por averiguar", a cor continua a dizer a situação. */}
                  {operator.pendingRecommendations && (
                    <circle
                      cx={x}
                      cy={y}
                      r={8}
                      fill="none"
                      stroke={RISK_PRESENTATION[operator.risk].color}
                      strokeWidth={1.5}
                      className="drcae-pulse"
                    />
                  )}
                    {/* A cor comunica a situação do operador — mesma convenção
                        da lista de firmas: vermelho com infrações, âmbar com
                        inconformidades, verde regularizado, cinza sem visitas. */}
                    <circle cx={x} cy={y} r={4.5} fill={RISK_PRESENTATION[operator.risk].color} />
                  </g>
                );
              })}
            </g>

            {/* Agente ao centro */}
            <circle cx={CENTER} cy={CENTER} r={4} className="fill-emerald-500" />
            <circle cx={CENTER} cy={CENTER} r={8} fill="none"
              className="stroke-emerald-500/40" strokeWidth={1.5} />
          </svg>

          {/* A lista é o caminho real para abrir uma ficha — os pontos no
              radar são pequenos demais para um dedo. Cada linha ocupa a
              largura toda do cartão e tem altura de alvo de toque confortável
              (44px, o mínimo recomendado), com o nome à esquerda e a distância
              à direita. */}
          <ul className="w-full flex-1 min-w-0 mt-4 sm:mt-0 space-y-1.5">
            {nearby.map((operator) => (
              <li key={operator.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/firmas/${operator.id}`)}
                  className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-white/5 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-750"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    {/* Mesma cor do ponto correspondente no radar — é o que
                        liga visualmente a lista ao gráfico. */}
                    <span
                      className={cn(
                        'w-2.5 h-2.5 rounded-full shrink-0',
                        operator.pendingRecommendations && 'drcae-pulse',
                      )}
                      style={{ backgroundColor: RISK_PRESENTATION[operator.risk].color }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                        {operator.name}
                      </span>
                      <span className={cn('block text-[10px] font-semibold', RISK_PRESENTATION[operator.risk].className)}>
                        {RISK_PRESENTATION[operator.risk].label}
                        {operator.pendingRecommendations && (
                          <span className="text-blue-500 dark:text-blue-400">
                            {' · recomendações por averiguar'}
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                  <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 shrink-0">
                    {formatDistance(operator.distanceKm)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
