# App Page Studio Pixso Plugin

This plugin exports selected Pixso frames/components/groups as page PNGs, exports slice nodes as PNG assets, and uploads both to App Page Studio.

## Load Locally

1. In Pixso, open the plugin development/import entry.
2. Select `packages/pixso-plugin/manifest.json`.
3. Open an App Page Studio workspace, click `Figma/Pixso`, generate a token, and paste both the server URL and token into the plugin settings.
4. Choose the target project and page group in the plugin before uploading.

## Slice Rules

A child node is exported as a slice when either condition is true:

- The node has Pixso export settings.
- The node name starts with `@slice`, `#slice`, `[slice]`, `slice/`, `slice:`, `slice_`, or `slice-`.

The plugin uploads:

- Page PNGs into `__design__/`.
- Slice PNGs into `__assets__/`.
- Slice regions into the page `imageReplacements` config.

Re-uploading the same Pixso node uses upsert mode and updates the existing App Page Studio page config where possible.
