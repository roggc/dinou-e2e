import { useSearchParams } from "dinou";
export default async function Page({ error, params }: any) {
  const searchParams = useSearchParams();
  return (
    <>
      <div>page params: {JSON.stringify(params, null, 2)}</div>
      <div>
        page searchParams:
        {JSON.stringify(Object.fromEntries(searchParams), null, 2)}
      </div>
      <div>page error: {JSON.stringify(error, null, 2)}</div>
    </>
  );
}
