import { getContext } from "dinou";

export default async function Page({ params }: any) {
  const ctx = getContext();
  const searchParams = ctx?.req?.query ?? {};
  return (
    <>
      <div>page params: {JSON.stringify(params, null, 2)}</div>
      <div>
        page searchParams:
        {JSON.stringify(searchParams, null, 2)}
      </div>
    </>
  );
}
