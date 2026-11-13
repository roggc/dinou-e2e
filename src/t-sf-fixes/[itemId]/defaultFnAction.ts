export default async (itemId: string, count: number) => {
  "use server";
  return `FnDefault:${itemId}:${count * 3}`;
};

