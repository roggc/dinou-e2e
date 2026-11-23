import { DinouCacheSlot } from "dinou/server";
import { readCubeState } from "../shared/cube-state";
import { CubeClientProbe, CubeControlBridge } from "../shared/cube-client";

export default function CubeCsDeepPage() {
  const hostSt = readCubeState();
  return (
    <main id="cube-cs-deep-page">
      <CubeControlBridge />
      <span id="csdeep-host-seq">{hostSt.csDeepHostSeq}</span>

      <section id="csdeep-3level-section">
        <DinouCacheSlot
          id="cube-csdeep-outer"
          tag="cube-csdeep-tag-outer"
          revalidate={3600}
        >
          {async () => {
            const outerSt = readCubeState();
            return (
              <div id="csdeep-outer-box">
                <span id="csdeep-outer-seq">{outerSt.csDeepOuterSeq}</span>
                <CubeClientProbe id="csdeep-outer" />
                <DinouCacheSlot
                  id="cube-csdeep-middle"
                  tag="cube-csdeep-tag-middle"
                  revalidate={3600}
                >
                  {async () => {
                    const midSt = readCubeState();
                    return (
                      <div id="csdeep-middle-box">
                        <span id="csdeep-middle-seq">{midSt.csDeepMiddleSeq}</span>
                        <CubeClientProbe id="csdeep-middle" />
                        <DinouCacheSlot
                          id="cube-csdeep-inner"
                          tag="cube-csdeep-tag-inner"
                          revalidate={3600}
                        >
                          {async () => {
                            const innerSt = readCubeState();
                            return (
                              <div id="csdeep-inner-box">
                                <span id="csdeep-inner-seq">{innerSt.csDeepInnerSeq}</span>
                                <CubeClientProbe id="csdeep-inner" />
                              </div>
                            );
                          }}
                        </DinouCacheSlot>
                      </div>
                    );
                  }}
                </DinouCacheSlot>
              </div>
            );
          }}
        </DinouCacheSlot>
      </section>

      <section id="csdeep-ttl-section">
        <DinouCacheSlot
          id="cube-csdeep-ttl-outer"
          tag="cube-csdeep-tag-ttl-outer"
          revalidate={3600}
        >
          {async () => {
            const outerTtl = readCubeState();
            return (
              <div id="csdeep-ttl-outer-box">
                <span id="csdeep-ttl-outer-seq">{outerTtl.csDeepTtlOuterSeq}</span>
                <DinouCacheSlot
                  id="cube-csdeep-ttl-middle"
                  tag="cube-csdeep-tag-ttl-middle"
                  revalidate={3600}
                >
                  {async () => {
                    const midTtl = readCubeState();
                    return (
                      <div id="csdeep-ttl-middle-box">
                        <span id="csdeep-ttl-middle-seq">{midTtl.csDeepTtlMiddleSeq}</span>
                        <DinouCacheSlot
                          id="cube-csdeep-ttl-inner"
                          tag="cube-csdeep-tag-ttl-inner"
                          revalidate={1}
                        >
                          {async () => {
                            const innerTtl = readCubeState();
                            return (
                              <div id="csdeep-ttl-inner-box">
                                <span id="csdeep-ttl-inner-seq">{innerTtl.csDeepTtlInnerSeq}</span>
                              </div>
                            );
                          }}
                        </DinouCacheSlot>
                      </div>
                    );
                  }}
                </DinouCacheSlot>
              </div>
            );
          }}
        </DinouCacheSlot>
      </section>
    </main>
  );
}
