/**
 * Planning de Vaccination — visible and editable only by Responsable Technique and Administrateur.
 * Table: Age, Date, Motif, Vaccin / Traitement, Quantité, Administration, Remarques.
 * Date defaults from Date Mise en Place (InfosSetup) for the selected lot.
 */
import React, { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Loader2, Plus, Save, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  type LotWithStatusResponse,
  type SetupInfoResponse,
  type VaccinationPlanningRequest,
  type VaccinationPlanningResponse,
} from "@/lib/api";

const DEFAULT_AGES = [
  "1 J",
  "3 J",
  "5 J",
  "7 J",
  "10 J",
  "21 J",
  "20 J",
  "31 J",
  "35 J",
  "42 J",
  "49 J",
  "52 J",
  "56 J",
  "60 J",
  "65 J",
  "77 J",
  "80 J",
  "100 J",
];

const DEFAULT_MOTIFS = [
  "RTI",
  "Démarrage",
  "Picage",
  "ND",
  "AI+ND",
  "Programme préventif",
  "Prévention",
  "Atteinte Hépatique",
];

const DEFAULT_VACCINS = [
  "RTI / Aviffa",
  "PCR MYCOPLASME",
  "Enrofloxacine / Colistine",
  "Diurétique",
  "Vitamine K",
  "Hitchner B1",
  "Gallimune ND+H9",
  "TRT",
  "Pulmotil",
  "AD3E",
  "Nobilis influenza N2H9+ND",
  "Clone 30",
  "OTC",
  "Hépatoprotecteur",
  "Doxycycline",
  "New Flu H9 K",
];

const DEFAULT_ADMINISTRATION = ["Nébulisation", "Eau de boisson", "Injection"];

const DEFAULT_REMARQUES = [
  "Pendant 2 j",
  "0,3 ml / sujet",
  "PCR MYCOPLASME",
  "0,5 ml / sujet",
  "0,5 ml / sujet (Mâles)",
];

