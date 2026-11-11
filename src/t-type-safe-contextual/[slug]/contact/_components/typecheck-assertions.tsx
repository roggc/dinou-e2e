import { Link, useRouter, ROUTE, type PageProps } from "../dinou";
import {
  Link as GlobalLink,
  type LayoutProps as GlobalLayoutProps,
  type SlotProps as GlobalSlotProps,
  type ErrorProps as GlobalErrorProps,
  type NotFoundProps as GlobalNotFoundProps,
  type LayoutFunctions as GlobalLayoutFunctions,
} from "dinou";

// TS2312 interface extension compatibility checks
export interface ExtendedContextualLayoutProps
  extends GlobalLayoutProps<"/t-type-safe-contextual/[slug]"> {
  extraFlag?: boolean;
}
export interface UnparameterizedLayoutProps extends GlobalLayoutProps {
  extraFlag?: boolean;
}

export function _CompileTimeAssertions(
  { params }: PageProps,
  slotProps: GlobalSlotProps<"/t-type-safe-contextual/[slug]/@sidebar">,
  errProps: GlobalErrorProps<"/t-type-safe-contextual/[slug]/@sidebar">,
  nfProps: GlobalNotFoundProps<"/t-type-safe-contextual/[slug]">,
  layoutFns: GlobalLayoutFunctions<"/t-type-safe-contextual/[slug]">
) {
  const exactRoute: "/t-type-safe-contextual/[slug]/contact" = ROUTE;
  const slug: string = params.slug;
  const slotSlug: string = slotProps.params.slug;
  const errSlug: string = errProps.params.slug;
  const nfSlug: string = nfProps.params.slug;
  void exactRoute;
  void slotSlug;
  void errSlug;
  void nfSlug;
  void layoutFns;

  const router = useRouter();

  // Valid contextual calls
  router.push("sub");
  router.push("./sub");
  router.push("../..");
  router.push("/t-type-safe-contextual/[slug]/contact/sub", { params: { slug } });

  // Invalid contextual calls that MUST be rejected by TypeScript
  // @ts-expect-error typo in dot-slash relative path
  router.push("./subs");
  // @ts-expect-error typo in bare relative path
  router.push("subs");
  // @ts-expect-error parent /t-type-safe-contextual/[slug] has NO page.tsx
  router.push("..");
  // @ts-expect-error dynamic bracket pattern requires { params }
  router.push("/t-type-safe-contextual/[slug]/contact/sub");

  return (
    <div>
      {/* Valid global Link calls (template string, pattern + params, anchored relative) */}
      <GlobalLink href={`/t-type-safe-contextual/${slug}/contact/sub`}>OK</GlobalLink>
      <GlobalLink
        to="/t-type-safe-contextual/[slug]/contact/sub"
        params={{ slug }}
      >
        OK
      </GlobalLink>
      <GlobalLink
        from="/t-type-safe-contextual/[slug]/contact"
        to="sub"
      >
        OK
      </GlobalLink>

      {/* Invalid contextual <Link> calls */}
      {/* @ts-expect-error typo in dot-slash relative path */}
      <Link to="./subs">Invalid</Link>
      {/* @ts-expect-error typo in bare relative path */}
      <Link to="subs">Invalid</Link>
      {/* @ts-expect-error parent /t-type-safe-contextual/[slug] has NO page.tsx */}
      <Link to="..">Invalid</Link>
      {/* @ts-expect-error missing required params prop */}
      <Link to="/t-type-safe-contextual/[slug]/contact/sub">Invalid</Link>
      {/* @ts-expect-error wrong param key */}
      <Link to="/t-type-safe-contextual/[slug]/contact/sub" params={{ wrong: "x" }}>
        Invalid
      </Link>
      {/* @ts-expect-error explicit from="/t-type-safe-contextual" invalidates "sub" */}
      <Link from="/t-type-safe-contextual" to="sub">
        Invalid
      </Link>

      {/* Invalid global <GlobalLink> calls */}
      {/* @ts-expect-error unanchored relative link without `from` */}
      <GlobalLink to="./sub">Invalid</GlobalLink>
      {/* @ts-expect-error intermediate layout folder /t-type-safe-contextual/[slug] has NO page.tsx */}
      <GlobalLink href={`/t-type-safe-contextual/${slug}`}>Invalid</GlobalLink>
      {/* @ts-expect-error @sidebar is a parallel slot, NOT a navigable URL */}
      <GlobalLink href={`/t-type-safe-contextual/${slug}/@sidebar`}>Invalid</GlobalLink>
    </div>
  );
}

