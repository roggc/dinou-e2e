"use client";

import { useEffect } from "react";
import {
  rcMutateAndRevalPage,
  rcMutateRevalAndRedirect,
  rcMutateAndRevalTag,
  rcMutateAndRevalLayout,
  rcMutateAndRevalPath,
} from "./actions";
import type { Cube3DState } from "../shared/cube-state";

export function RouterCoherenceBridge() {
  useEffect(() => {
    (window as any).__RC_ACTIONS__ = {
      mutateAndRevalPage: (targetPath: string, patch: Partial<Cube3DState>) =>
        rcMutateAndRevalPage(targetPath, patch),
      mutateRevalAndRedirect: (
        targetPath: string,
        patch: Partial<Cube3DState>
      ) => rcMutateRevalAndRedirect(targetPath, patch),
      mutateAndRevalTag: (tag: string, patch: Partial<Cube3DState>) =>
        rcMutateAndRevalTag(tag, patch),
      mutateAndRevalLayout: (layoutPath: string, patch: Partial<Cube3DState>) =>
        rcMutateAndRevalLayout(layoutPath, patch),
      mutateAndRevalPath: (targetPath: string, patch: Partial<Cube3DState>) =>
        rcMutateAndRevalPath(targetPath, patch),
    };
    return () => {
      delete (window as any).__RC_ACTIONS__;
    };
  }, []);

  return <div id="rc-actions-bridge" data-ready="true" />;
}
