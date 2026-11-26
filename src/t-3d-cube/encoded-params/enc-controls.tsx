"use client";

import { useEffect } from "react";
import {
  encMutateAndRevalRelativePage,
  encMutateAndRevalRelativeParentLayout,
  encMutateAndRevalPage,
  encMutateAndRevalPath,
  encMutateAndRevalTag,
} from "./actions";
import type { Cube3DState } from "../shared/cube-state";

export function EncodedParamsBridge() {
  useEffect(() => {
    (window as any).__ENC_ACTIONS__ = {
      revalRelativePage: (patch: Partial<Cube3DState>) =>
        encMutateAndRevalRelativePage(patch),
      revalRelativeParentLayout: (patch: Partial<Cube3DState>) =>
        encMutateAndRevalRelativeParentLayout(patch),
      revalPage: (targetPath: string, patch: Partial<Cube3DState>) =>
        encMutateAndRevalPage(targetPath, patch),
      revalPath: (targetPath: string, patch: Partial<Cube3DState>) =>
        encMutateAndRevalPath(targetPath, patch),
      revalTag: (tag: string, patch: Partial<Cube3DState>) =>
        encMutateAndRevalTag(tag, patch),
    };
    return () => {
      delete (window as any).__ENC_ACTIONS__;
    };
  }, []);

  return <div id="enc-actions-bridge" data-ready="true" />;
}
