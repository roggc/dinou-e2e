const STATE_KEY = Symbol.for("dinou.e2e.3d.cube.state");

export interface Cube3DState {
  // Check #37 — Asymmetric dynamic layout
  hsL1LayoutSeq: number;
  hsIndexPageSeq: number;
  hsAsymDynLayoutSeq: number;
  hsAsymStaticPageSeq: number;

  // Check #38 — Bidirectional nested cache-slots + dynamic-host 1s TTL
  csNestedOuterSeq: number;
  csNestedInnerSeq: number;
  csFastSeq: number;
  csAlphaSeq: number;

  // Check #39 — Pure PPR deep + 1s shell TTL
  pprRigShellSeq: number;
  pprRigStaticSuspenseSeq: number;
  pprOuterStaticVal: number;
  pprHoleCookieSeq: number;
  pprHoleQuerySeq: number;
  pprHoleClientSeq: number;
  pprHoleInnerInStaticSeq: number;
  pprHoleOuterDynSeq: number;
  pprHoleDeepInnerSeq: number;
  pprHoleMemoSeq: number;
  pprTtlShellSeq: number;
  pprTtlHoleSeq: number;

  // Check #40 — Per-segment mixed PPR chains
  pprMixedL1Seq: number;
  pprMixedL2ShellSeq: number;
  pprMixedL2HoleSeq: number;
  pprMixedStaticPageSeq: number;
  pprMixedLeafShellSeq: number;
  pprMixedLeafHoleSeq: number;
  pprInhLayoutSeq: number;
  pprInhShellSeq: number;
  pprInhHoleSeq: number;
  pprInhOptOutSeq: number;

  // Check #41 — Pairwise Y+Z (PPR + Cache-Slot deep + 1s TTLs)
  synShellSeq: number;
  synShellSlotSeq: number;
  synShellTtlSlotSeq: number;
  synStaticSuspenseHostSeq: number;
  synStaticSuspenseSlotSeq: number;
  synHoleNoCacheSlotSeq: number;
  synHoleSlotASeq: number;
  synHoleTtlSlotSeq: number;
  synHole3HostSeq: number;
  synClientSlotSeq: number;

  // Check #42 — Pairwise X+Y (HS + Cache-Slot deep)
  hscsL1HostSeq: number;
  hscsL1OuterSlotSeq: number;
  hscsL1InnerSlotSeq: number;
  hscsSidebarHostSeq: number;
  hscsSidebarSlotSeq: number;
  hscsL2HostSeq: number;
  hscsL2SlotSeq: number;
  hscsNestedPageHostSeq: number;
  hscsNestedPageSlotSeq: number;

  // Check #43 — Pairwise X+Z (HS + PPR deep)
  hspprL1ShellSeq: number;
  hspprL1HoleSeq: number;
  hspprSidebarShellSeq: number;
  hspprSidebarHoleSeq: number;
  hspprAShellSeq: number;
  hspprAStaticSuspSeq: number;
  hspprAHoleSeq: number;
  hspprBShellSeq: number;
  hspprBHoleSeq: number;
  hspprOptOutShellSeq: number;
  hspprL2ShellSeq: number;
  hspprL2HoleSeq: number;
  hspprNestedShellSeq: number;
  hspprNestedHoleSeq: number;

  // Checks #22, #44, #45, #46 — Triple Synergy X+Y+Z deep
  tsL1ShellSeq: number;
  tsLayoutShellSlotSeq: number;
  tsL1HoleSeq: number;
  tsPprAShellSeq: number;
  tsPageShellSlotSeq: number;
  tsPprATtlShellSlotSeq: number;
  tsPprAHoleHostSeq: number;
  tsHoleSlotSeq: number;
  tsHoleSlot2Seq: number;
  tsPprBShellSeq: number;
  tsPprBHoleSeq: number;
  tsStaticASeq: number;
  tsL2ShellSeq: number;
  tsNestedLayoutSlotSeq: number;
  tsL2HoleSeq: number;
  tsNestedPprShellSeq: number;
  tsNestedPprHoleHostSeq: number;
  tsNestedStaticHostSeq: number;

