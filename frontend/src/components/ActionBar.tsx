interface ActionBarProps {
  selectedCount: number;
  mode: "manage" | "export";
  onAction: () => void;
  onCancel: () => void;
  onSelectAll?: () => void;
  allSelected?: boolean;
}

export function ActionBar({
  selectedCount,
  mode,
  onAction,
  onCancel,
  onSelectAll,
  allSelected,
}: ActionBarProps) {
  const isManage = mode === "manage";

  return (
    <div className="fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-700">
            {selectedCount} selected
          </span>
          {onSelectAll && (
            <button
              onClick={onSelectAll}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              {allSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isManage ? (
            <button
              onClick={onAction}
              disabled={selectedCount === 0}
              className="px-4 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              Delete Selected
            </button>
          ) : (
            <button
              onClick={onAction}
              disabled={selectedCount === 0}
              className="px-4 py-1.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-40 transition-colors"
            >
              Download .ics
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-4 py-1.5 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
