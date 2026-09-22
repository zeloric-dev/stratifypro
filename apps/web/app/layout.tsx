import type { Metadata } from 'next';
import './globals.css';
import { SOURCE } from './source';

export const metadata: Metadata = {
  title: 'StratifyPro',
  description: 'What is this software component? Resolve a free-text name to a canonical identifier, or get an honest "I do not know".',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          {/*
            In the layout so that no page can ship without it, and plain anchors
            rather than next/link because these are four static documents and a
            router is not worth its weight on a page whose job is to be quoted.
          */}
          <nav className="top">
            <a href="/">Check a name</a>
            <a href="/rules">Rules</a>
            <a href="/crosswalk">Crosswalk</a>
            <a href="/eos">End of support</a>
            <a href="/bench">Benchmark</a>
            <a href="/honesty">What this does not do</a>
            {/*
              The whole argument of this product is that a reader can check it
              rather than trust it, and until now the site did not say where.
            */}
            <a href={SOURCE} rel="noreferrer">
              Source
            </a>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
