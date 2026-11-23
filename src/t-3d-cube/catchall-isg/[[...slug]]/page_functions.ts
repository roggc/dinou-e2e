export const ppr = true;
export const revalidate = 3600;
export const allowISG = true;
export const getStaticPaths = () => [];
export const getCacheTags = (params: { slug?: string[] }) => {
  const slugKey =
    Array.isArray(params?.slug) && params.slug.length > 0
      ? params.slug.join("-")
      : "root";
  return [`cube-ca-page-${slugKey}`];
};
