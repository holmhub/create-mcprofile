# BTML (Bun TypeScript Minecraft Launcher)

A lightweight, modern Minecraft launcher built with Bun and TypeScript.

## Available Scripts

### Development
- `bun run dev` - Start the launcher in development mode
- `bun run format` - Format code using Biome
- `bun run lint` - Run linting checks
- `bun run check` - Run all code checks

### Building
- `bun run build` - Build the project (outputs to dist/)
- `bun run start` - Run the built version
- `bun run compile` - Create executable binary

## Requirements
- Bun v1.2.8 or higher
- Java Runtime Environment (for Minecraft)

## Getting Started

1. Install dependencies:
   ```bash
   bun install
   ```
2. Start development:
   ```bash
   bun run dev
   ```
3. Build for production:
   ```bash
   bun run build
   ```
## Notes
- Requires Java to be installed and accessible
- Supports mod loaders (Forge, Fabric)
- Handles version management and asset downloads
- Includes offline mode support