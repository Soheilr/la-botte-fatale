import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'La Botte Fatale — Vino, bottiglie e incontri fatali',
  description: 'Corri, salta e trova la strada verso La Botte Fatale.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="it"><body>{children}</body></html>;
}
