export const getStaticPaths = ["ok"];

export default {
  revalidate: () => 120,
  allowISG: () => false,
};
