import type { SlotProps } from "dinou";
import { Link } from "dinou"

export default function Page({ params }: SlotProps<"t-slots/[slug]/@sidebar">) {
    return <><div>Side {params.slug}bar</div>
        <Link to="../contact">contact</Link>
    </>;
}