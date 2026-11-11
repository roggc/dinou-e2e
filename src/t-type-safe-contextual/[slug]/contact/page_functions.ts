import type { PageFunctions } from "./dinou";

export interface ContactExtraProps {
  greeting: string;
}

export const getStaticPaths: PageFunctions["getStaticPaths"] = () => [
  { slug: "acme" },
  { slug: "beta" },
];

export const getProps: PageFunctions<ContactExtraProps>["getProps"] = async (
  params
) => {
  return {
    greeting: `Hello ${params?.slug ?? "unknown"}`,
  };
};

