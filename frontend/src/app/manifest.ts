import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Allvision Pulse',
    short_name: 'Pulse',
    description: 'Allvision Pulse: сообщения, уведомления, звонки и активности в одном приложении.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f3ede0',
    theme_color: '#f3ede0',
    lang: 'ru',
    categories: ['social', 'communication', 'productivity'],
    icons: [
      {
        src: '/brand-eye-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/brand-eye-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/brand-eye-180.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  };
}
