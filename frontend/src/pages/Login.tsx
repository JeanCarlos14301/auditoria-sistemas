import { useEffect, useRef, useState, type FormEvent } from 'react';
import { animate as resorte } from 'motion';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { BITACORA_EJEMPLO, SELLO_EJEMPLO } from '../assets/bitacoraEjemplo';
import { useSesion } from '../auth/AuthContext';
import { Campo, MensajeError } from '../components/basicos';
import { SelloVivo } from '../components/SelloVivo';
import { pct } from '../lib/format';
import { sacudir } from '../motion/efectos';
import { CURVA, SplitText, gsap } from '../motion/gsap';
import { hasFinePointer, isNarrow, prefersReducedMotion } from '../motion/motion';

const CIFRA = pct(SELLO_EJEMPLO.cumplimiento_pct);
const ORLA = `AUDITA · ${SELLO_EJEMPLO.algoritmo} · ${BITACORA_EJEMPLO.length} ESLABONES · ISO/IEC 27002:2022 · ${SELLO_EJEMPLO.fecha} · `;
const espera = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export default function Login() {
  const { estado, entrar } = useSesion();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  /** Sesión iniciada: el sello se estampa antes de pasar a la aplicación. */
  const [sellando, setSellando] = useState(false);
  const hoja = useRef<HTMLDivElement>(null), form = useRef<HTMLFormElement>(null), marca = useRef<HTMLParagraphElement>(null);
  const lado = useRef<HTMLDivElement>(null), boton = useRef<HTMLButtonElement>(null);

  // La marca entra letra a letra; el sello sigue al cursor y el botón es magnético (solo con puntero fino)
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      const partes = SplitText.create(marca.current!, { type: 'chars' });
      gsap.from(partes.chars, { yPercent: 110, duration: 0.9, stagger: 0.05, ease: CURVA.entrada, onComplete: () => partes.revert() });
    });
    const zona = hoja.current, sello = lado.current, btn = boton.current, cerco = btn?.parentElement;
    if (!hasFinePointer() || !zona || !sello || !btn || !cerco) return () => ctx.revert();
    const qx = gsap.quickTo(sello, 'x', { duration: 0.9, ease: 'power3.out' }), qy = gsap.quickTo(sello, 'y', { duration: 0.9, ease: 'power3.out' });
    const mover = (e: PointerEvent) => { if (isNarrow()) return; const r = zona.getBoundingClientRect(); qx(((e.clientX - r.left) / r.width - 0.5) * -14); qy(((e.clientY - r.top) / r.height - 0.5) * -10); };
    const soltar = () => { qx(0); qy(0); };
    const iman = (e: PointerEvent) => { const r = btn.getBoundingClientRect(); resorte(btn, { x: (e.clientX - r.left - r.width / 2) * 0.3, y: (e.clientY - r.top - r.height / 2) * 0.3 }, { type: 'spring', stiffness: 260, damping: 18, mass: 0.6 }); };
    const dejar = () => { resorte(btn, { x: 0, y: 0 }, { type: 'spring', stiffness: 180, damping: 9 }); };
    zona.addEventListener('pointermove', mover); zona.addEventListener('pointerleave', soltar);
    cerco.addEventListener('pointermove', iman); cerco.addEventListener('pointerleave', dejar);
    return () => { ctx.revert(); zona.removeEventListener('pointermove', mover); zona.removeEventListener('pointerleave', soltar); cerco.removeEventListener('pointermove', iman); cerco.removeEventListener('pointerleave', dejar); };
  }, []);

  if (estado.fase === 'activa' && !sellando) return <Navigate to={(loc.state as { desde?: string } | null)?.desde ?? '/auditorias'} replace />;

  const fallar = (mensaje: string) => { setError(mensaje); sacudir(form.current); };
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { fallar('Escribe tu correo y tu contraseña.'); return; }
    setEnviando(true); setError(null); setSellando(true);
    try {
      await entrar(email.trim(), password);
      await espera(prefersReducedMotion() ? 0 : 850);   // el tiempo justo para ver el sello estamparse
    } catch (err) {
      fallar(err instanceof ApiError ? `${err.message}.` : 'No se pudo iniciar sesión.');
    } finally { setEnviando(false); setSellando(false); }
  };

  return (
    <main className="wrap pagina">
      <div className="hoja entrar" ref={hoja}>
        <form className="entrar-form" ref={form} onSubmit={enviar} noValidate>
          <div>
            <h1 className="marca-grande" ref={marca}>AuditA</h1>
            <p className="sub">Auditorías de seguridad de la información según ISO/IEC 27002:2022</p>
          </div>
          <Campo id="login-email" etiqueta="Correo"><input className="campo" id="login-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></Campo>
          <Campo id="login-pass" etiqueta="Contraseña"><input className="campo" id="login-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} aria-invalid={error ? true : undefined} /></Campo>
          {error && <MensajeError>{error}</MensajeError>}
          <div className="fila-acc">
            <span className="zona-iman"><button className="btn" type="submit" ref={boton} disabled={enviando}>{estado.fase === 'activa' ? 'Sesión iniciada' : enviando ? 'Entrando…' : 'Entrar'}</button></span>
          </div>
        </form>
        <div ref={lado}><SelloVivo cadena={BITACORA_EJEMPLO} cifra={CIFRA} orla={ORLA} fijo={estado.fase === 'activa'} /></div>
      </div>
    </main>
  );
}
