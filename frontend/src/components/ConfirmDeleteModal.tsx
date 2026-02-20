import type { CalendarEvent } from "@/lib/types";
import { getEventIcon } from "@/lib/eventIcons";

interface ConfirmDeleteModalProps {
  events: CalendarEvent[];
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}

export function ConfirmDeleteModal({
  events,
  onConfirm,
  onCancel,
  deleting,
}: ConfirmDeleteModalProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-5">
        <h3 className="text-lg font-semibold text-gray-900 mb-3">
          Delete {events.length} event{events.length > 1 ? "s" : ""}?
        </h3>

        <div className="max-h-48 overflow-y-auto space-y-1 mb-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-center gap-2 text-sm text-gray-700 py-1"
            >
              <span>{getEventIcon(event.event_type)}</span>
              <span className="truncate">{event.title}</span>
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-500 mb-4">
          This cannot be undone.
        </p>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
