"use server";

import QuoteCard from "@/components/quote-card";

export async function quoteCard() {
  // Simulate fetching data from a database or API
  const quotes = [
    {
      quote: "The best way to predict the future is to invent it.",
      author: "Alan Kay",
    },
    {
      quote: "Simplicity is the ultimate sophistication.",
      author: "Leonardo da Vinci",
    },
    {
      quote: "Code is like humor. When you have to explain it, it's bad.",
      author: "Cory House",
    },
  ];

  const random = await new Promise<{ quote: string; author: string }>(
    (resolve) =>
      setTimeout(
        () => resolve(quotes[Math.floor(Math.random() * quotes.length)]),
        3000
      )
  );

  // ✅ Return a Client Component with data
  return <QuoteCard {...random} />;
}
