import { Outlet, ScrollRestoration } from 'react-router';
import { Toaster } from '@/shared/ui/toast';
import { SiteFooter } from './SiteFooter';
import { SiteHeader } from './SiteHeader';

export function RootLayout() {
  return (
    <div className="theme-ready">
      <div className="bridge-page">
        <SiteHeader />
        <div className="page-transition">
          <div className="page-transition-panel">
            <Outlet />
          </div>
        </div>
        <SiteFooter />
      </div>
      <Toaster />
      <ScrollRestoration />
    </div>
  );
}
