import {
  Drawer,
  Box,
  Typography,
  List,
  ListItem,
  ListItemText,
  IconButton,
  Chip,
  Divider,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import { useBookmark } from '../hooks/useBookmark';
import { useBookmarkStore } from '../stores/bookmarkStore';

// Helper to shorten URIs for display
function shortenUri(uri: string): string {
  const prefixMap: Record<string, string> = {
    'http://www.w3.org/2000/01/rdf-schema#': 'rdfs:',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#': 'rdf:',
    'http://www.w3.org/2002/07/owl#': 'owl:',
    'http://www.w3.org/2004/02/skos/core#': 'skos:',
    'http://xmlns.com/foaf/0.1/': 'foaf:',
    'http://schema.org/': 'schema:',
  };

  for (const [fullPrefix, shortPrefix] of Object.entries(prefixMap)) {
    if (uri.startsWith(fullPrefix)) {
      return uri.replace(fullPrefix, shortPrefix);
    }
  }

  // Try to extract a reasonable short form
  const match = uri.match(/^(.+[/#])([^/#]+)$/);
  if (match) {
    const [, prefix, localName] = match;
    const parts = prefix.split('/');
    const lastPart = parts[parts.length - 1] || parts[parts.length - 2];
    if (lastPart) {
      return `${lastPart}:${localName}`;
    }
  }

  // Fallback: show last 50 chars
  return uri.length > 50 ? `...${uri.slice(-50)}` : uri;
}

interface BookmarkDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function BookmarkDrawer({ open, onClose }: BookmarkDrawerProps) {
  const { bookmarks, removeBookmark } = useBookmark();
  const fillFocusedInput = useBookmarkStore((state) => state.fillFocusedInput);

  const handleBookmarkClick = (iri: string) => {
    fillFocusedInput(iri);
  };

  const drawerWidth = 400;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
        },
      }}
    >
      <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BookmarkIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" component="h2">
            Bookmarks
          </Typography>
          <Chip label={bookmarks.length} size="small" color="primary" />
        </Box>
      </Box>
      <Divider />
      {bookmarks.length === 0 ? (
        <Box sx={{ p: 3, textAlign: 'center' }}>
          <BookmarkBorderIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 1 }} />
          <Typography variant="body2" color="text.secondary">
            No bookmarks yet. Click on entities in search results or class lists to bookmark them.
          </Typography>
        </Box>
      ) : (
        <List>
          {bookmarks.map((bookmark) => (
            <ListItem
              key={bookmark.iri}
              sx={{
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:hover': {
                  backgroundColor: 'action.hover',
                },
                cursor: 'pointer',
              }}
              onClick={() => handleBookmarkClick(bookmark.iri)}
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="delete"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeBookmark(bookmark.iri);
                  }}
                  size="small"
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              }
            >
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                      {bookmark.label || shortenUri(bookmark.iri)}
                    </Typography>
                    {bookmark.hint && (
                      <Chip
                        label={bookmark.hint}
                        size="small"
                        variant="outlined"
                        color="secondary"
                        sx={{ fontSize: '0.7rem', height: 20 }}
                      />
                    )}
                  </Box>
                }
                secondary={
                  <Box>
                    {bookmark.description && (
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
                        {bookmark.description}
                      </Typography>
                    )}
                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>
                      {shortenUri(bookmark.iri)}
                    </Typography>
                  </Box>
                }
              />
            </ListItem>
          ))}
        </List>
      )}
    </Drawer>
  );
}

