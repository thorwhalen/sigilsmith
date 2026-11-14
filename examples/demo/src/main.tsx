import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { SigilProvider } from 'sigilsmith/react';
import App from './App';
import { sigil } from './sigilsmith.gen';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SigilProvider sigil={sigil}>
      <App />
    </SigilProvider>
  </StrictMode>,
);
