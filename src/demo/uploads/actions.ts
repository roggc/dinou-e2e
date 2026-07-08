"use server";

export async function handleFileUpload(formData: FormData) {
  const file = formData.get("file");
  const notes = formData.get("notes") as string;

  if (!file || !(file instanceof Blob)) {
    return {
      success: false,
      message: "No file was uploaded or invalid file type.",
    };
  }

  const name = (file as any).name || "unknown_filename";
  const size = file.size;
  const type = file.type;

  let textContent = "";
  if (
    type.startsWith("text/") || 
    type.includes("json") || 
    name.endsWith(".txt") || 
    name.endsWith(".json") ||
    name.endsWith(".md")
  ) {
    try {
      textContent = await file.text();
    } catch (e) {
      textContent = `Failed to read text content: ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  return {
    success: true,
    name,
    size,
    type,
    notes: notes || "No custom notes provided.",
    textContent: textContent ? textContent.slice(0, 800) : null,
  };
}
