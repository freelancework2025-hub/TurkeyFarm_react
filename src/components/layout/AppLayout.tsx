import AppSidebar from "./AppSidebar";
import VaccinationAlertsBanner from "@/components/alerts/VaccinationAlertsBanner";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 lg:ml-0 overflow-auto relative">
        <VaccinationAlertsBanner />
        <div className="w-full max-w-[1800px] mx-auto py-6 lg:py-8 pl-16 pr-6 sm:pl-20 sm:pr-8 lg:px-12 xl:px-16 space-y-4">
          {children}
        </div>
      </main>
    </div>
  );
}
