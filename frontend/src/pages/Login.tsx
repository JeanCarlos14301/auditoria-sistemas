import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ApiError } from '../api/client';
import { useSesion } from '../auth/AuthContext';
import { Campo, MensajeError } from '../components/basicos';

// Pantalla funcional mínima: su diseño definitivo está pendiente de mockup.
export default function Login() {
  const { estado, entrar } = useSesion();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  if (estado.fase === 'activa') return <Navigate to={(loc.state as { desde?: string } | null)?.desde ?? '/auditorias'} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) { setError('Escribe tu correo y tu contraseña.'); return; }
    setEnviando(true); setError(null);
    try { await entrar(email.trim(), password); }
    catch (err) { setError(err instanceof ApiError ? err.message : 'No se pudo iniciar sesión.'); }
    finally { setEnviando(false); }
  };

  return (
    <main className="wrap pagina">
      <form className="login" onSubmit={enviar} noValidate>
        <p className="logo">AuditA</p>
        <h1 className="titulo-pagina">Iniciar sesión</h1>
        <Campo id="login-email" etiqueta="Correo"><input className="campo" id="login-email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} /></Campo>
        <Campo id="login-pass" etiqueta="Contraseña"><input className="campo" id="login-pass" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} /></Campo>
        {error && <MensajeError>{error}</MensajeError>}
        <button className="btn" type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </main>
  );
}
