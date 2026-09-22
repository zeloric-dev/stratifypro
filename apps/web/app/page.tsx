import { Checker } from './Checker';
import { FileChecker } from './FileChecker';
import { Sample } from './Sample';

export default function Home() {
  return (
    <main>
      <h1>What is this component?</h1>
      <p className="lede">
        Paste a software component name as it appears in a bill of materials. This resolves it
        to a canonical identifier, or tells you honestly that it cannot. Everything runs in
        your browser: nothing is uploaded.
      </p>

      <Checker />

      <FileChecker />

      <Sample />

      <h2>Why this is hard</h2>
      <p className="lede">
        The same component is written <code>openssl 1.1.1k</code>, <code>OpenSSL (FIPS)</code>,{' '}
        <code>libssl1.1</code> and <code>openssl-1.1.1k.tar.gz</code> depending on who recorded
        it. A component that cannot be matched to an identifier is invisible to every
        vulnerability database, and since April 2026 most new records never receive the
        identifier the industry matched on.
      </p>

      <footer>
        Checks against published minimum elements. No regulator has reviewed this tool.
        StratifyPro does not retain anything you paste here: resolution happens in your browser.
      </footer>
    </main>
  );
}
