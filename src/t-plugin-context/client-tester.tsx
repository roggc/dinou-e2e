"use client";

import { useState } from "react";
import { getPluginUser } from "./get-plugin-user";

export default function ClientTester() {
  const [sfUser, setSfUser] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  return (
    <div id="client-tester" style={{ marginTop: "1rem" }}>
      <button
        id="btn-fetch-sf-user"
        onClick={async () => {
          setLoading(true);
          try {
            const u = await getPluginUser();
            setSfUser(u);
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Loading..." : "Fetch SF User"}
      </button>
      {sfUser && (
        <div id="sf-user-result" style={{ marginTop: "0.5rem" }}>
          <span id="sf-user-name">{sfUser.name}</span>:
          <span id="sf-user-role">{sfUser.role}</span>
        </div>
      )}
    </div>
  );
}
