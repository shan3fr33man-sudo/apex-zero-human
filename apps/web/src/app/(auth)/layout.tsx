export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-apex-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-mono text-2xl font-bold text-apex-accent tracking-wider">
            APEX
          </h1>
          <p className="text-apex-muted text-sm mt-1 font-sans">
            Autonomous Company Builder
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
