import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const display = localFont({ src: '../../public/fonts/bricolage-grotesque-latin.woff2', variable: '--font-display', weight: '400 800', display: 'swap' });
const body = localFont({ src: '../../public/fonts/dm-sans-latin.woff2', variable: '--font-body', weight: '400 700', display: 'swap' });
const utility = localFont({ src: '../../public/fonts/dm-mono-latin.woff2', variable: '--font-utility', weight: '400', display: 'swap', preload: false });
export const metadata: Metadata = { title: 'East Eats | Find your kind of good', description: 'Find East Asian food and fusion spots that fit your tastes.', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, statusBarStyle: 'default', title: 'East Eats' }, icons: { icon: '/icon.svg', apple: '/icon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#B83A24' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className={`${display.variable} ${body.variable} ${utility.variable}`}><body>{children}</body></html>; }
