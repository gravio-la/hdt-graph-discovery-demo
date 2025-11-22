import { Alert, AlertTitle } from '@mui/material';
import { useEffect, useState } from 'react';

export function BrowserWarning() {
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    // Check for WASM64 support
    // Chrome 133+, Firefox 134+ (with flag), Safari: not supported yet
    const userAgent = navigator.userAgent;
    const isChrome = /Chrome/.test(userAgent) && !/Edg/.test(userAgent);
    const isFirefox = /Firefox/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);

    // Try to detect WASM64 support
    // This is a heuristic - actual support detection would require trying to instantiate WASM64
    let needsWarning = false;

    if (isSafari) {
      needsWarning = true;
    } else if (isFirefox) {
      // Firefox 134+ supports WASM64 but may need a flag
      const versionMatch = userAgent.match(/Firefox\/(\d+)/);
      if (versionMatch) {
        const version = parseInt(versionMatch[1], 10);
        if (version < 134) {
          needsWarning = true;
        }
      }
    } else if (isChrome) {
      // Chrome 133+ supports WASM64
      const versionMatch = userAgent.match(/Chrome\/(\d+)/);
      if (versionMatch) {
        const version = parseInt(versionMatch[1], 10);
        if (version < 133) {
          needsWarning = true;
        }
      }
    } else {
      // Unknown browser - show warning
      needsWarning = true;
    }

    setShowWarning(needsWarning);
  }, []);

  if (!showWarning) {
    return null;
  }

  return (
    <Alert severity="warning" sx={{ mb: 3 }}>
      <AlertTitle>Browser Compatibility</AlertTitle>
      This application requires WASM64 support. Your browser may not be fully
      compatible. Supported browsers:
      <ul style={{ marginTop: '8px', marginBottom: 0 }}>
        <li>Chrome 133+</li>
        <li>Firefox 134+ (may require flag)</li>
        <li>Safari: Not supported yet</li>
      </ul>
    </Alert>
  );
}