  // Stage 1 — Check #47: Alternating Static/Dynamic (S->D->S->S & S->D->S->D)
  hsAltL1Seq: number;
  hsAltDynL2Seq: number;
  hsAltStaticL3Seq: number;
  hsAltStaticPageSeq: number;
  hsAltDynPageSeq: number;

  // Stage 1 — Check #48: Static Layout Chain + Dynamic Page (S->S->D explicit & bailout)
  hsSdpL1Seq: number;
  hsSdpL2Seq: number;
  hsSdpStaticPageSeq: number;
  hsSdpDynExplicitSeq: number;
  hsSdpDynBailoutSeq: number;

  // Stage 1 — Check #49: Implicit Dynamic Bailout Layout + Static Page
  hsImpL1Seq: number;
  hsImpL2Seq: number;
  hsImpPageSeq: number;

  // Stage 1 — Check #50: Asymmetric Per-Level Layout ISR TTLs
  hsTtlAL1FastSeq: number;
  hsTtlAL2SlowSeq: number;
  hsTtlAPageSlowSeq: number;
  hsTtlBL1SlowSeq: number;
  hsTtlBL2FastSeq: number;
  hsTtlBPageSlowSeq: number;

  // Stage 2 — Check #51: 3-Level Nested <DinouCacheSlot> + Deep 1s TTL
  csDeepHostSeq: number;
  csDeepOuterSeq: number;
  csDeepMiddleSeq: number;
  csDeepInnerSeq: number;
  csDeepTtlOuterSeq: number;
  csDeepTtlMiddleSeq: number;
  csDeepTtlInnerSeq: number;

  // Stage 2 — Check #52: Shared <DinouCacheSlot> Across Routes & Layout+Page
  csSharedHostASeq: number;
  csSharedHostBSeq: number;
  csSharedSlotSeq: number;
  csSharedL1HostSeq: number;
  csSharedLpPageHostSeq: number;
  csSharedLpSlotSeq: number;

  // Stage 2 — Check #53: <DinouCacheSlot> Error Resilience
  csErrHostSeq: number;
  csFragileSeq: number;
  csHealthySeq: number;
  csFragileShouldThrow: boolean;

  // Stage 3 — Check #54: Concurrent 12-way Stampede During 1s PPR Shell TTL
  pprStampedeShellSeq: number;
  pprStampedeHoleSeq: number;

  // Stage 3 — Check #55: Error Isolation & redirect() Inside PPR Dynamic Hole
  pprEdgeShellSeq: number;
  pprEdgeHoleASeq: number;
  pprEdgeHoleBSeq: number;

  // Stage 4 — Check #56: X+Y Asymmetric (<DinouCacheSlot> inside dynamic L2)
  pairXyL1HostSeq: number;
  pairXyL1SlotSeq: number;
  pairXyDynL2HostSeq: number;
  pairXyDynL2SlotSeq: number;
  pairXyPageHostSeq: number;
  pairXyPageSlotSeq: number;

  // Stage 4 — Check #57: X+Z Asymmetric (L1 PPR -> L2 Dynamic -> Page PPR)
  pairXzL1ShellSeq: number;
  pairXzL1HoleSeq: number;
  pairXzDynL2Seq: number;
  pairXzPageShellSeq: number;
  pairXzPageStaticSuspSeq: number;
  pairXzPageHoleSeq: number;

  // Stage 4 — Check #58: X+Z Per-Level TTL (L1 PPR 1s -> L2 PPR 3600s -> Page PPR 3600s)
  pairXzTtlL1ShellSeq: number;
  pairXzTtlL1HoleSeq: number;
  pairXzTtlL2ShellSeq: number;
  pairXzTtlL2HoleSeq: number;
  pairXzTtlPageShellSeq: number;
  pairXzTtlPageHoleSeq: number;

