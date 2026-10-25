import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
const jakarta = localFont({ src: '../../public/fonts/plus-jakarta-sans-latin.woff2', variable: '--font-ui', weight: '400 800', display: 'swap' });
export const metadata: Metadata = { title: 'East Eats | Find your kind of good', description: 'Find East Asian food and fusion spots that fit your tastes.', manifest: '/manifest.webmanifest', appleWebApp: { capable: true, statusBarStyle: 'default', title: 'East Eats' }, icons: { icon: '/icon.svg', apple: '/icon.svg' } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#E12D12' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en" className={jakarta.variable}><body>{children}</body></html>; }
