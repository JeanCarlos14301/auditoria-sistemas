import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@fontsource-variable/libre-franklin';
import '@fontsource-variable/newsreader';
import './styles/base.css';
import './styles/tokens.css';
import './styles/componentes.css';
import './styles/trabajo.css';
import './styles/hoja.css';
import './styles/sello.css';
import './styles/entrada.css';
import './styles/listado.css';
import './styles/alcance.css';
import './styles/propuestas.css';
import './styles/informe.css';
import './styles/marco.css';
import './styles/acta.css';
import './styles/revision.css';
import './styles/utilidades.css';
import { ApiError } from './api/client';
import { AuthProvider } from './auth/AuthContext';
import App from './App';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Un 4xx no se arregla reintentando (401 cierra la sesión, 404 es "no encontrado").
      retry: (intentos, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && intentos < 2,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
