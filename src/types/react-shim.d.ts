declare namespace React {
  type ReactNode = unknown;
  interface JSXElement {}
  namespace JSX { interface Element extends JSXElement {} interface IntrinsicElements { [elemName: string]: Record<string, unknown>; } }
  interface FormEvent<T = Element> { preventDefault(): void; currentTarget: T; }
  interface ChangeEvent<T = Element> { target: T; }
  type SetStateAction<S> = S | ((prevState: S) => S);
  type Dispatch<A> = (value: A) => void;
}

declare module "react" {
  export const StrictMode: (props: { children?: React.ReactNode }) => React.JSX.Element;
  export function useState<S>(initialState: S | (() => S)): [S, React.Dispatch<React.SetStateAction<S>>];
  export function useEffect(effect: () => void | (() => void), dependencies?: readonly unknown[]): void;
  export function useCallback<T extends (...args: never[]) => unknown>(callback: T, dependencies: readonly unknown[]): T;
  export function useMemo<T>(factory: () => T, dependencies: readonly unknown[]): T;
  export type FormEvent<T = Element> = React.FormEvent<T>;
}

declare module "react-dom/client" {
  interface Root { render(children: React.ReactNode): void; }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare module "react/jsx-runtime" {
  export function jsx(type: unknown, props: unknown, key?: unknown): React.JSX.Element;
  export function jsxs(type: unknown, props: unknown, key?: unknown): React.JSX.Element;
  export const Fragment: unknown;
}

declare namespace JSX {
  interface Element extends React.JSX.Element {}
  interface IntrinsicElements { [elemName: string]: Record<string, unknown>; }
}
