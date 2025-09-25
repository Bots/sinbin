# SinBin Code Style and Conventions

## Code Formatting (Prettier Configuration)
- **Trailing Commas**: ES5 style (trailing commas in objects/arrays where valid in ES5)
- **Tab Width**: 4 spaces for indentation
- **Semicolons**: Disabled (no semicolons)
- **Quotes**: Single quotes for strings
- **Configuration File**: `.prettierrc` in project root

## TypeScript Configuration
- **Target**: ES2020
- **Module System**: CommonJS
- **Strict Mode**: Enabled (strict: true)
- **Source Maps**: Enabled for debugging
- **Output Directory**: `./dist`
- **Root Directory**: `./src`

### TypeScript Strictness
- `noImplicitReturns: true` - Functions must have explicit return statements
- `noFallthroughCasesInSwitch: true` - Switch cases must have breaks
- `forceConsistentCasingInFileNames: true` - Enforce consistent file naming
- `noUnusedLocals: false` - Allows unused local variables
- `noUnusedParameters: false` - Allows unused function parameters

## File Organization
### Directory Structure
```
sinbin/
├── src/
│   ├── server.ts           # Main application entry point
│   └── types/              # TypeScript type definitions
├── public/
│   ├── overlay.html        # OBS browser source
│   └── control.html        # Control panel interface
├── dist/                   # Compiled JavaScript output
└── node_modules/           # Dependencies
```

## Naming Conventions
- **Classes**: PascalCase (e.g., `SwearJarService`)
- **Variables/Properties**: camelCase (e.g., `swearCount`, `isListening`)
- **Methods**: camelCase (e.g., `startRecording`, `checkForCurseWords`)
- **Interfaces**: PascalCase (e.g., `SwearJarConfig`)
- **Files**: kebab-case for HTML, camelCase for TypeScript

## Code Architecture Patterns
### Main Class Structure
- **SwearJarService**: Main service class containing all functionality
- **Properties**: Instance variables for state management
- **Methods**: Public and private methods for functionality
- **Constructor**: Initialization and setup

### Method Organization
- **Setup Methods**: `setupExpress()`, `setupWebSocket()`
- **Core Methods**: `startSpeechRecognition()`, `checkForCurseWords()`
- **Utility Methods**: `loadConfig()`, `saveConfig()`
- **Lifecycle Methods**: `start()`, `stop()`

## Configuration Management
- **External Config**: JSON file for runtime configuration
- **Type Safety**: Interfaces defined for configuration objects
- **Persistence**: Automatic saving of configuration changes

## Error Handling
- Try-catch blocks for external API calls
- Graceful degradation for missing dependencies
- Console logging for debugging and status updates