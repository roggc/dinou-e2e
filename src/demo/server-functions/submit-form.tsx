"use server";

import FormResult from "@/demo/components/form-result";

export async function submitForm(formData: FormData) {
  await delay(1000);

  const name = String(formData.get("name") ?? "").trim();
  const language = String(formData.get("language") ?? "").trim();
  const experience = String(formData.get("experience") ?? "").trim();

  if (!name) {
    return (
      <div className="rounded-xl bg-rose-950 border border-rose-800 p-4 text-rose-300 text-sm">
        ❌ Name is required.
      </div>
    );
  }

  const score = Math.floor(Math.random() * 40) + 60;
  const level = score >= 90 ? "Expert" : score >= 75 ? "Advanced" : "Intermediate";

  // Returns a Client Component with the result data
  return (
    <FormResult
      name={name}
      language={language || "JavaScript"}
      experience={experience || "Unknown"}
      score={score}
      level={level}
    />
  );
}

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
