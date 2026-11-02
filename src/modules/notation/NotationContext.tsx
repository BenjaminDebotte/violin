import { createContext, useContext, useCallback, type ReactNode } from 'react';
import { formatNoteName, DEFAULT_NOTATION, type NotationSystem } from './noteNames';

const NotationContext = createContext<NotationSystem>(DEFAULT_NOTATION);

export function NotationProvider({
  system,
  children,
}: {
  readonly system: NotationSystem;
  readonly children: ReactNode;
}) {
  return <NotationContext.Provider value={system}>{children}</NotationContext.Provider>;
}

/** Returns a formatter that renders pitch labels in the user's chosen notation. */
export function useNoteName(): (label: string) => string {
  const system = useContext(NotationContext);
  return useCallback((label: string) => formatNoteName(label, system), [system]);
}

export function useNotationSystem(): NotationSystem {
  return useContext(NotationContext);
}
