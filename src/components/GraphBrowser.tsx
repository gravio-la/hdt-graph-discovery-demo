import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  CircularProgress,
  Menu,
  MenuItem,
} from '@mui/material';
import { RichTreeView } from '@mui/x-tree-view/RichTreeView';
import type { TreeViewBaseItem } from '@mui/x-tree-view/models';
import type { HdtDataset } from '@graviola/hdt-rdfjs-dataset';
import type { HDTDatasetCore } from '../hdt-dataset';
import factory from '@rdfjs/data-model';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import { useBookmarkStore } from '../stores/bookmarkStore';

interface GraphBrowserProps {
  dataset: HdtDataset | HDTDatasetCore | null;
  onSelectPredicate?: (startIri: string, predicateIri: string, direction: 'in' | 'out') => void;
}

type NodeId = string;
type NodeType = 'root' | 'in' | 'out' | 'predicate' | 'object';

interface NodeData {
  type: NodeType;
  iri: string;
  predicate?: string;
  loaded: boolean;
  children?: NodeId[];
  parentType?: 'in' | 'out'; // Track if predicate is under 'in' or 'out'
  isLiteral?: boolean; // Track if this is a literal value
  literalValue?: string; // Store literal value if it's a literal
  // For predicates: store object info to determine if we should inline or expand
  objectInfo?: Array<{ value: string; isLiteral: boolean }>;
  singleLiteralValue?: string; // If predicate has single literal, store it here
  parentNodeId?: NodeId; // Track parent node ID for unique path-based IDs
}

