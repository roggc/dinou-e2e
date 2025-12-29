"use client";

import { Link } from "dinou";

export default function Page() {
  return (
    <div>
      <Link href="/t-spa-hash/t-layout-client-component/t-client-component/t-target-client-component/target#pepe-section">
        go to pepe section on target page
      </Link>
      <Link href="#pepe-section" data-testid="hash-link">
        go to pepe section
      </Link>
      <div className="whitespace-pre">{`asdfiojasdf 
    asdf asdf 
    asdf
     asd
     f as
     df 
     asd
     f 
     asdf
      asd
      f 
      asd
      f 
      asdf
       as
       df 
       asd
       f 
       asd
       f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as     f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df      f 
       asdf
        a
        sdf 
        asd
        f 
        asdf
         a
         sdf 
         as
         df 
         df 
         asd
         f `}</div>
      <div id="pepe-section">aha!</div>
    </div>
  );
}
