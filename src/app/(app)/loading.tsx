export default function AppLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-ink-soft">
      <span className="inline-flex items-center gap-2 text-sm">
        <span
          aria-hidden
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
        Carregando…
      </span>
    </div>
  );
}
