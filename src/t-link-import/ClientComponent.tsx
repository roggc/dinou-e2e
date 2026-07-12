"use client";

import { Link, useRouter, usePathname, useNavigationLoading, ClientRedirect } from "dinou";
import { useState } from "react";

export default function ClientComponent() {
  const router = useRouter();
  const pathname = usePathname();
  const isLoading = useNavigationLoading();
  const [triggerRedirect, setTriggerRedirect] = useState(false);

  return (
    <div style={{ marginTop: "20px", border: "1px solid #ccc", padding: "10px" }}>
      <h2>Client Component importing Dinou APIs</h2>
      
      {/* 1. Link in Client Component */}
      <Link href="/revalidate" data-testid="client-link">
        Link from Client Component
      </Link>

      {/* 2. Pathname */}
      <div data-testid="client-pathname">
        Pathname: {pathname}
      </div>

      {/* 3. Navigation loading status */}
      <div data-testid="client-loading">
        Loading: {String(isLoading)}
      </div>

      {/* 4. ClientRedirect trigger */}
      <button 
        data-testid="trigger-redirect-btn"
        onClick={() => setTriggerRedirect(true)}
      >
        Trigger ClientRedirect
      </button>

      {triggerRedirect && (
        <ClientRedirect to="/revalidate" />
      )}
    </div>
  );
}
