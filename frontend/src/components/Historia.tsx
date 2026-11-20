import { useLayoutEffect, useMemo, useRef } from 'react';
import { animate as animar, splitText, stagger, type JSAnimation } from 'animejs';
import type { Eslabon } from '../api/types';
import { ESTADOS_AUDITORIA, NOMBRE_ESTADO, pct } from '../lib/format';
import { fraseDe, reproducir, trazaEnElTiempo } from '../lib/historia';
import { tramosVivos, trazaCompleta } from '../lib/traza';
import { prefersReducedMotion } from '../motion/motion';
import { crearSello } from './selloImperativo';

interface Props {
  eslabones: readonly Eslabon[];
  /** Nombre de cada control por código ISO. */
  nombres: Record<string, string>;
  titulo: string;
  cifra: string;
  orla: string;
}

/**
 * Rebobinar la auditoría: la bitácora se reproduce evento a evento.
 * Se abre terminada, en el último eslabón, con el resultado a la vista. «Reproducir desde el principio» la cuenta
 * de nuevo y el deslizador lleva a cualquier evento.
 *
 * El estado en cada evento sale del contenido de los eslabones (lib/historia.ts), no de cálculos propios.
 * Por rendimiento, mientras se pasa de un evento a otro se cambian clases directamente, sin volver a pintar con React.
 */
export function Historia({ eslabones, nombres, titulo, cifra, orla }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const instantaneas = useMemo(() => reproducir(eslabones), [eslabones]);
  const N = eslabones.length;
  const codigos = useMemo(() => Object.keys(instantaneas[N]?.controles ?? {}), [instantaneas, N]);

  // Antes de pintar, para que se vea ya terminada y no destelle el evento 0
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el || !N) return;
    const q = <T extends Element>(s: string) => el.querySelector<T>(s)!;
    const tit = q<HTMLElement>('.rb-tit'), meta = q<HTMLElement>('.rb-meta'), numero = q<HTMLElement>('.rb-k');
    const rango = q<HTMLInputElement>('.rb-rango'), play = q<HTMLButtonElement>('.rb-play'), inicio = q<HTMLButtonElement>('.rb-ini'), estados = q<HTMLElement>('.estados');
    const filas = Object.fromEntries(Array.from(el.querySelectorAll<HTMLElement>('.rb-fila')).map(f => [f.dataset.c!, f]));
    const sello = crearSello(q<HTMLElement>('.rb-sello'), eslabones.map(e => e.tipo_evento));
    sello.textos(cifra, orla);
    let k = -1, ultimo = 0, repro: JSAnimation | null = null;

    function poner(valor: number) {
      const nk = Math.max(0, Math.min(N, Math.round(valor)));
      if (nk === k) return;
      const avanza = nk > k, s = instantaneas[nk]!, e = nk ? eslabones[nk - 1]! : null, ahora = performance.now();
      k = nk;
      numero.textContent = String(nk); rango.value = String(nk);
      tit.textContent = e ? fraseDe(e, s, pct) : 'Antes del primer evento';
      tit.setAttribute('aria-label', tit.textContent);
      meta.textContent = e ? `${e.timestamp_utc.slice(11, 23)} UTC · ${e.hash_actual.slice(0, 20)}…` : '';
      // El titular entra letra a letra, salvo que se esté pasando deprisa (anime.js splitText)
      if (e && !prefersReducedMotion() && ahora - ultimo > 140) { const partes = splitText(tit, { chars: true, accessible: false }); animar(partes.chars, { opacity: [0, 1], y: [8, 0], duration: 320, delay: stagger(9), ease: 'outExpo' }); }
      ultimo = ahora;
      if (s.estado) { estados.removeAttribute('data-sin'); estados.style.setProperty('--idx', String(ESTADOS_AUDITORIA.indexOf(s.estado))); } else estados.setAttribute('data-sin', '');
      estados.querySelectorAll('li').forEach((li, i) => { if (s.estado && ESTADOS_AUDITORIA[i] === s.estado) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
      for (const c of codigos) {
        const f = filas[c]; if (!f) continue;
        const d = s.controles[c], traza = trazaEnElTiempo(d), vivos = tramosVivos(traza);
        f.classList.toggle('sin', !d); f.classList.toggle('toca', s.toca === c); f.classList.toggle('completa', !!d && d.estado !== null && trazaCompleta(traza));
        f.querySelector<HTMLElement>('.marca')!.dataset.v = d?.estado ?? '';
        f.querySelectorAll<HTMLElement>('.tramo').forEach((t, i) => { t.dataset.n = traza[i]!; t.classList.toggle('on', !!d && d.estado !== null && vivos[i]!); });
      }
      sello.hasta(nk); sello.forma(e ? e.hash_actual : null, 170); sello.sellar(nk === N, avanza);
      if (!repro) play.textContent = nk >= N ? 'Reproducir desde el principio' : nk === 0 ? 'Reproducir' : 'Seguir';
    }
    const parar = () => { repro?.pause(); repro = null; const nk = k; k = -1; poner(nk); };
    const alDeslizar = () => { if (repro) { repro.pause(); repro = null; } poner(Number(rango.value)); };
    // Reproducir: desde el principio si está terminada; si se pausó a medias, sigue desde ahí
    const alReproducir = () => {
      if (repro) { parar(); return; }
      if (prefersReducedMotion()) { poner(N); return; }
      const o = { v: k >= N ? 0 : k }; if (k >= N) poner(0);
      play.textContent = 'Pausar';
      repro = animar(o, { v: N, duration: (N - o.v) * 220, ease: 'linear', onUpdate: () => poner(o.v), onComplete: () => { repro = null; k = -1; poner(N); } });
    };
    const alInicio = () => { if (repro) { repro.pause(); repro = null; } poner(0); };
    rango.addEventListener('input', alDeslizar); play.addEventListener('click', alReproducir); inicio.addEventListener('click', alInicio);
    poner(N);
    return () => {
      repro?.pause(); repro = null;
      rango.removeEventListener('input', alDeslizar); play.removeEventListener('click', alReproducir); inicio.removeEventListener('click', alInicio);
      sello.destruir();
    };
  }, [eslabones, instantaneas, codigos, N, cifra, orla]);

  if (!N) return null;
  return (
    <div className="rb" ref={raiz}>
      <div className="hoja rb-stage">
        <div className="rb-izq">
          <p className="sub num">{titulo}</p>
          <p className="rb-num num"><span className="rb-k">{N}</span><small> de {N}</small></p>
          <p className="rb-tit" aria-live="polite" />
          <p className="rb-meta sub hash num" />
          <div className="estados" data-sin=""><ol>{ESTADOS_AUDITORIA.map(e => <li key={e}>{NOMBRE_ESTADO[e]}</li>)}</ol><span className="estados-marca" /></div>
          <div className="rb-ctrl">
            <input className="rb-rango" type="range" min={0} max={N} step={1} defaultValue={N} aria-label="Evento de la auditoría" />
            <div className="fila-acc"><button className="btn sec min rb-play" type="button">Reproducir desde el principio</button><button className="enlace rb-ini" type="button">Volver al principio</button></div>
          </div>
          <div className="rb-sello" />
        </div>
        <ol className="rb-filas">
          {codigos.map(c => (
            <li className="rb-fila sin" data-c={c} key={c}>
              <span className="cod num">{c}</span><i className="marca" data-v="" /><span className="nom">{nombres[c] ?? ''}</span>
              <div className="traza mini">{[0, 1, 2].map(i => <span className="tramo" key={i}><i className="hilo" /><i className="nodo" /></span>)}<i className="toma" /></div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
