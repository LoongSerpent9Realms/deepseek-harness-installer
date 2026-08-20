# Release Checklist

Use this checklist before publishing a new version to npm.

## Pre-Release Checks

### Code Quality
- [ ] All TypeScript files compile without errors: `npx tsc --noEmit`
- [ ] Build succeeds: `npm run bundle`
- [ ] No linting errors
- [ ] All tests pass (if applicable)

### Documentation
- [ ] README.md is up to date
- [ ] CHANGELOG.md has been updated with new version
- [ ] Package.json version matches the release version
- [ ] All public APIs are documented

### Dependencies
- [ ] Peer dependencies are correctly specified
- [ ] No unnecessary runtime dependencies
- [ ] Version ranges follow semver best practices

### Files
- [ ] Only necessary files are included in the package
- [ ] .npmignore excludes development files
- [ ] LICENSE file is present
- [ ] README.md will render correctly on npm

## Publishing Steps

### 1. Update Version

```bash
# For patch release (bug fixes)
npm version patch

# For minor release (new features, backward compatible)
npm version minor

# For major release (breaking changes)
npm version major
```

This will:
- Update version in package.json
- Run prepublishOnly script (builds the package)
- Create a git commit and tag

### 2. Verify Build Output

```bash
# Check what will be published
npm pack --dry-run

# Or create actual tarball to inspect
npm pack
tar -tzf deepseek-ai-dsh-client-ui-workspace-drag-drop-*.tgz
```

### 3. Test Locally (Optional but Recommended)

```bash
# In another project
npm install /path/to/deepseek-ai-dsh-client-ui-workspace-drag-drop-*.tgz
```

### 4. Publish to npm

```bash
# Login to npm (first time only)
npm login

# Publish
npm publish --access public
```

### 5. Push to Git

```bash
# The postversion script should have done this, but verify:
git push
git push --tags
```

### 6. Create GitHub Release

1. Go to https://github.com/deepseek-ai/deepseek-harness/releases
2. Click "Draft a new release"
3. Select the tag created by npm version
4. Copy changelog entries from CHANGELOG.md
5. Publish release

## Post-Release

- [ ] Verify package is visible on npm: https://www.npmjs.com/package/@loongserpent/dsh-client-ui-workspace-drag-drop
- [ ] Test installation in a fresh project
- [ ] Update any dependent projects
- [ ] Announce the release (if significant)

## Troubleshooting

### Build Fails
- Ensure all dependencies are installed: `pnpm install`
- Clean build artifacts: `rm -rf lib/`
- Rebuild: `npm run bundle`

### TypeScript Errors
- Check tsconfig.json extends the correct base config
- Verify all type imports are correct
- Run `npx tsc --noEmit` for detailed errors

### npm Publish Fails
- Verify you're logged in: `npm whoami`
- Check package name is available
- Ensure version is higher than current published version
- Verify you have publish rights to @deepseek-ai scope

### Package Size Too Large
- Review .npmignore exclusions
- Check if source maps are needed
- Remove unnecessary files from files array in package.json
