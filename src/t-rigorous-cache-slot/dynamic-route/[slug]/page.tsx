import { DinouCacheSlot } from "dinou/server";

export default async function DynamicParamSlotPage({
  params,
}: {
  params: { slug: string };
}) {
  const slug = params?.slug || "unknown";
  const pageTime = Date.now();
  return (
    <section id="dynamic-param-slot-page">
      <h2>Dynamic Param Route (/t-rigorous-cache-slot/dynamic-route/{slug})</h2>
      <div>
        Host Page Time:{" "}
        <span id="dyn-param-page-time" data-testid="dyn-param-page-time">
          {pageTime}
        </span>
      </div>
      <DinouCacheSlot
        id={`rig-slot-param-${slug}`}
        tag={`rig-tag-param-${slug}`}
        revalidate={3600}
      >
        {async () => {
          const slotTime = Date.now();
          const token = `param-${slug}-${slotTime}-${Math.random().toString(36).slice(2, 6)}`;
          return (
            <div id="slot-param-box" data-testid="slot-param-box">
              <div>
                Param Slug:{" "}
                <span id="slot-param-slug" data-testid="slot-param-slug">
                  {slug}
                </span>
              </div>
              <div>
                Slot Token:{" "}
                <span id="slot-param-token" data-testid="slot-param-token">
                  {token}
                </span>
              </div>
              <div>
                Slot Time:{" "}
                <span id="slot-param-time" data-testid="slot-param-time">
                  {slotTime}
                </span>
              </div>
            </div>
          );
        }}
      </DinouCacheSlot>
    </section>
  );
}

