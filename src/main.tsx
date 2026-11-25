import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Monomakh (poluustav, the medieval Serbian book hand) for headings; Noto Sans for text and Source Serif 4 for numbers,
// both of which draw the Serbian forms of б, г, д, п, т when the page is in Serbian.
import '@fontsource/noto-sans/400.css';
import '@fontsource/noto-sans/400-italic.css';
import '@fontsource/noto-sans/600.css';
import '@fontsource/noto-sans/700.css';
import '@fontsource/monomakh/400.css';
import '@fontsource/source-serif-4/700.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
