import { Link, type SlotProps } from "./dinou";

export default function ParkedSidebarSlot({ params }: SlotProps) {
  const slug: string = params.slug;
  return (
    <nav>
      <span>Sidebar for {slug}</span>
      <Link to="./contact">Contact</Link>
    </nav>
  );
}

