# Publishing Guide for ui-workspace-drag-drop

## Current Status

This plugin is currently integrated into the main DeepSeek Harness repository and distributed through the bundle system. It is **not yet available as a standalone installable package**.

## Distribution Options

### Option 1: Bundle Integration (Current) ✅

The plugin is already integrated into the web-app bundle:
- Added to `packages/bundle/web-app/cordis.patch.yml`
- Dependency declared in `packages/bundle/web-app/package.json`
- Automatically included when building the web application

**Pros:**
- No extra installation needed for users
- Maintained alongside the core codebase
- Automatic updates with the main application

**Cons:**
- Users cannot selectively enable/disable it
- Tied to the main release cycle

### Option 2: Publish as Standalone npm Package

To make this plugin independently installable:

1. **Update package.json**:
   ```json
   {
     "name": "@loongserpent/dsh-client-ui-workspace-drag-drop",
     "version": "1.0.0",
     "publishConfig": {
       "access": "public"
     },
     "repository": {
       "type": "git",
       "url": "git+https://github.com/deepseek-ai/deepseek-harness.git",
       "directory": "packages/client/ui-workspace-drag-drop"
     }
   }
   ```

2. **Remove `"private": true`** from package.json

3. **Add proper versioning** following semver

4. **Publish to npm**:
   ```bash
   cd packages/client/ui-workspace-drag-drop
   npm publish --access public
   ```

5. **Users can then install it**:
   ```bash
   npm install @loongserpent/dsh-client-ui-workspace-drag-drop
   ```

### Option 3: Create an Example Bundle

Create a demo bundle that showcases this plugin:

1. Create `packages/examples/workspace-drag-drop-demo/`
2. Add minimal cordis.yml configuration
3. Include usage examples and documentation
4. Users can clone and run the example

### Option 4: Document as Manual Installation

Create a cookbook entry showing how to manually add the plugin:

```markdown
# Adding Workspace Drag-Drop Plugin

1. Copy the plugin directory to your project
2. Add to your bundle's cordis.yml
3. Rebuild the application
```

## Future: Plugin Marketplace

DeepSeek Harness does not currently have a public plugin marketplace. However, the architecture supports:

- **Skill System** - For AI agent instructions (different from UI plugins)
- **Bundle System** - For composable plugin collections
- **Plugin Registry** - Internal registry for runtime plugin management

A future plugin marketplace could leverage:
- npm registry for package distribution
- GitHub releases for versioned bundles
- A discovery UI within the application

## Recommendation

For now, keep the plugin integrated in the main bundle (Option 1). If there's demand for independent distribution:

1. **Short-term**: Add to examples directory with documentation
2. **Medium-term**: Publish as npm package with clear installation guide
3. **Long-term**: Contribute to a community plugin registry when one exists

## Making the Plugin Discoverable

Even without a formal marketplace, you can help users find this plugin:

1. **Add to README.md** in the root repository
2. **Document in user guides** under customization section
3. **Create a cookbook entry** at `docs/cookbook/adding-workspace-drag-drop.md`
4. **Mention in release notes** when features are added

## Contributing Back

If you want to contribute this or similar plugins:

1. Follow the [plugin development guidelines](../../../docs/cookbook/adding-a-package.md)
2. Ensure all tests pass: `pnpm run test`
3. Build successfully: `pnpm run build`
4. Add documentation in both English and Chinese
5. Submit a pull request with clear description

## Technical Requirements for Distribution

For a plugin to be easily distributable:

- ✅ Proper package.json with exports
- ✅ TypeScript types exported
- ✅ Clear documentation
- ✅ Tests included
- ✅ Follows repository conventions
- ✅ No hardcoded dependencies on specific configurations

Our plugin meets all these requirements!
