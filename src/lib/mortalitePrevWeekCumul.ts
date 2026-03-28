import { api } from "@/lib/api";

/** Parses Sn from semaine label; returns null if not Sn. */
export function parseSemaineIndex(semaine: string): number | null {
  const m = semaine.trim().match(/^S(\d+)$/i);
  if (!m) return null;
  return parseInt(m[1], 10);
}

/**
 * Cumul mortalité à la fin de la semaine Sn−1 (point de départ « MORTALITE DU TRANSPORT » sur Sn),
 * **lu/calculé côté backend** (`GET .../transport-cumul`) pour le **même** farm, lot, **sexe** et **bâtiment**
 * que le tableau affiché (ex. S2 B1 Mâle n’utilise que les données S1 B1 Mâle ; S3 utilise la fin de S2 sur ce même scope).
 *
 * Règle métier:
 * - Transport sur S2 = fin de semaine (cumul morts) de S1 sur ce périmètre
 * - Transport sur S3 = fin de semaine de S2 sur ce périmètre
 * - etc.
 *
 * Le frontend ne chaîne pas les semaines en local ; il appelle l’API avec `batiment` + `sex` + `semaine` canonique.
 */
export async function fetchMortaliteCumulFinSemainePrecedente(
  farmId: number,
  lot: string,
  sex: string,
  batiment: string,
  semaine: string
): Promise<number> {
  const n = parseSemaineIndex(semaine);
  if (n == null || n <= 1) return 0;
  return api.suiviTechniqueHebdo.getTransportCumul({ farmId, lot, sex, batiment, semaine, persist: false });
}
