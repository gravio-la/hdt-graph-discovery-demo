import { IconButton, Tooltip } from '@mui/material';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import { useBookmark } from '../hooks/useBookmark';

interface BookmarkChipProps {
  iri: string;
  size?: 'small' | 'medium';
  onToggle?: (isBookmarked: boolean) => void;
}

export function BookmarkChip({ iri, size = 'small', onToggle }: BookmarkChipProps) {
  const { isBookmarked, addBookmark, removeBookmark } = useBookmark();
  const bookmarked = isBookmarked(iri);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (bookmarked) {
      removeBookmark(iri);
      onToggle?.(false);
    } else {
      addBookmark(iri);
      onToggle?.(true);
    }
  };

  return (
    <Tooltip title={bookmarked ? 'Remove bookmark' : 'Add bookmark'}>
      <IconButton size={size} onClick={handleClick} sx={{ p: 0.5 }}>
        {bookmarked ? (
          <BookmarkIcon fontSize={size} sx={{ color: 'primary.main' }} />
        ) : (
          <BookmarkBorderIcon fontSize={size} sx={{ color: 'text.secondary' }} />
        )}
      </IconButton>
    </Tooltip>
  );
}

