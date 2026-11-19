import { Link } from "./dinou";

export default function ApiRefNavReportPage() {
  return (
    <main data-testid="api-nav-report-page">
      <h1>API Ref Nav Report</h1>
      <Link to=".." data-testid="api-nav-report-back">
        Back to Hub
      </Link>
    </main>
  );
}
