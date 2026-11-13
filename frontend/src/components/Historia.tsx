import { useEffect, useMemo, useRef } from 'react';
import { animate as animar, splitText, stagger, type JSAnimation } from 'animejs';
import type { Eslabon } from '../api/types';
import { ESTADOS_AUDITORIA, NOMBRE_ESTADO, pct } from '../lib/format';
import { fraseDe, reproducir, trazaEnElTiempo } from '../lib/historia';
import { tramosVivos, trazaCompleta } from '../lib/traza';
import { ScrollTrigger } from '../motion/gsap';
import { isNarrow, prefersReducedMotion } from '../motion/motion';
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
 * En escritorio la sección se fija y el scroll es el tiempo (ScrollTrigger con pin y scrub): al bajar avanza
 * y al subir se deshace. En móvil o con movimiento reducido no hay pin: se maneja con el deslizador.
 *
 * El estado en cada evento sale del contenido de los eslabones (lib/historia.ts), no de cálculos propios.
 * Por rendimiento, mientras se pasa de un evento a otro se cambian clases directamente, sin volver a pintar con React.
 */
export function Historia({ eslabones, nombres, titulo, cifra, orla }: Props) {
  const raiz = useRef<HTMLDivElement>(null);
  const instantaneas = useMemo(() => reproducir(eslabones), [eslabones]);
  const N = eslabones.length;
  const codigos = useMemo(() => Object.keys(instantaneas[N]?.controles ?? {}), [instantaneas, N]);

  useEffect(() => {
    const el = raiz.current;
    if (!el || !N) return;
    const q = <T extends Element>(s: string) => el.querySelector<T>(s)!;
    const escenario = q<HTMLElement>('.rb-stage'), tit = q<HTMLElement>('.rb-tit'), meta = q<HTMLElement>('.rb-meta'), numero = q<HTMLElement>('.rb-k');
    const rango = q<HTMLInputElement>('.rb-rango'), play = q<HTMLButtonElement>('.rb-play'), inicio = q<HTMLButtonElement>('.rb-ini'), estados = q<HTMLElement>('.estados');
    const filas = Object.fromEntries(Array.from(el.querySelectorAll<HTMLElement>('.rb-fila')).map(f => [f.dataset.c!, f]));
    const sello = crearSello(q<HTMLElement>('.rb-sello'), eslabones.map(e => e.tipo_evento));
    sello.textos(cifra, orla);
    let k = -1, ultimo = 0, trig: ScrollTrigger | null = null, repro: JSAnimation | null = null;

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
    }
    // Con pin, el scroll es el tiempo; sin pin, el deslizador
    const ir = (v: number) => { if (trig) window.scrollTo(0, trig.start + (trig.end - trig.start) * (v / N)); else poner(v); };
    const parar = () => { repro?.pause(); repro = null; play.textContent = 'Reproducir'; };
    function montar() {
      parar(); trig?.kill(true); trig = null; el!.classList.remove('is-pinned');
      if (prefersReducedMotion()) { k = -1; poner(N); return; }   // estado final, sin pin
      if (!isNarrow() && window.innerHeight >= 660) {
        el!.classList.add('is-pinned');
        const barra = document.querySelector<HTMLElement>('.barra');
        trig = ScrollTrigger.create({ trigger: escenario, pin: true, start: () => `top ${barra?.offsetHeight ?? 0}px`, end: () => `+=${N * 70}`, scrub: 0.35, anticipatePin: 1, invalidateOnRefresh: true, onUpdate: self => poner(self.progress * N) });
        k = -1; poner(trig.progress * N);
      } else { k = -1; poner(N); }   // en móvil se abre en el final y se rebobina con el deslizador
    }
    const alDeslizar = () => { parar(); ir(Number(rango.value)); };
    const alReproducir = () => {
      if (repro) { parar(); return; }
      if (prefersReducedMotion()) { poner(N); return; }
      const o = { v: k >= N ? 0 : k }; if (k >= N) ir(0);
      play.textContent = 'Pausar';
      repro = animar(o, { v: N, duration: (N - o.v) * 260, ease: 'linear', onUpdate: () => ir(o.v), onComplete: () => { repro = null; play.textContent = 'Reproducir'; } });
    };
    const alInicio = () => { parar(); ir(0); };
    rango.addEventListener('input', alDeslizar); play.addEventListener('click', alReproducir); inicio.addEventListener('click', alInicio);

    const mq = matchMedia('(prefers-reduced-motion: reduce)');
    let eraEstrecho = isNarrow(), tR = 0, tRefresco = 0;
    const alRedimensionar = () => { clearTimeout(tR); tR = window.setTimeout(() => { if (isNarrow() !== eraEstrecho) { eraEstrecho = isNarrow(); montar(); } }, 200); };
    window.addEventListener('resize', alRedimensionar); mq.addEventListener('change', montar);
    // Si cambia la altura de lo que hay encima (se carga el relieve, se abre algo), se recalcula dónde empieza el pin
    const ro = new ResizeObserver(() => { clearTimeout(tRefresco); tRefresco = window.setTimeout(() => { if (trig) ScrollTrigger.refresh(); }, 200); });
    if (el.parentElement) ro.observe(el.parentElement);
    montar();
    return () => {
      clearTimeout(tR); clearTimeout(tRefresco); parar(); trig?.kill(true); ro.disconnect();
      window.removeEventListener('resize', alRedimensionar); mq.removeEventListener('change', montar);
      rango.removeEventListener('input', alDeslizar); play.removeEventListener('click', alReproducir); inicio.removeEventListener('click', alInicio);
      sello.destruir(); el.classList.remove('is-pinned');
    };
  }, [eslabones, instantaneas, codigos, N, cifra, orla]);

  if (!N) return null;
  return (
    <div className="rb" ref={raiz}>
      <div className="hoja rb-stage">
        <div className="rb-izq">
          <p className="sub num">{titulo}</p>
          <p className="rb-num num"><span className="rb-k">0</span><small> de {N}</small></p>
          <p className="rb-tit" aria-live="polite" />
          <p className="rb-meta sub hash num" />
          <div className="estados" data-sin=""><ol>{ESTADOS_AUDITORIA.map(e => <li key={e}>{NOMBRE_ESTADO[e]}</li>)}</ol><span className="estados-marca" /></div>
          <div className="rb-ctrl">
            <input className="rb-rango" type="range" min={0} max={N} step={1} defaultValue={0} aria-label="Evento de la auditoría" />
            <div className="fila-acc"><button className="btn sec min rb-play" type="button">Reproducir</button><button className="enlace rb-ini" type="button">Volver al principio</button></div>
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
