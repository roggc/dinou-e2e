import { Link } from "./dinou";
import { LoginQueryProbe } from "./LoginQueryProbe";

export default function ApiRefNavLoginPage() {
  return (
    <main data-testid="api-nav-login-page">
      <h1>API Ref Nav Login</h1>
      <LoginQueryProbe />
      <Link to=".." data-testid="api-nav-login-back">
        Back to Hub
      </Link>
    </main>
  );
}
