import { useState, useEffect, useCallback } from "react";
import { Save, Loader2, Info } from "lucide-react";
import { api, type SuiviTechniqueSetupResponse, type SuiviTechniqueSetupRequest, type SetupInfoResponse } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

const SOUCHES = ["PREMIUM", "Grade maker", "Optima", "Converter"];
const BATIMENTS = ["B1", "B2", "B3", "B4"];

interface SuiviSetupFormProps {
  farmId: number;
  lot: string;
  semaine: string;
  sex: string;
  /** When set (e.g. from page batiment step), load/save setup for this batiment and display it read-only. */
  selectedBatiment?: string;
  onSetupSaved?: (setup: SuiviTechniqueSetupResponse) => void;
  /** Called after setup is saved so parent can refresh stock. */
  onSaveSuccess?: () => void;
  /** Pre-populated setup info from InfosSetup page - used to pre-fill form when no existing suivi setup exists */
  presetSetupInfo?: SetupInfoResponse;
}

export default function SuiviSetupForm({ farmId, lot, semaine, sex, selectedBatiment, onSetupSaved, onSaveSuccess, presetSetupInfo }: SuiviSetupFormProps) {
  const { isReadOnly, canCreate, canUpdate } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /** True when setup was loaded from API (existing record). Responsable de ferme cannot modify after save. */
  const [hasExistingSetup, setHasExistingSetup] = useState(false);

  const effectiveBatiment = selectedBatiment?.trim() || "B1";
  const batimentFromPage = selectedBatiment != null && selectedBatiment.trim() !== "";

  const [formData, setFormData] = useState<SuiviTechniqueSetupRequest>({
    lot,
    semaine,
    sex,
    typeElevage: "DINDE CHAIR",
    origineFournisseur: "",
    dateEclosion: null,
    heureMiseEnPlace: null,
    dateMiseEnPlace: null,
    souche: "PREMIUM",
    effectifMisEnPlace: null,
    batiment: effectiveBatiment,
  });

  const [customBatiment, setCustomBatiment] = useState("");
  const [useCustomBatiment, setUseCustomBatiment] = useState(false);

  /** Load setup for this (farm, lot, semaine, sex, batiment). When none exists, pre-populate from presetSetupInfo if available and auto-save. */
  const load = useCallback(async () => {
    setLoading(true);
    const batimentForApi = batimentFromPage ? effectiveBatiment : "B1";
    try {
      const existing = await api.suiviTechniqueSetup.getBySex({ farmId, lot, semaine, sex, batiment: batimentForApi });
      if (existing) {
        setHasExistingSetup(true);
        setFormData({
          lot: existing.lot,
          semaine: existing.semaine,
          sex: existing.sex,
          typeElevage: existing.typeElevage || "DINDE CHAIR",
          origineFournisseur: existing.origineFournisseur || "",
          dateEclosion: existing.dateEclosion || null,
          heureMiseEnPlace: existing.heureMiseEnPlace || null,
          dateMiseEnPlace: existing.dateMiseEnPlace || null,
          souche: existing.souche || "PREMIUM",
          effectifMisEnPlace: presetSetupInfo?.effectifMisEnPlace ?? existing.effectifMisEnPlace ?? null,
          batiment: existing.batiment || effectiveBatiment,
        });
        if (!batimentFromPage && existing.batiment && !BATIMENTS.includes(existing.batiment)) {
          setUseCustomBatiment(true);
          setCustomBatiment(existing.batiment);
        }
      } else {
        // No existing suivi setup - pre-populate from presetSetupInfo (from InfosSetup page) if available
        setHasExistingSetup(false);
        if (presetSetupInfo) {
          const prefilledData = {
            lot,
            semaine,
            sex,
            typeElevage: presetSetupInfo.typeElevage || "DINDE CHAIR",
            origineFournisseur: presetSetupInfo.origineFournisseur || "",
            dateEclosion: presetSetupInfo.dateEclosion || null,
            heureMiseEnPlace: presetSetupInfo.heureMiseEnPlace || null,
            dateMiseEnPlace: presetSetupInfo.dateMiseEnPlace || null,
            souche: presetSetupInfo.souche || "PREMIUM",
            effectifMisEnPlace: presetSetupInfo.effectifMisEnPlace || null,
            batiment: batimentFromPage ? effectiveBatiment : (presetSetupInfo.building || "B1"),
          };
          setFormData(prefilledData);
          
          // Auto-save: If data from InfosSetup exists and user has create permission, automatically save it
          if (canCreate && !isReadOnly) {
            try {
              const saved = await api.suiviTechniqueSetup.save(prefilledData, farmId);
              setHasExistingSetup(true);
              toast({ 
                title: "Configuration auto-enregistrée", 
                description: "Les données depuis Données mises en place ont été automatiquement enregistrées pour cette semaine." 
              });
              onSetupSaved?.(saved);
              onSaveSuccess?.();
            } catch (error) {
              // If auto-save fails, just show the form - user can manually save later
              console.warn("Auto-save failed, user can manually save:", error);
            }
          }
        } else {
          setFormData({
            lot,
            semaine,
            sex,
            typeElevage: "DINDE CHAIR",
            origineFournisseur: "",
            dateEclosion: null,
            heureMiseEnPlace: null,
            dateMiseEnPlace: null,
            souche: "PREMIUM",
            effectifMisEnPlace: null,
            batiment: batimentFromPage ? effectiveBatiment : "B1",
          });
        }
      }
    } catch (e) {
      // On error, try to use presetSetupInfo if available
      setHasExistingSetup(false);
      if (presetSetupInfo) {
        setFormData({
          lot,
          semaine,
          sex,
          typeElevage: presetSetupInfo.typeElevage || "DINDE CHAIR",
          origineFournisseur: presetSetupInfo.origineFournisseur || "",
          dateEclosion: presetSetupInfo.dateEclosion || null,
          heureMiseEnPlace: presetSetupInfo.heureMiseEnPlace || null,
          dateMiseEnPlace: presetSetupInfo.dateMiseEnPlace || null,
          souche: presetSetupInfo.souche || "PREMIUM",
          effectifMisEnPlace: presetSetupInfo.effectifMisEnPlace || null,
          batiment: batimentFromPage ? effectiveBatiment : (presetSetupInfo.building || "B1"),
        });
      } else {
        setFormData({
          lot,
          semaine,
          sex,
          typeElevage: "DINDE CHAIR",
          origineFournisseur: "",
          dateEclosion: null,
          heureMiseEnPlace: null,
          dateMiseEnPlace: null,
          souche: "PREMIUM",
          effectifMisEnPlace: null,
          batiment: batimentFromPage ? effectiveBatiment : "B1",
        });
      }
      if (!batimentFromPage) {
        setUseCustomBatiment(false);
        setCustomBatiment("");
      }
    } finally {
      setLoading(false);
    }
  }, [farmId, lot, semaine, sex, effectiveBatiment, batimentFromPage, presetSetupInfo, canCreate, isReadOnly, toast, onSetupSaved, onSaveSuccess]);

  useEffect(() => {
    load();
  }, [load]);

  const handleChange = (field: keyof SuiviTechniqueSetupRequest, value: string | number | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  /** Responsable de ferme: can create once, cannot update after save. */
  const canEditSetup = hasExistingSetup ? canUpdate : canCreate;
  const formReadOnly = isReadOnly || !canEditSetup;

  const handleSave = async () => {
    if (!canEditSetup) {
      toast({ title: "Non autorisé", description: "Vous ne pouvez pas modifier les données après enregistrement.", variant: "destructive" });
      return;
    }

    const dataToSave: SuiviTechniqueSetupRequest = {
      ...formData,
      lot,
      semaine,
      sex,
      batiment: batimentFromPage ? effectiveBatiment : (useCustomBatiment ? customBatiment : formData.batiment),
      effectifMisEnPlace: presetSetupInfo?.effectifMisEnPlace ?? formData.effectifMisEnPlace,
    };

    setSaving(true);
    try {
      const saved = await api.suiviTechniqueSetup.save(dataToSave, farmId);
      setHasExistingSetup(true);
      toast({ title: "Configuration enregistrée", description: "Les données mises en place ont été sauvegardées." });
      onSetupSaved?.(saved);
      onSaveSuccess?.();
    } catch {
      /* API error — logged in backend only */
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-card rounded-lg border border-border shadow-sm p-6 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span>Chargement des données mises en place…</span>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg border border-border shadow-sm animate-fade-in">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-base font-display font-bold text-foreground">
            Données mises en place — {sex}
          </h3>
          <p className="text-xs text-muted-foreground">
            Configuration initiale pour le lot {lot}
            {batimentFromPage && ` — Bâtiment ${effectiveBatiment}`}
          </p>
          {hasExistingSetup && presetSetupInfo && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              <Info className="w-3 h-3" />
              ✓ Configuration auto-enregistrée depuis Données mises en place
            </p>
          )}
          {!hasExistingSetup && presetSetupInfo && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
              <Info className="w-3 h-3" />
              Données pré-remplies depuis Données mises en place (auto-enregistrement en cours...)
            </p>
          )}
          {!hasExistingSetup && !presetSetupInfo && (
            <p className="text-xs text-primary mt-1">
              Formulaire vide — renseignez les données et l&apos;effectif de départ pour ce sexe, puis enregistrez.
            </p>
          )}
        </div>
        {!formReadOnly && !hasExistingSetup && (
          <button
            onClick={handleSave}
            disabled={!canEditSetup || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </button>
        )}
      </div>

      <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Type d'élevage */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Type d'élevage</label>
          <input
            type="text"
            value={formData.typeElevage || ""}
            onChange={(e) => handleChange("typeElevage", e.target.value)}
            placeholder="DINDE CHAIR"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            readOnly={formReadOnly}
          />
        </div>

        {/* Origine/Fournisseur */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Origine/Fournisseur</label>
          <input
            type="text"
            value={formData.origineFournisseur || ""}
            onChange={(e) => handleChange("origineFournisseur", e.target.value)}
            placeholder="Saisir le fournisseur"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            readOnly={formReadOnly}
          />
        </div>

        {/* Date d'éclosion */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Date d'éclosion</label>
          <input
            type="date"
            value={formData.dateEclosion || ""}
            onChange={(e) => handleChange("dateEclosion", e.target.value || null)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            readOnly={formReadOnly}
          />
        </div>

        {/* Heure de mise en place */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Heure de mise en place</label>
          <input
            type="time"
            value={formData.heureMiseEnPlace || ""}
            onChange={(e) => handleChange("heureMiseEnPlace", e.target.value || null)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            readOnly={formReadOnly}
          />
        </div>

        {/* Date de mise en place */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Date de mise en place</label>
          <input
            type="date"
            value={formData.dateMiseEnPlace || ""}
            onChange={(e) => handleChange("dateMiseEnPlace", e.target.value || null)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            readOnly={formReadOnly}
          />
        </div>

        {/* Souche */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Souche</label>
          <select
            value={formData.souche || "PREMIUM"}
            onChange={(e) => handleChange("souche", e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            disabled={formReadOnly}
          >
            {SOUCHES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Effectif mis en place — always from InfosSetup page, read-only here */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Effectif mis en place</label>
          <div className="relative">
            <input
              type="number"
              value={presetSetupInfo?.effectifMisEnPlace ?? formData.effectifMisEnPlace ?? ""}
              readOnly
              placeholder="0"
              min="0"
              className="w-full rounded-md border border-input bg-muted/50 px-3 py-2 text-sm cursor-not-allowed"
            />
            {presetSetupInfo && (
              <p className="text-xs text-muted-foreground mt-1">
                Valeur définie dans Données mises en place (non modifiable ici)
              </p>
            )}
          </div>
        </div>

        {/* Bâtiment: read-only when selected from page, else dropdown + custom */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">Bâtiment</label>
          {batimentFromPage ? (
            <div className="rounded-md border border-input bg-muted/50 px-3 py-2 text-sm font-medium text-foreground">
              {effectiveBatiment}
            </div>
          ) : (
            <div className="flex gap-2">
              <select
                value={useCustomBatiment ? "__custom__" : (formData.batiment || "B1")}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setUseCustomBatiment(true);
                  } else {
                    setUseCustomBatiment(false);
                    handleChange("batiment", e.target.value);
                  }
                }}
                className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                disabled={formReadOnly}
              >
                {BATIMENTS.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
                <option value="__custom__">Autre...</option>
              </select>
              {useCustomBatiment && (
                <input
                  type="text"
                  value={customBatiment}
                  onChange={(e) => setCustomBatiment(e.target.value)}
                  placeholder="Bâtiment"
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  readOnly={formReadOnly}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
