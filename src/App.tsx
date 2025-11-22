import { useState, useCallback } from 'react';
import {
  Container,
  AppBar,
  Toolbar,
  Typography,
  Box,
  Snackbar,
  Alert,
  Stack,
  Button,
  Tabs,
  Tab,
  IconButton,
} from '@mui/material';
import BookmarkIcon from '@mui/icons-material/Bookmark';
import { loadHdtDataset } from '@graviola/hdt-rdfjs-dataset';
import type { HdtDataset } from '@graviola/hdt-rdfjs-dataset';
import factory from '@rdfjs/data-model';
import { FileUploader } from './components/FileUploader';
import { DatasetStats } from './components/DatasetStats';
import { ClassesList } from './components/ClassesList';
import { BrowserWarning } from './components/BrowserWarning';
import { GraphBrowser } from './components/GraphBrowser';
import { SpecializedGraphBrowser } from './components/SpecializedGraphBrowser';
import { FullTextSearch } from './components/FullTextSearch';
import { BookmarkDrawer } from './components/BookmarkDrawer';

interface ClassInfo {
  uri: string;
  instanceCount: number;
}

function App() {
  const [dataset, setDataset] = useState<HdtDataset | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [fileName, setFileName] = useState<string | undefined>();
  const [fileSize, setFileSize] = useState<number | undefined>();
  const [totalTriples, setTotalTriples] = useState<number | null>(null);
  const [memoryUsage, setMemoryUsage] = useState<number | bigint | null>(null);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [specializedView, setSpecializedView] = useState<{
    startIri: string;
    predicateIri: string;
    direction: 'in' | 'out';
  } | null>(null);
  const [activeTab, setActiveTab] = useState<'browser' | 'search'>('browser');
  const [bookmarkDrawerOpen, setBookmarkDrawerOpen] = useState(false);

  const loadHdtFromBytes = useCallback(async (fileBytes: Uint8Array, fileName?: string) => {
    setLoading(true);
    setError(null);
    setDataset(null);
    setClasses([]);
    setTotalTriples(null);
    setMemoryUsage(null);
    if (fileName) {
      setFileName(fileName);
      setFileSize(fileBytes.length);
    }

    try {
      // Verify file starts with HDT magic bytes
      const hdtMagic = new TextDecoder().decode(fileBytes.slice(0, 4));
      if (hdtMagic !== '$HDT') {
        // Show first few bytes for debugging
        const firstBytes = Array.from(fileBytes.slice(0, 16))
          .map(b => `0x${b.toString(16).padStart(2, '0')}`)
          .join(' ');
        setError(
          `Invalid HDT file. Expected "$HDT" magic bytes, but got: ${hdtMagic} (${firstBytes})`
        );
        setFileName(undefined);
        setFileSize(undefined);
        setLoading(false);
        return;
      }
      
      // Load HDT dataset using the library
      // Use BASE_URL to support GitHub Pages deployment with base path
      const wasmPath = `${import.meta.env.BASE_URL}hdt.wasm`;
      const ds = await loadHdtDataset(fileBytes, { wasmSource: wasmPath });
      
      setDataset(ds);
    } catch (err) {
      let errorMessage = 'Failed to load HDT file';
      
      if (err instanceof Error) {
        errorMessage = err.message;
        
        // Decode error code -9000 format: -(9000 + b0 + (b1 << 8) + (b2 << 16) + (b3 << 24))
        const errorCodeMatch = errorMessage.match(/Error code (-?\d+)/);
        if (errorCodeMatch) {
          const code = parseInt(errorCodeMatch[1], 10);
          if (code < -9000 && code >= -9000 - 0xFFFFFFFF) {
            // Decode the bytes from the error code
            const encoded = -(code + 9000);
            const b0 = encoded & 0xFF;
            const b1 = (encoded >> 8) & 0xFF;
            const b2 = (encoded >> 16) & 0xFF;
            const b3 = (encoded >> 24) & 0xFF;
            const bytes = [b0, b1, b2, b3];
            const hexBytes = bytes.map(b => `0x${b.toString(16).padStart(2, '0')}`).join(' ');
            const ascii = String.fromCharCode(...bytes.map(b => b < 32 || b > 126 ? 46 : b));
            errorMessage = `Invalid HDT file header. Expected "$HDT" but got: ${hexBytes} (${ascii}). The file may be corrupted or not an HDT file.`;
          } else if (code === -9000) {
            errorMessage = 'Invalid HDT file: First 4 bytes are all zeros. The file may be corrupted or empty.';
          } else if (code === -9999) {
            errorMessage = 'Invalid HDT file: File is too short or data length mismatch.';
          } else if (code < 0) {
            // Error code encodes byte position: -(bytes_read + 1)
            const bytesRead = -(code + 1);
            errorMessage = `HDT file parsing failed at byte ${bytesRead} of ${fileBytes.length}. The file may be corrupted.`;
          }
        }
      }
      
      setError(errorMessage);
      setFileName(undefined);
      setFileSize(undefined);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    await loadHdtFromBytes(fileBytes, file.name);
  }, [loadHdtFromBytes]);

  const handleLoadTestFile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Use BASE_URL to support GitHub Pages deployment with base path
      const response = await fetch(`${import.meta.env.BASE_URL}snikmeta.hdt`);
      if (!response.ok) {
        throw new Error(`Failed to fetch test file: ${response.statusText}`);
      }
      const hdtBytes = new Uint8Array(await response.arrayBuffer());
      await loadHdtFromBytes(hdtBytes, 'snikmeta.hdt');
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load test file';
      setError(errorMessage);
      setLoading(false);
    }
  }, [loadHdtFromBytes]);

  // Load statistics on demand
  const handleLoadStats = useCallback(async () => {
    if (!dataset) return;
    
    setLoadingStats(true);
    setError(null);
    
    try {
      // Use efficient counting via countMatches method
      const count = dataset.countMatches(null, null, null);
      const memory = dataset.sizeInBytes();
      
      setTotalTriples(count);
      setMemoryUsage(memory);
    } catch (err) {
      console.error('Error loading stats:', err);
      setError('Failed to load statistics: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoadingStats(false);
    }
  }, [dataset]);

  // Simple class discovery - only explicitly declared classes
  const handleDiscoverClassesSimple = useCallback(async () => {
    if (!dataset) return;
    
    setLoadingClasses(true);
    setError(null);
    
    try {
      // RDF/OWL class URIs
      const rdfsClass = factory.namedNode(
        'http://www.w3.org/2000/01/rdf-schema#Class'
      );
      const owlClass = factory.namedNode(
        'http://www.w3.org/2002/07/owl#Class'
      );
      const rdfType = factory.namedNode(
        'http://www.w3.org/1999/02/22-rdf-syntax-ns#type'
      );

      // Find all resources that are declared as rdfs:Class or owl:Class
      const rdfsClasses = dataset.match(null, rdfType, rdfsClass);
      const owlClasses = dataset.match(null, rdfType, owlClass);

      // Collect all class URIs
      const classUris = new Set<string>();
      for (const quad of rdfsClasses) {
        classUris.add(quad.subject.value);
      }
      for (const quad of owlClasses) {
        classUris.add(quad.subject.value);
      }

      // Count instances efficiently using the countMatches method
      const classList: ClassInfo[] = [];
      for (const classUri of classUris) {
        const classNode = factory.namedNode(classUri);
        // Count instances without loading them into memory
        const instanceCount = dataset.countMatches(null, rdfType, classNode);
        classList.push({
          uri: classUri,
          instanceCount,
        });
      }

      // Sort by instance count (descending)
      classList.sort((a, b) => b.instanceCount - a.instanceCount);

      setClasses(classList);
    } catch (err) {
      console.error('Error discovering classes:', err);
      setError('Failed to discover classes: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoadingClasses(false);
    }
  }, [dataset]);

  const handleCloseError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: 'grey.50' }}>
        <AppBar position="fixed">
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              HDT Graph Discovery Demo
            </Typography>
            <IconButton
              color="inherit"
              onClick={() => setBookmarkDrawerOpen(!bookmarkDrawerOpen)}
              aria-label="toggle bookmarks"
            >
              <BookmarkIcon />
            </IconButton>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4, mt: 8 }}>
        <BrowserWarning />

        <Stack spacing={3}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 2, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              onClick={handleLoadTestFile}
              disabled={loading}
              sx={{ minWidth: 200 }}
            >
              Load Test File (snikmeta.hdt)
            </Button>
            <Typography variant="body2" color="text.secondary">
              Or upload your own HDT file below
            </Typography>
          </Box>

          <FileUploader
            onFileSelect={handleFileUpload}
            loading={loading}
            fileName={fileName}
            fileSize={fileSize}
          />

          {dataset && (
            <>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <Button
                  variant="contained"
                  onClick={handleLoadStats}
                  disabled={loadingStats || totalTriples !== null}
                  sx={{ minWidth: 200 }}
                >
                  {loadingStats ? 'Loading...' : totalTriples !== null ? 'Stats Loaded ✓' : 'Load Statistics'}
                </Button>
                <Button
                  variant="contained"
                  onClick={handleDiscoverClassesSimple}
                  disabled={loadingClasses}
                  sx={{ minWidth: 200 }}
                >
                  {loadingClasses ? 'Discovering...' : 'Discover Classes'}
                </Button>
              </Box>
              
              {totalTriples !== null && memoryUsage !== null && (
                <DatasetStats
                  totalTriples={totalTriples}
                  memoryUsage={memoryUsage}
                />
              )}
              
               {classes.length > 0 && (
                 <ClassesList classes={classes} loading={loadingClasses} />
               )}
               
               <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                 <Tabs
                   value={activeTab}
                   onChange={(_, newValue) => setActiveTab(newValue)}
                   aria-label="view tabs"
                 >
                   <Tab label="Graph Browser" value="browser" />
                   <Tab label="Full-Text Search" value="search" />
                 </Tabs>
               </Box>

               {activeTab === 'browser' && (
                 <>
                   {specializedView ? (
                     <SpecializedGraphBrowser
                       dataset={dataset}
                       startNodeIri={specializedView.startIri}
                       predicateIri={specializedView.predicateIri}
                       direction={specializedView.direction}
                       onClose={() => setSpecializedView(null)}
                     />
                   ) : (
                     <GraphBrowser
                       dataset={dataset}
                       onSelectPredicate={(startIri, predicateIri, direction) => {
                         setSpecializedView({
                           startIri,
                           predicateIri,
                           direction: direction as 'in' | 'out',
                         });
                       }}
                     />
                   )}
                 </>
               )}

               {activeTab === 'search' && <FullTextSearch dataset={dataset} />}
             </>
           )}
         </Stack>
      </Container>

      <Snackbar
        open={error !== null}
        autoHideDuration={6000}
        onClose={handleCloseError}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseError} severity="error" sx={{ width: '100%' }}>
          {error}
        </Alert>
      </Snackbar>

      <BookmarkDrawer open={bookmarkDrawerOpen} onClose={() => setBookmarkDrawerOpen(false)} />
    </Box>
  );
}

export default App;
