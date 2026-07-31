import { lazy, Suspense } from "react";
import type { CadViewerProps } from "./CadViewer.tsx";

const CadViewer = lazy(async () => {
  const module = await import("./CadViewer.tsx");
  return { default: module.CadViewer };
});

export function LazyCadViewer(props: CadViewerProps): React.JSX.Element {
  return <Suspense fallback={<div className="cad-viewer-fallback" role="status">Загрузка 3D-вьюера…</div>}>
    <CadViewer {...props} />
  </Suspense>;
}
