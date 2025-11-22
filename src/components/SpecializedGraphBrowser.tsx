import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  CircularProgress,
} from '@mui/material';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import type { TreeViewBaseItem } from '@mui/x-tree-view/models';
import type { HdtDataset } from '@graviola/hdt-rdfjs-dataset';
import factory from '@rdfjs/data-model';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

interface SpecializedGraphBrowserProps {
  dataset: HdtDataset | null;
  startNodeIri: string;
  predicateIri: string;
  direction: 'in' | 'out';
  onClose: () => void;
}

interface SpecializedNode {
  iri: string;
  label?: string; // rdfs:label if available
  loaded: boolean;
  children?: string[]; // Child node IRIs
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

export function SpecializedGraphBrowser({
  dataset,
  startNodeIri,
  predicateIri,
  direction,
  onClose,
}: SpecializedGraphBrowserProps) {
  const [nodes, setNodes] = useState<Map<string, SpecializedNode>>(new Map());
  const [loading, setLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  const rdfsLabel = factory.namedNode('http://www.w3.org/2000/01/rdf-schema#label');
  const predicateNode = factory.namedNode(predicateIri);

  // Load rdfs:label for a node
  const loadLabel = useCallback(
    async (iri: string): Promise<string | undefined> => {
      if (!dataset) return undefined;

      const subject = factory.namedNode(iri);
      const matches = dataset.match(subject, rdfsLabel, null);
      
      // Get first literal label
      for (const quad of matches) {
        if (quad.object.termType === 'Literal') {
          return quad.object.value;
        }
      }
      return undefined;
    },
    [dataset]
  );

  // Load children following the predicate
  const loadChildren = useCallback(
    async (iri: string): Promise<string[]> => {
      if (!dataset) return [];

      const subject = factory.namedNode(iri);
      const matches = dataset.match(subject, predicateNode, null);
      
      const children: string[] = [];
      for (const quad of matches) {
        // Only include named nodes (not literals)
        if (quad.object.termType === 'NamedNode') {
          children.push(quad.object.value);
        }
      }
      return children;
    },
    [dataset, predicateNode]
  );

  // Load parents following the predicate (incoming direction)
  const loadParents = useCallback(
    async (iri: string): Promise<string[]> => {
      if (!dataset) return [];

      const object = factory.namedNode(iri);
      const matches = dataset.match(null, predicateNode, object);
      
      const parents: string[] = [];
      for (const quad of matches) {
        // Only include named nodes
        if (quad.subject.termType === 'NamedNode') {
          parents.push(quad.subject.value);
        }
      }
      return parents;
    },
    [dataset, predicateNode]
  );

  // Load node and its children
  const loadNode = useCallback(
    async (iri: string) => {
      if (!dataset) return;

      setLoading(true);
      try {
        // Check if already loaded using functional update
        setNodes((prevNodes) => {
          if (prevNodes.has(iri) && prevNodes.get(iri)?.loaded) {
            return prevNodes; // Already loaded
          }
          return prevNodes;
        });

        // Load label and children/parents in parallel
        const [label, relatedNodes] = await Promise.all([
          loadLabel(iri),
          direction === 'out' ? loadChildren(iri) : loadParents(iri),
        ]);

        setNodes((prevNodes) => {
          // Double-check we haven't loaded it in the meantime
          const existing = prevNodes.get(iri);
          if (existing?.loaded) {
            return prevNodes;
          }

          const newNodes = new Map(prevNodes);
          newNodes.set(iri, {
            iri,
            label,
            loaded: true,
            children: relatedNodes,
          });

          // Recursively load labels for children (but not their children yet - lazy load)
          if (relatedNodes.length > 0) {
            // Load labels asynchronously after setting the node
            Promise.all(relatedNodes.map((childIri) => loadLabel(childIri)))
              .then((labels) => {
                setNodes((currentNodes) => {
                  const updatedNodes = new Map(currentNodes);
                  labels.forEach((lbl, index) => {
                    const childIri = relatedNodes[index];
                    const existing = updatedNodes.get(childIri);
                    if (existing) {
                      updatedNodes.set(childIri, {
                        ...existing,
                        label: lbl,
                      });
                    } else {
                      updatedNodes.set(childIri, {
                        iri: childIri,
                        label: lbl,
                        loaded: false,
                      });
                    }
                  });
                  return updatedNodes;
                });
              })
              .catch(console.error);
          }

          return newNodes;
        });
      } catch (error) {
        console.error('Error loading node:', error);
      } finally {
        setLoading(false);
      }
    },
    [dataset, direction, loadLabel, loadChildren, loadParents]
  );

  // Initialize with start node
  useEffect(() => {
    if (dataset && startNodeIri) {
      // Reset state when start node changes
      const startNode: SpecializedNode = {
        iri: startNodeIri,
        loaded: false,
      };
      setNodes(new Map([[startNodeIri, startNode]]));
      setExpandedItems([startNodeIri]);
      // Load node asynchronously
      loadNode(startNodeIri).catch(console.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataset, startNodeIri]); // Don't include loadNode to avoid infinite loop

  // Handle expansion
  const handleExpandedItemsChange = useCallback(
    (_event: React.SyntheticEvent | null, itemIds: string[]) => {
      setExpandedItems(itemIds);
      
      // Load children for newly expanded items
      for (const itemId of itemIds) {
        if (!expandedItems.includes(itemId)) {
          const node = nodes.get(itemId);
          if (node && !node.loaded) {
            loadNode(itemId);
          } else if (node && node.children) {
            // Load children that aren't loaded yet
            for (const childIri of node.children) {
              const childNode = nodes.get(childIri);
              if (!childNode || !childNode.loaded) {
                loadNode(childIri);
              }
            }
          }
        }
      }
    },
    [expandedItems, nodes, loadNode]
  );

  // Build tree items
  const treeItems = useMemo((): TreeViewBaseItem[] => {
    if (nodes.size === 0) return [];

    const buildTreeItem = (iri: string): TreeViewBaseItem | null => {
      const node = nodes.get(iri);
      if (!node) return null;

      // Create label: abbreviated IRI on left, rdfs:label on right if available
      // We'll use a custom format that CSS can style
      const iriPart = shortenUri(iri);
      const labelPart = node.label || '';

      const children: TreeViewBaseItem[] = [];
      if (node.children && node.children.length > 0) {
        for (const childIri of node.children) {
          const childItem = buildTreeItem(childIri);
          if (childItem) {
            children.push(childItem);
          }
        }
      } else if (!node.loaded) {
        // Add placeholder for lazy loading
        children.push({
          id: `${iri}:placeholder`,
          label: '...',
        });
      }

      // Format label: IRI on left, label on right separated by pipe
      // Display format: "IRI | label" (label right-aligned via CSS)
      const formattedLabel = labelPart 
        ? `${iriPart} | ${labelPart}`
        : iriPart;
      
      return {
        id: iri,
        label: formattedLabel,
        children: children.length > 0 ? children : undefined,
      };
    };

    const startNode = nodes.get(startNodeIri);
    if (!startNode) return [];

    const rootItem = buildTreeItem(startNodeIri);
    return rootItem ? [rootItem] : [];
  }, [nodes, startNodeIri]);

  if (!dataset) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <AccountTreeIcon sx={{ color: 'primary.main' }} />
            <Box>
              <Typography variant="h6" component="h2">
                Specialized View
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {direction === 'out' ? '→' : '←'} {shortenUri(predicateIri)}
              </Typography>
            </Box>
          </Box>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ArrowBackIcon />}
            onClick={onClose}
          >
            Close
          </Button>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Start: <strong>{shortenUri(startNodeIri)}</strong>
          </Typography>
        </Box>

        <Box
          sx={{
            minHeight: 400,
            maxHeight: 600,
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            p: 2,
          }}
        >
          {treeItems.length > 0 ? (
            <RichTreeView
              items={treeItems}
              expandedItems={expandedItems}
              onExpandedItemsChange={handleExpandedItemsChange}
              sx={{
                flexGrow: 1,
                width: '100%',
                '& .MuiTreeItem-content': {
                  width: '100%',
                },
                '& .MuiTreeItem-label': {
                  width: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                },
              }}
            />
          ) : (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 4 }}>
              {loading ? (
                <CircularProgress />
              ) : (
                <Typography variant="body2" color="text.secondary">
                  No data available
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

