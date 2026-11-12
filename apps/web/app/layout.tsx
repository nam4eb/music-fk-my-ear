import type { Metadata, Viewport } from 'next';
import './globals.css';
const base = process.env.NEXT_PUBLIC_BASE_PATH || '';
export const metadata: Metadata = {
  title: 'VibeBox — Your music, your mood',
  description: 'Private music player, smart playlists and daily listening insights.',
  applicationName: 'VibeBox',
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: 'VibeBox', statusBarStyle: 'black-translucent' },
  icons: { icon: `${base}/icon-192.png`, apple: `${base}/icon-192.png` }
};
export const viewport: Viewport = { themeColor: '#10101b', width: 'device-width', initialScale: 1, viewportFit: 'cover' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
