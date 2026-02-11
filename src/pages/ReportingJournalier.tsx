import AppLayout from "@/components/layout/AppLayout";
import EffectifMisEnPlace from "@/components/reporting/EffectifMisEnPlace";
import DailyReportTable from "@/components/reporting/DailyReportTable";

export default function ReportingJournalier() {
  return (
    <AppLayout>
      <div className="page-header">
        <h1>Reporting Journalier</h1>
        <p>Suivi quotidien de l'élevage — Effectif initial et rapport journalier</p>
      </div>

      <div className="space-y-8">
        <EffectifMisEnPlace />
        <DailyReportTable />
      </div>
    </AppLayout>
  );
}
