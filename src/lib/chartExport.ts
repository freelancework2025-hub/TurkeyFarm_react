/**
 * Renders line charts to base64 for PDF/Excel export.
 * Uses Chart.js for headless canvas rendering.
 */

import {
  Chart,
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";

Chart.register(
  CategoryScale,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Filler,
  Tooltip,
  Legend
);

const CHART_WIDTH = 420;
const CHART_HEIGHT = 220;

export interface WaterDataPoint {
  date: string;
  dayLabel: string;
  consoEauL: number;
}

export interface MortalityDataPoint {
  date: string;
  dayLabel: string;
  mortaliteNbre: number;
}

/**
 * Renders Consommation d'eau line chart to base64 PNG.
 */
export function renderWaterChartToBase64(
  data: WaterDataPoint[],
  semaine: string,
  sexLabel?: string
): string | null {
  if (!data || data.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = CHART_WIDTH;
  canvas.height = CHART_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const labels = data.map((d) => d.dayLabel);
  const values = data.map((d) => d.consoEauL);

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Conso. Eau (L)",
          data: values,
          borderColor: "rgb(59, 130, 246)",
          backgroundColor: "rgba(59, 130, 246, 0.1)",
          fill: true,
          tension: 0.3,
          pointBackgroundColor: "rgb(59, 130, 246)",
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Consommation d'eau ${semaine ? `— ${semaine}` : ""}${sexLabel ? ` (${sexLabel})` : ""}`,
          font: { size: 12 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 45, font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(0,0,0,0.08)" },
          ticks: { font: { size: 9 } },
        },
      },
    },
  });

  const base64 = chart.toBase64Image("image/png", 1);
  chart.destroy();
  return base64;
}

/**
 * Renders Mortalité par jour line chart to base64 PNG.
 */
export function renderMortalityChartToBase64(
  data: MortalityDataPoint[],
  semaine: string,
  sexLabel?: string
): string | null {
  if (!data || data.length === 0) return null;

  const canvas = document.createElement("canvas");
  canvas.width = CHART_WIDTH;
  canvas.height = CHART_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const labels = data.map((d) => d.dayLabel);
  const values = data.map((d) => d.mortaliteNbre);

  const chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Mortalité (Nbre)",
          data: values,
          borderColor: "rgb(239, 68, 68)",
          backgroundColor: "rgba(239, 68, 68, 0.1)",
          fill: true,
          tension: 0.3,
          pointBackgroundColor: "rgb(239, 68, 68)",
          pointRadius: 4,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Mortalité par jour ${semaine ? `— ${semaine}` : ""}${sexLabel ? ` (${sexLabel})` : ""}`,
          font: { size: 12 },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 45, font: { size: 9 } },
        },
        y: {
          beginAtZero: true,
          stepSize: 1,
          grid: { color: "rgba(0,0,0,0.08)" },
          ticks: { font: { size: 9 } },
        },
      },
    },
  });

  const base64 = chart.toBase64Image("image/png", 1);
  chart.destroy();
  return base64;
}
