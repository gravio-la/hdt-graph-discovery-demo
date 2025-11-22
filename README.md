# HDT Graph Discovery Demo

A web application for browsing and exploring HDT (Header Dictionary Triples) RDF graphs in the browser using WASM64.

## What You Can Do

- **Load HDT files** via drag-and-drop or file picker
- **View dataset statistics** (triple count, memory usage) on demand
- **Discover RDF classes** with instance counts (`rdfs:Class`, `owl:Class`)
- **Browse the graph** starting from any URI with interactive navigation
- **Search full-text** across all subjects, predicates, and objects
- **Bookmark URIs** for quick access during exploration

## Browser Requirements

This application requires **WASM64** support:

- ✅ **Chrome 133+** (fully supported)
- ⚠️ **Firefox 134+** (may require flag)
- ❌ **Safari**: Not supported yet

The app will display a warning banner if your browser may not be compatible.

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) (recommended) or Node.js 18+
- A modern browser with WASM64 support

### Installation

```bash
# Install dependencies
bun install
```

### Development

```bash
# Start development server
bun dev
```

The app will be available at `http://localhost:5173` (or the port Vite assigns).

### Build

```bash
# Build for production
bun run build
```

### Preview Production Build

```bash
# Preview production build
bun run preview
```

## Deployment

The application automatically deploys to GitHub Pages when changes are pushed to the `main` branch. The workflow:

1. Builds the application with the correct base path (derived from repository name)
2. Uploads the build artifacts
3. Deploys to GitHub Pages

**Note:** Ensure GitHub Pages is enabled in your repository settings and set to deploy from GitHub Actions.

## Usage

1. **Upload an HDT file**: Drag and drop a `.hdt` file onto the upload area, or click to browse
2. **View Statistics**: Once loaded, the app displays:
   - Total number of triples in the dataset
   - Memory usage (approximate)
3. **Browse Classes**: The app automatically discovers and lists:
   - Classes explicitly declared as `rdfs:Class` or `owl:Class`
   - Common types used in `rdf:type` statements
   - Instance counts for each class

## Converting RDF to HDT

To create HDT files from RDF data, use the `rdf2hdt` tool from the [hdt-cpp package](https://search.nixos.org/packages?channel=unstable&query=hdt):

```bash
# With Nix
nix-shell -p hdt --run "rdf2hdt input.nt output.hdt"

# Or directly if you have hdt in your environment
rdf2hdt input.nt output.hdt
```

Supported input formats: N-Triples, Turtle, RDF/XML, and more. HDT provides 10-15x compression and enables fast pattern queries.

## Technology Stack

- **React 18+**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **Material-UI v6**: UI component library
- **@graviola/hdt-rdfjs-dataset**: HDT dataset implementation for RDF/JS
- **@rdfjs/data-model**: RDF/JS data model factory

## How It Works

1. **File Loading**: The app reads the HDT file as a `Uint8Array` and passes it to `loadHdtDataset()`
2. **Dataset Creation**: The HDT file is parsed and loaded into memory using WASM64
3. **Querying**: The app uses RDF/JS `match()` patterns to:
   - Find all triples
   - Discover classes (resources typed as `rdfs:Class` or `owl:Class`)
   - Count instances of each class
4. **Display**: Results are displayed in a clean, responsive Material-UI interface

## Limitations

- HDT files are read-only (no editing capabilities)
- Large datasets may take time to load and process
- Class discovery is heuristic-based and may not catch all classes
- Browser compatibility is limited to WASM64-supporting browsers

## License

MIT

## Contributing

This is a demo application. For issues or contributions related to the HDT library itself, please refer to the [@graviola/hdt-rdfjs-dataset](https://github.com/gravio-la/hdt-rdfjs-dataset) repository.