  // Stage 4 — Check #59: Y+Z Deep (Nested <DinouCacheSlot> inside PPR dynamic hole)
  pairYzShellSeq: number;
  pairYzHoleHostSeq: number;
  pairYzHoleOuterSeq: number;
  pairYzHoleInnerSeq: number;
  pairYzHoleInnerTtlSeq: number;

  // Stage 5 — Check #60: Ultimate Asymmetric Triple Synergy (L1 PPR+Slot -> L2 Dyn+Slot -> L3 PPR+Slot -> Page PPR+Hole+Slot)
  taL1ShellSeq: number;
  taL1SlotSeq: number;
  taL1HoleSeq: number;
  taDynL2HostSeq: number;
  taDynL2SlotSeq: number;
  taL3ShellSeq: number;
  taL3SlotSeq: number;
  taL3HoleSeq: number;
  taPageShellSeq: number;
  taPageShellSlotSeq: number;
  taPageHoleHostSeq: number;
  taHoleSlotSeq: number;

  // Stage 5 — Check #61: Shared Multi-Layer Cache Tag (Layout + Page + Slot)
  tstL1ShellSeq: number;
  tstSharedSlotSeq: number;
  tstUnrelatedSlotSeq: number;
  tstPageShellSeq: number;
  tstPageHoleSeq: number;
  tstSiblingPageSeq: number;

  // Phase 3 — Stage 1 — Check #62: Dynamic [id] On-Demand ISG Under 3D Triple Synergy
  isgL1ShellSeq: number;
  isgL1SlotSeq: number;
  isgL1HoleSeq: number;
  isgAlphaL2ShellSeq: number;
  isgAlphaL2SlotSeq: number;
  isgAlphaL2HoleSeq: number;
  isgAlphaPageShellSeq: number;
  isgAlphaPageSlotSeq: number;
  isgAlphaPageHoleSeq: number;
  isgBetaL2ShellSeq: number;
  isgBetaL2SlotSeq: number;
  isgBetaL2HoleSeq: number;
  isgBetaPageShellSeq: number;
  isgBetaPageSlotSeq: number;
  isgBetaPageHoleSeq: number;

  // Phase 3 — Stage 3 — Check #64: Parallel Routes (@sidebar / @panel) in Asymmetric Chains (S -> D -> S)
  paL1ShellSeq: number;
  paL1SlotSeq: number;
  paL1HoleSeq: number;
  paSidebarShellSeq: number;
  paSidebarSlotSeq: number;
  paSidebarHoleSeq: number;
  paDynL2HostSeq: number;
  paDynPanelHostSeq: number;
  paDynPanelSlotSeq: number;
  paDynPageShellSeq: number;
  paDynPageSlotSeq: number;
  paDynPageHoleSeq: number;
  paAltL2ShellSeq: number;
  paAltPanelShellSeq: number;
  paAltPanelSlotSeq: number;
  paAltPanelHoleSeq: number;
  paAltPageShellSeq: number;
  paAltPageHoleSeq: number;

  // Phase 3 — Stage 4 — Check #65: Client Lifecycle Stress (refreshSlot -> no_layout / reset_layout -> Back / Forward)
  lcL1ShellSeq: number;
  lcL1SlotSeq: number;
  lcL1HoleSeq: number;
  lcPageShellSeq: number;
  lcPageSlotSeq: number;
  lcPageHoleSeq: number;
  lcNoLayoutShellSeq: number;
  lcNoLayoutSlotSeq: number;
  lcNoLayoutHoleSeq: number;
  lcResetLayoutShellSeq: number;
  lcResetLayoutSlotSeq: number;
  lcResetPageShellSeq: number;
  lcResetPageSlotSeq: number;

