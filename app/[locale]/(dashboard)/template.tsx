// Re-mounted on every navigation, so each page eases in instead of appearing at once.
export default function DashboardTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-out motion-reduce:animate-none">
      {children}
    </div>
  );
}