// Helper to shorten URIs for display
function shortenUri(uri: string): string {
  const prefixMap: Record<string, string> = {
    'http://www.w3.org/2000/01/rdf-schema#': 'rdfs:',
    'http://www.w3.org/1999/02/22-rdf-syntax-ns#': 'rdf:',
    'http://www.w3.org/2002/07/owl#': 'owl:',
    'http://www.w3.org/2004/02/skos/core#': 'skos:',
    'http://xmlns.com/foaf/0.1/': 'foaf:',
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

  // Fallback: show last 60 chars
  return uri.length > 60 ? `...${uri.slice(-60)}` : uri;
}

export function GraphBrowser({ dataset, onSelectPredicate }: GraphBrowserProps) {
  const [rootIri, setRootIri] = useState('');
  const [nodes, setNodes] = useState<Map<NodeId, NodeData>>(new Map());
  const [loading, setLoading] = useState(false);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    nodeId: NodeId | null;
  } | null>(null);
  
  const inputId = 'graph-browser-root-iri';
  const inputRef = useRef<HTMLInputElement>(null);
  const setFieldValue = useBookmarkStore((state) => state.setFieldValue);
  const setLastFocusedInputId = useBookmarkStore((state) => state.setLastFocusedInputId);
  const removeField = useBookmarkStore((state) => state.removeField);
  const fieldValue = useBookmarkStore((state) => state.fieldStates[inputId]);
  
  // Register input field focus handler (only once on mount)
  useEffect(() => {
    const input = inputRef.current;
    if (input) {
      const handleFocus = () => {
        setLastFocusedInputId(inputId);
      };
      
      input.addEventListener('focus', handleFocus);
      
      return () => {
        input.removeEventListener('focus', handleFocus);
        removeField(inputId);
      };
    }
  }, [setLastFocusedInputId, removeField, inputId]);
  
  // Sync from Zustand to React: when fieldValue changes (e.g., from bookmark click), update rootIri
  useEffect(() => {
    if (fieldValue !== undefined && fieldValue !== rootIri) {
      setRootIri(fieldValue);
    }
  }, [fieldValue]); // Only depend on fieldValue to avoid circular updates
  
  // Sync from React to Zustand: update store when rootIri changes (user typing)
  // Use a ref to track if we're updating from Zustand to avoid circular updates
  const isUpdatingFromStore = useRef(false);
  useEffect(() => {
    if (!isUpdatingFromStore.current) {
      setFieldValue(inputId, rootIri);
    }
    isUpdatingFromStore.current = false;
  }, [rootIri, inputId, setFieldValue]);
  
  // Update the ref when we update from store
  useEffect(() => {
    if (fieldValue !== undefined && fieldValue !== rootIri) {
      isUpdatingFromStore.current = true;
    }
  }, [fieldValue, rootIri]);

  // Generate node IDs with optional parent path for uniqueness
  const getNodeId = useCallback((type: NodeType, iri: string, predicate?: string, parentNodeId?: NodeId): NodeId => {
    if (predicate) {
      // For predicates, include parent path
      const baseId = `${type}:${iri}:${predicate}`;
      return parentNodeId ? `${parentNodeId}->${baseId}` : baseId;
    }
    // For objects, include parent path to ensure uniqueness
    const baseId = `${type}:${iri}`;
    return parentNodeId ? `${parentNodeId}->${baseId}` : baseId;
  }, []);

  // Load outgoing predicates for a node
  const loadOutgoingPredicates = useCallback(
    async (iri: string): Promise<string[]> => {
      if (!dataset) return [];

      const subject = factory.namedNode(iri);
      const matches = dataset.match(subject, null, null);
      
      const predicates = new Set<string>();
      for (const quad of matches) {
        predicates.add(quad.predicate.value);
      }

      return Array.from(predicates).sort();
    },
    [dataset]
  );

  // Load incoming predicates for a node
  const loadIncomingPredicates = useCallback(
    async (iri: string): Promise<string[]> => {
      if (!dataset) return [];

      const object = factory.namedNode(iri);
      const matches = dataset.match(null, null, object);
      
      const predicates = new Set<string>();
      for (const quad of matches) {
        predicates.add(quad.predicate.value);
      }

      return Array.from(predicates).sort();
    },
    [dataset]
  );

  // Load objects for a predicate (returns both IRIs and literals with metadata)
  const loadObjects = useCallback(
    async (
      subjectIri: string,
      predicateIri: string,
      limit: number = 100
    ): Promise<Array<{ value: string; isLiteral: boolean }>> => {
      if (!dataset) return [];

      const subject = factory.namedNode(subjectIri);
      const predicate = factory.namedNode(predicateIri);
      const matches = dataset.match(subject, predicate, null);
      
      const objects: Array<{ value: string; isLiteral: boolean }> = [];
      let count = 0;
      for (const quad of matches) {
        if (count >= limit) break;
        // Include both named nodes and literals
        if (quad.object.termType === 'NamedNode' || quad.object.termType === 'Literal') {
          objects.push({
            value: quad.object.value,
            isLiteral: quad.object.termType === 'Literal',
          });
        }
        count++;
      }

      return objects;
    },
    [dataset]
  );

  // Load subjects for a predicate (incoming) - subjects are always NamedNodes
  const loadSubjects = useCallback(
    async (objectIri: string, predicateIri: string, limit: number = 100): Promise<string[]> => {
      if (!dataset) return [];

      const object = factory.namedNode(objectIri);
      const predicate = factory.namedNode(predicateIri);
      const matches = dataset.match(null, predicate, object);
      
      const subjects: string[] = [];
      let count = 0;
      for (const quad of matches) {
        if (count >= limit) break;
        // Only include named nodes (subjects are always resources)
        if (quad.subject.termType === 'NamedNode') {
          subjects.push(quad.subject.value);
        }
        count++;
      }

      return subjects;
    },
    [dataset]
  );

  // Load children for a node when expanded
  const loadNodeChildren = useCallback(
    async (nodeId: NodeId) => {
      // Read current node state
      const currentNodes = nodes;
      const node = currentNodes.get(nodeId);
      
      if (!node) {
        console.warn('Node not found:', nodeId);
        return;
      }
      
      if (node.loaded) {
        console.log('Node already loaded:', nodeId);
        return;
      }

      console.log('Loading children for node:', nodeId, node);

      setLoading(true);
      try {
        const newNodes = new Map();
        const children: NodeId[] = [];

        if (node.type === 'root') {
          // Root node: create "in" and "out" nodes
          const inNodeId = getNodeId('in', node.iri, undefined, nodeId);
          const outNodeId = getNodeId('out', node.iri, undefined, nodeId);

          newNodes.set(inNodeId, {
            type: 'in',
            iri: node.iri,
            loaded: false,
            parentNodeId: nodeId,
          });
          newNodes.set(outNodeId, {
            type: 'out',
            iri: node.iri,
            loaded: false,
            parentNodeId: nodeId,
          });

          children.push(inNodeId, outNodeId);
        } else if (node.type === 'out') {
          // Out node: load all outgoing predicates
          const predicates = await loadOutgoingPredicates(node.iri);
          for (const predicate of predicates) {
            const predicateNodeId = getNodeId('predicate', node.iri, predicate, nodeId);
            newNodes.set(predicateNodeId, {
              type: 'predicate',
              iri: node.iri,
              predicate,
              loaded: false,
              parentType: 'out',
              parentNodeId: nodeId,
            });
            children.push(predicateNodeId);
          }
        } else if (node.type === 'in') {
          // In node: load all incoming predicates
          const predicates = await loadIncomingPredicates(node.iri);
          for (const predicate of predicates) {
            const predicateNodeId = getNodeId('predicate', node.iri, predicate, nodeId);
            newNodes.set(predicateNodeId, {
              type: 'predicate',
              iri: node.iri,
              predicate,
              loaded: false,
              parentType: 'in',
              parentNodeId: nodeId,
            });
            children.push(predicateNodeId);
          }
        } else if (node.type === 'predicate') {
          // Predicate node: load objects (for out) or subjects (for in)
          if (node.iri && node.predicate) {
            const isOutgoing = node.parentType === 'out';
            
            if (isOutgoing) {
              // Load objects (can be IRIs or literals)
              const objects = await loadObjects(node.iri, node.predicate);
              
              // Check if all objects are literals
              const allLiterals = objects.every(obj => obj.isLiteral);
              
              if (allLiterals && objects.length === 1) {
                // Single literal: store it inline, no children
                newNodes.set(nodeId, {
                  ...node,
                  loaded: true,
                  singleLiteralValue: objects[0].value,
                  objectInfo: objects,
                  children: [], // No children
                });
                // Continue to update nodes below
              } else if (allLiterals && objects.length > 1) {
                // Multiple literals: show as expandable with all literals as children
                for (const obj of objects) {
                  const objectNodeId = getNodeId('object', obj.value, undefined, nodeId);
                  if (!newNodes.has(objectNodeId)) {
                    newNodes.set(objectNodeId, {
                      type: 'object',
                      iri: obj.value,
                      loaded: false,
                      isLiteral: true,
                      literalValue: obj.value,
                      parentNodeId: nodeId,
                    });
                  }
                  children.push(objectNodeId);
                }
              } else {
                // Has IRIs (or mix): show all as expandable children
                for (const obj of objects) {
                  const objectNodeId = getNodeId('object', obj.value, undefined, nodeId);
                  if (!newNodes.has(objectNodeId)) {
                    newNodes.set(objectNodeId, {
                      type: 'object',
                      iri: obj.value,
                      loaded: false,
                      isLiteral: obj.isLiteral,
                      literalValue: obj.isLiteral ? obj.value : undefined,
                      parentNodeId: nodeId,
                    });
                  }
                  children.push(objectNodeId);
                }
              }
              
              // Store object info for reference (if not already set above for single literal)
              if (!newNodes.has(nodeId) || newNodes.get(nodeId)?.singleLiteralValue === undefined) {
                newNodes.set(nodeId, {
                  ...node,
                  objectInfo: objects,
                });
              }
            } else {
              // Load subjects (always NamedNodes) - always expandable
              const subjects = await loadSubjects(node.iri, node.predicate);
              for (const subjectIri of subjects) {
                const objectNodeId = getNodeId('object', subjectIri, undefined, nodeId);
                if (!newNodes.has(objectNodeId)) {
                  newNodes.set(objectNodeId, {
                    type: 'object',
                    iri: subjectIri,
                    loaded: false,
                    isLiteral: false,
                    parentNodeId: nodeId,
                  });
                }
                children.push(objectNodeId);
              }
            }
          }
        } else if (node.type === 'object') {
          // Object node: create "in" and "out" nodes (recursive)
          // BUT: Skip if this is a literal - literals are always leaf nodes
          if (node.isLiteral) {
            // Literals are leaf nodes, no children
            newNodes.set(nodeId, {
              ...node,
              loaded: true,
              children: [],
            });
          } else {
            // Only create In/Out for non-literal objects (IRIs)
            const inNodeId = getNodeId('in', node.iri, undefined, nodeId);
            const outNodeId = getNodeId('out', node.iri, undefined, nodeId);

            if (!newNodes.has(inNodeId)) {
              newNodes.set(inNodeId, {
                type: 'in',
                iri: node.iri,
                loaded: false,
                parentNodeId: nodeId,
              });
            }
            if (!newNodes.has(outNodeId)) {
              newNodes.set(outNodeId, {
                type: 'out',
                iri: node.iri,
                loaded: false,
                parentNodeId: nodeId,
              });
            }

            children.push(inNodeId, outNodeId);
          }
        }

        // Update nodes with new children
        setNodes((prevNodes) => {
          const updatedNodes = new Map(prevNodes);
          
          // Add new child nodes
          for (const [childId, childNode] of newNodes.entries()) {
            updatedNodes.set(childId, childNode);
          }

          // Mark node as loaded and set children (unless it's a single literal which is already set)
          const updatedNode = updatedNodes.get(nodeId);
          if (updatedNode && updatedNode.singleLiteralValue === undefined) {
            updatedNodes.set(nodeId, {
              ...updatedNode,
              loaded: true,
              children,
            });
          }

          return updatedNodes;
        });
        
        console.log('Successfully loaded', children.length, 'children for node:', nodeId);
      } catch (error) {
        console.error('Error loading node children:', error);
      } finally {
        setLoading(false);
      }
    },
    [nodes, dataset, getNodeId, loadOutgoingPredicates, loadIncomingPredicates, loadObjects, loadSubjects]
  );

  // Handle expansion
  const handleExpandedItemsChange = useCallback(
    (_event: React.SyntheticEvent | null, itemIds: string[]) => {
      const previousExpanded = expandedItems;
      setExpandedItems(itemIds);
      
      // Load children for newly expanded items (skip placeholder nodes and literals)
      for (const itemId of itemIds) {
        if (!previousExpanded.includes(itemId) && !itemId.includes(':placeholder')) {
          // Remove "literal:" prefix if present to get the actual node ID
          const actualNodeId = itemId.startsWith('literal:') ? itemId.substring(8) : itemId;
          console.log('Expanding node:', actualNodeId);
          loadNodeChildren(actualNodeId).catch((error) => {
            console.error('Error loading children for', actualNodeId, error);
          });
        }
      }
    },
    [expandedItems, loadNodeChildren]
  );

  // Convert nodes to tree items
  const treeItems = useMemo((): TreeViewBaseItem[] => {
    if (nodes.size === 0) return [];

    // Find root node
    const rootNodes = Array.from(nodes.values()).filter((n) => n.type === 'root');
    if (rootNodes.length === 0) return [];

    const buildTreeItem = (nodeId: NodeId): TreeViewBaseItem | null => {
      const node = nodes.get(nodeId);
      if (!node) return null;

      let label = '';
      let isLiteral = false;
      if (node.type === 'root') {
        label = shortenUri(node.iri);
      } else if (node.type === 'in') {
        label = '← In';
      } else if (node.type === 'out') {
        label = '→ Out';
      } else if (node.type === 'predicate') {
        const predicateLabel = shortenUri(node.predicate || '');
        // If single literal, show it inline
        if (node.singleLiteralValue !== undefined) {
          label = `${predicateLabel}: ${node.singleLiteralValue}`;
          isLiteral = true; // Mark as literal for right alignment
        } else {
          label = predicateLabel;
        }
      } else if (node.type === 'object') {
        if (node.isLiteral && node.literalValue) {
          label = node.literalValue;
          isLiteral = true;
        } else {
          label = shortenUri(node.iri);
        }
      }

      const children: TreeViewBaseItem[] = [];
      
      // Predicates with single literals should not be expandable
      const isSingleLiteralPredicate = node.type === 'predicate' && node.singleLiteralValue !== undefined;
      // Literal objects should never be expandable (they're leaf nodes)
      const isLiteralObject = node.type === 'object' && node.isLiteral;
      
      if (!isSingleLiteralPredicate && !isLiteralObject) {
        if (node.children && node.children.length > 0) {
          for (const childId of node.children) {
            const childItem = buildTreeItem(childId);
            if (childItem) {
              children.push(childItem);
            }
          }
        } else if (!node.loaded) {
          // For nodes that can have children but aren't loaded yet, add a placeholder
          // This makes the tree view show an expand icon
          // But skip for literal objects
          if (node.type === 'root' || node.type === 'in' || node.type === 'out' || node.type === 'predicate' || (node.type === 'object' && !node.isLiteral)) {
            children.push({
              id: `${nodeId}:placeholder`,
              label: loading ? 'Loading...' : '...',
            });
          }
        }
      }

      // Use a special ID prefix for literals to enable CSS targeting
      const itemId = isLiteral ? `literal:${nodeId}` : nodeId;
      
      // Store node data in the item for click handling
      return {
        id: itemId,
        label,
        children: children.length > 0 ? children : undefined,
        // Store metadata for predicate click handling
        ...(node.type === 'predicate' && {
          'data-predicate': node.predicate,
          'data-subject-iri': node.iri,
          'data-direction': node.parentType,
        }),
      };
    };

    // Build tree for each root node
    const items: TreeViewBaseItem[] = [];
    for (const rootNode of rootNodes) {
      const rootItem = buildTreeItem(getNodeId('root', rootNode.iri));
      if (rootItem) {
        items.push(rootItem);
      }
    }
    return items;
  }, [nodes, getNodeId, loading]);

  // Handle root IRI submission
  const handleLoadRoot = useCallback(async () => {
    if (!rootIri.trim() || !dataset) return;

    const rootNodeId = getNodeId('root', rootIri.trim());
    const newNodes = new Map();
    newNodes.set(rootNodeId, {
      type: 'root',
      iri: rootIri.trim(),
      loaded: false,
    });
    setNodes(newNodes);
    setExpandedItems([]); // Start collapsed by default
    
    // Load children immediately after state is set
    // Use setTimeout to ensure state has updated
    setTimeout(async () => {
      await loadNodeChildren(rootNodeId);
    }, 0);
  }, [rootIri, dataset, getNodeId, loadNodeChildren]);

  if (!dataset) {
    return null;
  }

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <AccountTreeIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="h2">
            Graph Browser
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center' }}>
          <TextField
            inputRef={inputRef}
            label="Start IRI"
            value={rootIri}
            onChange={(e) => setRootIri(e.target.value)}
            placeholder="http://example.org/resource"
            fullWidth
            size="small"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleLoadRoot();
              }
            }}
          />
          <Button
            variant="contained"
            onClick={handleLoadRoot}
            disabled={loading || !rootIri.trim()}
            sx={{ minWidth: 120 }}
          >
            {loading ? <CircularProgress size={20} /> : 'Load'}
          </Button>
        </Box>

        {treeItems.length > 0 && (
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
            <Box
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Find the tree item that was right-clicked
                const target = e.target as HTMLElement;
                // MUI RichTreeView sets the ID on the root element with class MuiTreeItem-root
                const rootElement = target.closest('[class*="MuiTreeItem-root"]') as HTMLElement | null;
                
                if (rootElement) {
                  // Get the ID from the root element (set by RichTreeView)
                  const itemId = rootElement.id;
                  
                  console.log('Found rootElement, itemId:', itemId);
                  
                  if (itemId) {
                    // Remove literal: prefix if present
                    const actualNodeId = itemId.startsWith('literal:') ? itemId.substring(8) : itemId;
                    console.log('Looking up nodeId:', actualNodeId);
                    console.log('Total nodes in map:', nodes.size);
                    console.log('Sample node IDs (first 5):', Array.from(nodes.keys()).slice(0, 5));
                    
                    // Try direct lookup first
                    let node = nodes.get(actualNodeId);
                    let matchedNodeId = actualNodeId;
                    
                    // If direct lookup fails, try to find by matching patterns
                    // The nodeId might be a complex path like "root:iri->out:iri->predicate:iri:predicate"
                    if (!node) {
                      console.log('Direct lookup failed, trying pattern matching...');
                      
                      // Strategy 1: Find nodes where actualNodeId is a suffix
                      for (const [nodeId, candidateNode] of nodes.entries()) {
                        if (candidateNode.type === 'predicate' && nodeId.endsWith(actualNodeId)) {
                          console.log('Found by suffix match:', nodeId);
                          node = candidateNode;
                          matchedNodeId = nodeId;
                          break;
                        }
                      }
                      
                      // Strategy 2: Find nodes where actualNodeId contains the predicate part
                      if (!node) {
                        // Extract predicate from actualNodeId if it's in format "predicate:iri:predicate"
                        const predicateMatch = actualNodeId.match(/predicate:([^:]+):(.+)$/);
                        if (predicateMatch) {
                          const [, subjectIri, predicateIri] = predicateMatch;
                          console.log('Extracted predicate info - subject:', subjectIri, 'predicate:', predicateIri);
                          
                          // Find predicate nodes matching this subject and predicate
                          for (const [nodeId, candidateNode] of nodes.entries()) {
                            if (
                              candidateNode.type === 'predicate' &&
                              candidateNode.predicate === predicateIri &&
                              candidateNode.iri === subjectIri
                            ) {
                              console.log('Found by predicate match:', nodeId);
                              node = candidateNode;
                              matchedNodeId = nodeId;
                              break;
                            }
                          }
                        }
                      }
                      
                      // Strategy 3: Find any predicate node with matching predicate IRI
                      if (!node) {
                        // Try to extract just the predicate IRI from the end
                        const parts = actualNodeId.split(':');
                        if (parts.length > 0) {
                          const lastPart = parts[parts.length - 1];
                          console.log('Trying to match by last part:', lastPart);
                          
                          for (const [nodeId, candidateNode] of nodes.entries()) {
                            if (
                              candidateNode.type === 'predicate' &&
                              candidateNode.predicate &&
                              (candidateNode.predicate === lastPart || candidateNode.predicate.endsWith(lastPart))
                            ) {
                              console.log('Found by predicate IRI match:', nodeId, 'predicate:', candidateNode.predicate);
                              node = candidateNode;
                              matchedNodeId = nodeId;
                              break;
                            }
                          }
                        }
                      }
                    }
                    
                    // Only show context menu for predicate nodes
                    if (node?.type === 'predicate' && node.predicate) {
                      console.log('✓ Opening context menu for predicate:', node.predicate, 'matched nodeId:', matchedNodeId);
                      setContextMenu({
                        mouseX: e.clientX,
                        mouseY: e.clientY,
                        nodeId: matchedNodeId,
                      });
                    } else {
                      console.log('✗ Not a predicate node or no predicate. Node:', node, 'nodeId:', actualNodeId);
                    }
                  } else {
                    console.log('No itemId found on rootElement');
                  }
                } else {
                  console.log('No rootElement found');
                }
              }}
              sx={{ width: '100%', height: '100%' }}
            >
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
                // Store item ID on tree item for context menu
                '& .MuiTreeItem-root': {
                  '&[id]': {
                    // IDs are already set by RichTreeView
                  },
                },
                '& .MuiTreeItem-label': {
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  width: '100%',
                  maxWidth: '100%',
                  display: 'block',
                  textAlign: 'left', // Default: left-align
                },
                // Right-align literal values (items with ID starting with "literal:")
                '& .MuiTreeItem-root[id^="literal:"] .MuiTreeItem-label': {
                  textAlign: 'right',
                  direction: 'rtl',
                  '& > span': {
                    direction: 'ltr',
                    display: 'inline-block',
                  },
                },
              }}
            />
            </Box>
          </Box>
        )}

        {treeItems.length === 0 && !loading && (
          <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
            Enter an IRI above to start browsing the graph
          </Typography>
        )}

        {contextMenu && (
          <Menu
            open={true}
            onClose={() => {
              console.log('Closing context menu');
              setContextMenu(null);
            }}
            anchorReference="anchorPosition"
            anchorPosition={{
              top: contextMenu.mouseY,
              left: contextMenu.mouseX,
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'left',
            }}
            slotProps={{
              paper: {
                sx: {
                  maxHeight: 'none',
                },
              },
            }}
          >
          {contextMenu?.nodeId && (() => {
            let node = nodes.get(contextMenu.nodeId);
            console.log('Rendering menu for nodeId:', contextMenu.nodeId);
            console.log('Direct lookup result:', node);
            console.log('All nodes:', Array.from(nodes.entries()).map(([id, n]) => ({ id, type: n.type, predicate: n.predicate })));
            
            // If direct lookup fails, try to find by matching
            if (!node) {
              for (const [nodeId, candidateNode] of nodes.entries()) {
                if (candidateNode.type === 'predicate' && (nodeId === contextMenu.nodeId || nodeId.endsWith(contextMenu.nodeId) || contextMenu.nodeId.endsWith(nodeId))) {
                  console.log('Found matching node by ID pattern:', nodeId);
                  node = candidateNode;
                  break;
                }
              }
            }
            
            console.log('Final node for menu:', node);
            if (node?.type === 'predicate' && node.predicate && onSelectPredicate) {
              const isOutgoing = node.parentType === 'out' || !node.parentType;
              const isIncoming = node.parentType === 'in';
              
              console.log('Menu items - isOutgoing:', isOutgoing, 'isIncoming:', isIncoming);
              
              return (
                <>
                  {isOutgoing && (
                    <MenuItem
                      onClick={() => {
                        console.log('Clicked Specialize Out');
                        onSelectPredicate(node.iri, node.predicate!, 'out');
                        setContextMenu(null);
                      }}
                    >
                      Specialize → Out
                    </MenuItem>
                  )}
                  {isIncoming && (
                    <MenuItem
                      onClick={() => {
                        console.log('Clicked Specialize In');
                        onSelectPredicate(node.iri, node.predicate!, 'in');
                        setContextMenu(null);
                      }}
                    >
                      Specialize ← In
                    </MenuItem>
                  )}
                  {!isOutgoing && !isIncoming && (
                    <MenuItem disabled>No specialization available</MenuItem>
                  )}
                </>
              );
            }
            console.log('Node is not a predicate or missing onSelectPredicate');
            return <MenuItem disabled>Not a predicate node</MenuItem>;
          })()}
          {!contextMenu?.nodeId && <MenuItem disabled>No node selected</MenuItem>}
          </Menu>
        )}
      </CardContent>
    </Card>
  );
}

