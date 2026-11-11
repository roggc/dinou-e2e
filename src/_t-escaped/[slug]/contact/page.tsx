import { Link, type PageProps } from "./dinou";

export default function ParkedContactPage({ params }: PageProps) {
  const slug: string = params.slug;
  return (
    <div>
      <h2>Contact {slug}</h2>
      <Link to="../..">Back to Parked Root</Link>
    </div>
  );
}

