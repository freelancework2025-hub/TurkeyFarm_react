import AppSidebar from "./AppSidebar";
import VaccinationAlertsBanner from "@/components/alerts/VaccinationAlertsBanner";
import PriceAlertIcon from "@/components/alerts/PriceAlertIcon";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen">
      <AppSidebar />
      <main className="flex-1 min-w-0 lg:ml-0 overflow-auto relative">
        <VaccinationAlertsBanner />
        {/* Price Alert Icon - positioned next to vaccination bell */}
        <div className="fixed top-3 right-16 sm:top-4 sm:right-20 md:right-24 z-50">
          <PriceAlertIcon />
        </div>
        <div className="w-full max-w-[1800px] mx-auto py-6 lg:py-8 pl-16 pr-6 sm:pl-20 sm:pr-8 lg:px-12 xl:px-16 space-y-4">
          {children}
        </div>
      </main>
    </div>
  );
}
