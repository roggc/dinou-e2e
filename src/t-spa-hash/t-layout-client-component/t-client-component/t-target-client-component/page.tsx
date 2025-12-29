"use client";

export default function Page() {
  return (
    <div>
      <a href="/t-spa-hash/t-layout-client-component/t-client-component/t-target-client-component/target#pepe-section">
        go to pepe section on target page
      </a>
      <a href="#pepe-section">go to pepe section</a>
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
         as
         df 
         asd
         f `}</div>
      <div id="pepe-section">aha!</div>
    </div>
  );
}
