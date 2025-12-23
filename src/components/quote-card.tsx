// "use client";

export default async function QuoteCard({
  quote,
  author,
}: {
  quote: string;
  author: string;
}) {
  return (
    <div className="rounded-2xl bg-white shadow-md p-6 max-w-md text-center border border-slate-100">
      <blockquote className="text-xl font-medium text-slate-800 mb-4">
        “{quote}”
      </blockquote>
      <p className="text-slate-500">— {author}</p>
    </div>
  );
}
