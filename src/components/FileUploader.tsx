import { useCallback, useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  LinearProgress,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

interface FileUploaderProps {
  onFileSelect: (file: File) => Promise<void>;
  loading: boolean;
  fileName?: string;
  fileSize?: number;
}

export function FileUploader({
  onFileSelect,
  loading,
  fileName,
  fileSize,
}: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files);
      const hdtFile = files.find((f) => f.name.endsWith('.hdt'));

      if (hdtFile) {
        await onFileSelect(hdtFile);
      }
    },
    [onFileSelect]
  );

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && file.name.endsWith('.hdt')) {
        await onFileSelect(file);
      }
      // Reset input so same file can be selected again
      e.target.value = '';
    },
    [onFileSelect]
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Paper
      elevation={isDragging ? 8 : 2}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        p: 4,
        textAlign: 'center',
        border: '2px dashed',
        borderColor: isDragging ? 'primary.main' : 'grey.300',
        backgroundColor: isDragging ? 'action.hover' : 'background.paper',
        transition: 'all 0.2s ease-in-out',
        cursor: 'pointer',
        position: 'relative',
      }}
    >
      {loading && (
        <Box sx={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
          <LinearProgress />
        </Box>
      )}

      {fileName ? (
        <Box>
          <CloudUploadIcon sx={{ fontSize: 48, color: 'primary.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            {fileName}
          </Typography>
          {fileSize !== undefined && (
            <Typography variant="body2" color="text.secondary">
              {formatFileSize(fileSize)}
            </Typography>
          )}
          <Button
            variant="outlined"
            component="label"
            sx={{ mt: 2 }}
            disabled={loading}
          >
            Change File
            <input
              type="file"
              accept=".hdt"
              hidden
              onChange={handleFileInput}
            />
          </Button>
        </Box>
      ) : (
        <Box>
          <CloudUploadIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Drop HDT file here or click to browse
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Select a .hdt file to load and browse
          </Typography>
          <Button
            variant="contained"
            component="label"
            disabled={loading}
            startIcon={<CloudUploadIcon />}
          >
            Choose File
            <input
              type="file"
              accept=".hdt"
              hidden
              onChange={handleFileInput}
            />
          </Button>
        </Box>
      )}
    </Paper>
  );
}

