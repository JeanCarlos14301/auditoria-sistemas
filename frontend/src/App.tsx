import { Navigate, Route, Routes } from 'react-router-dom';
import { RutaPrivada } from './auth/AuthContext';
import { Marco } from './components/Barra';
import AuditoriaLayout from './pages/AuditoriaLayout';
import Auditorias from './pages/Auditorias';
import Cierre from './pages/Cierre';
import HistoriaPagina from './pages/HistoriaPagina';
import Informe from './pages/Informe';
import Login from './pages/Login';
import NuevaAuditoria from './pages/NuevaAuditoria';
import Trabajo from './pages/Trabajo';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RutaPrivada />}>
        <Route element={<Marco />}>
          <Route path="/auditorias" element={<Auditorias />} />
          <Route path="/auditorias/nueva" element={<NuevaAuditoria />} />
          {/* Las vistas de una auditoría comparten su cabecera: Trabajo (o Alcance), Revisión o Acta, e Historia */}
          <Route path="/auditorias/:id" element={<AuditoriaLayout />}>
            <Route index element={<Trabajo />} />
            <Route path="cierre" element={<Cierre />} />
            <Route path="historia" element={<HistoriaPagina />} />
          </Route>
          <Route path="/auditorias/:id/informe" element={<Informe />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/auditorias" replace />} />
    </Routes>
  );
}
