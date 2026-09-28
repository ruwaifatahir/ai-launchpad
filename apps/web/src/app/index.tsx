// First: it declares the cascade layer order (theme < components). Page CSS imported earlier
// would declare `components` first, and Tailwind's theme would then override our fonts and tokens.
import './styles/index.css';
// Self-hosted fonts named by the stylesheet's --font-sans and --font-serif.
import '@fontsource-variable/inter/wght.css';
import '@fontsource/instrument-serif/400.css';
import { StrictMode } from 'react';
import { RouterProvider } from 'react-router/dom';
import { envErrors } from '@/shared/config';
import { ConfigError } from './config-error/ConfigError';
import { WalletProvider } from './wallet/WalletProvider';
import { router } from './routes/router';

export function App() {
  // A broken configuration never reaches the wallet or the API: the screen names what to fix.
  if (envErrors.length > 0) {
    return (
      <StrictMode>
        <ConfigError errors={envErrors} />
      </StrictMode>
    );
  }
  return (
    <StrictMode>
      <WalletProvider>
        <RouterProvider router={router} />
      </WalletProvider>
    </StrictMode>
  );
}
