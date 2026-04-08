export function SimplePage({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="container-shell py-12 sm:py-16">
      <section className="panel max-w-3xl p-8">
        <h1 className="heading-display text-4xl font-bold">{title}</h1>
        <p className="mt-5 text-base leading-8 text-[var(--color-muted)]">{text}</p>
      </section>
    </div>
  );
}
