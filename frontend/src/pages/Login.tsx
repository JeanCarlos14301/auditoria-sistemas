import { useEffect, useRef, useState, type FormEvent } from 'react';
import { animate as animar, type JSAnimation } from 'animejs';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { BITACORA_EJEMPLO, SELLO_EJEMPLO } from '../assets/bitacoraEjemplo';
import { useSesion } from '../auth/AuthContext';
import { Campo, MensajeError } from '../components/basicos';
import { SelloRelieve, type ControlRelieve } from '../components/SelloRelieve';
import { crearSello } from '../components/selloImperativo';
import { pct } from '../lib/format';
import { PASO_TRAZO } from '../lib/sello';
import { cascada, sacudir } from '../motion/efectos';
import { CURVA, SplitText, gsap } from '../motion/gsap';
import { hasFinePointer, prefersReducedMotion } from '../motion/motion';

const N = BITACORA_EJEMPLO.length;
const TIPOS = BITACORA_EJEMPLO.map(e => e.t), HASH_FINAL = BITACORA_EJEMPLO[N - 1]!.h;
const CIFRA = pct(SELLO_EJEMPLO.cumplimiento_pct);
const ORLA = `AUDITA · ${SELLO_EJEMPLO.algoritmo} · ${N} ESLABONES · ISO/IEC 27002:2022 · ${SELLO_EJEMPLO.fecha} · `;
/** El sello ocupa el 78 % del lado corto del panel; en pantallas estrechas, algo más. */
const encuadre = (ancho: number) => (ancho < 700 ? 0.9 : 0.78);
/** Un sello de verdad nunca queda recto: se asienta girado unos 7°. */
const GIRO = -0.12;

/**
 * Entrada: "Sello en seco" con marco de acta. La pantalla entera es la portada de un documento (cabecera y pie a todo
 * el ancho). A la izquierda, el formulario como líneas para rellenar; a la derecha, en el mismo papel, el sello en
 * relieve de una auditoría de ejemplo. Sus trazos se levantan uno a uno mientras el pie cuenta cada evento en lenguaje
 * claro; la luz sigue al puntero por toda la pantalla. Al entrar, el sello se vuelve a estampar y la hoja se archiva.
 */
