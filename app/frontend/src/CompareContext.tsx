import React, { createContext, useContext, useState } from "react";

export type SelectedEntity = { name: string; source?: string; type?: string } | null;

type CompareContextValue = {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedEntity: SelectedEntity;
  setSelectedEntity: (e: SelectedEntity) => void;
  salienceThreshold: number;
  setSalienceThreshold: (v: number) => void;
  showHighlights: boolean;
  setShowHighlights: (v: boolean) => void;
  showDiff: boolean;
  setShowDiff: (v: boolean) => void;
  showMergedGraph: boolean;
  setShowMergedGraph: (v: boolean) => void;
  isRecomputing: boolean;
  setIsRecomputing: (v: boolean) => void;
};

const CompareContext = createContext<CompareContextValue | undefined>(undefined);

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);
  const [salienceThreshold, setSalienceThreshold] = useState(0);
  const [showHighlights, setShowHighlights] = useState(true);
  const [showDiff, setShowDiff] = useState(false);
  const [showMergedGraph, setShowMergedGraph] = useState(false);
  const [isRecomputing, setIsRecomputing] = useState(false);

  return (
    <CompareContext.Provider
      value={{
        searchQuery,
        setSearchQuery,
        selectedEntity,
        setSelectedEntity,
        salienceThreshold,
        setSalienceThreshold,
        showHighlights,
        setShowHighlights,
        showDiff,
        setShowDiff,
        showMergedGraph,
        setShowMergedGraph,
        isRecomputing,
        setIsRecomputing,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompareControls(): CompareContextValue {
  const ctx = useContext(CompareContext);
  if (!ctx) {
    throw new Error("useCompareControls must be used within CompareProvider");
  }
  return ctx;
}