  // Phase 3 — Stage 5 — Check #66: 404 / not_found.tsx & res.status(404) / res.cookie() Inside PPR Dynamic Holes
  pprNfL1ShellSeq: number;
  pprNfL1SlotSeq: number;
  pprNfL1HoleSeq: number;
  pprNfPageShellSeq: number;
  pprNfHoleASeq: number;
  pprNfHoleBSeq: number;

  // Phase 4 — Stage 1 — Check #67: Sibling Route Groups (alpha)/(beta) & Optional Catch-All [[...slug]] ISG
  grpOuterShellSeq: number;
  grpOuterSlotSeq: number;
  grpOuterHoleSeq: number;
  grpAlphaShellSeq: number;
  grpAlphaSlotSeq: number;
  grpAlphaHoleSeq: number;
  grpAlphaPromoShellSeq: number;
  grpAlphaPromoHoleSeq: number;
  grpAlphaPromo2ShellSeq: number;
  grpAlphaPromo2HoleSeq: number;
  grpBetaShellSeq: number;
  grpBetaSlotSeq: number;
  grpBetaHoleSeq: number;
  grpBetaSettingsShellSeq: number;
  grpBetaSettingsHoleSeq: number;
  caOuterShellSeq: number;
  caOuterSlotSeq: number;
  caOuterHoleSeq: number;
  caRootLayoutShellSeq: number;
  caRootLayoutSlotSeq: number;
  caRootLayoutHoleSeq: number;
  caRootPageShellSeq: number;
  caRootPageHoleSeq: number;
  caDocsLayoutShellSeq: number;
  caDocsLayoutSlotSeq: number;
  caDocsLayoutHoleSeq: number;
  caDocsPageShellSeq: number;
  caDocsPageHoleSeq: number;
  caDocsV2LayoutShellSeq: number;
  caDocsV2LayoutSlotSeq: number;
  caDocsV2LayoutHoleSeq: number;
  caDocsV2PageShellSeq: number;
  caDocsV2PageHoleSeq: number;

  // Phase 4 — Stage 3 — Check #69: Server Functions ("use server", <form action>, useActionState, Bound Closures) Inside <DinouCacheSlot> & PPR
  sfL1ShellSeq: number;
  sfL1SlotSeq: number;
  sfPageShellSeq: number;
  sfPageSlotSeq: number;
  sfHoleSeq: number;
  sfActionNote: string;
  sfRedirectNote: string;

  // Phase 4 — Stage 5 — Check #71: Same-Pathname Query Transitions + router.refresh() / router.refresh({ layout: true })
  qpL1ShellSeq: number;
  qpL1SlotSeq: number;
  qpL1HoleSeq: number;
  qpPageShellSeq: number;
  qpPageSlotSeq: number;
  qpPageHoleSeq: number;
  qpAsymL2HostSeq: number;
  qpAsymL2SlotSeq: number;
  qpAsymPageShellSeq: number;
  qpAsymPageSlotSeq: number;
  qpAsymPageHoleSeq: number;

  // Phase 4 — Stage 6 — Check #72: Staggered Slow/Fast PPR Streaming Holes + Mid-Flight Abort & Concurrent refreshSlot
  stagL1ShellSeq: number;
  stagShellSeq: number;
  stagShellSlotSeq: number;
  stagHoleASeq: number;
  stagHoleBSeq: number;
  stagSlowSlotSeq: number;
  stagHubSeq: number;

  // Phase 5 — Stage 3 — Check #75: Perimeter Guard Contracts (validateParams, allowISG=false, getProps redirect & 404)
  guardsL1ShellSeq: number;
  guardsL1SlotSeq: number;
  guardsL1HoleSeq: number;
  guardsItemL2ShellSeq: number;
  guardsItemPageShellSeq: number;
  guardsItemHoleSeq: number;
  guardsStrictShellSeq: number;
  guardsStrictHoleSeq: number;
  guardsLandedShellSeq: number;
  guardsLandedHoleSeq: number;
}

