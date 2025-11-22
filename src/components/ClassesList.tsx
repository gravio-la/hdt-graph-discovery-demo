import {
  Box,
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemText,
  Chip,
  CircularProgress,
} from '@mui/material';
import LabelIcon from '@mui/icons-material/Label';
import { useBookmark } from '../hooks/useBookmark';
import { BookmarkChip } from './BookmarkChip';

interface ClassInfo {
  uri: string;
  instanceCount: number;
}

interface ClassesListProps {
  classes: ClassInfo[];
  loading: boolean;
}

export function ClassesList({ classes, loading }: ClassesListProps) {
  const { addBookmark } = useBookmark();
  
  const shortenUri = (uri: string): string => {
    // Try to extract prefix:localName pattern
    const match = uri.match(/^(.+[/#])([^/#]+)$/);
    if (match) {
      const [, prefix, localName] = match;
      // Common prefixes
      const prefixMap: Record<string, string> = {
        'http://www.w3.org/2000/01/rdf-schema#': 'rdfs:',
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#': 'rdf:',
        'http://www.w3.org/2002/07/owl#': 'owl:',
        'http://www.w3.org/2004/02/skos/core#': 'skos:',
        'http://xmlns.com/foaf/0.1/': 'foaf:',
      };

      for (const [fullPrefix, shortPrefix] of Object.entries(prefixMap)) {
        if (prefix === fullPrefix) {
          return `${shortPrefix}${localName}`;
        }
      }

      // If no known prefix, try to extract a reasonable short form
      const parts = prefix.split('/');
      const lastPart = parts[parts.length - 1] || parts[parts.length - 2];
      if (lastPart) {
        return `${lastPart}:${localName}`;
      }
    }

    // Fallback: show last 50 chars
    return uri.length > 50 ? `...${uri.slice(-50)}` : uri;
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <LabelIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" component="h2">
              Classes Found
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (classes.length === 0) {
    return (
      <Card>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <LabelIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" component="h2">
              Classes Found
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No classes found in this dataset.
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <LabelIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="h2">
            Classes Found
          </Typography>
          <Chip
            label={classes.length}
            size="small"
            sx={{ ml: 2 }}
            color="primary"
          />
        </Box>
        <List>
          {classes.map((classInfo, index) => (
            <ListItem
              key={index}
              sx={{
                borderBottom: '1px solid',
                borderColor: 'divider',
                '&:last-child': { borderBottom: 'none' },
              }}
              secondaryAction={
                <BookmarkChip
                  iri={classInfo.uri}
                  onToggle={(isBookmarked) => {
                    if (isBookmarked) {
                      addBookmark(classInfo.uri, {
                        description: `${classInfo.instanceCount.toLocaleString()} instance${classInfo.instanceCount !== 1 ? 's' : ''}`,
                        hint: 'subject',
                      });
                    }
                  }}
                />
              }
            >
              <ListItemText
                primary={
                  <Typography variant="body1" component="code">
                    {shortenUri(classInfo.uri)}
                  </Typography>
                }
                secondary={
                  <Typography variant="body2" color="text.secondary">
                    {classInfo.instanceCount.toLocaleString()} instance
                    {classInfo.instanceCount !== 1 ? 's' : ''}
                  </Typography>
                }
              />
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
}

