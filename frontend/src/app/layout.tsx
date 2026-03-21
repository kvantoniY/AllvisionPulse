import type { Metadata } from 'next';
import './styles/globals.css';
import { StoreProvider } from './providers/StoreProvider';
import { LightboxProvider } from '@/shared/ui/Lightbox/LightboxProvider';

export const metadata: Metadata = {
  title: 'Allvision Pulse',
  description: 'Allvision Pulse MVP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <StoreProvider>
          <LightboxProvider>{children}</LightboxProvider>
        </StoreProvider>
      </body>
    </html>
  );
}
