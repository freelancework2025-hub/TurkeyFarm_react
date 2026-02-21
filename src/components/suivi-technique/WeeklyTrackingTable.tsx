import { useState, useEffect, useCallback, useMemo } from "react";
import { Plus, Save, Trash2, Loader2 } from "lucide-react";
import { api, type SuiviTechniqueHebdoResponse, type SuiviTechniqueHebdoRequest } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

interface WeeklyRow {
  id: string;
  recordDate: string;
  ageJour: string;
  mortaliteNbre: string;
  mortalitePct: string;
  mortaliteCumul: string;
  mortaliteCumulPct: string;
  consoEauL: string;
  tempMin: string;
  tempMax: string;
  vaccination: string;
  traitement: string;
  observation: string;
}

function toRow(r: SuiviTechniqueHebdoResponse): WeeklyRow {
  return {
    id: String(r.id),
    recordDate: r.recordDate,
    ageJour: r.ageJour != null ? String(r.ageJour) : "",
    mortaliteNbre: r.mortaliteNbre != null ? String(r.mortaliteNbre) : "",
    mortalitePct: r.mortalitePct != null ? r.mortalitePct.toFixed(2) : "",
    mortaliteCumul: r.mortaliteCumul != null ? String(r.mortaliteCumul) : "",
    mortaliteCumulPct: r.mortaliteCumulPct != null ? r.mortaliteCumulPct.toFixed(2) : "",
    consoEauL: r.consoEauL != null ? String(r.consoEauL) : "",
    tempMin: r.tempMin != null ? String(r.tempMin) : "",
    tempMax: r.tempMax != null ? String(r.tempMax) : "",
    vaccination: r.vaccination ?? "",
    traitement: r.traitement ?? "",
    observation: r.observation ?? "",
  };
}

function emptyRow(date: string): WeeklyRow {
  return {
    id: crypto.randomUUID(),
    recordDate: date,
    ageJour: "",
    mortaliteNbre: "",
    mortalitePct: "",
    mortaliteCumul: "",
    mortaliteCumulPct: "",
    consoEauL: "",
    tempMin: "",
    tempMax: "",
    vaccination: "",
    traitement: "",
    observation: "",
  };
}

function isSavedRow(id: string): boolean {
  return /^\d+$/.test(id);
}

const ROWS_PER_WEEK = 7;

