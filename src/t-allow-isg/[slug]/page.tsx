export default async function Page({ params }: { params: { slug: string } }) {
  return <div data-testid="slug-text">Slug: {params.slug}</div>;
}
