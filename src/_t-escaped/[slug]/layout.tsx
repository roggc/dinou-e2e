import type { LayoutProps } from "./dinou";

export default function ParkedSlugLayout({
  children,
  params,
  sidebar,
}: LayoutProps) {
  const slug: string = params.slug;
  return (
    <div data-slug={slug}>
      <aside>{sidebar}</aside>
      <div>{children}</div>
    </div>
  );
}

