export default function HttpHeadDynPage({ dynSeq }: { dynSeq?: number }) {
  return (
    <section id="hh-dyn-page">
      <span id="hh-dyn-seq">{dynSeq ?? 0}</span>
    </section>
  );
}
