import { Navigate, Route, Routes } from 'react-router-dom';
import { RutaPrivada } from './auth/AuthContext';
import { Marco } from './components/Barra';
import Auditorias from './pages/Auditorias';
import Cierre from './pages/Cierre';
import Login from './pages/Login';
import Trabajo from './pages/Trabajo';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RutaPrivada />}>
        <Route element={<Marco />}>
          <Route path="/auditorias" element={<Auditorias />} />
          <Route path="/auditorias/:id" element={<Trabajo />} />
          <Route path="/auditorias/:id/cierre" element={<Cierre />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/auditorias" replace />} />
    </Routes>
  );
}
