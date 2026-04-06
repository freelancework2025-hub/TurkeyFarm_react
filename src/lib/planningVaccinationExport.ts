/**
 * Export utilities for Planning de vaccination.
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

export interface VaccinationRowExport {
  age: string;
  date: string;
  motif: string;
  vaccinTraitement: string;
  quantite: string;
  administration: string;
  remarques: string;
}

export interface PlanningNoteExport {
  label: string;
  content: string;
  selected: boolean;
}

export interface PlanningVaccinationExportParams {
  farmName: string;
  lot: string;
  dateMiseEnPlace: string | null;
  rows: VaccinationRowExport[];
  notes: PlanningNoteExport[];
}

const HEADER_PRIMARY = "FF3D2E1A";
const HEADER_TEXT = "FFF7F6F3";
const ROW_ALT = "FFE8E6E1";
const BORDER_THIN = { style: "thin" as const };
const BORDERS_ALL = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

function safeFileName(parts: string[]): string {
  return parts.join("_").replace(/[^\w\-_]/g, "_");
}

export async function exportToExcel(params: PlanningVaccinationExportParams): Promise<void> {
  const { farmName, lot, dateMiseEnPlace, rows, notes } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  let currentRow = 1;

  const addTitle = (ws: ExcelJS.Worksheet, text: string) => {
    ws.mergeCells(currentRow, 1, currentRow, 7);
    const cell = ws.getCell(currentRow, 1);
    cell.value = text;
    cell.font = { size: 14, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
    currentRow += 2;
  };

  const addInfoBlock = (ws: ExcelJS.Worksheet, infoRows: [string, string | number][]) => {
    for (const [label, value] of infoRows) {
      ws.getCell(currentRow, 1).value = label;
      ws.getCell(currentRow, 2).value = value;
      for (let c = 1; c <= 2; c++) {
        ws.getCell(currentRow, c).border = BORDERS_ALL;
        ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1E0DB" } };
      }
      currentRow++;
    }
    currentRow++;
  };

  const ws = workbook.addWorksheet("Planning vaccination", {
    views: [{ state: "frozen", ySplit: 6, activeCell: "A7", showGridLines: true }],
  });
  ws.columns = [
    { width: 16 }, // Age / Note
    { width: 45 }, // Date / Contenu (wider for note content)
    { width: 18 }, // Motif / Sélectionné
    { width: 24 }, // Vaccin / Traitement
    { width: 12 }, // Quantité
    { width: 18 }, // Administration
    { width: 28 }, // Remarques
  ];

  addTitle(ws, "PLANNING DE VACCINATION");
  addInfoBlock(ws, [
    ["Ferme", farmName || "—"],
    ["Lot", lot || "—"],
    ["Date mise en place", dateMiseEnPlace || "—"],
  ]);

  addTitle(ws, "1. Planning — Vaccination / Traitement");
  const planHeaders = ["Age", "Date", "Motif", "Vaccin / Traitement", "Quantité", "Administration", "Remarques"];
  for (let c = 0; c < planHeaders.length; c++) {
    const cell = ws.getCell(currentRow, c + 1);
    cell.value = planHeaders[c];
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
  }
  currentRow++;
  let planIdx = 0;
  for (const r of rows) {
    ws.getCell(currentRow, 1).value = r.age || "—";
    ws.getCell(currentRow, 2).value = r.date || "—";
    ws.getCell(currentRow, 3).value = r.motif || "—";
    ws.getCell(currentRow, 4).value = r.vaccinTraitement || "—";
    ws.getCell(currentRow, 5).value = r.quantite || "—";
    ws.getCell(currentRow, 6).value = r.administration || "—";
    ws.getCell(currentRow, 7).value = r.remarques || "—";
    for (let c = 1; c <= 7; c++) {
      ws.getCell(currentRow, c).border = BORDERS_ALL;
      if (planIdx % 2 === 1) ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
    }
    currentRow++;
    planIdx++;
  }
  currentRow += 2;

  addTitle(ws, "2. Notes");
  const noteHeaders = ["Note", "Contenu", "Sélectionné"];
  for (let c = 0; c < noteHeaders.length; c++) {
    const cell = ws.getCell(currentRow, c + 1);
    cell.value = noteHeaders[c];
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
  }
  currentRow++;
  let noteIdx = 0;
  for (const n of notes) {
    ws.getCell(currentRow, 1).value = n.label || "—";
    ws.getCell(currentRow, 2).value = n.content || "—";
    ws.getCell(currentRow, 3).value = n.selected ? "Oui" : "Non";
    for (let c = 1; c <= 3; c++) {
      ws.getCell(currentRow, c).border = BORDERS_ALL;
      if (noteIdx % 2 === 1) ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
    }
    currentRow++;
    noteIdx++;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Planning_Vaccination_${safeFileName([farmName, `Lot${lot}`])}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf(params: PlanningVaccinationExportParams): void {
  const { farmName, lot, dateMiseEnPlace, rows, notes } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 210;

  const lastY = () => (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? margin;

  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("PLANNING DE VACCINATION", margin, 12);

  doc.setFillColor(225, 224, 219);
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  let y = 24;
  doc.text(`Ferme: ${farmName || "—"}  |  Lot: ${lot || "—"}  |  Date mise en place: ${dateMiseEnPlace || "—"}`, margin, y);
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("1. Planning — Vaccination / Traitement", margin, y);
  y += 6;

  const planHeaders = ["Age", "Date", "Motif", "Vaccin / Traitement", "Quantité", "Administration", "Remarques"];
  const planBody = rows.map((r) => [
    r.age || "—",
    r.date || "—",
    r.motif || "—",
    r.vaccinTraitement || "—",
    r.quantite || "—",
    r.administration || "—",
    r.remarques || "—",
  ]);

  autoTable(doc, {
    head: [planHeaders],
    body: planBody.map((row) => row.map(String)),
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 7 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  });
  y = lastY() + 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("2. Notes", margin, y);
  y += 6;

  const noteHeaders = ["Note", "Contenu", "Sélectionné"];
  const noteBody = notes.map((n) => [n.label || "—", n.content || "—", n.selected ? "Oui" : "Non"]);

  autoTable(doc, {
    head: [noteHeaders],
    body: noteBody.map((row) => row.map(String)),
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 8 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  });

  doc.save(`Planning_Vaccination_${safeFileName([farmName, `Lot${lot}`])}.pdf`);
}
