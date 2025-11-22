import { Box, Card, CardContent, Typography } from '@mui/material';
import BarChartIcon from '@mui/icons-material/BarChart';

interface DatasetStatsProps {
  totalTriples: number;
  memoryUsage: number | bigint;
}

export function DatasetStats({ totalTriples, memoryUsage }: DatasetStatsProps) {
  const formatBytes = (bytes: number | bigint): string => {
    // Convert BigInt to number if needed
    const numBytes = typeof bytes === 'bigint' ? Number(bytes) : bytes;
    if (numBytes < 1024) return `${numBytes} B`;
    if (numBytes < 1024 * 1024) return `${(numBytes / 1024).toFixed(2)} KB`;
    return `${(numBytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <BarChartIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" component="h2">
            Dataset Statistics
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Total Triples
            </Typography>
            <Typography variant="h5" component="div">
              {totalTriples.toLocaleString()}
            </Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">
              Memory Usage
            </Typography>
            <Typography variant="h6" component="div">
              ~{formatBytes(memoryUsage)}
            </Typography>
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

