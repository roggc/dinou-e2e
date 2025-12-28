"use client";
import { usePathname } from "dinou"; // Tu nuevo hook
// import { usePathname } from "../../../../dinou/core/navigation";

export default function NavBar() {
  const pathname = usePathname();
  return (
    <nav>
      <a
        href="/t-spa-navigation/t-layout-client-component/t-client-component"
        data-testid="link-home"
        style={{
          fontWeight:
            pathname ===
            "/t-spa-navigation/t-layout-client-component/t-client-component"
              ? "bold"
              : "normal",
        }}
      >
        Home
      </a>
      <a
        href="/t-spa-navigation/t-layout-client-component/about"
        data-testid="link-about"
        style={{
          fontWeight:
            pathname === "/t-spa-navigation/t-layout-client-component/about"
              ? "bold"
              : "normal",
        }}
      >
        About
      </a>
      <div data-testid="current-path">{pathname}</div>
    </nav>
  );
}
