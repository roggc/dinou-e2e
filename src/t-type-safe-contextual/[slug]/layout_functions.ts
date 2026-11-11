import type { LayoutFunctions } from "./dinou";

export interface SlugLayoutExtraProps {
  orgPlan: "pro" | "free";
}

export const getStaticPaths: LayoutFunctions["getStaticPaths"] = () => [
  { slug: "acme" },
  { slug: "beta" },
];

export const getProps: LayoutFunctions<SlugLayoutExtraProps>["getProps"] = async (
  params
) => {
  return {
    orgPlan: params?.slug === "acme" ? "pro" : "free",
  };
};

