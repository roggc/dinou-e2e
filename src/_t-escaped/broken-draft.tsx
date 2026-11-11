// @ts-expect-error Intentional non-existent package to prove bundlers never scan `src/_t-escaped/`
import bogus from "__non_existent_parked_pkg_dinou_e2e__";

export function BrokenDraft() {
  return <div>{String(bogus)}</div>;
}