export const DEFAULT_CUBE_3D_STATE: Cube3DState = {
  hsL1LayoutSeq: 100,
  hsIndexPageSeq: 100,
  hsAsymDynLayoutSeq: 100,
  hsAsymStaticPageSeq: 100,

  csNestedOuterSeq: 100,
  csNestedInnerSeq: 100,
  csFastSeq: 100,
  csAlphaSeq: 100,

  pprRigShellSeq: 100,
  pprRigStaticSuspenseSeq: 100,
  pprOuterStaticVal: 100,
  pprHoleCookieSeq: 100,
  pprHoleQuerySeq: 100,
  pprHoleClientSeq: 100,
  pprHoleInnerInStaticSeq: 100,
  pprHoleOuterDynSeq: 100,
  pprHoleDeepInnerSeq: 100,
  pprHoleMemoSeq: 100,
  pprTtlShellSeq: 100,
  pprTtlHoleSeq: 100,

  pprMixedL1Seq: 100,
  pprMixedL2ShellSeq: 100,
  pprMixedL2HoleSeq: 100,
  pprMixedStaticPageSeq: 100,
  pprMixedLeafShellSeq: 100,
  pprMixedLeafHoleSeq: 100,
  pprInhLayoutSeq: 100,
  pprInhShellSeq: 100,
  pprInhHoleSeq: 100,
  pprInhOptOutSeq: 100,

  synShellSeq: 100,
  synShellSlotSeq: 100,
  synShellTtlSlotSeq: 100,
  synStaticSuspenseHostSeq: 100,
  synStaticSuspenseSlotSeq: 100,
  synHoleNoCacheSlotSeq: 100,
  synHoleSlotASeq: 100,
  synHoleTtlSlotSeq: 100,
  synHole3HostSeq: 100,
  synClientSlotSeq: 100,

  hscsL1HostSeq: 100,
  hscsL1OuterSlotSeq: 100,
  hscsL1InnerSlotSeq: 100,
  hscsSidebarHostSeq: 100,
  hscsSidebarSlotSeq: 100,
  hscsL2HostSeq: 100,
  hscsL2SlotSeq: 100,
  hscsNestedPageHostSeq: 100,
  hscsNestedPageSlotSeq: 100,

  hspprL1ShellSeq: 100,
  hspprL1HoleSeq: 100,
  hspprSidebarShellSeq: 100,
  hspprSidebarHoleSeq: 100,
  hspprAShellSeq: 100,
  hspprAStaticSuspSeq: 100,
  hspprAHoleSeq: 100,
  hspprBShellSeq: 100,
  hspprBHoleSeq: 100,
  hspprOptOutShellSeq: 100,
  hspprL2ShellSeq: 100,
  hspprL2HoleSeq: 100,
  hspprNestedShellSeq: 100,
  hspprNestedHoleSeq: 100,

  tsL1ShellSeq: 100,
  tsLayoutShellSlotSeq: 100,
  tsL1HoleSeq: 100,
  tsPprAShellSeq: 100,
  tsPageShellSlotSeq: 100,
  tsPprATtlShellSlotSeq: 100,
  tsPprAHoleHostSeq: 100,
  tsHoleSlotSeq: 100,
  tsHoleSlot2Seq: 100,
  tsPprBShellSeq: 100,
  tsPprBHoleSeq: 100,
  tsStaticASeq: 100,
  tsL2ShellSeq: 100,
  tsNestedLayoutSlotSeq: 100,
  tsL2HoleSeq: 100,
  tsNestedPprShellSeq: 100,
  tsNestedPprHoleHostSeq: 100,
  tsNestedStaticHostSeq: 100,

  hsAltL1Seq: 100,
  hsAltDynL2Seq: 100,
  hsAltStaticL3Seq: 100,
  hsAltStaticPageSeq: 100,
  hsAltDynPageSeq: 100,

  hsSdpL1Seq: 100,
  hsSdpL2Seq: 100,
  hsSdpStaticPageSeq: 100,
  hsSdpDynExplicitSeq: 100,
  hsSdpDynBailoutSeq: 100,

  hsImpL1Seq: 100,
  hsImpL2Seq: 100,
  hsImpPageSeq: 100,

  hsTtlAL1FastSeq: 100,
  hsTtlAL2SlowSeq: 100,
  hsTtlAPageSlowSeq: 100,
  hsTtlBL1SlowSeq: 100,
  hsTtlBL2FastSeq: 100,
  hsTtlBPageSlowSeq: 100,

  csDeepHostSeq: 100,
  csDeepOuterSeq: 100,
  csDeepMiddleSeq: 100,
  csDeepInnerSeq: 100,
  csDeepTtlOuterSeq: 100,
  csDeepTtlMiddleSeq: 100,
  csDeepTtlInnerSeq: 100,

  csSharedHostASeq: 100,
  csSharedHostBSeq: 100,
  csSharedSlotSeq: 100,
  csSharedL1HostSeq: 100,
  csSharedLpPageHostSeq: 100,
  csSharedLpSlotSeq: 100,

  csErrHostSeq: 100,
  csFragileSeq: 100,
  csHealthySeq: 100,
  csFragileShouldThrow: false,

  pprStampedeShellSeq: 100,
  pprStampedeHoleSeq: 100,

  pprEdgeShellSeq: 100,
  pprEdgeHoleASeq: 100,
  pprEdgeHoleBSeq: 100,

  pairXyL1HostSeq: 100,
  pairXyL1SlotSeq: 100,
  pairXyDynL2HostSeq: 100,
  pairXyDynL2SlotSeq: 100,
  pairXyPageHostSeq: 100,
  pairXyPageSlotSeq: 100,

  pairXzL1ShellSeq: 100,
  pairXzL1HoleSeq: 100,
  pairXzDynL2Seq: 100,
  pairXzPageShellSeq: 100,
  pairXzPageStaticSuspSeq: 100,
  pairXzPageHoleSeq: 100,

  pairXzTtlL1ShellSeq: 100,
  pairXzTtlL1HoleSeq: 100,
  pairXzTtlL2ShellSeq: 100,
  pairXzTtlL2HoleSeq: 100,
  pairXzTtlPageShellSeq: 100,
  pairXzTtlPageHoleSeq: 100,

  pairYzShellSeq: 100,
  pairYzHoleHostSeq: 100,
  pairYzHoleOuterSeq: 100,
  pairYzHoleInnerSeq: 100,
  pairYzHoleInnerTtlSeq: 100,

  taL1ShellSeq: 100,
  taL1SlotSeq: 100,
  taL1HoleSeq: 100,
  taDynL2HostSeq: 100,
  taDynL2SlotSeq: 100,
  taL3ShellSeq: 100,
  taL3SlotSeq: 100,
  taL3HoleSeq: 100,
  taPageShellSeq: 100,
  taPageShellSlotSeq: 100,
  taPageHoleHostSeq: 100,
  taHoleSlotSeq: 100,

  tstL1ShellSeq: 100,
  tstSharedSlotSeq: 100,
  tstUnrelatedSlotSeq: 100,
  tstPageShellSeq: 100,
  tstPageHoleSeq: 100,
  tstSiblingPageSeq: 100,

  isgL1ShellSeq: 100,
  isgL1SlotSeq: 100,
  isgL1HoleSeq: 100,
  isgAlphaL2ShellSeq: 100,
  isgAlphaL2SlotSeq: 100,
  isgAlphaL2HoleSeq: 100,
  isgAlphaPageShellSeq: 100,
  isgAlphaPageSlotSeq: 100,
  isgAlphaPageHoleSeq: 100,
  isgBetaL2ShellSeq: 100,
  isgBetaL2SlotSeq: 100,
  isgBetaL2HoleSeq: 100,
  isgBetaPageShellSeq: 100,
  isgBetaPageSlotSeq: 100,
  isgBetaPageHoleSeq: 100,

  paL1ShellSeq: 100,
  paL1SlotSeq: 100,
  paL1HoleSeq: 100,
  paSidebarShellSeq: 100,
  paSidebarSlotSeq: 100,
  paSidebarHoleSeq: 100,
  paDynL2HostSeq: 100,
  paDynPanelHostSeq: 100,
  paDynPanelSlotSeq: 100,
  paDynPageShellSeq: 100,
  paDynPageSlotSeq: 100,
  paDynPageHoleSeq: 100,
  paAltL2ShellSeq: 100,
  paAltPanelShellSeq: 100,
  paAltPanelSlotSeq: 100,
  paAltPanelHoleSeq: 100,
  paAltPageShellSeq: 100,
  paAltPageHoleSeq: 100,

  lcL1ShellSeq: 100,
  lcL1SlotSeq: 100,
  lcL1HoleSeq: 100,
  lcPageShellSeq: 100,
  lcPageSlotSeq: 100,
  lcPageHoleSeq: 100,
  lcNoLayoutShellSeq: 100,
  lcNoLayoutSlotSeq: 100,
  lcNoLayoutHoleSeq: 100,
  lcResetLayoutShellSeq: 100,
  lcResetLayoutSlotSeq: 100,
  lcResetPageShellSeq: 100,
  lcResetPageSlotSeq: 100,

  pprNfL1ShellSeq: 100,
  pprNfL1SlotSeq: 100,
  pprNfL1HoleSeq: 100,
  pprNfPageShellSeq: 100,
  pprNfHoleASeq: 100,
  pprNfHoleBSeq: 100,

  grpOuterShellSeq: 100,
  grpOuterSlotSeq: 100,
  grpOuterHoleSeq: 100,
  grpAlphaShellSeq: 100,
  grpAlphaSlotSeq: 100,
  grpAlphaHoleSeq: 100,
  grpAlphaPromoShellSeq: 100,
  grpAlphaPromoHoleSeq: 100,
  grpAlphaPromo2ShellSeq: 100,
  grpAlphaPromo2HoleSeq: 100,
  grpBetaShellSeq: 100,
  grpBetaSlotSeq: 100,
  grpBetaHoleSeq: 100,
  grpBetaSettingsShellSeq: 100,
  grpBetaSettingsHoleSeq: 100,
  caOuterShellSeq: 100,
  caOuterSlotSeq: 100,
  caOuterHoleSeq: 100,
  caRootLayoutShellSeq: 100,
  caRootLayoutSlotSeq: 100,
  caRootLayoutHoleSeq: 100,
  caRootPageShellSeq: 100,
  caRootPageHoleSeq: 100,
  caDocsLayoutShellSeq: 100,
  caDocsLayoutSlotSeq: 100,
  caDocsLayoutHoleSeq: 100,
  caDocsPageShellSeq: 100,
  caDocsPageHoleSeq: 100,
  caDocsV2LayoutShellSeq: 100,
  caDocsV2LayoutSlotSeq: 100,
  caDocsV2LayoutHoleSeq: 100,
  caDocsV2PageShellSeq: 100,
  caDocsV2PageHoleSeq: 100,

  sfL1ShellSeq: 100,
  sfL1SlotSeq: 100,
  sfPageShellSeq: 100,
  sfPageSlotSeq: 100,
  sfHoleSeq: 100,
  sfActionNote: "init",
  sfRedirectNote: "none",

  qpL1ShellSeq: 100,
  qpL1SlotSeq: 100,
  qpL1HoleSeq: 100,
  qpPageShellSeq: 100,
  qpPageSlotSeq: 100,
  qpPageHoleSeq: 100,
  qpAsymL2HostSeq: 100,
  qpAsymL2SlotSeq: 100,
  qpAsymPageShellSeq: 100,
  qpAsymPageSlotSeq: 100,
  qpAsymPageHoleSeq: 100,

  stagL1ShellSeq: 100,
  stagShellSeq: 100,
  stagShellSlotSeq: 100,
  stagHoleASeq: 100,
  stagHoleBSeq: 100,
  stagSlowSlotSeq: 100,
  stagHubSeq: 100,

  guardsL1ShellSeq: 100,
  guardsL1SlotSeq: 100,
  guardsL1HoleSeq: 100,
  guardsItemL2ShellSeq: 100,
  guardsItemPageShellSeq: 100,
  guardsItemHoleSeq: 100,
  guardsStrictShellSeq: 100,
  guardsStrictHoleSeq: 100,
  guardsLandedShellSeq: 100,
  guardsLandedHoleSeq: 100,
};

