import type { PageProps } from "./dinou";
import defaultModAction from "./defaultModAction";
import defaultFnAction from "./defaultFnAction";
import defaultAnonModAction from "./defaultAnonModAction";
import { WidgetLoader } from "./WidgetLoader";

export default function SfFixesItemPage({ params }: PageProps) {
  const currentItemId = params.itemId;

  async function updateItemInline(suffix: string) {
    "use server";
    return `Inline:${currentItemId}:${suffix}`;
  }

  return (
    <main>
      <h1 data-testid="sf-fixes-heading">{`SfFixes:${currentItemId}`}</h1>
      <WidgetLoader
        itemId={currentItemId}
        serverModDefault={defaultModAction.bind(null, currentItemId)}
        serverFnDefault={defaultFnAction.bind(null, currentItemId)}
        serverAnonModDefault={defaultAnonModAction.bind(null, currentItemId)}
        serverInlineAction={updateItemInline}
      />
    </main>
  );
}

