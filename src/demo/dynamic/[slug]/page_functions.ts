export async function getStaticPaths() {
  return [
    { slug: "react" },
    { slug: "dinou" },
    { slug: "nodejs" },
    { slug: "express" },
    { slug: "esbuild" },
  ];
}

// 🛑 v5.0.0 Feature: Reject dynamic requests for paths not listed in getStaticPaths
export function allowISG() {
  return true;
}

// 🛑 v5.0.0 Feature: Parameter Validation
export async function validateParams(params: { slug?: string }) {
  if (!params.slug) return false;
  
  // Only allow lowercase letters (a-z) to check regex-level validation
  const isOnlyLetters = /^[a-z]+$/.test(params.slug);
  if (!isOnlyLetters) return false;

  const validSlugs = ["react", "dinou", "nodejs", "express", "esbuild", "testisg"];
  return validSlugs.includes(params.slug);
}

