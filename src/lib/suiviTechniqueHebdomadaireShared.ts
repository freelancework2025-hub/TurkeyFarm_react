/**
 * Shared column labels for Suivi technique hebdomadaire (table + Excel/PDF export).
 * Used by WeeklyTrackingTable and suiviTechniqueBatimentExport.
 */

/** Flat data columns — same order as export (section 3 suivi hebdomadaire). */
export const SUIVI_HEBDO_EXPORT_HEADERS = [
  "DATE",
  "ÂGE EN J",
  "MORT. NBRE",
  "MORT. %",
  "MORT. CUMUL",
  "MORT. % CUMUL",
  "CONSO. EAU (L)",
  "T° MIN",
  "T° MAX",
  "VACCINATION",
  "TRAITEMENT",
  "OBSERVATION",
] as const;

export type SuiviHebdoExportHeaderKey = (typeof SUIVI_HEBDO_EXPORT_HEADERS)[number];

export const SUIVI_HEBDO_DATA_COLUMN_COUNT = SUIVI_HEBDO_EXPORT_HEADERS.length;

/** Optional thead tooltips (export column keys). */
export const SUIVI_HEBDO_HEADER_TITLE: Partial<Record<SuiviHebdoExportHeaderKey, string>> = {
  "CONSO. EAU (L)": "Consommation eau du jour (litres)",
};

/** Second header row labels, aligned with SUIVI_HEBDO_EXPORT_HEADERS. */
export const SUIVI_HEBDO_SUBHEADER_LABEL: Record<SuiviHebdoExportHeaderKey, string> = {
  DATE: "",
  "ÂGE EN J": "",
  "MORT. NBRE": "NBRE",
  "MORT. %": "%",
  "MORT. CUMUL": "CUMUL",
  "MORT. % CUMUL": "%",
  "CONSO. EAU (L)": "",
  "T° MIN": "MIN",
  "T° MAX": "MAX",
  VACCINATION: "VACCINATION",
  TRAITEMENT: "TRAITEMENT",
  OBSERVATION: "",
};

export const SUIVI_HEBDO_SUBHEADER_TH_CLASS: Record<SuiviHebdoExportHeaderKey, string> = {
  DATE: "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border",
  "ÂGE EN J": "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border",
  "MORT. NBRE": "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border min-w-[72px]",
  "MORT. %": "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border min-w-[56px]",
  "MORT. CUMUL": "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border min-w-[56px]",
  "MORT. % CUMUL": "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border min-w-[56px]",
  "CONSO. EAU (L)": "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border",
  "T° MIN": "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border w-12",
  "T° MAX": "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border w-12",
  VACCINATION: "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border",
  TRAITEMENT: "px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border",
  OBSERVATION: "px-1 py-1 border-r border-border",
};

/** Top grouped header row (spans match 12 data columns). */
export const SUIVI_HEBDO_PRIMARY_HEADER_GROUPS = [
  {
    label: "DATE",
    colSpan: 1,
    className:
      "px-1.5 py-2 text-left font-semibold text-foreground border-r border-border w-[100px]",
  },
  {
    label: "ÂGE EN J",
    colSpan: 1,
    className:
      "px-1.5 py-2 text-left font-semibold text-foreground border-r border-border w-[70px]",
  },
  {
    label: "MORTALITÉ",
    colSpan: 4,
    className:
      "px-1.5 py-2 text-center font-semibold text-foreground border-r border-border min-w-[220px]",
  },
  {
    label: "CONSO. EAU (L)",
    colSpan: 1,
    className:
      "px-1.5 py-2 text-center font-semibold text-foreground border-r border-border min-w-[84px]",
  },
  {
    label: "T°",
    colSpan: 2,
    className:
      "px-1.5 py-2 text-center font-semibold text-foreground border-r border-border w-[96px]",
  },
  {
    label: "INTERVENTION",
    colSpan: 2,
    className:
      "px-1.5 py-2 text-center font-semibold text-foreground border-r border-border",
  },
  {
    label: "OBSERVATION",
    colSpan: 1,
    className:
      "px-1.5 py-2 text-left font-semibold text-foreground border-r border-border",
  },
] as const;

/** Colspan for « MORTALITE DU TRANSPORT » label cell (DATE + ÂGE EN J + start of mortalité block). */
export function suiviHebdoTransportRowLabelColSpan(): number {
  return 4;
}
