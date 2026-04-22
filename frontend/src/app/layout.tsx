import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './styles/globals.css';
import { StoreProvider } from './providers/StoreProvider';
import { LightboxProvider } from '@/shared/ui/Lightbox/LightboxProvider';

const pulseBodyFont = localFont({
  src: './fonts/Nunito-Variable.ttf',
  variable: '--font-pulse-body',
  display: 'swap',
  weight: '400 800',
});

const pulseDisplayFont = localFont({
  src: './fonts/Comfortaa-Variable.ttf',
  variable: '--font-pulse-display',
  display: 'swap',
  weight: '400 700',
});

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
  other: {
    'mobile-web-app-capable': 'yes',
    'supported-color-schemes': 'light',
    'darkreader-lock': '',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light',
  themeColor: '#f3ede0',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${pulseBodyFont.variable} ${pulseDisplayFont.variable}`}>
      <body>
        <StoreProvider>
          <LightboxProvider>{children}</LightboxProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
