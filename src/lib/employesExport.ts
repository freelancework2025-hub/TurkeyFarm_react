/**
 * Export utilities for Liste des employés.
 */

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { EmployerResponse } from "@/lib/api";

export interface EmployesExportParams {
  employers: EmployerResponse[];
}

const HEADER_PRIMARY = "FF3D2E1A";
const HEADER_TEXT = "FFF7F6F3";
const ROW_ALT = "FFE8E6E1";
const BORDER_THIN = { style: "thin" as const };
const BORDERS_ALL = { top: BORDER_THIN, left: BORDER_THIN, bottom: BORDER_THIN, right: BORDER_THIN };

function safeFileName(parts: string[]): string {
  return parts.join("_").replace(/[^\w\-_]/g, "_");
}

function formatSalaire(s: number | null | undefined): string {
  if (s == null || Number.isNaN(s)) return "—";
  return Number(s).toFixed(2).replace(".", ",");
}

export async function exportToExcel(params: EmployesExportParams): Promise<void> {
  const { employers } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "ElevagePro";
  let currentRow = 1;

  const addTitle = (ws: ExcelJS.Worksheet, text: string) => {
    ws.mergeCells(currentRow, 1, currentRow, 4);
    const cell = ws.getCell(currentRow, 1);
    cell.value = text;
    cell.font = { size: 14, bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
    currentRow += 2;
  };

  const addInfoBlock = (ws: ExcelJS.Worksheet, rows: [string, string | number][]) => {
    for (const [label, value] of rows) {
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

  const ws = workbook.addWorksheet("Employés", {
    views: [{ state: "frozen", ySplit: 8, activeCell: "A9", showGridLines: true }],
  });
  ws.columns = [
    { width: 18 }, // N° Employé
    { width: 24 }, // Nom
    { width: 24 }, // Prénom
    { width: 14 }, // Salaire
  ];

  addTitle(ws, "LISTE DES EMPLOYÉS");
  addInfoBlock(ws, [["Nombre d'employés", employers.length]]);

  addTitle(ws, "Employés");
  const headers = ["N° Employé", "Nom", "Prénom", "Salaire"];
  for (let c = 0; c < headers.length; c++) {
    const cell = ws.getCell(currentRow, c + 1);
    cell.value = headers[c];
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_PRIMARY } };
    cell.border = BORDERS_ALL;
  }
  currentRow++;

  let idx = 0;
  for (const e of employers) {
    ws.getCell(currentRow, 1).value = e.numeroEmploye ?? "—";
    ws.getCell(currentRow, 2).value = e.nom ?? "—";
    ws.getCell(currentRow, 3).value = e.prenom ?? "—";
    ws.getCell(currentRow, 4).value = formatSalaire(e.salaire);
    for (let c = 1; c <= 4; c++) {
      ws.getCell(currentRow, c).border = BORDERS_ALL;
      if (idx % 2 === 1) ws.getCell(currentRow, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT } };
    }
    currentRow++;
    idx++;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Employes_${safeFileName([new Date().toISOString().slice(0, 10)])}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToPdf(params: EmployesExportParams): void {
  const { employers } = params;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margin = 12;
  const pageWidth = (doc as { internal?: { pageSize?: { width: number } } }).internal?.pageSize?.width ?? 210;

  doc.setFillColor(61, 46, 26);
  doc.rect(0, 0, pageWidth, 18, "F");
  doc.setTextColor(247, 246, 243);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("LISTE DES EMPLOYÉS", margin, 12);

  doc.setFillColor(225, 224, 219);
  doc.setTextColor(38, 36, 21);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`Nombre d'employés : ${employers.length}`, margin, 24);

  doc.setTextColor(0, 0, 0);
  let y = 32;

  const headers = ["N° Employé", "Nom", "Prénom", "Salaire"];
  const body = employers.map((e) => [
    e.numeroEmploye ?? "—",
    e.nom ?? "—",
    e.prenom ?? "—",
    formatSalaire(e.salaire),
  ]);

  autoTable(doc, {
    head: [headers],
    body: body.map((row) => row.map(String)),
    startY: y,
    margin: { left: margin, right: margin },
    theme: "grid",
    styles: { fontSize: 9 },
    headStyles: { fillColor: [61, 46, 26], textColor: [247, 246, 243], fontStyle: "bold" },
    alternateRowStyles: { fillColor: [232, 230, 225] },
  });

  doc.save(`Employes_${safeFileName([new Date().toISOString().slice(0, 10)])}.pdf`);
}
