export default async function Page({ params }: any) {
  return <div>{params.slug}</div>;
}
