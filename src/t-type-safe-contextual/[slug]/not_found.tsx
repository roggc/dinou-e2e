import { Link, ROUTE, type NotFoundProps } from "./dinou";

export default function ContextualSlugNotFound({ params }: NotFoundProps) {
  return (
    <section data-testid="ctx-slug-not-found" data-nf-route={ROUTE}>
      <p data-testid="ctx-nf-slug">{params.slug}</p>
      <Link data-testid="ctx-nf-back-hub" to="..">
        Back to Hub
      </Link>
    </section>
  );
}

