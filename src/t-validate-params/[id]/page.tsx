export default async function Page({ params }: { params: { id: string } }) {
  return <div data-testid="id-text">ID: {params.id}</div>;
}
