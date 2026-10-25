import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'East Eats | Find your kind of good', description: 'Find East Asian food and fusion spots that fit your tastes.', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, statusBarStyle: 'default', title: 'East Eats' }, icons: { icon: '/icon.svg', apple: '/icon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#2549D8' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
