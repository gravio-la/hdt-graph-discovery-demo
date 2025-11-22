import { create } from 'zustand';

export interface Bookmark {
  iri: string;
  label?: string;
  description?: string;
  hint?: 'subject' | 'predicate' | 'object';
  addedAt: number;
}

interface BookmarkStore {
  bookmarks: Bookmark[];
  fieldStates: Record<string, string>; // inputId -> value
  lastFocusedInputId: string | null;
  addBookmark: (iri: string, metadata?: { label?: string; description?: string; hint?: 'subject' | 'predicate' | 'object' }) => void;
  removeBookmark: (iri: string) => void;
  updateBookmark: (iri: string, metadata: { label?: string; description?: string; hint?: 'subject' | 'predicate' | 'object' }) => void;
  setFieldValue: (inputId: string, value: string) => void;
  setLastFocusedInputId: (inputId: string | null) => void;
  removeField: (inputId: string) => void;
  fillFocusedInput: (iri: string) => void;
}

export const useBookmarkStore = create<BookmarkStore>((set) => ({
  bookmarks: [],
  fieldStates: {},
  lastFocusedInputId: null,
  
  setFieldValue: (inputId, value) => {
    set((state) => ({
      fieldStates: {
        ...state.fieldStates,
        [inputId]: value,
      },
    }));
  },
  
  setLastFocusedInputId: (inputId) => {
    set({ lastFocusedInputId: inputId });
  },
  
  removeField: (inputId) => {
    set((state) => {
      const newFieldStates = { ...state.fieldStates };
      delete newFieldStates[inputId];
      return {
        fieldStates: newFieldStates,
        lastFocusedInputId: state.lastFocusedInputId === inputId ? null : state.lastFocusedInputId,
      };
    });
  },
  
  fillFocusedInput: (iri) => {
    set((state) => {
      if (state.lastFocusedInputId) {
        return {
          fieldStates: {
            ...state.fieldStates,
            [state.lastFocusedInputId]: iri,
          },
        };
      }
      return state;
    });
  },
  
  addBookmark: (iri, metadata) => {
    set((state) => {
      // Check if bookmark already exists
      const existingIndex = state.bookmarks.findIndex((b) => b.iri === iri);
      
      if (existingIndex >= 0) {
        // Remove from current position
        const updatedBookmarks = [...state.bookmarks];
        const existing = updatedBookmarks.splice(existingIndex, 1)[0];
        
        // Create new bookmark with overridden metadata
        const newBookmark: Bookmark = {
          iri,
          label: metadata?.label ?? existing.label,
          description: metadata?.description ?? existing.description,
          hint: metadata?.hint ?? existing.hint,
          addedAt: Date.now(), // Update timestamp
        };
        
        // Add to top
        return { bookmarks: [newBookmark, ...updatedBookmarks] };
      } else {
        // Add new bookmark to top
        const newBookmark: Bookmark = {
          iri,
          label: metadata?.label,
          description: metadata?.description,
          hint: metadata?.hint,
          addedAt: Date.now(),
        };
        
        return { bookmarks: [newBookmark, ...state.bookmarks] };
      }
    });
  },
  
  removeBookmark: (iri) => {
    set((state) => ({
      bookmarks: state.bookmarks.filter((b) => b.iri !== iri),
    }));
  },
  
  updateBookmark: (iri, metadata) => {
    set((state) => ({
      bookmarks: state.bookmarks.map((b) =>
        b.iri === iri
          ? {
              ...b,
              ...metadata,
            }
          : b
      ),
    }));
  },
}));