/** Previous semaine for effectif chain: S2 → S1, S3 → S2, etc. Returns null for S1 or non-Sn format. */
function previousSemaine(semaine: string): string | null {
  const m = semaine.trim().match(/^S(\d+)$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n <= 1) return null;
  return `S${n - 1}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function emptyWeekRows(startDate: string): WeeklyRow[] {
  return Array.from({ length: ROWS_PER_WEEK }, (_, i) => emptyRow(addDays(startDate, i)));
}

interface WeeklyTrackingTableProps {
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  /** Bâtiment for this tracking (used in list and save). */
  batiment?: string;
  effectifInitial?: number;
  /** Called after hebdo or effectif départ is saved so parent can refresh stock. */
  onSaveSuccess?: () => void;
}

export default function WeeklyTrackingTable({ farmId, lot, semaine, sex, batiment = "B1", effectifInitial, onSaveSuccess }: WeeklyTrackingTableProps) {
  const today = new Date().toISOString().split("T")[0];
  const { isReadOnly, canCreate, canUpdate, canDelete } = useAuth();
  const { toast } = useToast();

  const [effectifDepart, setEffectifDepart] = useState<string>("");
  /** True when effectif départ was loaded from API (already saved). RESPONSABLE_FERME cannot modify after save (permission.mdc). */
  const [hasSavedEffectif, setHasSavedEffectif] = useState(false);

  const [rows, setRows] = useState<WeeklyRow[]>(() => emptyWeekRows(today));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingEffectif, setSavingEffectif] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.suiviTechniqueHebdo.list({ farmId, lot, sex, batiment, semaine });
      const mapped = list.map(toRow);
      const savedEffectif = list.length > 0 && list.some((r) => r.effectifDepart != null);
      setHasSavedEffectif(!!savedEffectif);
      // When no data (e.g. after "delete sex data"), ensure table is fully editable
      if (list.length === 0) {
        setHasSavedEffectif(false);
      }
      if (list.length > 0 && list[0].effectifDepart != null) {
        setEffectifDepart(String(list[0].effectifDepart));
      } else {
        // Week 2+: prefill effectif départ from previous week's effectif restant fin de semaine (stock chain)
        // Use batiment-specific stock when batiment is provided
        const prev = previousSemaine(semaine);
        if (prev != null) {
          try {
            const stock = await api.suiviStock.get({ farmId, lot, semaine: prev, sex, batiment: batiment ?? undefined });
            if (stock?.effectifRestantFinSemaine != null) {
              setEffectifDepart(String(stock.effectifRestantFinSemaine));
            }
          } catch {
            // ignore: keep empty or effectifInitial placeholder
          }
        }
      }

      // Display exactly 7 rows by default (one per day). User can add more via "+ Ligne".
      if (isReadOnly) {
        if (mapped.length === 0) {
          setRows(emptyWeekRows(today));
        } else if (mapped.length < ROWS_PER_WEEK) {
          const lastDate = mapped[mapped.length - 1].recordDate;
          const padCount = ROWS_PER_WEEK - mapped.length;
          const padRows = Array.from({ length: padCount }, (_, i) => emptyRow(addDays(lastDate, i + 1)));
          setRows([...mapped, ...padRows]);
        } else {
          setRows(mapped);
        }
      } else if (mapped.length >= ROWS_PER_WEEK) {
        setRows(mapped);
      } else if (mapped.length > 0) {
        const lastDate = mapped[mapped.length - 1].recordDate;
        const padCount = ROWS_PER_WEEK - mapped.length;
        const padRows = Array.from({ length: padCount }, (_, i) => emptyRow(addDays(lastDate, i + 1)));
        setRows([...mapped, ...padRows]);
      } else {
        setRows(emptyWeekRows(today));
      }
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible de charger les données.",
        variant: "destructive",
      });
      setRows(emptyWeekRows(today));
      setHasSavedEffectif(false);
    } finally {
      setLoading(false);
    }
  }, [farmId, lot, sex, batiment, semaine, isReadOnly, toast, today]);

  useEffect(() => {
    load();
  }, [load]);

  const addRow = () => {
    const last = rows[rows.length - 1];
    // Calculate next date
    let nextDate = today;
    if (last?.recordDate) {
      const d = new Date(last.recordDate);
      d.setDate(d.getDate() + 1);
      nextDate = d.toISOString().split("T")[0];
    }
    // Calculate next age
    let nextAge = "";
    if (last?.ageJour) {
      nextAge = String(parseInt(last.ageJour) + 1);
    }
    setRows((prev) => [
      ...prev,
      {
        ...emptyRow(nextDate),
        ageJour: nextAge,
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= ROWS_PER_WEEK) return;
    const row = rows.find((r) => r.id === id);
    if (!row) return;
    const saved = isSavedRow(row.id);
    if (saved && !canDelete) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const updateRow = (id: string, field: keyof WeeklyRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleSave = async () => {
    if (!canCreate) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas créer de données.", variant: "destructive" });
      return;
    }

    // Responsable de ferme: can only create; exclude already-saved rows from batch so we do not attempt update
    const toSend: SuiviTechniqueHebdoRequest[] = rows
      .filter((r) => r.recordDate && (r.mortaliteNbre.trim() !== "" || r.consoEauL.trim() !== ""))
      .filter((r) => canUpdate || !isSavedRow(r.id))
      .map((r) => ({
        lot,
        sex,
        batiment,
        semaine,
        effectifDepart: effectifDepart ? parseInt(effectifDepart) : null,
        recordDate: r.recordDate,
        ageJour: r.ageJour.trim() !== "" ? parseInt(r.ageJour) : null,
        mortaliteNbre: r.mortaliteNbre.trim() !== "" ? parseInt(r.mortaliteNbre) : null,
        consoEauL: r.consoEauL.trim() !== "" ? parseFloat(r.consoEauL) : null,
        tempMin: r.tempMin.trim() !== "" ? parseFloat(r.tempMin) : null,
        tempMax: r.tempMax.trim() !== "" ? parseFloat(r.tempMax) : null,
        vaccination: r.vaccination.trim() || null,
        traitement: r.traitement.trim() || null,
        observation: r.observation.trim() || null,
      }));

    if (toSend.length === 0) {
      toast({
        title: "Aucune ligne à enregistrer",
        description: "Renseignez au moins une date et une valeur de mortalité ou consommation d'eau.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await api.suiviTechniqueHebdo.saveBatch(toSend, farmId);
      toast({ title: "Données enregistrées", description: `${toSend.length} ligne(s) enregistrée(s).` });
      onSaveSuccess?.();
      await load();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'enregistrer.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  /** Rows eligible for effectif save: have recordDate and (user can update any row, or row is not yet saved). RESPONSABLE_FERME can only create — cannot include saved rows. */
  const effectifEligibleRowCount = useMemo(
    () =>
      rows.filter((r) => r.recordDate && r.recordDate.trim() !== "").filter((r) => canUpdate || !isSavedRow(r.id))
        .length,
    [rows, canUpdate]
  );
  /** RESPONSABLE_FERME cannot update after save: once effectif départ was saved, they cannot modify it (permission.mdc). */
  const canSaveEffectif =
    (canCreate || canUpdate) && effectifEligibleRowCount > 0 && (canUpdate || !hasSavedEffectif);
  /** Effectif input read-only when: full read-only, or effectif was already saved and user cannot update (e.g. RESPONSABLE_FERME). */
  const effectifInputReadOnly =
    isReadOnly || (hasSavedEffectif && !canUpdate);

  /** Save only effectif départ de la semaine. Respects permission.mdc: create for new rows, update for existing (RESPONSABLE_FERME cannot update). */
  const handleSaveEffectifDepart = async () => {
    if (!canSaveEffectif) {
      if (!canCreate && !canUpdate) {
        toast({ title: "Non autorisé", description: "Vous ne pouvez pas enregistrer l'effectif départ.", variant: "destructive" });
      } else if (hasSavedEffectif && !canUpdate) {
        toast({
          title: "Modification non autorisée",
          description: "L'effectif départ a déjà été enregistré. Vous ne pouvez pas le modifier après enregistrement.",
          variant: "destructive",
        });
      } else if (effectifEligibleRowCount === 0) {
        toast({
          title: "Impossible d'enregistrer",
          description: "Vous ne pouvez pas modifier l'effectif après enregistrement (lignes déjà sauvegardées).",
          variant: "destructive",
        });
      }
      return;
    }
    const effectifVal = effectifDepart.trim() !== "" ? parseInt(effectifDepart, 10) : null;
    if (effectifVal != null && (Number.isNaN(effectifVal) || effectifVal < 0)) {
      toast({ title: "Valeur invalide", description: "Saisissez un effectif départ valide (nombre ≥ 0).", variant: "destructive" });
      return;
    }
    // Build batch: rows with recordDate, respecting canUpdate (exclude saved rows if user cannot update)
    const toSend: SuiviTechniqueHebdoRequest[] = rows
      .filter((r) => r.recordDate && r.recordDate.trim() !== "")
      .filter((r) => canUpdate || !isSavedRow(r.id))
      .map((r) => ({
        lot,
        sex,
        batiment,
        semaine,
        effectifDepart: effectifVal ?? null,
        recordDate: r.recordDate,
        ageJour: r.ageJour.trim() !== "" ? parseInt(r.ageJour) : null,
        mortaliteNbre: r.mortaliteNbre.trim() !== "" ? parseInt(r.mortaliteNbre) : null,
        consoEauL: r.consoEauL.trim() !== "" ? parseFloat(r.consoEauL) : null,
        tempMin: r.tempMin.trim() !== "" ? parseFloat(r.tempMin) : null,
        tempMax: r.tempMax.trim() !== "" ? parseFloat(r.tempMax) : null,
        vaccination: r.vaccination.trim() || null,
        traitement: r.traitement.trim() || null,
        observation: r.observation.trim() || null,
      }));
    if (toSend.length === 0) {
      toast({
        title: "Impossible d'enregistrer",
        description: "Aucune ligne éligible. Vous ne pouvez pas modifier l'effectif sur des lignes déjà enregistrées.",
        variant: "destructive",
      });
      return;
    }
    setSavingEffectif(true);
    try {
      await api.suiviTechniqueHebdo.saveBatch(toSend, farmId);
      setHasSavedEffectif(true);
      toast({ title: "Effectif enregistré", description: "Effectif départ de la semaine enregistré." });
      onSaveSuccess?.();
      await load();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Impossible d'enregistrer l'effectif.",
        variant: "destructive",
      });
    } finally {
      setSavingEffectif(false);
    }
  };

  // Calculate totals for current week
  const weeklyTotals = useMemo(() => {
    const totalMortality = rows.reduce((s, r) => s + (parseInt(r.mortaliteNbre) || 0), 0);
    const totalWater = rows.reduce((s, r) => s + (parseFloat(r.consoEauL) || 0), 0);
    return { totalMortality, totalWater };
  }, [rows]);

  /**
   * Computed mortality stats (aligned with backend SuiviTechniqueHebdoService):
   * - Mortalité % (Journée) = (Mortalité NBRE du jour / Effectif départ de la semaine) × 100
   * - Mortalité CUMUL = CUMUL veille + NBRE du jour (by recordDate order)
   * - Mortalité % CUMUL = (Mortalité CUMUL / Effectif départ de la semaine) × 100
   */
  const mortalityComputedByRowId = useMemo(() => {
    const effectif = parseInt(effectifDepart, 10);
    if (!effectifDepart?.trim() || Number.isNaN(effectif) || effectif <= 0)
      return new Map<string, { mortalitePct: string; mortaliteCumul: string; mortaliteCumulPct: string }>();

    const withDate = rows.filter((r) => r.recordDate && r.recordDate.trim() !== "");
    const sorted = [...withDate].sort((a, b) => a.recordDate.localeCompare(b.recordDate));
    const map = new Map<string, { mortalitePct: string; mortaliteCumul: string; mortaliteCumulPct: string }>();
    let runningCumul = 0;

    for (const row of sorted) {
      const nbre = parseInt(row.mortaliteNbre, 10) || 0;
      runningCumul += nbre;
      const mortalitePct = ((nbre / effectif) * 100).toFixed(2);
      const mortaliteCumulPct = ((runningCumul / effectif) * 100).toFixed(2);
      map.set(row.id, {
        mortalitePct,
        mortaliteCumul: String(runningCumul),
        mortaliteCumulPct,
      });
    }
    return map;
  }, [rows, effectifDepart]);

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement des données hebdomadaires…</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Effectif départ: compact card for current semaine */}
      <div className="inline-flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card px-3 py-2 shadow-sm">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Effectif départ de {semaine}</label>
          <input
            type="number"
            value={effectifDepart}
            onChange={(e) => setEffectifDepart(e.target.value)}
            placeholder={effectifInitial ? String(effectifInitial) : "0"}
            min="0"
            className={`w-24 rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring ${effectifInputReadOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
            readOnly={effectifInputReadOnly}
          />
        </div>
        {!isReadOnly && (canCreate || canUpdate) && (
          <button
            type="button"
            onClick={handleSaveEffectifDepart}
            disabled={!canSaveEffectif || savingEffectif}
            title={
              !canSaveEffectif && effectifEligibleRowCount === 0
                ? "Vous ne pouvez pas modifier l'effectif après enregistrement des lignes."
                : undefined
            }
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingEffectif ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer effectif
          </button>
        )}
      </div>

      {/* Main tracking table */}
      <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h3 className="text-base font-display font-bold text-foreground">
              Suivi Hebdomadaire — {sex} — {semaine}
            </h3>
            <p className="text-xs text-muted-foreground">
              Lot {lot}
            </p>
          </div>
          {!isReadOnly && (
            <div className="flex gap-2">
              <button
                onClick={addRow}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              >
                <Plus className="w-4 h-4" /> Ligne
              </button>
              <button
                onClick={handleSave}
                disabled={!canCreate || saving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Enregistrer
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-b-lg border border-border">
          <table className="w-full min-w-[900px] text-sm border-collapse bg-card table-fixed">
            <colgroup>
              <col className="w-[100px]" />
              <col className="w-[70px]" />
              <col className="w-[72px]" />
              <col className="w-[56px]" />
              <col className="w-[56px]" />
              <col className="w-[56px]" />
              <col className="w-[84px]" />
              <col className="w-12" />
              <col className="w-12" />
              <col className="w-[90px]" />
              <col className="w-[90px]" />
              <col style={{ width: "1%", minWidth: 140 }} />
              {!isReadOnly && (canDelete || canCreate) ? <col className="w-10" /> : null}
            </colgroup>
            <thead>
              <tr className="bg-muted/80 border-b-2 border-border">
                <th className="px-1.5 py-2 text-left font-semibold text-foreground border-r border-border w-[100px]">
                  DATE
                </th>
                <th className="px-1.5 py-2 text-left font-semibold text-foreground border-r border-border w-[70px]">
                  ÂGE EN J
                </th>
                <th colSpan={4} className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border min-w-[220px]">
                  MORTALITÉ
                </th>
                <th className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border min-w-[84px]">
                  CONSO. EAU (L)
                </th>
                <th colSpan={2} className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border w-[96px]">
                  T°
                </th>
                <th colSpan={2} className="px-1.5 py-2 text-center font-semibold text-foreground border-r border-border">
                  INTERVENTION
                </th>
                <th className="px-1.5 py-2 text-left font-semibold text-foreground border-r border-border">
                  OBSERVATION
                </th>
                {!isReadOnly && (canDelete || canCreate) ? <th className="w-10 border-l border-border"></th> : null}
              </tr>
              <tr className="bg-muted/60 border-b border-border">
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border min-w-[72px]">NBRE</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border min-w-[56px]">%</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border min-w-[56px]">CUMUL</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border min-w-[56px]">%</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border"></th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border w-12">MIN</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border w-12">MAX</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">VACCINATION</th>
                <th className="px-1 py-1 text-xs font-medium text-muted-foreground border-r border-border">TRAITEMENT</th>
                <th className="px-1 py-1 border-r border-border"></th>
                {!isReadOnly && (canDelete || canCreate) ? <th className="border-l border-border"></th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const saved = isSavedRow(row.id);
                const readOnly = isReadOnly || (saved && !canUpdate);
                const inputBase = "w-full bg-transparent border-0 outline-none px-1 py-1 text-sm focus:ring-1 focus:ring-ring rounded " + (readOnly ? "bg-muted/40 cursor-not-allowed" : "");
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border ${index % 2 === 0 ? "bg-card" : "bg-muted/20"} hover:bg-muted/30 transition-colors`}
                  >
                    <td className="border-r border-border align-middle px-1">
                      <input
                        type="date"
                        value={row.recordDate}
                        onChange={(e) => updateRow(row.id, "recordDate", e.target.value)}
                        readOnly={readOnly}
                        className={`${inputBase} max-w-[120px]`}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1">
                      <input
                        type="number"
                        value={row.ageJour}
                        onChange={(e) => updateRow(row.id, "ageJour", e.target.value)}
                        placeholder="0"
                        min="0"
                        readOnly={readOnly}
                        className={`${inputBase} w-14 text-center`}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1 min-w-[72px]">
                      <input
                        type="number"
                        value={row.mortaliteNbre}
                        onChange={(e) => updateRow(row.id, "mortaliteNbre", e.target.value)}
                        placeholder="0"
                        min="0"
                        readOnly={readOnly}
                        className={`${inputBase} w-full min-w-[64px] text-center`}
                      />
                    </td>
                    <td className="border-r border-border text-center text-muted-foreground tabular-nums px-1 py-1 min-w-[56px]">
                      {(mortalityComputedByRowId.get(row.id)?.mortalitePct ?? row.mortalitePct)
                        ? `${(mortalityComputedByRowId.get(row.id)?.mortalitePct ?? row.mortalitePct).replace(".", ",")} %`
                        : "—"}
                    </td>
                    <td className="border-r border-border text-center tabular-nums px-1 py-1 min-w-[56px]">
                      {mortalityComputedByRowId.get(row.id)?.mortaliteCumul ?? (row.mortaliteCumul || "—")}
                    </td>
                    <td className="border-r border-border text-center text-muted-foreground tabular-nums px-1 py-1 min-w-[56px]">
                      {(mortalityComputedByRowId.get(row.id)?.mortaliteCumulPct ?? row.mortaliteCumulPct)
                        ? `${(mortalityComputedByRowId.get(row.id)?.mortaliteCumulPct ?? row.mortaliteCumulPct).replace(".", ",")} %`
                        : "—"}
                    </td>
                    <td className="border-r border-border align-middle px-1 min-w-[84px]">
                      <input
                        type="number"
                        value={row.consoEauL}
                        onChange={(e) => updateRow(row.id, "consoEauL", e.target.value)}
                        placeholder="0"
                        step="0.1"
                        readOnly={readOnly}
                        className={`${inputBase} w-full min-w-[56px] text-center`}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1 w-12">
                      <input
                        type="number"
                        value={row.tempMin}
                        onChange={(e) => updateRow(row.id, "tempMin", e.target.value)}
                        placeholder="—"
                        step="0.1"
                        readOnly={readOnly}
                        className={`${inputBase} w-full min-w-[2.5rem] text-center`}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1 w-12">
                      <input
                        type="number"
                        value={row.tempMax}
                        onChange={(e) => updateRow(row.id, "tempMax", e.target.value)}
                        placeholder="—"
                        step="0.1"
                        readOnly={readOnly}
                        className={`${inputBase} w-full min-w-[2.5rem] text-center`}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1">
                      <input
                        type="text"
                        value={row.vaccination}
                        onChange={(e) => updateRow(row.id, "vaccination", e.target.value)}
                        placeholder="—"
                        className={`${inputBase} min-w-[90px]`}
                        readOnly={readOnly}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1">
                      <input
                        type="text"
                        value={row.traitement}
                        onChange={(e) => updateRow(row.id, "traitement", e.target.value)}
                        placeholder="—"
                        className={`${inputBase} min-w-[90px]`}
                        readOnly={readOnly}
                      />
                    </td>
                    <td className="border-r border-border align-middle px-1">
                      <input
                        type="text"
                        value={row.observation}
                        onChange={(e) => updateRow(row.id, "observation", e.target.value)}
                        placeholder="—"
                        className={`${inputBase} min-w-[120px]`}
                        readOnly={readOnly}
                      />
                    </td>
                    {!isReadOnly && (canDelete || canCreate) ? (
                      <td className="border-l border-border text-center align-middle">
                        {index >= ROWS_PER_WEEK && (canDelete || !saved) ? (
                          <button
                            onClick={() => removeRow(row.id)}
                            className="inline-flex p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors"
                            disabled={rows.length <= ROWS_PER_WEEK}
                            aria-label="Supprimer la ligne"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border bg-muted font-semibold text-foreground">
                <td colSpan={2} className="px-1.5 py-2 text-center border-r border-border">
                  TOTAL {semaine}
                </td>
                <td className="px-1.5 py-2 text-center border-r border-border tabular-nums text-destructive">
                  {weeklyTotals.totalMortality}
                </td>
                <td className="px-1.5 py-2 text-center text-muted-foreground border-r border-border tabular-nums">
                  {rows.length && effectifDepart?.trim() ? (() => {
                    const effectif = parseInt(effectifDepart, 10);
                    if (Number.isNaN(effectif) || effectif <= 0) return "—";
                    const pct = ((weeklyTotals.totalMortality / effectif) * 100).toFixed(2);
                    return `${pct.replace(".", ",")} %`;
                  })() : "—"}
                </td>
                <td colSpan={2} className="px-1.5 py-2 text-center border-r border-border"></td>
                <td className="px-1.5 py-2 text-center border-r border-border tabular-nums text-muted-foreground">
                  {weeklyTotals.totalWater.toFixed(1).replace(".", ",")} L
                </td>
                <td colSpan={2} className="px-1.5 py-2 text-center border-r border-border"></td>
                <td className="px-1.5 py-2 text-center border-r border-border"></td>
                <td className="px-1.5 py-2 text-center border-r border-border"></td>
                <td className="px-1.5 py-2 text-center border-r border-border"></td>
                {!isReadOnly && (canDelete || canCreate) ? <td className="px-1.5 py-2 text-center border-l border-border"></td> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
