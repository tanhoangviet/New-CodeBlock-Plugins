# New-CodeBlock-Plugins

Custom local Markdown code block UI for Bunny / Kettu / Vendetta Discord mobile.

This plugin turns special Markdown code block languages into local React Native UI cards:

```info
Hello info box
```

```warn
Cảnh báo test UI custom
```

```success
Patch hoạt động ngon
```

Normal code blocks still use the original Discord renderer:

```lua
print("lol")
```

## What it does

- Hooks Discord mobile's Markdown module through Metro.
- Patches `createReactRules`, `reactParserFor`, and `defaultRules.codeBlock.react`.
- Keeps normal code blocks like `js`, `lua`, `py`, etc. untouched.
- Renders only on your client. Other users still see normal code blocks.
- Restores original functions when the plugin unloads.

## Supported block types

| Language | UI |
|---|---|
| `info` / `note` | Blue info card |
| `warn` / `warning` | Orange warning card |
| `success` / `ok` | Green success card |

## Files

- `manifest.json` - plugin manifest.
- `index.js` - main plugin entrypoint.
- `src/index.ts` - TypeScript source copy.
- `package.json` - metadata/scripts.

## Important note

Discord may cache its Markdown renderer early. Enable this plugin, restart Discord/Bunny/Kettu, then test in a channel.

## Test messages

```md
```info
Hello info box
```
```

```md
```warn
Cảnh báo test UI custom
```
```

```md
```success
Patch hoạt động ngon
```
```

```md
```lua
print("lol")
```
```
