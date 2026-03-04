import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Filter, RotateCcw } from "lucide-react";

const WEEKS = Array.from({ length: 24 }, (_, i) => `S${i + 1}`);
const SEX_OPTIONS = [
  { value: "both", label: "Tous" },
  { value: "Mâle", label: "Mâle" },
  { value: "Femelle", label: "Femelle" },
];

export interface DashboardFilters {
  farmId: number | null;
  lot: string | null;
  week: string | null;
  sex: string | null;
}

interface DashboardFilterBarProps {
  filters: DashboardFilters;
  onFiltersChange: (f: DashboardFilters) => void;
  farms?: { id: number; name: string; code: string }[];
  lots?: string[];
  /** Show farm selector (Admin/RT/Backoffice); hide it for Responsable Ferme */
  showFarmSelector?: boolean;
  /** Pre-selected farm for Responsable Ferme (read-only context) */
  fixedFarmId?: number | null;
}

export function DashboardFilterBar({
  filters,
  onFiltersChange,
  farms = [],
  lots = [],
  showFarmSelector = false,
  fixedFarmId = null,
}: DashboardFilterBarProps) {
  const [farmId, setFarmId] = useState<number | null>(filters.farmId);
  const [lot, setLot] = useState<string | null>(filters.lot);
  const [week, setWeek] = useState<string | null>(filters.week);
  const [sex, setSex] = useState<string | null>(filters.sex);

  const effectiveFarmId = showFarmSelector ? (farmId ?? filters.farmId) : (fixedFarmId ?? filters.farmId);

  useEffect(() => {
    setFarmId(filters.farmId);
    setLot(filters.lot);
    setWeek(filters.week);
    setSex(filters.sex);
  }, [filters.farmId, filters.lot, filters.week, filters.sex]);

  const handleFarmChange = (farmIdValue: number | null) => {
    setFarmId(farmIdValue);
    onFiltersChange({
      farmId: farmIdValue,
      lot: lot ?? null,
      week: week ?? null,
      sex: sex ?? null,
    });
  };

  const applyFilters = () => {
    onFiltersChange({
      farmId: effectiveFarmId ?? null,
      lot: lot ?? null,
      week: week ?? null,
      sex: sex ?? null,
    });
  };

  const resetFilters = () => {
    setLot(null);
    setWeek(null);
    setSex(null);
    onFiltersChange({
      farmId: showFarmSelector ? farmId : fixedFarmId,
      lot: null,
      week: null,
      sex: null,
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Filter className="h-4 w-4" />
        <span className="text-sm font-medium">Filtres</span>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {showFarmSelector && (
          <Select
            value={effectiveFarmId?.toString() ?? ""}
            onValueChange={(v) => handleFarmChange(v ? Number(v) : null)}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Choisir une ferme..." />
            </SelectTrigger>
            <SelectContent>
              {farms.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!showFarmSelector && fixedFarmId && farms.length > 0 && (
          <div className="flex h-9 items-center rounded-md border border-input bg-muted/50 px-3 py-1 text-sm font-medium text-muted-foreground">
            {farms.find((f) => f.id === fixedFarmId)?.name ?? "Ma ferme"}
          </div>
        )}
        <Select
          value={lot ?? "all"}
          onValueChange={(v) => setLot(v === "all" ? null : v)}
          disabled={!effectiveFarmId}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Lot" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les lots</SelectItem>
            {lots.map((l) => (
              <SelectItem key={l} value={l}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={week ?? "all"}
          onValueChange={(v) => setWeek(v === "all" ? null : v)}
          disabled={!effectiveFarmId}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue placeholder="Semaine" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes</SelectItem>
            {WEEKS.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sex ?? "both"}
          onValueChange={(v) => setSex(v === "both" ? null : v)}
          disabled={!effectiveFarmId}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Sexe" />
          </SelectTrigger>
          <SelectContent>
            {SEX_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={applyFilters} className="gap-1.5">
          <Filter className="h-3.5 w-3.5" />
          Appliquer
        </Button>
        <Button size="sm" variant="outline" onClick={resetFilters} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          Réinitialiser
        </Button>
      </div>
    </div>
  );
}