export default function Login() {
  const { estado, entrar } = useSesion();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Sesión iniciada: el sello se estampa antes de pasar a la aplicación. */
  const [sellando, setSellando] = useState(false);
  const pantalla = useRef<HTMLElement>(null), form = useRef<HTMLFormElement>(null), marca = useRef<HTMLHeadingElement>(null);
  const relieve = useRef<ControlRelieve>(null), plano = useRef<HTMLDivElement>(null), raya = useRef<HTMLSpanElement>(null);
  const pieK = useRef<HTMLElement>(null), pieF = useRef<HTMLSpanElement>(null), narracion = useRef<JSAnimation | null>(null);

  const pieFinal = () => {
    if (pieK.current) pieK.current.textContent = '';
    if (pieF.current) pieF.current.textContent = `Sello de una auditoría de ejemplo: ${N} eventos encadenados, ${CIFRA} de cumplimiento.${hasFinePointer() ? ' Mueve el cursor y cambia la luz.' : ''}`;
  };
  /** El pie narra, en lenguaje claro, el eslabón cuyo trazo se está levantando. */
  const narrar = () => {
    narracion.current?.cancel();
    if (prefersReducedMotion()) { pieFinal(); return; }
    const o = { k: 0 }; let ultimo = -1;
    narracion.current = animar(o, { k: N, duration: PASO_TRAZO * N + 300, ease: 'linear', onComplete: pieFinal, onUpdate: () => {
      const k = Math.min(N, Math.max(1, Math.ceil(o.k)));
      if (k === ultimo) return; ultimo = k;
      if (pieK.current) pieK.current.textContent = `${k} de ${N}`;
      if (pieF.current) pieF.current.textContent = BITACORA_EJEMPLO[k - 1]!.f;
    } });
  };

  // El sello plano: el respaldo mientras llega three.js, y el que se queda sin WebGL
  useEffect(() => {
    if (!plano.current) return;
    const s = crearSello(plano.current, TIPOS);
    s.hasta(N); s.forma(HASH_FINAL, 0); s.textos(CIFRA, ORLA); s.sellar(true);
    pieFinal();
    return () => { s.destruir(); narracion.current?.cancel(); };
  }, []);

  // Entrada: la marca letra a letra, el resto en cascada y la línea que separa formulario y sello, de arriba abajo
  useEffect(() => {
    if (prefersReducedMotion() || !pantalla.current) return;
    const ctx = gsap.context(() => {
      const partes = SplitText.create(marca.current!, { type: 'chars' });
      gsap.from(partes.chars, { yPercent: 105, opacity: 0, duration: 0.9, stagger: 0.055, ease: CURVA.entrada, onComplete: () => partes.revert() });
      if (raya.current) gsap.fromTo(raya.current, { scaleY: 0 }, { scaleY: 1, duration: 1.1, ease: CURVA.cambio, delay: 0.2 });
      // Las reglas de la cabecera y del pie se trazan de izquierda a derecha, como al preparar una hoja
      gsap.fromTo('.entrada-regla', { scaleX: 0 }, { scaleX: 1, duration: 1, ease: CURVA.cambio, stagger: 0.2, clearProps: 'transform' });
    }, pantalla);
    cascada(pantalla.current.querySelectorAll('.entrada-cab-t, .entrada-rot, .entrada-lead, .entrada-form > *, .entrada-nota, .entrada-pie-t'), 70);
    return () => ctx.revert();
  }, []);

  if (estado.fase === 'activa' && !sellando) return <Navigate to={(loc.state as { desde?: string } | null)?.desde ?? '/auditorias'} replace />;

  const fallar = (mensaje: string) => { setError(mensaje); sacudir(form.current); };
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { fallar('Escribe tu correo y tu contraseña.'); return; }
    setEnviando(true); setError(null); setSellando(true);
    try {
      await entrar(email.trim(), password);
      narracion.current?.cancel();
      if (pieK.current) pieK.current.textContent = '';
      if (pieF.current) pieF.current.textContent = 'Sesión iniciada.';
      // El sello se vuelve a estampar antes de pasar a la aplicación (sin WebGL, un momento para leer el pie)
      await Promise.all([relieve.current?.estampar(), new Promise(r => setTimeout(r, prefersReducedMotion() ? 0 : 600))]);
      // La hoja se archiva hacia arriba antes de abrir el listado
      if (!prefersReducedMotion() && pantalla.current) await new Promise<void>(r => { gsap.to(pantalla.current, { y: -40, opacity: 0, duration: 0.5, ease: 'power3.in', onComplete: () => r() }); });
    } catch (err) {
      fallar(err instanceof ApiError ? `${err.message}.` : 'No se pudo iniciar sesión.');
    } finally { setEnviando(false); setSellando(false); }
  };
  // Al escribir, la luz llega desde el lado del formulario
  const alEnfocar = (e: React.FocusEvent) => { if (e.target instanceof HTMLInputElement) relieve.current?.luzDesde(-1.07, 0.4); };

  return (
    <main className="entrada" ref={pantalla}>
      <header className="entrada-cab-doc">
        <div className="entrada-cab-t"><span className="m">AuditA</span><span className="entrada-medio">Acceso al sistema</span><span className="num">ISO/IEC 27002:2022 · ISO 19011:2018</span></div>
        <i className="entrada-regla" aria-hidden="true" />
      </header>
      <div className="entrada-col">
        <div className="entrada-centro">
          <div className="entrada-cab">
            <p className="entrada-rot">Gestión de auditorías de seguridad de la información</p>
            <h1 className="marca-grande" ref={marca}>AuditA</h1>
            <p className="entrada-lead"><b>Entra para seguir con tus auditorías.</b> Cuando cierres una, su bitácora quedará sellada en un sello como este, distinto en cada auditoría.</p>
          </div>
          <form className="entrada-form" ref={form} onSubmit={enviar} onFocus={alEnfocar} noValidate>
            {/* Campos como líneas de un formulario impreso: al enfocarlos, la línea se llena de acento */}
            <Campo id="login-email" etiqueta="Correo"><span className="linea"><input className="campo" id="login-email" type="email" autoComplete="username" inputMode="email" spellCheck={false} value={email} onChange={e => setEmail(e.target.value)} aria-invalid={error && !email.trim() ? true : undefined} /></span></Campo>
            <Campo id="login-pass" etiqueta="Contraseña"><span className="linea"><input className="campo" id="login-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={error ? true : undefined} /></span></Campo>
            {error && <MensajeError>{error}</MensajeError>}
            <button className="btn" type="submit" disabled={enviando}>{estado.fase === 'activa' ? 'Sesión iniciada' : enviando ? 'Entrando…' : 'Entrar'}</button>
          </form>
          <p className="entrada-nota">No hay registro abierto: las cuentas las crea un administrador.</p>
        </div>
      </div>
      <div className="entrada-sello">
        <span className="entrada-raya" ref={raya} aria-hidden="true" />
        <SelloRelieve ref={relieve} className="relieve-panel" tipos={TIPOS} hashFinal={HASH_FINAL} cifra={CIFRA} orla={ORLA} ruptura={null}
          encuadre={encuadre} zona={pantalla} inclinacion={0.2} giro={GIRO} onListo={narrar}>
          <div className="entrada-plano" ref={plano} />
        </SelloRelieve>
        <p className="entrada-pie"><b className="num" ref={pieK} /><span ref={pieF} /></p>
      </div>
      <footer className="entrada-pie-doc">
        <i className="entrada-regla fina" aria-hidden="true" />
        <div className="entrada-pie-t"><span>Bitácora encadenada con HMAC-SHA256</span><span>Cada auditoría cerrada lleva su propio sello</span></div>
      </footer>
    </main>
  );
}