function getNodeFsAndPath(): { fs: any; stateFile: string } | null {
  try {
    const proc = typeof process !== "undefined" ? (process as any) : null;
    if (
      proc &&
      typeof proc.getBuiltinModule === "function" &&
      typeof proc.cwd === "function"
    ) {
      const fs = proc.getBuiltinModule("node:fs");
      const path = proc.getBuiltinModule("node:path");
      if (fs && path) {
        return {
          fs,
          stateFile: path.resolve(proc.cwd(), ".dinou/cube-3d-state.json"),
        };
      }
    }
  } catch {}
  return null;
}

export function readCubeState(): Cube3DState {
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      if (nodeEnv.fs.existsSync(nodeEnv.stateFile)) {
        const raw = JSON.parse(nodeEnv.fs.readFileSync(nodeEnv.stateFile, "utf8"));
        const merged = { ...DEFAULT_CUBE_3D_STATE, ...raw };
        (globalThis as any)[STATE_KEY] = merged;
        return merged;
      }
    } catch {}
  }
  const mem = (globalThis as any)[STATE_KEY];
  if (mem && typeof mem === "object") {
    return { ...DEFAULT_CUBE_3D_STATE, ...mem };
  }
  return { ...DEFAULT_CUBE_3D_STATE };
}

export function writeCubeState(patch: Partial<Cube3DState>): Cube3DState {
  const current = readCubeState();
  const next = { ...current, ...patch };
  (globalThis as any)[STATE_KEY] = next;
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      const pathMod = (process as any).getBuiltinModule("node:path");
      nodeEnv.fs.mkdirSync(pathMod.dirname(nodeEnv.stateFile), { recursive: true });
      nodeEnv.fs.writeFileSync(
        nodeEnv.stateFile,
        JSON.stringify(next, null, 2),
        "utf8"
      );
    } catch {}
  }
  return next;
}