interface VaccinationRow {
  id: string;
  serverId?: number;
  age: string;
  date: string;
  motif: string;
  vaccinTraitement: string;
  quantite: string;
  administration: string;
  remarques: string;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Parse "X J" or "X Jours" to days; Couvoir = 0; else 0. */
function ageToDays(age: string): number | null {
  const t = (age || "").trim();
  if (!t || t === "Couvoir") return 0;
  const m = t.match(/^(\d+)\s*J/);
  return m ? parseInt(m[1], 10) : null;
}

interface SelectOrAddProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  onAddOption: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function SelectOrAdd({
  value,
  onChange,
  options,
  onAddOption,
  placeholder = "Sélectionner ou saisir",
  disabled = false,
  className = "",
}: SelectOrAddProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(value);
  }, [value]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setInput(value);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [value]);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes((input || "").toLowerCase())
  );
  const exact = options.find((o) => o.toLowerCase() === (input || "").toLowerCase());
  const canAdd = input.trim() && !exact && !options.includes(input.trim());

  const select = (v: string) => {
    setInput(v);
    onChange(v);
    setOpen(false);
  };

  const addNew = () => {
    const t = input.trim();
    if (t && canAdd) {
      onAddOption(t);
      onChange(t);
    }
    setOpen(false);
  };

  return (
    <div className={`relative ${className}`} ref={ref}>
      <input
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        className="w-full min-w-[120px] border rounded px-2 py-1 text-sm bg-background"
        placeholder={placeholder}
      />
      {open && !disabled && (
        <div className="absolute z-10 top-full left-0 right-0 mt-0.5 bg-popover border rounded-md shadow-md max-h-48 overflow-y-auto">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => select(opt)}
            >
              {opt}
            </button>
          ))}
          {canAdd && (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 text-sm text-primary hover:bg-accent flex items-center gap-1"
              onClick={addNew}
            >
              <Plus className="w-3 h-3" />
              Ajouter &quot;{input.trim()}&quot;
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlanningVaccination() {
  const [searchParams, setSearchParams] = useSearchParams();
  const farmIdParam = searchParams.get("farmId");
  const lotParam = searchParams.get("lot") ?? "";
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);
  const { canAccessAllFarms, selectedFarmId: authFarmId } = useAuth();
  const pageFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authFarmId ?? undefined);
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [rows, setRows] = useState<VaccinationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dateMiseEnPlace, setDateMiseEnPlace] = useState<string | null>(null);

  const [ages, setAges] = useState<string[]>(DEFAULT_AGES);
  const [motifs, setMotifs] = useState<string[]>(DEFAULT_MOTIFS);
  const [vaccins, setVaccins] = useState<string[]>(DEFAULT_VACCINS);
  const [administrations, setAdministrations] = useState<string[]>(DEFAULT_ADMINISTRATION);
  const [remarques, setRemarques] = useState<string[]>(DEFAULT_REMARQUES);

  const selectedLot = lotParam.trim() || null;
  const { toast } = useToast();

  useEffect(() => {
    if (!showFarmSelector) return;
    setFarmsLoading(true);
    api.farms
      .list()
      .then((list) => setFarms(list))
      .catch(() => setFarms([]))
      .finally(() => setFarmsLoading(false));
  }, [showFarmSelector]);

  useEffect(() => {
    if (showFarmSelector || !pageFarmId) return;
    setLotsLoading(true);
    api.farms
      .lotsWithStatus(pageFarmId)
      .then((data) => {
        setLotsWithStatus(data ?? []);
        setLots((data ?? []).map((x) => x.lot));
      })
      .catch(() => {
        setLotsWithStatus([]);
        setLots([]);
      })
      .finally(() => setLotsLoading(false));
  }, [showFarmSelector, pageFarmId]);

  const loadPlanning = useCallback(
    async (setupDate: string | null) => {
      if (!selectedLot) {
        setRows([]);
        return;
      }
      setLoading(true);
      try {
        const list: VaccinationPlanningResponse[] = await api.vaccinationPlanning.list({
          farmId: pageFarmId ?? undefined,
          lot: selectedLot,
        });
        if (list.length) {
          const loadedRows = list
            .filter((r) => (r.age ?? "").trim().toLowerCase() !== "couvoir")
            .map((r) => ({
              id: String(r.id),
              serverId: r.id,
              age: r.age ?? "",
              date: r.planDate ?? "",
              motif: r.motif ?? "",
              vaccinTraitement: r.vaccinTraitement ?? "",
              quantite: r.quantite ?? "",
              administration: r.administration ?? "",
              remarques: r.remarques ?? "",
            }));
          setRows(loadedRows);
          setAges((prev) => {
            const fromRows = new Set(loadedRows.map((row) => row.age).filter(Boolean));
            const next = new Set(prev.filter((a) => a.trim().toLowerCase() !== "couvoir"));
            fromRows.forEach((a) => {
              if (a.trim().toLowerCase() !== "couvoir") next.add(a);
            });
            return [...next].sort((a, b) => {
              const na = ageToDays(a);
              const nb = ageToDays(b);
              if (na != null && nb != null) return na - nb;
              if (na != null) return -1;
              if (nb != null) return 1;
              return a.localeCompare(b);
            });
          });
        } else {
          const baseDate = setupDate || new Date().toISOString().split("T")[0];
          setRows(
            DEFAULT_AGES.map((age) => {
              const days = ageToDays(age);
              const date = days != null && days > 0 ? addDays(baseDate, days) : addDays(baseDate, days ?? 0);
              return {
                id: crypto.randomUUID(),
                age,
                date: date || "",
                motif: "",
                vaccinTraitement: "",
                quantite: "",
                administration: "",
                remarques: "",
              };
            })
          );
        }
      } catch {
        setRows([]);
        toast({ title: "Erreur", description: "Impossible de charger le planning.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [selectedLot, pageFarmId, toast]
  );

  useEffect(() => {
    if (!selectedLot || !pageFarmId) {
      setDateMiseEnPlace(null);
      setRows([]);
      return;
    }
    let cancelled = false;
    (async () => {
      let setupDate: string | null = null;
      try {
        const list: SetupInfoResponse[] = await api.setupInfo.list(pageFarmId, selectedLot);
        if (list.length && !cancelled) {
          const dates = list.map((r) => r.dateMiseEnPlace).filter(Boolean);
          setupDate = dates.length ? dates.sort()[0] : null;
          setDateMiseEnPlace(setupDate);
        }
      } catch {
        if (!cancelled) setDateMiseEnPlace(null);
      }
      if (!cancelled) await loadPlanning(setupDate);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedLot, pageFarmId, loadPlanning]);

  const updateRow = (id: string, field: keyof VaccinationRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const defaultDateForAge = (age: string): string => {
    if (!dateMiseEnPlace) return "";
    const days = ageToDays(age);
    if (days == null) return "";
    if (days === 0) return age === "Couvoir" ? "" : dateMiseEnPlace;
    return addDays(dateMiseEnPlace, days);
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        age: "",
        date: dateMiseEnPlace || new Date().toISOString().split("T")[0],
        motif: "",
        vaccinTraitement: "",
        quantite: "",
        administration: "",
        remarques: "",
      },
    ]);
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const save = async () => {
    if (!selectedLot) {
      toast({ title: "Sélectionnez un lot", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: VaccinationPlanningRequest[] = rows.map((r, i) => ({
        farmId: pageFarmId ?? null,
        lot: selectedLot,
        ordre: i,
        age: r.age,
        planDate: r.date || null,
        motif: r.motif || null,
        vaccinTraitement: r.vaccinTraitement || null,
        quantite: r.quantite || null,
        administration: r.administration || null,
        remarques: r.remarques || null,
      }));
      await api.vaccinationPlanning.replace(
        { lot: selectedLot, farmId: pageFarmId ?? undefined },
        payload
      );
      toast({ title: "Enregistré", description: "Le planning de vaccination a été enregistré." });
      const baseDate = dateMiseEnPlace || new Date().toISOString().split("T")[0];
      await loadPlanning(baseDate);
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer le planning.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const onSelectLot = (lot: string) =>
    setSearchParams(pageFarmId != null ? { farmId: String(pageFarmId), lot } : { lot });
  const selectFarm = (id: number) => setSearchParams({ farmId: String(id) });
  const clearFarmSelection = () => setSearchParams({});

  if (showFarmSelector) {
    return (
      <AppLayout>
        <div className="p-6 space-y-6">
          <h1 className="text-xl font-semibold">Planning de vaccination</h1>
          <p className="text-sm text-muted-foreground">
            Choisissez une exploitation pour accéder au planning de vaccination de ses lots. Chaque lot a son propre planning.
          </p>
          {farmsLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Chargement des fermes…</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {farms.map((farm) => (
                <button
                  key={farm.id}
                  type="button"
                  onClick={() => selectFarm(farm.id)}
                  className="flex items-center gap-4 p-5 rounded-xl border-2 border-border bg-card hover:border-primary hover:bg-muted/50 transition-colors text-left group"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/20">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-foreground truncate">{farm.name}</div>
                    <div className="text-xs text-muted-foreground">{farm.code}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {farms.length === 0 && !farmsLoading && (
            <p className="text-sm text-muted-foreground">Aucune exploitation disponible.</p>
          )}
        </div>
      </AppLayout>
    );
  }

  if (!selectedLot) {
    return (
      <AppLayout>
        <div className="p-6">
          {canAccessAllFarms && isValidFarmId && (
            <button
              type="button"
              onClick={clearFarmSelection}
              className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Changer d&apos;exploitation
            </button>
          )}
          <LotSelectorView
            existingLots={lots}
            lotsWithStatus={lotsWithStatus}
            loading={lotsLoading}
            onSelectLot={onSelectLot}
            title="Choisir un lot"
            description="Choisissez un lot pour afficher ou modifier son planning de vaccination. Chaque lot a son propre planning. La date de mise en place (Données mises en place) sera utilisée pour les dates par défaut."
            emptyMessage="Aucun lot pour cette exploitation. Créez d'abord un lot (Données mises en place) puis revenez ici."
          />
        </div>
      </AppLayout>
    );
  }

  const goBackToLotSelector = () =>
    setSearchParams(pageFarmId != null ? { farmId: String(pageFarmId) } : {});

  return (
    <AppLayout>
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goBackToLotSelector}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              title="Changer de lot"
            >
              <ArrowLeft className="w-4 h-4" />
              Lot
            </button>
            <span className="text-muted-foreground">/</span>
            <h1 className="text-xl font-semibold">Planning de vaccination — {selectedLot}</h1>
          </div>
          {dateMiseEnPlace && (
            <span className="text-sm text-muted-foreground">
              Date mise en place (lot) : {dateMiseEnPlace}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            >
              <Plus className="w-4 h-4" />
              Ligne
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || loading}
              className="inline-flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm hover:opacity-90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">Age</th>
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Motif</th>
                  <th className="text-left p-2 font-medium">Vaccin / Traitement</th>
                  <th className="text-left p-2 font-medium">Quantité</th>
                  <th className="text-left p-2 font-medium">Administration</th>
                  <th className="text-left p-2 font-medium">Remarques</th>
                  <th className="w-10 p-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-muted/30">
                    <td className="p-1">
                      <SelectOrAdd
                        value={row.age}
                        onChange={(v) => updateRow(row.id, "age", v)}
                        options={ages.filter((a) => a.trim().toLowerCase() !== "couvoir")}
                        onAddOption={(v) => {
                          if (v.trim().toLowerCase() === "couvoir") return;
                          setAges((prev) =>
                            [...prev, v.trim()].sort((a, b) => {
                              const na = ageToDays(a);
                              const nb = ageToDays(b);
                              if (na != null && nb != null) return na - nb;
                              if (na != null) return -1;
                              if (nb != null) return 1;
                              return a.localeCompare(b);
                            })
                          );
                        }}
                        placeholder="Age"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(row.id, "date", e.target.value)}
                        className="w-full min-w-[130px] border rounded px-2 py-1 text-sm bg-background"
                        placeholder={defaultDateForAge(row.age) || "JJ/MM/AAAA"}
                      />
                    </td>
                    <td className="p-1">
                      <SelectOrAdd
                        value={row.motif}
                        onChange={(v) => updateRow(row.id, "motif", v)}
                        options={motifs}
                        onAddOption={(v) => setMotifs((prev) => [...prev, v])}
                        placeholder="Motif"
                      />
                    </td>
                    <td className="p-1">
                      <SelectOrAdd
                        value={row.vaccinTraitement}
                        onChange={(v) => updateRow(row.id, "vaccinTraitement", v)}
                        options={vaccins}
                        onAddOption={(v) => setVaccins((prev) => [...prev, v])}
                        placeholder="Vaccin / Traitement"
                      />
                    </td>
                    <td className="p-1">
                      <input
                        type="text"
                        value={row.quantite}
                        onChange={(e) => updateRow(row.id, "quantite", e.target.value)}
                        className="w-full min-w-[80px] border rounded px-2 py-1 text-sm bg-background"
                        placeholder="Quantité"
                      />
                    </td>
                    <td className="p-1">
                      <SelectOrAdd
                        value={row.administration}
                        onChange={(v) => updateRow(row.id, "administration", v)}
                        options={administrations}
                        onAddOption={(v) => setAdministrations((prev) => [...prev, v])}
                        placeholder="Administration"
                      />
                    </td>
                    <td className="p-1">
                      <SelectOrAdd
                        value={row.remarques}
                        onChange={(v) => updateRow(row.id, "remarques", v)}
                        options={remarques}
                        onAddOption={(v) => setRemarques((prev) => [...prev, v])}
                        placeholder="Remarques (optionnel)"
                      />
                    </td>
                    <td className="p-1">
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        title="Supprimer la ligne"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
