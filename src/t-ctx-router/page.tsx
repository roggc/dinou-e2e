import {
  ROUTE,
  type PageProps,
  type DinouEnv,
  type DinouNavigableRoutePatternMap,
  type DinouNavigableRouteKey,
  type DinouDynamicRoutePattern,
  type DinouDynamicRouteWithSuffix,
  type DinouEffectiveRoutePattern,
  type ScopedLinkTargetForFrom,
} from "./dinou";
import { ContextualRouterStabilityProbe } from "./client-probe";

// Compile-time assertions confirming all Batch 2 re-exported contextual types resolve strictly
type _AssertDinouEnv = DinouEnv;
type _AssertPatternMap = DinouNavigableRoutePatternMap;
type _AssertRouteKey = DinouNavigableRouteKey;
type _AssertDynamicPattern = DinouDynamicRoutePattern;
type _AssertDynamicSuffix = DinouDynamicRouteWithSuffix;
type _AssertEffectivePattern = DinouEffectiveRoutePattern;
type _AssertScopedTarget = ScopedLinkTargetForFrom<"/t-ctx-router", undefined>;

const _validScopedChild: _AssertScopedTarget = "child";
// @ts-expect-error invalid relative target must be rejected by re-exported ScopedLinkTargetForFrom
const _invalidScopedTarget: _AssertScopedTarget = "non-existent-relative-child";
const _validRouteKey: _AssertRouteKey = "/t-ctx-router";
const _validEffective: _AssertEffectivePattern = "/t-ctx-router/child";
const _envShapeProbe: Partial<_AssertDinouEnv> = {};
void (
  _validScopedChild &&
  _invalidScopedTarget &&
  _validRouteKey &&
  _validEffective &&
  _envShapeProbe
);
type _UnusedTypeHolders =
  | _AssertPatternMap
  | _AssertDynamicPattern
  | _AssertDynamicSuffix;
const _typeMarker: _UnusedTypeHolders | null = null;
void _typeMarker;

export default function ContextualRouterHomePage(_props: PageProps) {
  return (
    <main data-testid="ctx-router-home" data-route={ROUTE}>
      <h1 data-testid="ctx-router-heading">Contextual Router Probe</h1>
      <ContextualRouterStabilityProbe />
    </main>
  );
}
