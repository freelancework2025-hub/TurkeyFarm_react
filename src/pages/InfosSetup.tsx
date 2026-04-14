import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Building2, Check, Plus, Trash2, ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";
import AppLayout from "@/components/layout/AppLayout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import LotSelectorView from "@/components/lot/LotSelectorView";
import { useAuth } from "@/contexts/AuthContext";
import { api, type FarmResponse, type LotWithStatusResponse, type SetupInfoRequest, type SetupInfoResponse } from "@/lib/api";
import { isClosedLotBlockedForSession, type ClosedLotSessionContext } from "@/lib/lotAccess";
import { exportToExcel, exportToPdf } from "@/lib/infosSetupExport";
import { formatGroupedNumber, toOptionalNumber } from "@/lib/formatResumeAmount";
import { QuantityInput } from "@/components/ui/QuantityInput";
import { useToast } from "@/hooks/use-toast";

const BUILDINGS = ["B1", "B2", "B3", "B4"];
const SEXES = ["Mâle", "Femelle"];
const ELEVAGE_TYPES = ["DINDE CHAIR"];
const SOUCHES = ["PREMIUM", "Grade maker", "Optima", "Converter"];

/**
 * Effectif mis en place: same display pattern as Livraisons d'aliment (QTE) —
 * grouped thousands + dot decimal via formatGroupedNumber; read-only = static span;
 * editable = text input, formatted when blurred, raw while focused.
 */

interface SetupRow {
  id: string;
  lot: string;
  dateMiseEnPlace: string;
  heureMiseEnPlace: string;
  building: string;
  sex: string;
  effectifMisEnPlace: string;
  typeElevage: string;
  origineFournisseur: string;
  dateEclosion: string;
  souche: string;
}

function toRow(s: SetupInfoResponse): SetupRow {
  return {
    id: String(s.id),
    lot: s.lot,
    dateMiseEnPlace: s.dateMiseEnPlace,
    heureMiseEnPlace: s.heureMiseEnPlace,
    building: s.building,
    sex: s.sex,
    effectifMisEnPlace: String(s.effectifMisEnPlace),
    typeElevage: s.typeElevage,
    origineFournisseur: s.origineFournisseur,
    dateEclosion: s.dateEclosion,
    souche: s.souche,
  };
}

function emptyRow(selectedLot?: string | null, availableBuildings?: string[]): SetupRow {
  const today = new Date().toISOString().split("T")[0];
  const defaultBuilding = availableBuildings && availableBuildings.length > 0 ? availableBuildings[0] : BUILDINGS[0];
  return {
    id: crypto.randomUUID(),
    lot: (selectedLot?.trim() || "1"),
    dateMiseEnPlace: today,
    heureMiseEnPlace: "08:00",
    building: defaultBuilding,
    sex: SEXES[0],
    effectifMisEnPlace: "",
    typeElevage: "DINDE CHAIR",
    origineFournisseur: "",
    dateEclosion: today,
    souche: "PREMIUM",
  };
}

function isSavedRow(id: string): boolean {
  return /^\d+$/.test(id);
}

function isRowCompleteForSave(r: SetupRow): boolean {
  return (
    r.lot.trim() !== "" &&
    Boolean(r.dateMiseEnPlace) &&
    r.effectifMisEnPlace.trim() !== "" &&
    r.origineFournisseur.trim() !== ""
  );
}

function formatEffectifDisplay(s: string): string {
  const n = toOptionalNumber(s);
  if (n == null) return "—";
  return formatGroupedNumber(Math.round(n), 0);
}

function formatDateDMY(iso: string): string {
  if (!iso) return "—";
  const parts = iso.split("-").reverse();
  if (parts.length !== 3) return "—";
  return parts.join("/");
}

function setupRowToRequest(r: SetupRow): SetupInfoRequest {
  return {
    lot: r.lot.trim(),
    dateMiseEnPlace: r.dateMiseEnPlace,
    heureMiseEnPlace: r.heureMiseEnPlace,
    building: r.building,
    sex: r.sex,
    effectifMisEnPlace: Math.max(0, Math.round(toOptionalNumber(r.effectifMisEnPlace) ?? 0)),
    typeElevage: r.typeElevage,
    origineFournisseur: r.origineFournisseur.trim(),
    dateEclosion: r.dateEclosion,
    souche: r.souche,
  };
}

