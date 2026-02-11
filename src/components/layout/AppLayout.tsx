import AppSidebar from "./AppSidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 lg:ml-0 overflow-auto">
        <div className="w-full max-w-[1800px] mx-auto py-6 lg:py-8 px-6 sm:px-8 lg:px-12 xl:px-16">
          {children}
        </div>
      </main>
    </div>
  );
}
