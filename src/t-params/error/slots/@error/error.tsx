export default async function Page({ error, params, searchParams }: any) {
  return (
    <>
      <div>page params: {JSON.stringify(params, null, 2)}</div>
      <div>page searchParams: {JSON.stringify(searchParams, null, 2)}</div>
      <div>page error: {JSON.stringify(error, null, 2)}</div>
    </>
  );
}
