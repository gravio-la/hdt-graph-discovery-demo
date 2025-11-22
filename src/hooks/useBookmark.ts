import { useBookmarkStore } from '../stores/bookmarkStore';
import type { Bookmark } from '../stores/bookmarkStore';

export function useBookmark() {
  const bookmarks = useBookmarkStore((state) => state.bookmarks);
  const addBookmark = useBookmarkStore((state) => state.addBookmark);
  const removeBookmark = useBookmarkStore((state) => state.removeBookmark);
  const updateBookmark = useBookmarkStore((state) => state.updateBookmark);

  const isBookmarked = (iri: string): boolean => {
    return bookmarks.some((b) => b.iri === iri);
  };

  const getBookmark = (iri: string): Bookmark | undefined => {
    return bookmarks.find((b) => b.iri === iri);
  };

  return {
    bookmarks,
    addBookmark,
    removeBookmark,
    updateBookmark,
    isBookmarked,
    getBookmark,
  };
}

