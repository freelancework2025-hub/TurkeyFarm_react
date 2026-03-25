/**
 * Planning de Vaccination — visible and editable only by Responsable Technique and Administrateur.
 * Table: Age, Date, Motif, Vaccin / Traitement, Quantité, Administration, Remarques.
 * Date defaults from Date Mise en Place (InfosSetup) for the selected lot.
 */
import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Building2, Check, Download, FileSpreadsheet, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  api,
  type FarmResponse,
  getStoredSelectedFarm,
  type LotWithStatusResponse,
  type SetupInfoResponse,
  type VaccinationPlanningRequest,
  type VaccinationPlanningResponse,
  type VaccinationPlanningNoteRequest,
  type VaccinationPlanningNoteResponse,
} from "@/lib/api";
import { dispatchVaccinationAlertsRefresh } from "@/lib/vaccinationAlertsEvents";
import { exportToExcel, exportToPdf } from "@/lib/planningVaccinationExport";

const DEFAULT_AGES = [
  "Couvoir",
  "1 J",
  "3 J",
  "5 J",
  "7 J",
  "10 J",
  "20 J",
  "21 J",
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

/** Default note contents for the vaccination planning (used as menu options). */
const DEFAULT_NOTE_CONTENT_OPTIONS: string[] = [
  "Rappel par le vaccin HB1 tous les 21 jours pour les mâles.",
  "2 jours de vitamines après chaque vaccination.",
  "Alterner la vaccination contre Newcastle par les vaccins Hitchner/Avinew avec Clone 30.",
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

interface PlanningNote {
  id: string;
  /** ex. "Note 1", "Note 2" */
  label: string;
  /** Content selected from the default note content menu (or a custom one added by RT/Admin). */
  content: string;
  /** Whether this note is selected/visible for the lot. */
  selected: boolean;
}

function mapResponsesToPlanningNotes(list: VaccinationPlanningNoteResponse[]): PlanningNote[] {
  if (list.length === 0) {
    return [{ id: crypto.randomUUID(), label: "Note 1", content: "", selected: false }];
  }
  return [...list]
    .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0))
    .map((r, i) => ({
      id: String(r.id),
      label: r.label || `Note ${i + 1}`,
      content: r.content ?? "",
      selected: Boolean(r.selected),
    }));
}

