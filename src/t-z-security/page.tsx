import { SecurityProbeClient } from "./SecurityProbeClient";

export default function Z2SecurityPage() {
  return (
    <main data-testid="z2-security-page">
      <h1>Z2 Security Hardening Probes</h1>
      <SecurityProbeClient />
    </main>
  );
}
