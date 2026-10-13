import type { components } from "./generated/api";
export type CatalogPart = Required<components["schemas"]["Part"]>;
export type PartVariant = components["schemas"]["Variant"];
export type PartId = CatalogPart["id"];
export type ComponentScene = Required<
  Omit<components["schemas"]["ComponentScene"], "components">
> & { components: ScenePart[] };
export type ScenePart = Required<components["schemas"]["ScenePart"]>;
export type Catalogue = Required<
  Omit<components["schemas"]["Catalogue"], "parts">
> & { parts: CatalogPart[] };
export const emptyScene = (): ComponentScene => ({
  revision: 0,
  frame_id: null,
  timestamp_ms: null,
  components: [],
  questions: [],
});