function mergeNoteContentOptionsFromSaved(
  saved: VaccinationPlanningNoteResponse[],
  setNoteContentOptions: React.Dispatch<React.SetStateAction<string[]>>
) {
  const customContents = saved
    .map((r) => (r.content ?? "").trim())
    .filter((c) => c && !DEFAULT_NOTE_CONTENT_OPTIONS.includes(c));
  setNoteContentOptions((prev) => {
    const combined = new Set([...DEFAULT_NOTE_CONTENT_OPTIONS, ...customContents, ...prev]);
    return [...combined];
  });
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

/** Parse "X J" or "X Jours" to days; Couvoir = 0; else null si non reconnu. */
function ageToDays(age: string): number | null {
  const t = (age || "").trim();
  if (!t) return null;
  if (t.toLowerCase() === "couvoir") return 0;
  const m = t.match(/^(\d+)\s*J/i);
  return m ? parseInt(m[1], 10) : null;
}

function isCouvoirAge(age: string): boolean {
  return (age || "").trim().toLowerCase() === "couvoir";
}

/** Partie numérique pour la saisie (âge stocké en « N J »). */
function ageDaysNumberString(age: string): string {
  const t = (age || "").trim();
  if (!t || isCouvoirAge(t)) return "";
  const m = t.match(/^(\d+)\s*J/i);
  return m ? String(parseInt(m[1], 10)) : "";
}

/** Une seule ligne « Couvoir » : la première conservée, les autres vidées. */
function dedupeCouvoirRows(rows: VaccinationRow[]): VaccinationRow[] {
  let seen = false;
  return rows.map((r) => {
    if (!isCouvoirAge(r.age)) return r;
    if (!seen) {
      seen = true;
      return { ...r, age: "Couvoir" };
    }
    return { ...r, age: "" };
  });
}

/** Ordre croissant par âge (jours) ; même âge : serverId croissant puis id stable. Couvoir avant les autres « 0 j ». */
function sortPlanningRowsByAge(rows: VaccinationRow[]): VaccinationRow[] {
  return [...rows].sort((a, b) => {
    const da = ageToDays(a.age);
    const db = ageToDays(b.age);
    const na = da === null ? Number.MAX_SAFE_INTEGER : da;
    const nb = db === null ? Number.MAX_SAFE_INTEGER : db;
    if (na !== nb) return na - nb;
    if (na === 0 && nb === 0) {
      const ac = isCouvoirAge(a.age);
      const bc = isCouvoirAge(b.age);
      if (ac && !bc) return -1;
      if (!ac && bc) return 1;
    }
    const sa = a.serverId;
    const sb = b.serverId;
    if (sa != null && sb != null && sa !== sb) return sa - sb;
    if (sa != null && sb == null) return -1;
    if (sa == null && sb != null) return 1;
    return a.id.localeCompare(b.id);
  });
}

function sortAndNormalizePlanningRows(rows: VaccinationRow[]): VaccinationRow[] {
  return dedupeCouvoirRows(sortPlanningRowsByAge(rows));
}

interface PlanningAgeCellProps {
  rowId: string;
  age: string;
  isCouvoir: boolean;
  disabled?: boolean;
  onAgeChange: (value: string) => void;
}

/** Saisie : nombre seul ; stockage « N J ». Ligne Couvoir : libellé fixe en tête. */
function PlanningAgeCell({
  rowId,
  age,
  isCouvoir,
  disabled = false,
  onAgeChange,
}: PlanningAgeCellProps) {
  const [numDraft, setNumDraft] = useState(() => ageDaysNumberString(age));

  useEffect(() => {
    setNumDraft(ageDaysNumberString(age));
  }, [rowId, age]);

  if (isCouvoir) {
    return (
      <span className="inline-flex min-w-[3rem] items-center px-2 py-1 text-sm font-medium text-foreground">
        Couvoir
      </span>
    );
  }

  const commitNumber = (digits: string) => {
    const t = digits.trim();
    if (!t) {
      onAgeChange("");
      return;
    }
    const n = parseInt(t, 10);
    if (Number.isNaN(n) || n <= 0) {
      setNumDraft("");
      onAgeChange("");
      return;
    }
    onAgeChange(`${n} J`);
  };

  return (
    <div className="flex min-w-[5rem] max-w-[9rem] items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        value={numDraft}
        onChange={(e) => {
          const raw = e.target.value.replace(/\D/g, "");
          setNumDraft(raw);
          if (raw === "") {
            onAgeChange("");
            return;
          }
          const n = parseInt(raw, 10);
          if (!Number.isNaN(n) && n > 0) {
            onAgeChange(`${n} J`);
          }
        }}
        onBlur={() => commitNumber(numDraft)}
        className="w-full min-w-[3rem] max-w-[5rem] border rounded px-2 py-1 text-sm bg-background"
        placeholder="Âge"
        aria-label="Âge en jours"
      />
      <span className="shrink-0 text-sm text-muted-foreground" aria-hidden>
        J
      </span>
    </div>
  );
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
  const [panelBox, setPanelBox] = useState({ top: 0, left: 0, width: 0, maxHeight: 192 });

  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInput(value);
  }, [value]);

  const filtered = options.filter((o) =>
    o.toLowerCase().includes((input || "").toLowerCase())
  );
  const exact = options.find((o) => o.toLowerCase() === (input || "").toLowerCase());
  const canAdd = Boolean(input.trim() && !exact && !options.includes(input.trim()));

  const closeAndSync = useCallback(() => {
    setOpen(false);
    setInput(value);
  }, [value]);

  const updatePanelPosition = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const gap = 6;
    const maxDrop = 192;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = rect.width;
    const left = Math.max(8, Math.min(rect.left, vw - width - 8));

    const spaceBelow = vh - rect.bottom - gap - 8;
    const spaceAbove = rect.top - gap - 8;
    const preferBelow = spaceBelow >= 100 || spaceBelow >= spaceAbove;

    if (preferBelow) {
      const maxH = Math.max(72, Math.min(maxDrop, spaceBelow));
      setPanelBox({
        left,
        width,
        top: rect.bottom + gap,
        maxHeight: maxH,
      });
    } else {
      const maxH = Math.max(72, Math.min(maxDrop, spaceAbove));
      setPanelBox({
        left,
        width,
        top: Math.max(8, rect.top - gap - maxH),
        maxHeight: maxH,
      });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open || disabled) return;
    updatePanelPosition();
    const onReposition = () => updatePanelPosition();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, disabled, updatePanelPosition, filtered.length, canAdd]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapperRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      closeAndSync();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, closeAndSync]);

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

  const dropdown =
    open &&
    !disabled &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={panelRef}
        role="listbox"
        className="fixed z-[200] rounded-md border bg-popover text-popover-foreground shadow-md overflow-y-auto overflow-x-hidden"
        style={{
          top: panelBox.top,
          left: panelBox.left,
          width: panelBox.width,
          maxHeight: panelBox.maxHeight,
        }}
      >
        {filtered.map((opt) => (
          <button
            key={opt}
            type="button"
            role="option"
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
            <Plus className="w-3 h-3 shrink-0" />
            Ajouter &quot;{input.trim()}&quot;
          </button>
        )}
      </div>,
      document.body
    );

  return (
    <div className={`relative min-w-0 ${className}`} ref={wrapperRef}>
      <input
        type="text"
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        disabled={disabled}
        className="w-full min-w-[120px] border rounded px-2 py-1 text-sm bg-background"
        placeholder={placeholder}
        autoComplete="off"
      />
      {dropdown}
    </div>
  );
}