/** Returns the first (building, sex) combo not yet used by any row. Ensures new rows don't violate uq_setup_info_farm_lot_building_sex. */
function getFirstUnusedBuildingSex(
  existingRows: SetupRow[],
  availableBuildings: string[],
  sexes: string[]
): { building: string; sex: string } {
  const used = new Set(existingRows.map((r) => `${r.building}|${r.sex}`));
  const buildings = availableBuildings.length > 0 ? availableBuildings : BUILDINGS;
  for (const sex of sexes) {
    for (const building of buildings) {
      const key = `${building}|${sex}`;
      if (!used.has(key)) return { building, sex };
    }
  }
  return {
    building: buildings[0],
    sex: sexes[0],
  };
}

// BuildingCombobox component for selecting or creating buildings
interface BuildingComboboxProps {
  value: string;
  onChange: (value: string) => void;
  availableBuildings: string[];
  onAddBuilding: (building: string) => void;
  disabled?: boolean;
  canCreate: boolean;
}

function BuildingCombobox({ value, onChange, availableBuildings, onAddBuilding, disabled = false, canCreate }: BuildingComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setIsCreatingNew(false);
        setInputValue(value); // Reset to original value if clicking outside
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value]);

  const filteredBuildings = availableBuildings.filter(building =>
    building.toLowerCase().includes(inputValue.toLowerCase())
  );

  const exactMatch = availableBuildings.find(building => 
    building.toLowerCase() === inputValue.toLowerCase()
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setIsOpen(true);
    
    // Check if this is a new building name
    const isNew = !availableBuildings.some(building => 
      building.toLowerCase() === newValue.toLowerCase()
    );
    setIsCreatingNew(isNew && newValue.trim() !== '' && canCreate);
  };

  const handleSelectBuilding = (building: string) => {
    setInputValue(building);
    onChange(building);
    setIsOpen(false);
    setIsCreatingNew(false);
  };

  const handleCreateNew = () => {
    const trimmedValue = inputValue.trim();
    if (trimmedValue && canCreate && !exactMatch) {
      onAddBuilding(trimmedValue);
      onChange(trimmedValue);
    }
    setIsOpen(false);
    setIsCreatingNew(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isCreatingNew) {
        handleCreateNew();
      } else if (filteredBuildings.length === 1) {
        handleSelectBuilding(filteredBuildings[0]);
      } else if (exactMatch) {
        handleSelectBuilding(exactMatch);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setIsCreatingNew(false);
      setInputValue(value);
    }
  };

  const handleBlur = () => {
    // Delay to allow click events on dropdown items
    setTimeout(() => {
      if (isCreatingNew && inputValue.trim() && canCreate && !exactMatch) {
        handleCreateNew();
      } else if (exactMatch) {
        handleSelectBuilding(exactMatch);
      } else {
        setInputValue(value); // Reset to original value
        setIsCreatingNew(false);
      }
    }, 150);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 pr-8 ${
            disabled ? "bg-muted/50 cursor-not-allowed" : ""
          }`}
          placeholder="Sélectionner ou créer un bâtiment"
        />
        <ChevronDown 
          className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`} 
        />
      </div>
      
      {isOpen && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {filteredBuildings.length > 0 && (
            <div className="py-1">
              {filteredBuildings.map((building) => (
                <button
                  key={building}
                  type="button"
                  onClick={() => handleSelectBuilding(building)}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-muted focus:bg-muted focus:outline-none"
                >
                  {building}
                </button>
              ))}
            </div>
          )}
          
          {isCreatingNew && (
            <div className="border-t border-border py-1">
              <button
                type="button"
                onClick={handleCreateNew}
                className="w-full px-3 py-2 text-left text-sm text-primary hover:bg-muted focus:bg-muted focus:outline-none flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Créer "{inputValue}"
              </button>
            </div>
          )}
          
          {filteredBuildings.length === 0 && !isCreatingNew && (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              {!canCreate ? "Aucun bâtiment trouvé" : "Aucun bâtiment trouvé - tapez pour en créer un nouveau"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function InfosSetup() {
  const [searchParams, setSearchParams] = useSearchParams();
  const farmIdParam = searchParams.get("farmId");
  const lotParam = searchParams.get("lot") ?? "";
  const selectedFarmId = farmIdParam ? parseInt(farmIdParam, 10) : null;
  const isValidFarmId = selectedFarmId != null && !Number.isNaN(selectedFarmId);
  const hasLotInUrl = lotParam.trim() !== "";

  const {
    user,
    isAdministrateur,
    isResponsableTechnique,
    isBackofficeEmployer,
    canAccessAllFarms,
    selectedFarmId: authSelectedFarmId,
    selectedFarmName,
    allFarmsMode,
    canCreate,
    canCreateNewLot,
    canUpdate,
    hasFullAccess,
  } = useAuth();

  /** Only Responsable Technique and Administrateur can fill/edit setup info; others can only view. */
  const canFillSetupInfo = isResponsableTechnique || isAdministrateur;
  
  const { toast } = useToast();
  
  const showFarmSelector = canAccessAllFarms && !isValidFarmId;

  const [farms, setFarms] = useState<FarmResponse[]>([]);
  const [farmsLoading, setFarmsLoading] = useState(showFarmSelector);
  const [lots, setLots] = useState<string[]>([]);
  const [lotsWithStatus, setLotsWithStatus] = useState<LotWithStatusResponse[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);

  const selectedLot = lotParam?.trim() || null;
  const [rows, setRows] = useState<SetupRow[]>([emptyRow(selectedLot, BUILDINGS)]);
  const [loading, setLoading] = useState(true);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [effectifFocusRowId, setEffectifFocusRowId] = useState<string | null>(null);
  const [dateFocusRowId, setDateFocusRowId] = useState<string | null>(null);
  
  // Dynamic buildings list - starts with predefined buildings and grows with user input
  const [availableBuildings, setAvailableBuildings] = useState<string[]>(BUILDINGS);

  useEffect(() => {
    if (!showFarmSelector) return;
    setFarmsLoading(true);
    api.farms
      .list()
      .then((list) => setFarms(list))
      .catch(() => setFarms([]))
      .finally(() => setFarmsLoading(false));
  }, [showFarmSelector]);

  const reportingFarmId = isValidFarmId ? selectedFarmId : (canAccessAllFarms ? undefined : authSelectedFarmId ?? undefined);
  
  // For URL parameters, always use a farmId when available to ensure proper multi-tenant data isolation
  const urlFarmId = reportingFarmId ?? authSelectedFarmId;

  // Function to refresh lots list (with closed/open status for grey display and close/open actions)
  const refreshLots = useCallback(async () => {
    if (showFarmSelector || !reportingFarmId) return;
    setLotsLoading(true);
    try {
      const withStatus = await api.farms.lotsWithStatus(reportingFarmId);
      setLotsWithStatus(withStatus ?? []);
      setLots((withStatus ?? []).map((x) => x.lot));
    } catch {
      setLotsWithStatus([]);
      setLots([]);
    } finally {
      setLotsLoading(false);
    }
  }, [showFarmSelector, reportingFarmId]);

  useEffect(() => {
    if (!reportingFarmId) return;
    refreshLots();
  }, [reportingFarmId, refreshLots]);

  const lotAccessCtx: ClosedLotSessionContext = useMemo(
    () => ({
      currentUserId: user?.id ?? null,
      isAdministrateur,
      isResponsableTechnique,
    }),
    [user?.id, isAdministrateur, isResponsableTechnique]
  );

  /** When the selected lot is closed for this session, show message and lot selector only. */
  const isSelectedLotClosed = Boolean(
    hasLotInUrl &&
      selectedLot &&
      isClosedLotBlockedForSession(lotsWithStatus.find((l) => l.lot === selectedLot), lotAccessCtx)
  );

  // Load setup information for the selected lot (skip when lot is closed for this user)
  const load = useCallback(async () => {
    if (!hasLotInUrl) return;
    const st = lotsWithStatus.find((l) => l.lot === selectedLot);
    if (isClosedLotBlockedForSession(st, lotAccessCtx)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Try to load existing setup info first
      let setupRows: SetupRow[] = [];
      
      try {
        console.log("📡 InfosSetup - Calling api.setupInfo.list with:", {
          farmId: reportingFarmId ?? undefined,
          lot: selectedLot
        });
        
        const setupInfoList = await api.setupInfo.list(reportingFarmId ?? undefined, selectedLot);
        
        console.log("✅ InfosSetup - setupInfo API response:", {
          count: setupInfoList.length,
          data: setupInfoList
        });
        
        setupRows = setupInfoList.map(toRow);
        
        console.log("🔄 InfosSetup - Mapped setup rows:", {
          count: setupRows.length,
          rows: setupRows
        });
      } catch (error) {
        console.log("❌ InfosSetup - setupInfo API failed, falling back to placements:", error);
        
        // If setup info API doesn't exist yet, fall back to placement data
        const placements = await api.placements.list(reportingFarmId ?? undefined);
        
        console.log("📡 InfosSetup - placements API response:", {
          count: placements.length,
          data: placements
        });
        
        const filtered = selectedLot ? placements.filter((p) => String(p.lot || "").trim() === selectedLot) : placements;
        
        console.log("🔍 InfosSetup - Filtered placements for lot:", {
          selectedLot,
          filteredCount: filtered.length,
          filtered
        });
        
        // Convert placements to setup rows with additional fields
        setupRows = filtered.map((p): SetupRow => ({
          id: String(p.id),
          lot: p.lot,
          dateMiseEnPlace: p.placementDate,
          heureMiseEnPlace: "08:00", // Default value
          building: p.building,
          sex: p.sex,
          effectifMisEnPlace: String(p.initialCount),
          typeElevage: "DINDE CHAIR", // Default value
          origineFournisseur: "", // Default empty
          dateEclosion: p.placementDate, // Default to placement date
          souche: "PREMIUM", // Default value
        }));
        
        console.log("🔄 InfosSetup - Mapped placement rows:", {
          count: setupRows.length,
          rows: setupRows
        });
      }

      // Extract unique buildings from loaded data and add to available buildings
      const existingBuildings = [...new Set(setupRows.map(row => row.building))];
      const combined = [...new Set([...availableBuildings, ...existingBuildings])].sort();
      
      setAvailableBuildings(combined);

      let finalRows: SetupRow[];
      if (!canFillSetupInfo) {
        finalRows = setupRows;
      } else if (setupRows.length) {
        const empty = emptyRow(selectedLot, combined);
        const { building, sex } = getFirstUnusedBuildingSex(setupRows, combined, SEXES);
        finalRows = [...setupRows, { ...empty, building, sex }];
      } else {
        finalRows = [emptyRow(selectedLot, combined)];
      }
      
      console.log("🎯 InfosSetup - Final rows to display:", {
        canFillSetupInfo,
        setupRowsCount: setupRows.length,
        finalRowsCount: finalRows.length,
        finalRows
      });

      setRows(finalRows);
    } catch (error) {
      console.log("💥 InfosSetup - Load failed with error:", error);
      setRows([emptyRow(selectedLot, availableBuildings)]);
    } finally {
      setLoading(false);
    }
  }, [reportingFarmId, selectedLot, hasLotInUrl, canFillSetupInfo, lotsWithStatus, lotAccessCtx]);

  useEffect(() => {
    console.log("🔄 InfosSetup - useEffect triggered, calling load()");
    load();
  }, [load]);

  const selectFarm = useCallback(
    (id: number) => {
      setSearchParams({ farmId: String(id) });
    },
    [setSearchParams]
  );

  const clearFarmSelection = useCallback(() => {
    setSearchParams({});
  }, [setSearchParams]);

  const addRow = () => {
    const last = rows[rows.length - 1];
    const { building, sex } = getFirstUnusedBuildingSex(rows, availableBuildings, SEXES);
    setRows((prev) => [
      ...prev,
      {
        ...emptyRow(selectedLot, availableBuildings),
        id: crypto.randomUUID(),
        lot: last?.lot ?? selectedLot ?? "1",
        dateMiseEnPlace: last?.dateMiseEnPlace ?? new Date().toISOString().split("T")[0],
        heureMiseEnPlace: last?.heureMiseEnPlace ?? "08:00",
        building,
        sex,
        typeElevage: last?.typeElevage ?? "DINDE CHAIR",
        origineFournisseur: last?.origineFournisseur ?? "",
        dateEclosion: last?.dateEclosion ?? new Date().toISOString().split("T")[0],
        souche: last?.souche ?? "PREMIUM",
      },
    ]);
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    const rowToRemove = rows.find((r) => r.id === id);
    const isSaved = rowToRemove && isSavedRow(rowToRemove.id);
    setRows((prev) => prev.filter((r) => r.id !== id));
    if (isSaved && rowToRemove && hasFullAccess) {
      // Persist deletion: save remaining rows via replaceBatch (removes deleted row from backend)
      const remaining = rows.filter((r) => r.id !== id);
      const toSend: SetupInfoRequest[] = remaining.filter(isRowCompleteForSave).map(setupRowToRequest);
      api.setupInfo
        .replaceBatch(toSend, reportingFarmId ?? undefined, selectedLot)
        .then(() => {
          toast({ title: "Ligne supprimée", description: "La ligne a été supprimée." });
          load();
        })
        .catch(() => {
          toast({
            title: "Erreur",
            description: "Impossible de supprimer la ligne.",
            variant: "destructive",
          });
          load(); // Reload to restore state
        });
    }
  };

  const addNewBuilding = (building: string) => {
    const trimmedBuilding = building.trim();
    if (trimmedBuilding && !availableBuildings.includes(trimmedBuilding)) {
      setAvailableBuildings(prev => [...prev, trimmedBuilding].sort());
      toast({
        title: "Nouveau bâtiment créé",
        description: `Le bâtiment "${trimmedBuilding}" a été ajouté à la liste.`,
      });
    }
  };

  const updateRow = (id: string, field: keyof SetupRow, value: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        
        const updated = { ...r, [field]: value };
        
        // Business rule: When building or sex changes, auto-populate effectif from existing data
        if (field === 'building' || field === 'sex') {
          const building = field === 'building' ? value : r.building;
          const sex = field === 'sex' ? value : r.sex;
          
          // Find existing row with same building and sex
          const existingRow = rows.find(row => 
            row.building === building && 
            row.sex === sex && 
            row.effectifMisEnPlace && 
            row.id !== id
          );
          
          if (existingRow) {
            updated.effectifMisEnPlace = existingRow.effectifMisEnPlace;
            toast({
              title: "Effectif auto-rempli",
              description: `Effectif de ${formatEffectifDisplay(existingRow.effectifMisEnPlace)} appliqué pour ${building} - ${sex}`,
            });
          }
        }
        
        return updated;
      })
    );
  };

  /** Enregistre via replaceBatch toutes les lignes complètes (API lot entier), déclenché par ✓ sur une ligne. */
  const saveRow = async (row: SetupRow) => {
    if (!canFillSetupInfo) {
      toast({
        title: "Non autorisé",
        description: "Seuls le responsable technique et l'administrateur peuvent renseigner les données mises en place.",
        variant: "destructive",
      });
      return;
    }
    if (!isRowCompleteForSave(row)) {
      toast({
        title: "Ligne incomplète",
        description: "Renseignez le lot, la date, l'effectif et l'origine/fournisseur avant d'enregistrer.",
        variant: "destructive",
      });
      return;
    }

    const toSend: SetupInfoRequest[] = rows.filter(isRowCompleteForSave).map(setupRowToRequest);

    const keys = toSend.map((r) => `${r.building}|${r.sex}`);
    const duplicateKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (duplicateKeys.length > 0) {
      const labels = [...new Set(duplicateKeys)].map((k) => k.replace("|", " - "));
      toast({
        title: "Combinaison en double",
        description: `Chaque ligne doit avoir une combinaison Bâtiment/Sexe unique. Double(s) : ${labels.join(", ")}`,
        variant: "destructive",
      });
      return;
    }

    if (toSend.length === 0) {
      toast({
        title: "Aucune ligne à enregistrer",
        description: "Renseignez au moins lot, date, effectif et fournisseur.",
        variant: "destructive",
      });
      return;
    }

    setSavingRowId(row.id);
    try {
      try {
        await api.setupInfo.replaceBatch(toSend, reportingFarmId ?? undefined, selectedLot);
      } catch {
        const placementData = toSend.map((setup) => ({
          lot: setup.lot,
          placementDate: setup.dateMiseEnPlace,
          building: setup.building,
          sex: setup.sex,
          initialCount: setup.effectifMisEnPlace,
        }));

        if (reportingFarmId != null) {
          await api.placements.replaceBatch(placementData, reportingFarmId);
        } else {
          await api.placements.createBatch(placementData, reportingFarmId);
        }
      }

      toast({
        title: "Données enregistrées",
        description: `${toSend.length} ligne(s) complète(s) enregistrée(s) pour ce lot.`,
      });
      await load();
      await refreshLots();
    } catch {
      toast({
        title: "Erreur",
        description: "Impossible d'enregistrer les données mises en place.",
        variant: "destructive",
      });
    } finally {
      setSavingRowId(null);
    }
  };

  const totalMale = rows
    .filter((r) => r.sex === "Mâle")
    .reduce((sum, r) => sum + Math.max(0, Math.round(toOptionalNumber(r.effectifMisEnPlace) ?? 0)), 0);
  const totalFemale = rows
    .filter((r) => r.sex === "Femelle")
    .reduce((sum, r) => sum + Math.max(0, Math.round(toOptionalNumber(r.effectifMisEnPlace) ?? 0)), 0);

  if (loading && hasLotInUrl) {
    return (
      <AppLayout>
        <div className="bg-card rounded-lg border border-border shadow-sm p-8 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Chargement des données mises en place…</span>
        </div>
      </AppLayout>
    );
  }

  const canShowExport = hasLotInUrl && !isSelectedLotClosed && reportingFarmId != null;
  const exportFarmName =
    canAccessAllFarms && isValidFarmId && selectedFarmId != null
      ? (farms.find((f) => f.id === reportingFarmId)?.name ?? "Ferme")
      : (selectedFarmName ?? "Ferme");

  const handleExportExcel = async () => {
    if (!canShowExport || !selectedLot) return;
    try {
      await exportToExcel({
        farmName: exportFarmName,
        lot: selectedLot,
        rows,
        totalMale,
        totalFemale,
      });
      toast({ title: "Export Excel", description: "Le fichier Excel a été téléchargé." });
    } catch {
      toast({ title: "Erreur", description: "Impossible de générer le fichier Excel.", variant: "destructive" });
    }
  };

  const handleExportPdf = () => {
    if (!canShowExport || !selectedLot) return;
    exportToPdf({
      farmName: exportFarmName,
      lot: selectedLot,
      rows,
      totalMale,
      totalFemale,
    });
    toast({ title: "Export PDF", description: "Le fichier PDF a été téléchargé." });
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div className="flex flex-wrap items-center gap-3">
          <h1>Données mises en place</h1>
          {canShowExport && (
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
                  <DropdownMenuItem onClick={handleExportExcel} className="cursor-pointer gap-2">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                    Télécharger Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportPdf} className="cursor-pointer gap-2">
                    <FileText className="h-4 w-4 text-red-600" />
                    Télécharger PDF
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipProvider>
          )}
        </div>
        <p>
          Configuration initiale de l'élevage — Informations de base réutilisables pour tout le lot
          {!canFillSetupInfo && (
            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Consultation seule
            </span>
          )}
        </p>
      </div>

      {showFarmSelector ? (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            {!canFillSetupInfo
              ? "Choisissez une ferme pour consulter les données mises en place. Vous pouvez changer de ferme sans vous déconnecter."
              : "Choisissez une ferme pour consulter et gérer les données mises en place. Vous pouvez changer de ferme sans vous déconnecter."}
          </p>
          {farmsLoading ? (
            <div className="bg-card rounded-lg border border-border shadow-sm p-12 flex items-center justify-center gap-2 text-muted-foreground">
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
            <p className="text-sm text-muted-foreground">Aucune ferme disponible.</p>
          )}
        </div>
      ) : (
        <>
          {canAccessAllFarms && isValidFarmId && (
            <button
              type="button"
              onClick={clearFarmSelection}
              className="mb-4 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Changer de ferme
            </button>
          )}

          {!hasLotInUrl ? (
            <LotSelectorView
              existingLots={lots}
              lotsWithStatus={lotsWithStatus.length > 0 ? lotsWithStatus : undefined}
              loading={lotsLoading}
              onSelectLot={(lot) => {
                const status = lotsWithStatus.find((l) => l.lot === lot);
                if (isClosedLotBlockedForSession(status, lotAccessCtx)) {
                  toast({
                    title: "Lot fermé",
                    description:
                      "Les données de ce lot ne sont pas accessibles pour votre compte. Choisissez un lot ouvert.",
                    variant: "destructive",
                  });
                  return;
                }
                setSearchParams(urlFarmId != null ? { farmId: String(urlFarmId), lot } : { lot });
              }}
              onNewLot={
                canCreateNewLot
                  ? (lot) => setSearchParams(urlFarmId != null ? { farmId: String(urlFarmId), lot } : { lot })
                  : undefined
              }
              canCreate={canCreateNewLot}
              canCloseOpen={canFillSetupInfo}
              onCloseLot={async (lot) => {
                if (!reportingFarmId) return;
                await api.farms.closeLot(reportingFarmId, lot);
                toast({ title: "Lot fermé", description: `Le lot ${lot} est maintenant fermé.` });
                await refreshLots();
              }}
              onOpenLot={async (lot) => {
                if (!reportingFarmId) return;
                await api.farms.openLot(reportingFarmId, lot);
                toast({ title: "Lot ouvert", description: `Le lot ${lot} est à nouveau accessible.` });
                await refreshLots();
              }}
              title="Choisir un lot — Données mises en place"
              emptyMessage="Aucun lot sur cette exploitation. Les responsables techniques et administrateurs peuvent en créer un ; sinon choisissez un lot existant."
            />
          ) : isSelectedLotClosed ? (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-4 mb-6">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Ce lot est fermé. Les données ne sont pas accessibles.
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  Choisissez un autre lot ci-dessous ou, si vous êtes responsable technique ou administrateur, survolez le lot fermé et cliquez sur &quot;Ouvrir le lot&quot;.
                </p>
              </div>
              <LotSelectorView
                existingLots={lots}
                lotsWithStatus={lotsWithStatus.length > 0 ? lotsWithStatus : undefined}
                loading={lotsLoading}
                onSelectLot={(lot) => {
                  const status = lotsWithStatus.find((l) => l.lot === lot);
                  if (isClosedLotBlockedForSession(status, lotAccessCtx)) {
                    toast({
                      title: "Lot fermé",
                      description:
                        "Les données de ce lot ne sont pas accessibles pour votre compte. Choisissez un lot ouvert.",
                      variant: "destructive",
                    });
                    return;
                  }
                  setSearchParams(urlFarmId != null ? { farmId: String(urlFarmId), lot } : { lot });
                }}
                onNewLot={
                  canCreateNewLot
                    ? (lot) => setSearchParams(urlFarmId != null ? { farmId: String(urlFarmId), lot } : { lot })
                    : undefined
                }
                canCreate={canCreateNewLot}
                canCloseOpen={canFillSetupInfo}
                onCloseLot={async (lot) => {
                  if (!reportingFarmId) return;
                  await api.farms.closeLot(reportingFarmId, lot);
                  toast({ title: "Lot fermé", description: `Le lot ${lot} est maintenant fermé.` });
                  await refreshLots();
                }}
                onOpenLot={async (lot) => {
                  if (!reportingFarmId) return;
                  await api.farms.openLot(reportingFarmId, lot);
                  toast({ title: "Lot ouvert", description: `Le lot ${lot} est à nouveau accessible.` });
                  await refreshLots();
                }}
                title="Choisir un lot — Données mises en place"
                emptyMessage="Aucun lot sur cette exploitation. Les responsables techniques et administrateurs peuvent en créer un ; sinon choisissez un lot existant."
              />
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-4 mb-6">
                <span className="text-sm font-medium">Lot : <strong>{lotParam}</strong></span>
                <button
                  type="button"
                  onClick={() => setSearchParams(urlFarmId != null ? { farmId: String(urlFarmId) } : {})}
                  className="text-sm text-muted-foreground hover:text-foreground underline"
                >
                  Changer de lot
                </button>
              </div>

              <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                  <div>
                    <h2 className="text-lg font-display font-bold text-foreground">
                      Données mises en place
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {allFarmsMode
                        ? "Configuration initiale de l'élevage — informations réutilisables (toutes fermes)."
                        : selectedFarmName
                          ? `Ferme : ${selectedFarmName} — Configuration initiale de l'élevage`
                          : "Configuration initiale de l'élevage — informations réutilisables"}
                      {canFillSetupInfo && (
                        <span className="block mt-1">Cliquez sur ✓ sur une ligne pour enregistrer (toutes les lignes complètes du lot sont synchronisées).</span>
                      )}
                    </p>
                  </div>
                  {canFillSetupInfo && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={addRow}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-farm-green text-farm-green-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                      >
                        <Plus className="w-4 h-4" /> Ajouter
                      </button>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="table-farm">
                    <thead>
                      <tr>
                        <th>Date Mise en Place</th>
                        <th>Heure de mise en place</th>
                        <th>Bâtiment</th>
                        <th>Sexe</th>
                        <th>Effectif mis en place</th>
                        <th>Type d'élevage</th>
                        <th>Origine/Fournisseur</th>
                        <th>Date d'éclosion</th>
                        <th>Souche</th>
                        {canFillSetupInfo ? <th colSpan={2} className="w-10">Actions</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const saved = isSavedRow(row.id);
                        const readOnly = !canFillSetupInfo || (saved && !canUpdate);
                        const canSaveRow = canFillSetupInfo && (!saved || canUpdate);
                        const showDelete = saved ? hasFullAccess : canFillSetupInfo;
                        return (
                          <tr key={row.id}>
                            <td>
                              {readOnly ? (
                                <span className="text-sm">{formatDateDMY(row.dateMiseEnPlace)}</span>
                              ) : dateFocusRowId === row.id ? (
                                <input
                                  type="date"
                                  value={row.dateMiseEnPlace}
                                  onChange={(e) => updateRow(row.id, "dateMiseEnPlace", e.target.value)}
                                  onBlur={() => setDateFocusRowId(null)}
                                  autoFocus
                                  className="w-full"
                                />
                              ) : (
                                <span
                                  onClick={() => setDateFocusRowId(row.id)}
                                  className="cursor-pointer text-sm hover:text-primary transition-colors"
                                  title="Cliquer pour éditer"
                                >
                                  {formatDateDMY(row.dateMiseEnPlace)}
                                </span>
                              )}
                            </td>
                            <td>
                              <input
                                type="time"
                                value={row.heureMiseEnPlace}
                                onChange={(e) => updateRow(row.id, "heureMiseEnPlace", e.target.value)}
                                readOnly={readOnly}
                                className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                              />
                            </td>
                            <td>
                              <BuildingCombobox
                                value={row.building}
                                onChange={(value) => updateRow(row.id, "building", value)}
                                availableBuildings={availableBuildings}
                                onAddBuilding={addNewBuilding}
                                disabled={readOnly}
                                canCreate={canCreate && !readOnly}
                              />
                            </td>
                            <td>
                              <select
                                value={row.sex}
                                onChange={(e) => updateRow(row.id, "sex", e.target.value)}
                                className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                                disabled={readOnly}
                              >
                                {SEXES.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                            <td className="min-w-[7rem] text-center">
                              {readOnly ? (
                                <span className="block text-center tabular-nums px-1 py-0.5 whitespace-nowrap">
                                  {formatEffectifDisplay(row.effectifMisEnPlace)}
                                </span>
                              ) : (
                                <QuantityInput
                                  value={row.effectifMisEnPlace}
                                  onChange={(value) => {
                                    // For effectif, we need integer values
                                    if (value === "") {
                                      updateRow(row.id, "effectifMisEnPlace", "");
                                    } else {
                                      const n = toOptionalNumber(value);
                                      if (n != null && n >= 0) {
                                        updateRow(row.id, "effectifMisEnPlace", String(Math.round(n)));
                                      } else {
                                        updateRow(row.id, "effectifMisEnPlace", value);
                                      }
                                    }
                                  }}
                                  isFocused={effectifFocusRowId === row.id}
                                  onFocusChange={(focused) => setEffectifFocusRowId(focused ? row.id : null)}
                                  placeholder="0"
                                  className="w-full min-w-[6rem] tabular-nums text-center"
                                  showFormattedDisplay={true}
                                />
                              )}
                            </td>
                            <td>
                              <select
                                value={row.typeElevage}
                                onChange={(e) => updateRow(row.id, "typeElevage", e.target.value)}
                                className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                                disabled={readOnly}
                              >
                                {ELEVAGE_TYPES.map((t) => (
                                  <option key={t} value={t}>{t}</option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="text"
                                value={row.origineFournisseur}
                                onChange={(e) => updateRow(row.id, "origineFournisseur", e.target.value)}
                                placeholder="Nom du fournisseur"
                                readOnly={readOnly}
                                className={`w-full ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                value={row.dateEclosion}
                                onChange={(e) => updateRow(row.id, "dateEclosion", e.target.value)}
                                readOnly={readOnly}
                                className={readOnly ? "bg-muted/50 cursor-not-allowed" : ""}
                              />
                            </td>
                            <td>
                              <select
                                value={row.souche}
                                onChange={(e) => updateRow(row.id, "souche", e.target.value)}
                                className={`w-full bg-transparent border-0 outline-none text-sm py-0.5 ${readOnly ? "bg-muted/50 cursor-not-allowed" : ""}`}
                                disabled={readOnly}
                              >
                                {SOUCHES.map((s) => (
                                  <option key={s} value={s}>{s}</option>
                                ))}
                              </select>
                            </td>
                            {canFillSetupInfo ? (
                              <>
                                <td className="w-9 max-w-9 shrink-0 !px-1 text-center align-middle">
                                  {canSaveRow && (
                                    <button
                                      type="button"
                                      onClick={() => saveRow(row)}
                                      disabled={savingRowId != null}
                                      className="text-muted-foreground hover:text-primary transition-colors p-0.5 inline-flex justify-center"
                                      title="Enregistrer (synchronise toutes les lignes complètes)"
                                    >
                                      {savingRowId === row.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Check className="w-4 h-4" />
                                      )}
                                    </button>
                                  )}
                                </td>
                                <td>
                                  {showDelete && (
                                    <button
                                      type="button"
                                      onClick={() => removeRow(row.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                                      disabled={rows.length <= 1}
                                      title="Supprimer la ligne"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </td>
                              </>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/60">
                        <td colSpan={4} className="text-right font-semibold text-sm px-3 py-2">
                          Total Mâle / Femelle :
                        </td>
                        <td className="px-3 py-2 font-bold text-sm whitespace-nowrap tabular-nums">
                          {formatGroupedNumber(totalMale, 0)} / {formatGroupedNumber(totalFemale, 0)}
                        </td>
                        <td colSpan={4} className="text-right font-semibold text-sm px-3 py-2">
                          Total Général :{" "}
                          <span className="text-accent tabular-nums">
                            {formatGroupedNumber(totalMale + totalFemale, 0)}
                          </span>
                        </td>
                        {canFillSetupInfo ? (
                          <>
                            <td />
                            <td />
                          </>
                        ) : null}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </AppLayout>
  );
}