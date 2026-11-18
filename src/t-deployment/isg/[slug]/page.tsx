import { Link, type PageProps } from "./dinou";

export default function DeploymentIsgSlugPage({ params }: PageProps) {
  return (
    <article data-testid="deploy-isg-root" data-isg-slug={params.slug}>
      <h1 data-testid="deploy-isg-heading">ISG Slug: {params.slug}</h1>
      <Link href="/t-deployment" data-testid="deploy-isg-home">
        Back to Deployment Home
      </Link>
    </article>
  );
}

