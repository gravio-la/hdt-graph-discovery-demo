import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Typography,
  CircularProgress,
  Chip,
  ListItem,
  ListItemText,
  Paper,
  Autocomplete,
  Button,
} from '@mui/material';
// Use a simple scrollable list instead of react-window for simplicity
// FlexSearch - need to access Index from the default export
// @ts-ignore - FlexSearch types may not be perfect
import FlexSearch from 'flexsearch';

import type { HdtDataset } from '@graviola/hdt-rdfjs-dataset';
import type { HDTDatasetCore } from '../hdt-dataset';
import factory from '@rdfjs/data-model';
import SearchIcon from '@mui/icons-material/Search';
import BuildIcon from '@mui/icons-material/Build';
import { useBookmark } from '../hooks/useBookmark';
import { BookmarkChip } from './BookmarkChip';

interface FullTextSearchProps {
  dataset: HdtDataset | HDTDatasetCore | null;
}

interface SearchResult {
  id: string;
  subject: string;
  predicate: string;
  value: string;
  subjectType?: string; // Optional rdf:type of the subject
  score?: number;
}

interface IndexedDocument {
  id: string;
  subject: string;
  predicate: string;
  value: string;
  subjectType?: string; // Optional rdf:type of the subject
}


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

export function FullTextSearch({ dataset }: FullTextSearchProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [index, setIndex] = useState<any>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexedCount, setIndexedCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedPredicates, setSelectedPredicates] = useState<string[]>([
    'http://www.w3.org/2000/01/rdf-schema#label',
    'http://www.w3.org/2000/01/rdf-schema#comment',
  ]);
  const [, setAvailablePredicates] = useState<string[]>([]);
  const [predicateOptions, setPredicateOptions] = useState<{ label: string; value: string }[]>([]);
  const documentsRef = useRef<IndexedDocument[]>([]);
  const [inputValue, setInputValue] = useState('');
  const { addBookmark } = useBookmark();

  // Discover available predicates by finding owl:DatatypeProperty instances
  const discoverPredicates = useCallback(async () => {
    if (!dataset) return;

    const predicates = new Set<string>();
    const commonPredicates = [
      'http://www.w3.org/2000/01/rdf-schema#label',
      'http://www.w3.org/2000/01/rdf-schema#comment',
      'http://www.w3.org/2000/01/rdf-schema#description',
      'http://purl.org/dc/terms/title',
      'http://purl.org/dc/terms/description',
      'http://schema.org/name',
      'http://schema.org/description',
    ];

    // Add common predicates
    commonPredicates.forEach(p => predicates.add(p));

    // Query for owl:DatatypeProperty instances
    const rdfType = factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    const owlDatatypeProperty = factory.namedNode('http://www.w3.org/2002/07/owl#DatatypeProperty');
    
    // Find all subjects that are of type owl:DatatypeProperty
    const matches = dataset.match(null, rdfType, owlDatatypeProperty);
    
    for (const quad of matches) {
      if (quad.subject.termType === 'NamedNode') {
        // The subject is a DatatypeProperty (predicate)
        predicates.add(quad.subject.value);
      }
    }

    const predicateList = Array.from(predicates).sort();
    setAvailablePredicates(predicateList);
    
    // Create options for autocomplete
    setPredicateOptions(
      predicateList.map(p => ({
        label: shortenUri(p),
        value: p,
      }))
    );
  }, [dataset]);

  // Initialize index
  useEffect(() => {
    if (dataset) {
      discoverPredicates();
    }
  }, [dataset, discoverPredicates]);

  // Build index from dataset
  const buildIndex = useCallback(async () => {
    if (!dataset || selectedPredicates.length === 0) return;

    setIndexing(true);
    setIndexedCount(0);
    documentsRef.current = [];

    try {
      // Create FlexSearch index - Index is a property of the default export
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const FlexSearchIndex = (FlexSearch as any).Index || (FlexSearch as any).default?.Index;
      if (!FlexSearchIndex) {
        throw new Error('FlexSearch Index not found');
      }
      const flexIndex = new FlexSearchIndex({
        tokenize: 'forward',
      } as any);

      let docId = 0;
      const documents: IndexedDocument[] = [];

      // Query for each selected predicate
      const rdfType = factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      
      for (const predicateIri of selectedPredicates) {
        try {
          const predicate = factory.namedNode(predicateIri);
          const matches = dataset.match(null, predicate, null);

          for (const quad of matches) {
            // Only index literal values
            if (quad.object.termType === 'Literal') {
              // Query for rdf:type of the subject
              let subjectType: string | undefined;
              const typeMatches = dataset.match(quad.subject, rdfType, null);
              // Get the first type (subjects can have multiple types)
              for (const typeQuad of typeMatches) {
                if (typeQuad.object.termType === 'NamedNode') {
                  subjectType = typeQuad.object.value;
                  break; // Take first type
                }
              }
              
              const doc: IndexedDocument = {
                id: `doc_${docId++}`,
                subject: quad.subject.value,
                predicate: predicateIri,
                value: quad.object.value,
                subjectType: subjectType,
              };
              documents.push(doc);
              
              // Add to index
              flexIndex.add(doc.id, doc.value);
              
              setIndexedCount(documents.length);
              
              // Yield to UI every 100 documents
              if (documents.length % 100 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
              }
            }
          }
        } catch (warnErr) {
          console.warn('Warning building sub-index for predicate', predicateIri, warnErr);
        }
      }

      documentsRef.current = documents;
      setIndex(flexIndex);
      console.log(`Indexed ${documents.length} documents`);
    } catch (error) {
      console.error('Error building index:', error);
    } finally {
      setIndexing(false);
    }
  }, [dataset, selectedPredicates]);

  // Perform search
  const performSearch = useCallback(
    (query: string) => {
      if (!index || !query.trim()) {
        setResults([]);
        return;
      }

      try {
        const searchResults = index.search(query, { limit: 1000 });
        const resultDocs: SearchResult[] = searchResults
          .map((id: string | number) => {
            const doc = documentsRef.current.find((d) => d.id === String(id));
            if (!doc) return null;
            return {
              id: doc.id,
              subject: doc.subject,
              predicate: doc.predicate,
              value: doc.value,
              subjectType: doc.subjectType,
            };
          })
          .filter((r: SearchResult | null): r is SearchResult => r !== null);

        setResults(resultDocs);
      } catch (error) {
        console.error('Error performing search:', error);
        setResults([]);
      }
    },
    [index]
  );

  // Handle search query change
  useEffect(() => {
    if (searchQuery.trim()) {
      performSearch(searchQuery);
    } else {
      setResults([]);
    }
  }, [searchQuery, performSearch]);

  // Render result item
  const renderResultItem = useCallback(
    ({ index: itemIndex }: { index: number }) => {
      const result = results[itemIndex];
      if (!result) return null;

      return (
        <ListItem
          key={result.id}
          sx={{
            borderBottom: '1px solid',
            borderColor: 'divider',
            '&:hover': {
              backgroundColor: 'action.hover',
            },
          }}
          secondaryAction={
            <BookmarkChip
              iri={result.subject}
              onToggle={(isBookmarked) => {
                if (isBookmarked) {
                  addBookmark(result.subject, {
                    label: result.value,
                    description: `Predicate: ${shortenUri(result.predicate)}`,
                    hint: 'object',
                  });
                }
              }}
            />
          }
        >
          <ListItemText
            primary={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                  {result.value}
                </Typography>
                {result.subjectType && (
                  <Chip
                    label={shortenUri(result.subjectType)}
                    size="small"
                    variant="outlined"
                    color="secondary"
                    sx={{ fontSize: '0.7rem', height: 20 }}
                  />
                )}
                <Chip
                  label={shortenUri(result.predicate)}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              </Box>
            }
            secondary={
              <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                {shortenUri(result.subject)}
              </Typography>
            }
          />
        </ListItem>
      );
    },
    [results]
  );

  if (!dataset) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
          <SearchIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" component="h2">
            Full-Text Search
          </Typography>
        </Box>

        {/* Predicate Selection */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Index Fields (Predicates)
          </Typography>
          <Autocomplete
            multiple
            freeSolo
            options={predicateOptions}
            value={selectedPredicates.map((pred) => {
              // Find matching option or return as string
              const option = predicateOptions.find((opt) => opt.value === pred);
              return option || pred;
            })}
            inputValue={inputValue}
            onInputChange={(_, newInputValue, reason) => {
              setInputValue(newInputValue);
              // When user presses Enter or selects, add the value
              if (reason === 'input' && newInputValue.trim()) {
                // This will be handled by onChange
              }
            }}
            onChange={(_, newValue, reason) => {
              // Handle both option objects and free text strings
              const newPredicates: string[] = [];
              
              for (const v of newValue) {
                if (typeof v === 'string') {
                  // Free text input - use as-is if it's a valid IRI
                  if (v.trim() && !selectedPredicates.includes(v.trim())) {
                    newPredicates.push(v.trim());
                  }
                } else {
                  // Selected from options
                  if (!selectedPredicates.includes(v.value)) {
                    newPredicates.push(v.value);
                  }
                }
              }
              
              // If reason is 'createOption', it means user pressed Enter with free text
              if (reason === 'createOption' && inputValue.trim()) {
                const trimmed = inputValue.trim();
                if (!selectedPredicates.includes(trimmed)) {
                  newPredicates.push(trimmed);
                }
              }
              
              // Combine with existing selected predicates (to handle removals)
              const allPredicates = [...selectedPredicates];
              for (const newPred of newPredicates) {
                if (!allPredicates.includes(newPred)) {
                  allPredicates.push(newPred);
                }
              }
              
              // Remove predicates that are no longer in newValue
              const newValueStrings = newValue.map((v) => (typeof v === 'string' ? v : v.value));
              const finalPredicates = allPredicates.filter((p) => newValueStrings.includes(p));
              
              setSelectedPredicates(finalPredicates);
              setInputValue(''); // Clear input after adding
            }}
            getOptionLabel={(option) => {
              if (typeof option === 'string') {
                return option;
              }
              return option.label;
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Select predicates or type an IRI and press Enter"
                helperText="You can select from discovered predicates or type any IRI and press Enter"
              />
            )}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => {
                const label = typeof option === 'string' ? shortenUri(option) : option.label;
                const valueStr = typeof option === 'string' ? option : option.value;
                return (
                  <Chip
                    {...getTagProps({ index })}
                    key={valueStr}
                    label={label}
                    size="small"
                  />
                );
              })
            }
            disabled={indexing || index !== null}
            sx={{ mb: 2 }}
          />
          <Button
            variant="contained"
            startIcon={<BuildIcon />}
            onClick={buildIndex}
            disabled={indexing || selectedPredicates.length === 0 || index !== null}
            sx={{ minWidth: 200 }}
          >
            {indexing ? (
              <>
                <CircularProgress size={16} sx={{ mr: 1 }} />
                Indexing... ({indexedCount})
              </>
            ) : index ? (
              `Index Built (${indexedCount} documents)`
            ) : (
              'Build Index'
            )}
          </Button>
          {index && (
            <Button
              variant="outlined"
              onClick={() => {
                setIndex(null);
                setResults([]);
                setSearchQuery('');
                documentsRef.current = [];
              }}
              sx={{ ml: 2 }}
            >
              Rebuild Index
            </Button>
          )}
        </Box>

        {/* Search Field */}
        {index && (
          <Box sx={{ mb: 2 }}>
            <TextField
              fullWidth
              placeholder="Search in indexed fields..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              }}
            />
            {results.length > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                Found {results.length} result{results.length !== 1 ? 's' : ''}
              </Typography>
            )}
          </Box>
        )}

        {/* Results List */}
        {index && (
          <Paper
            variant="outlined"
            sx={{
              height: 500,
              overflow: 'hidden',
            }}
          >
            {results.length > 0 ? (
              <Box sx={{ maxHeight: 500, overflow: 'auto' }}>
                {results.map((result, idx) => (
                  <Box key={result.id}>
                    {renderResultItem({ index: idx, style: {} } as any)}
                  </Box>
                ))}
              </Box>
            ) : searchQuery.trim() ? (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  No results found
                </Typography>
              </Box>
            ) : (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  height: '100%',
                }}
              >
                <Typography variant="body2" color="text.secondary">
                  Enter a search query to find results
                </Typography>
              </Box>
            )}
          </Paper>
        )}

        {!index && !indexing && (
          <Paper
            variant="outlined"
            sx={{
              p: 4,
              textAlign: 'center',
              backgroundColor: 'action.hover',
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Select predicates and build the index to enable full-text search
            </Typography>
          </Paper>
        )}
      </CardContent>
    </Card>
  );
}