export function resetCubeState(): Cube3DState {
  const next = { ...DEFAULT_CUBE_3D_STATE };
  (globalThis as any)[STATE_KEY] = next;
  const nodeEnv = getNodeFsAndPath();
  if (nodeEnv) {
    try {
      const pathMod = (process as any).getBuiltinModule("node:path");
      nodeEnv.fs.mkdirSync(pathMod.dirname(nodeEnv.stateFile), { recursive: true });
      nodeEnv.fs.writeFileSync(
        nodeEnv.stateFile,
        JSON.stringify(next, null, 2),
        "utf8"
      );
    } catch {}
  }
  return next;
}

export const cubeSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

const STAMPEDE_EXEC_KEY = Symbol.for("dinou.e2e.3d.cube.stampede.shell.execs");

export function incrementStampedeShellExecs(): number {
  const next = Number((globalThis as any)[STAMPEDE_EXEC_KEY] || 0) + 1;
  (globalThis as any)[STAMPEDE_EXEC_KEY] = next;
  return next;
}

export function getStampedeShellExecs(): number {
  return Number((globalThis as any)[STAMPEDE_EXEC_KEY] || 0);
}

export function resetStampedeShellExecs(): number {
  (globalThis as any)[STAMPEDE_EXEC_KEY] = 0;
  return 0;
}
