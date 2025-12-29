export default async function Page() {
  return (
    <>
      <div data-testid="target-content">hello from server component B</div>
      <a
        data-testid="link-trigger"
        href="/t-redirect-from-server-component/to-server-component/t-layout-server-component/redirect-to/redirect-soft"
      >
        Click to Redirect
      </a>
    </>
  );
}
