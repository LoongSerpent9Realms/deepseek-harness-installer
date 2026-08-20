# Quick Publish Guide

Ready to publish `@loongserpent/dsh-client-ui-workspace-drag-drop` to npm? Follow these steps:

## Prerequisites

1. **npm account** with access to publish to `@deepseek-ai` scope
2. **Git repository** is clean and up to date
3. **All tests pass** and build succeeds

## Steps to Publish

### 1. Final Checks

```bash
cd packages/client/ui-workspace-drag-drop

# Verify build works
npm run bundle

# Check TypeScript compilation
npx tsc --noEmit

# Review what will be published
ls lib/
cat package.json | grep version
```

### 2. Update Version

Choose the appropriate version bump:

```bash
# Bug fixes only
npm version patch    # 1.0.0 -> 1.0.1

# New features (backward compatible)
npm version minor    # 1.0.0 -> 1.1.0

# Breaking changes
npm version major    # 1.0.0 -> 2.0.0
```

This will:
- ✅ Update version in package.json
- ✅ Run `prepublishOnly` script (builds the package)
- ✅ Create git commit with message "vX.Y.Z"
- ✅ Create git tag "vX.Y.Z"

### 3. Update CHANGELOG

Edit `CHANGELOG.md` and add release notes for the new version.

### 4. Publish to npm

```bash
# Login if not already logged in
npm login

# Publish (the --access flag is required for scoped packages)
npm publish --access public
```

### 5. Push to GitHub

```bash
# The postversion script should have done this, but verify:
git push origin main
git push origin --tags
```

### 6. Create GitHub Release

1. Go to: https://github.com/deepseek-ai/deepseek-harness/releases
2. Click "Draft a new release"
3. Select the tag (e.g., `v1.0.0`)
4. Copy release notes from CHANGELOG.md
5. Click "Publish release"

## Verify Publication

Check that the package is live:

```bash
# View on npm website
open https://www.npmjs.com/package/@loongserpent/dsh-client-ui-workspace-drag-drop

# Install in a test project
mkdir test-install && cd test-install
npm init -y
npm install @loongserpent/dsh-client-ui-workspace-drag-drop
ls node_modules/@loongserpent/dsh-client-ui-workspace-drag-drop/
```

## Troubleshooting

### "You do not have permission to publish to @deepseek-ai"

You need to be added as a collaborator to the @deepseek-ai organization on npm. Contact the maintainer.

### "Version already exists"

The version you're trying to publish already exists on npm. Bump the version:

```bash
npm version patch  # or minor/major
```

### Build fails during prepublishOnly

Fix the build errors first:

```bash
npm run bundle
# Fix any errors shown
npm version patch  # retry
```

### Package is too large

Check what's being included:

```bash
# See all files that will be published
find . -type f | grep -v node_modules | grep -v '.git'

# Remove unnecessary files from package.json "files" array
# Or add to .npmignore
```

## Post-Publish Tasks

- [ ] Announce the release in team channel
- [ ] Update dependent projects
- [ ] Add release notes to project documentation
- [ ] Monitor npm downloads and issues

## Automation (Optional)

For future releases, consider setting up:

1. **GitHub Actions** for automated publishing on tag push
2. **Semantic Release** for automatic versioning
3. **CI checks** before allowing publish

Example GitHub Action workflow can be found in `.github/workflows/publish.yml` (if available).

---

**Congratulations!** Your plugin is now available on npm! 🎉

Users can install it with:
```bash
npm install @loongserpent/dsh-client-ui-workspace-drag-drop
```
