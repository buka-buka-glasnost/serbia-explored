import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/literata/600.css';
import '@fontsource/literata/700.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
