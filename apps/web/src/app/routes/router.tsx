import { createBrowserRouter } from 'react-router';
import { features } from '@/shared/config';
import { RootLayout } from '@/app/layout/RootLayout';
import { pageRoutes } from './page-routes';
import { RouteError } from './RouteError';

export const router = createBrowserRouter([
  {
    Component: RootLayout,
    // The layout renders immediately; nothing to show while the first page chunk loads.
    HydrateFallback: () => null,
    // Last resort, should the layout itself throw.
    ErrorBoundary: RouteError,
    children: [
      {
        // A page that throws or fails to load is replaced inside the header and footer.
        ErrorBoundary: RouteError,
        children: pageRoutes({ agents: features.agents }),
      },
    ],
  },
]);
