type Props = {
  title: string;
  hint?: string;
};

export function PlaceholderPage({ title, hint }: Props) {
  return (
    <main>
      <h1 className="mb-3 text-3xl font-semibold">{title}</h1>
      <div className="rounded-2xl bg-white p-6 shadow">
        <p className="text-slate-600">{hint ?? "Раздел в работе"}</p>
      </div>
    </main>
  );
}
