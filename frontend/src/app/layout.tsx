import type { Metadata, Viewport } from 'next';
import './styles/globals.css';
import { StoreProvider } from './providers/StoreProvider';
import { LightboxProvider } from '@/shared/ui/Lightbox/LightboxProvider';

export const metadata: Metadata = {
  title: {
    default: 'Allvision Pulse',
    template: '%s | Allvision Pulse',
  },
  description: 'Allvision Pulse: сообщения, уведомления, звонки и активности в одном приложении.',
  applicationName: 'Allvision Pulse',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/brand-eye-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand-eye-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/brand-eye-32.png',
    apple: '/brand-eye-180.png',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Allvision Pulse',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#060709',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <StoreProvider>
          <LightboxProvider>{children}</LightboxProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
