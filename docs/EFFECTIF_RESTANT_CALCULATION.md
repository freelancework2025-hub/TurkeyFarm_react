# EFFECTIF RESTANT FIN DE SEMAINE - Backend Calculation

## Overview

The calculation for "EFFECTIF RESTANT FIN DE SEMAINE" (Remaining Stock at End of Week) has been updated to use a new formula that provides more accurate tracking of bird inventory. The calculation is now performed on the **Java backend** to ensure consistency, avoid caching issues, and improve performance.

## New Formula

```
EFFECTIF RESTANT FIN DE SEMAINE = Effectif mis en place - TOTAL Sn de cumul (last row) - Total NB (ProductionTrackingTable)
```

### Components

1. **Effectif mis en place**: Initial number of birds placed in the building (from Données mises en place / SetupInfo)
2. **TOTAL Sn de cumul (last row)**: Cumulative mortality at the end of the week (maximum mortaliteCumul value from SuiviTechniqueHebdo)
3. **Total NB (ProductionTrackingTable)**: Total production numbers including:
   - REPORT (carry-over from previous week)
   - VENTE (sales)
   - CONSOMMATION employeur (employer consumption)
   - AUTRE gratuit (other free distribution)

## Backend Implementation

### Location
- **Service**: `SuiviStockService.java`
- **Method**: `computeEffectifRestantWithNewFormula()`
- **Called from**: `get()` method when fetching stock data

### Data Sources

1. **Effectif mis en place**:
   - Primary: `SuiviTechniqueSetup` table (effectifMisEnPlace field)
   - Fallback: `SetupInfo` table (effectifMisEnPlace field)

2. **Cumulative Mortality**:
   - Repository: `SuiviTechniqueHebdoRepository`
   - Method: `getFinalCumulativeMortalityForWeek()`
   - Query: `SELECT COALESCE(MAX(s.mortaliteCumul), 0) FROM SuiviTechniqueHebdo s WHERE ...`

3. **Production Totals**:
   - Service method: `getProductionForBatiment()` or `getAggregatedProduction()`
   - Calculates: reportNbre + venteNbre + consoNbre + autreNbre

### Calculation Logic

```java
private int computeEffectifRestantWithNewFormula(Long farmId, String lot, String sex, 
                                                  String semaine, String batiment, 
                                                  Integer effectifMisEnPlace) {
    // 1. Get final cumulative mortality for the week
    Integer lastCumulMortality = hebdoRepository.getFinalCumulativeMortalityForWeek(
        farmId, lot, sex, batiment, semaine);
    
    // 2. Get total production numbers
    SuiviProductionHebdoResponseDto prod = getProductionForBatiment(
        farmId, lot, semaine, sex, batiment);
    int totalProductionNb = (prod.getReportNbre() ?? 0) + 
                           (prod.getVenteNbre() ?? 0) + 
                           (prod.getConsoNbre() ?? 0) + 
                           (prod.getAutreNbre() ?? 0);
    
    // 3. Apply formula
    int effectifRestant = Math.max(0, effectifMisEnPlace - lastCumulMortality - totalProductionNb);
    
    return effectifRestant;
}
```

## Frontend Integration

### API Response
The calculated value is returned in the `SuiviStockResponseDto`:
```typescript
interface SuiviStockResponse {
  effectifRestantFinSemaine: number | null;
  poidsVifProduitKg: BigDecimal | null;
  stockAliment: BigDecimal | null;
  stockAlimentRecordExists: boolean;
}
```

### React Components
- **StockTrackingTable.tsx**: Displays the value from `data.effectifRestantFinSemaine`
- **SuiviTechniqueBatimentContent.tsx**: Fetches stock data via API
- **SuiviTechniqueHebdomadaire.tsx**: Main page that renders the tables

### No Client-Side Calculation
The React frontend simply reads and displays the value from the API response. No calculation is performed on the client side, which ensures:
- No caching issues
- Consistent values across all clients
- Fast display (single API call)
- Reduced frontend complexity

## Benefits

1. **No Caching Issues**: Calculated fresh on each API request
2. **Performance**: Single API call returns all stock data including calculated effectif
3. **Consistency**: All clients see the same calculated value
4. **Simplicity**: React just displays the value, no complex logic
5. **Per-batiment**: Each building gets its own calculated value
6. **Maintainability**: Calculation logic in one place (backend)

## Migration from Old Formula

### Old Formula (Chained)
```
Week 1: effectif_restant = effectif_depart - mortality - production
Week 2: effectif_depart = Week 1's effectif_restant
        effectif_restant = effectif_depart - mortality - production
```

### New Formula (Independent)
```
Each Week: effectif_restant = effectif_mis_en_place - cumul_mortality - total_production
```

### Key Differences
- **OLD**: Chains week by week (week 2 depends on week 1's result)
- **NEW**: Each week calculates independently from original effectif mis en place
- **OLD**: Uses daily mortality sum
- **NEW**: Uses cumulative mortality (more accurate)
- **OLD**: Excludes REPORT from production
- **NEW**: Includes REPORT in production totals (more comprehensive)

## Validation

The calculation includes validation to ensure:
- Result is never negative (uses `Math.max(0, calculation)`)
- Effectif mis en place is valid (> 0)
- All input values are non-null (defaults to 0 if missing)

## Logging

Debug logging is included to track:
- Input parameters
- Intermediate values (cumul mortality, production totals)
- Final calculated result
- Any warnings or errors