interface NoteContentSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onAddOption: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Compact dropdown just for notes content so the table stays stable. Uses Dialog for add-new (no browser prompt). */
function NoteContentSelect({
  value,
  options,
  onChange,
  onAddOption,
  placeholder = "Sélectionner le contenu",
  disabled = false,
}: NoteContentSelectProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newContent, setNewContent] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    if (v === "__add_new__") {
      setNewContent("");
      setAddDialogOpen(true);
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    onChange(v);
  };

  const handleAddSubmit = () => {
    const trimmed = newContent.trim();
    if (!trimmed) return;
    onAddOption(trimmed);
    onChange(trimmed);
    setNewContent("");
    setAddDialogOpen(false);
  };

  const handleDialogOpenChange = (open: boolean) => {
    setAddDialogOpen(open);
    if (!open) setNewContent("");
  };

  return (
    <>
      <select
        className="w-full min-w-[200px] border rounded px-2 py-1 text-sm bg-background"
        value={value || ""}
        onChange={handleSelectChange}
        disabled={disabled}
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
        <option value="__add_new__">+ Ajouter un nouveau contenu…</option>
      </select>

      <Dialog open={addDialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nouveau contenu de note</DialogTitle>
            <DialogDescription>
              Saisissez le contenu qui sera disponible dans le menu des notes pour ce lot.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              ref={inputRef}
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Ex: Rappel vaccin à 35 jours…"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddSubmit();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
            >
              Annuler
            </Button>
            <Button
              type="button"
              onClick={handleAddSubmit}
              disabled={!newContent.trim()}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function PlanningVaccination() {
  const [searchParams, setSearchParams] = useSearchParams();
  const farmIdParam = searchParams.get("farmId");
  const lotParam = searchParams.get("lot") ?? "";
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);
  const { canAccessAllFarms, selectedFarmId: authFarmId, hasFullAccess } = useAuth();
  const pageFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authFarmId ?? undefined);
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;
  /** Only RT and Admin can edit; Backoffice and Responsable Ferme see the table in read-only. */
  const canEditPlanning = hasFullAccess;

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [rows, setRows] = useState<VaccinationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  /** While a note row ✓ or delete persist is in flight */
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [dateMiseEnPlace, setDateMiseEnPlace] = useState<string | null>(null);

  const [motifs, setMotifs] = useState<string[]>(DEFAULT_MOTIFS);
  const [vaccins, setVaccins] = useState<string[]>(DEFAULT_VACCINS);
  const [administrations, setAdministrations] = useState<string[]>(DEFAULT_ADMINISTRATION);
  const [remarques, setRemarques] = useState<string[]>(DEFAULT_REMARQUES);

  /** Available note contents for the dropdown menu (initialised with 3 defaults, RT/Admin can add more). */
  const [noteContentOptions, setNoteContentOptions] = useState<string[]>(DEFAULT_NOTE_CONTENT_OPTIONS);

  /** Notes lines for the lot: Note 1, Note 2, ... each choosing a content from the menu. */
  const [notes, setNotes] = useState<PlanningNote[]>([
    {
      id: "note-1",
      label: "Note 1",
      content: "",
      selected: false,
    },
  ]);

  const selectedLot = lotParam.trim() || null;
  const { toast } = useToast();

  const farmName =
    (pageFarmId != null && farms.find((f) => f.id === pageFarmId)?.name) ||
    getStoredSelectedFarm()?.name ||
    "Ferme";

  const exportParams = React.useMemo(
    () =>
      selectedLot
        ? {
            farmName,
            lot: selectedLot,
            dateMiseEnPlace,
            rows: rows.map((r) => ({
              age: r.age,
              date: r.date,
              motif: r.motif,
              vaccinTraitement: r.vaccinTraitement,
              quantite: r.quantite,
              administration: r.administration,
              remarques: r.remarques,
            })),
            notes: notes.map((n) => ({
              label: n.label,
              content: n.content,
              selected: n.selected,
            })),
          }
        : null,
    [farmName, selectedLot, dateMiseEnPlace, rows, notes]
  );

  useEffect(() => {
    if (showFarmSelector) {
      setFarmsLoading(true);
      api.farms
        .list()
        .then((list) => setFarms(list))
        .catch(() => setFarms([]))
        .finally(() => setFarmsLoading(false));
      return;
    }
    if (pageFarmId != null) {
      api.farms
        .list()
        .then((list) => setFarms(list ?? []))
        .catch(() => setFarms([]));
    }
  }, [showFarmSelector, pageFarmId]);

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
        const baseDate = setupDate || new Date().toISOString().split("T")[0];

        const emptyRowForAge = (age: string): VaccinationRow => {
          const days = ageToDays(age);
          const date =
            days != null && days > 0
              ? addDays(baseDate, days)
              : isCouvoirAge(age)
                ? ""
                : addDays(baseDate, days ?? 0);
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
        };

        if (list.length) {
          const loadedRows = list.map((r) => ({
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
          const saved = [...loadedRows];
          const result: VaccinationRow[] = [];
          for (const age of DEFAULT_AGES) {
            const idx = saved.findIndex((r) => (r.age ?? "").trim() === age);
            if (idx >= 0) {
              result.push(saved[idx]);
              saved.splice(idx, 1);
            } else {
              result.push(emptyRowForAge(age));
            }
          }
          result.push(...saved);
          setRows(sortAndNormalizePlanningRows(result));
        } else {
          setRows(sortAndNormalizePlanningRows(DEFAULT_AGES.map((age) => emptyRowForAge(age))));
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

  const loadNotes = useCallback(async () => {
    if (!selectedLot || !pageFarmId) {
      setNotes([{ id: "note-1", label: "Note 1", content: "", selected: false }]);
      return;
    }
    try {
      const list = await api.vaccinationPlanningNotes.list({
        farmId: pageFarmId ?? undefined,
        lot: selectedLot,
      });
      if (list.length) {
        setNotes(mapResponsesToPlanningNotes(list));
        mergeNoteContentOptionsFromSaved(list, setNoteContentOptions);
      } else {
        setNotes([{ id: "note-1", label: "Note 1", content: "", selected: false }]);
        setNoteContentOptions(DEFAULT_NOTE_CONTENT_OPTIONS);
      }
    } catch {
      setNotes([{ id: "note-1", label: "Note 1", content: "", selected: false }]);
      setNoteContentOptions(DEFAULT_NOTE_CONTENT_OPTIONS);
    }
  }, [selectedLot, pageFarmId]);

  useEffect(() => {
    if (!selectedLot || !pageFarmId) {
      setDateMiseEnPlace(null);
      setRows([]);
      setNotes([{ id: "note-1", label: "Note 1", content: "", selected: false }]);
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
      if (!cancelled) await loadNotes();
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedLot, pageFarmId, loadPlanning, loadNotes]);

  const updateRow = (id: string, field: keyof VaccinationRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const defaultDateForAge = (age: string): string => {
    if (!dateMiseEnPlace) return "";
    const days = ageToDays(age);
    if (days == null) return "";
    if (days === 0) return isCouvoirAge(age) ? "" : dateMiseEnPlace;
    return addDays(dateMiseEnPlace, days);
  };

  /** Si la date est vide à l’enregistrement : même calcul que l’aperçu (date mise en place du lot = InfosSetup). */
  const rowWithAutoDateFromMiseEnPlace = (r: VaccinationRow): VaccinationRow => {
    if ((r.date ?? "").trim() !== "") return r;
    const d = defaultDateForAge(r.age);
    return d ? { ...r, date: d } : r;
  };

  const addRow = () => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        age: "",
        date: "",
        motif: "",
        vaccinTraitement: "",
        quantite: "",
        administration: "",
        remarques: "",
      },
    ]);
  };

  /** Build request DTO from a row (for create and update). */
  const rowToRequest = (row: VaccinationRow, ordre: number): VaccinationPlanningRequest => ({
    farmId: pageFarmId ?? null,
    lot: selectedLot!,
    ordre,
    age: row.age,
    planDate: row.date || null,
    motif: row.motif || null,
    vaccinTraitement: row.vaccinTraitement || null,
    quantite: row.quantite || null,
    administration: row.administration || null,
    remarques: row.remarques || null,
  });

  /** True if row has minimum content to save (at least age). */
  const hasRowContent = (row: VaccinationRow) => (row.age ?? "").trim() !== "";

  /** Save a single row: create if unsaved, update if already saved. */
  const saveRow = async (row: VaccinationRow) => {
    if (!canEditPlanning) return;
    if (!selectedLot) {
      toast({ title: "Sélectionnez un lot", variant: "destructive" });
      return;
    }
    const canSaveNew = row.serverId == null && hasRowContent(row);
    const canSaveExisting = row.serverId != null;
    if (!canSaveNew && !canSaveExisting) {
      toast({
        title: "Ligne incomplète",
        description: "Renseignez au moins l'âge pour enregistrer la ligne.",
        variant: "destructive",
      });
      return;
    }
    const ordre = rows.findIndex((r) => r.id === row.id);
    if (ordre < 0) return;

    const rowToSave = rowWithAutoDateFromMiseEnPlace(row);
    const planDateTrimmed = (rowToSave.date ?? "").trim();
    if (!planDateTrimmed) {
      const days = ageToDays(rowToSave.age);
      const needsMiseEnPlaceDate =
        days != null &&
        (days > 0 || (days === 0 && !isCouvoirAge(rowToSave.age)));
      if (needsMiseEnPlaceDate) {
        setSavingRowId(null);
        toast({
          title: "Date de mise en place manquante",
          description:
            "Renseignez la date de mise en place du lot dans Données mises en place (Infos setup), ou saisissez la date du planning manuellement.",
          variant: "destructive",
        });
        return;
      }
    }

    setSavingRowId(row.id);
    try {
      const is1J = (rowToSave.age ?? "").trim() === "1 J";
      const couvoirRow = rows.find((r) => isCouvoirAge(r.age));
      const couvoirSaved = couvoirRow?.serverId != null;

      if (is1J && !couvoirSaved && couvoirRow) {
        const couvoirOrdre = rows.findIndex((r) => r.id === couvoirRow.id);
        const couvoirReq: VaccinationPlanningRequest = {
          farmId: pageFarmId ?? null,
          lot: selectedLot,
          ordre: couvoirOrdre,
          age: "Couvoir",
          planDate: dateMiseEnPlace || null,
          motif: couvoirRow.motif || null,
          vaccinTraitement: couvoirRow.vaccinTraitement || null,
          quantite: couvoirRow.quantite || null,
          administration: couvoirRow.administration || null,
          remarques: couvoirRow.remarques || null,
        };
        const createdCouvoir = await api.vaccinationPlanning.create(couvoirReq);
        setRows((prev) =>
          sortAndNormalizePlanningRows(
            prev.map((r) => (r.id === couvoirRow.id ? { ...r, serverId: createdCouvoir.id } : r))
          )
        );
        dispatchVaccinationAlertsRefresh();
      }

      const req = rowToRequest(rowToSave, ordre);
      if (row.serverId != null) {
        await api.vaccinationPlanning.update(row.serverId, req);
        toast({ title: "Ligne mise à jour", description: "La ligne a été mise à jour." });
        setRows((prev) =>
          sortAndNormalizePlanningRows(
            prev.map((r) => (r.id === row.id ? { ...r, ...rowToSave, serverId: r.serverId } : r))
          )
        );
        dispatchVaccinationAlertsRefresh();
      } else {
        const created = await api.vaccinationPlanning.create(req);
        toast({ title: "Ligne enregistrée", description: "La ligne a été enregistrée." });
        setRows((prev) =>
          sortAndNormalizePlanningRows(
            prev.map((r) =>
              r.id === row.id ? { ...r, ...rowToSave, serverId: created.id } : r
            )
          )
        );
        dispatchVaccinationAlertsRefresh();
        return;
      }
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer la ligne.",
        variant: "destructive",
      });
    } finally {
      setSavingRowId(null);
    }
  };

  const removeRow = (id: string) => {
    const row = rows.find((r) => r.id === id);
    if (row && isCouvoirAge(row.age)) {
      toast({
        title: "Suppression impossible",
        description: "La ligne Couvoir est unique et ne peut pas être supprimée.",
        variant: "destructive",
      });
      return;
    }
    if (row?.serverId != null && canEditPlanning) {
      api.vaccinationPlanning
        .delete(row.serverId)
        .then(() => {
          setRows((prev) => prev.filter((r) => r.id !== id));
          dispatchVaccinationAlertsRefresh();
        })
        .catch(() => {
          toast({
            title: "Erreur",
            description: "Impossible de supprimer la ligne.",
            variant: "destructive",
          });
        });
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const toggleNoteSelected = (id: string) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === id ? { ...n, selected: !n.selected } : n))
    );
  };

  const updateNote = (id: string, updates: { label?: string; content?: string }) => {
    setNotes((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      )
    );
  };

  const addNote = () => {
    setNotes((prev) => {
      const nextIndex = prev.length + 1;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          label: `Note ${nextIndex}`,
          content: "",
          selected: false,
        },
      ];
    });
  };

  const notesToReplaceBody = useCallback(
    (list: PlanningNote[]): VaccinationPlanningNoteRequest[] =>
      list.map((n, i) => ({
        farmId: pageFarmId ?? null,
        lot: selectedLot!,
        ordre: i,
        label: n.label || `Note ${i + 1}`,
        content: n.content || null,
        selected: n.selected,
      })),
    [pageFarmId, selectedLot]
  );

  /**
   * Backend only supports replace-all for the lot. Each ✓ sends the full current list so nothing is lost;
   * response rehydrates server ids (new lines get real ids).
   */
  const saveNoteRow = async (noteId: string) => {
    if (!canEditPlanning) return;
    if (!selectedLot || !pageFarmId) {
      toast({ title: "Sélectionnez un lot", variant: "destructive" });
      return;
    }
    setSavingNoteId(noteId);
    try {
      const body = notesToReplaceBody(notes);
      const saved = await api.vaccinationPlanningNotes.replace(
        { lot: selectedLot, farmId: pageFarmId ?? undefined },
        body
      );
      setNotes(mapResponsesToPlanningNotes(saved));
      mergeNoteContentOptionsFromSaved(saved, setNoteContentOptions);
      toast({
        title: "Notes synchronisées",
        description: "Toutes les notes du lot ont été enregistrées (remplacement côté serveur).",
      });
      dispatchVaccinationAlertsRefresh();
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer les notes.",
        variant: "destructive",
      });
    } finally {
      setSavingNoteId(null);
    }
  };

  const removeNote = async (id: string) => {
    if (!canEditPlanning) return;
    const next = notes.filter((n) => n.id !== id);
    if (!selectedLot || !pageFarmId) {
      setNotes(next.length ? next : mapResponsesToPlanningNotes([]));
      return;
    }
    setSavingNoteId(id);
    try {
      const body = notesToReplaceBody(next);
      const saved = await api.vaccinationPlanningNotes.replace(
        { lot: selectedLot, farmId: pageFarmId ?? undefined },
        body
      );
      setNotes(mapResponsesToPlanningNotes(saved));
      mergeNoteContentOptionsFromSaved(saved, setNoteContentOptions);
      dispatchVaccinationAlertsRefresh();
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible de supprimer la note.",
        variant: "destructive",
      });
    } finally {
      setSavingNoteId(null);
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
          {!loading && exportParams && (
            <TooltipProvider>
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <ShimmerButton
                        type="button"
                        className="h-9 w-9 shrink-0 p-0 [border-radius:9999px] border-primary/40 text-primary"
                        background="#f1f5f9"
                        shimmerColor="rgba(37,99,235,0.3)"
                        shimmerDuration="2.5s"
                        aria-label="Télécharger Excel ou PDF"
                      >
                        <Download className="h-4 w-4 text-primary" />
                      </ShimmerButton>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="font-medium">
                    Télécharger (Excel ou PDF)
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" className="min-w-[180px]">
                  <DropdownMenuItem onClick={() => exportToExcel(exportParams)} className="cursor-pointer gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Télécharger Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportToPdf(exportParams)} className="cursor-pointer gap-2">
                    <FileText className="h-4 w-4 text-red-600" />
                    Télécharger PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipProvider>
          )}
          {canEditPlanning && (
            <div className="ml-auto">
              <button
                type="button"
                onClick={addRow}
                className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                <Plus className="w-4 h-4" />
                Ligne
              </button>
            </div>
          )}
          {!canEditPlanning && (
            <span className="ml-auto text-sm text-muted-foreground">Consultation seule</span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
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
                  {canEditPlanning && (
                    <>
                      <th className="w-10 p-2" title="Enregistrer la ligne">✓</th>
                      <th className="w-10 p-2" />
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-muted/30">
                    {canEditPlanning ? (
                      <>
                        <td className="p-1">
                          <PlanningAgeCell
                            rowId={row.id}
                            age={row.age}
                            isCouvoir={isCouvoirAge(row.age)}
                            disabled={loading}
                            onAgeChange={(v) => updateRow(row.id, "age", v)}
                          />
                        </td>
                        <td className="p-1">
                          <input
                            type="date"
                            value={row.date}
                            onChange={(e) => updateRow(row.id, "date", e.target.value)}
                            className="w-full min-w-[130px] border rounded px-2 py-1 text-sm bg-background"
                            placeholder="YYYY-MM-DD"
                            title={
                              (row.date ?? "").trim()
                                ? undefined
                                : "Laisser vide : la date sera calculée à l’enregistrement (date de mise en place + âge), ou saisir une date au format AAAA-MM-JJ."
                            }
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
                            onClick={() => saveRow(row)}
                            disabled={
                              savingRowId === row.id ||
                              loading ||
                              savingNoteId !== null ||
                              (row.serverId == null && !hasRowContent(row))
                            }
                            className="p-1 text-muted-foreground hover:text-primary transition-colors"
                            title="Enregistrer la ligne"
                          >
                            {savingRowId === row.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Check className="w-4 h-4" />
                            )}
                          </button>
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
                      </>
                    ) : (
                      <>
                        <td className="p-2 text-sm">{row.age || "—"}</td>
                        <td className="p-2 text-sm">{row.date || "—"}</td>
                        <td className="p-2 text-sm">{row.motif || "—"}</td>
                        <td className="p-2 text-sm">{row.vaccinTraitement || "—"}</td>
                        <td className="p-2 text-sm">{row.quantite || "—"}</td>
                        <td className="p-2 text-sm">{row.administration || "—"}</td>
                        <td className="p-2 text-sm">{row.remarques || "—"}</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Table des notes — éditable par RT/Admin uniquement ; Backoffice/Responsable Ferme en lecture seule */}
          <div className="mt-6 space-y-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold">Notes</h2>
                {canEditPlanning && (
                  <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                    Chaque ✓ enregistre toutes les lignes du tableau (l&apos;API remplace la liste des notes du
                    lot). La coche « Sélection » est incluse lors de l&apos;enregistrement.
                  </p>
                )}
              </div>
              {canEditPlanning ? (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={addNote}
                    disabled={savingNoteId !== null || savingRowId !== null}
                    className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    Ajouter une note
                  </button>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">Consultation seule</span>
              )}
            </div>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium w-12">Sélection</th>
                    <th className="text-left p-2 font-medium min-w-[80px]">Note</th>
                    <th className="text-left p-2 font-medium">Contenu</th>
                    {canEditPlanning && (
                      <>
                        <th className="w-10 p-2 text-center text-xs font-medium" title="Enregistrer (synchronise toutes les notes)">
                          ✓
                        </th>
                        <th className="w-10 p-2" />
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(canEditPlanning ? notes : notes.filter((n) => n.selected)).map((note) => (
                    <tr key={note.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 align-top">
                        <Checkbox
                          checked={note.selected}
                          onCheckedChange={() => canEditPlanning && toggleNoteSelected(note.id)}
                          disabled={!canEditPlanning}
                          aria-label={`Sélectionner ${note.label || "note"}`}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <span className="font-medium">{note.label}</span>
                      </td>
                      <td className="p-2 align-top">
                        {canEditPlanning ? (
                          <NoteContentSelect
                            value={note.content}
                            options={noteContentOptions}
                            onChange={(v) => updateNote(note.id, { content: v })}
                            onAddOption={(v) =>
                              setNoteContentOptions((prev) =>
                                prev.includes(v) ? prev : [...prev, v]
                              )
                            }
                            placeholder="Sélectionner le contenu"
                          />
                        ) : (
                          <span className="text-foreground">{note.content || "—"}</span>
                        )}
                      </td>
                      {canEditPlanning && (
                        <>
                          <td className="p-2 align-top text-center">
                            <button
                              type="button"
                              onClick={() => saveNoteRow(note.id)}
                              disabled={savingNoteId !== null || savingRowId !== null}
                              className="inline-flex p-1 text-muted-foreground hover:text-primary disabled:opacity-40 disabled:pointer-events-none"
                              title="Enregistrer les notes du lot (toutes les lignes)"
                              aria-label="Enregistrer les notes du lot"
                            >
                              {savingNoteId === note.id ? (
                                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                              ) : (
                                <Check className="w-4 h-4 shrink-0" />
                              )}
                            </button>
                          </td>
                          <td className="p-2 align-top">
                            <button
                              type="button"
                              onClick={() => removeNote(note.id)}
                              disabled={savingNoteId !== null || savingRowId !== null}
                              className="p-1 text-muted-foreground hover:text-destructive disabled:opacity-40 disabled:pointer-events-none"
                              title="Supprimer la note"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
