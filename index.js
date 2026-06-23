(() => {
  const PATCH_KEY = "__novaMarkdownBlocksV8";

  function root() {
    if (typeof globalThis !== "undefined") return globalThis;
    if (typeof window !== "undefined") return window;
    return {};
  }

  function getMetro() {
    const g = root();
    return g?.bunny?.metro || g?.vendetta?.metro || g?.kettu?.metro || g?.revenge?.metro || null;
  }

  function byProps(metro, ...props) {
    try { return metro?.findByProps?.(...props) || null; } catch (_) { return null; }
  }

  function getModules() {
    const metro = getMetro();
    return {
      metro,
      md: byProps(metro, "createReactRules", "reactParserFor", "parse") || byProps(metro, "parse", "parseTopic"),
      React: byProps(metro, "createElement", "cloneElement") || byProps(metro, "createElement", "useState"),
      RN: byProps(metro, "ScrollView", "View", "Text", "StyleSheet") || byProps(metro, "View", "Text", "StyleSheet") || byProps(metro, "Text", "View"),
    };
  }

  function getKind(lang) {
    const value = String(lang || "").trim().toLowerCase();
    if (value === "info" || value === "note") return "info";
    if (value === "warn" || value === "warning") return "warn";
    if (value === "success" || value === "ok") return "success";
    return null;
  }

  function makeStyles(RN) {
    const raw = {
      root: { padding: 16, gap: 12 },
      h1: { color: "#fff", fontSize: 20, fontWeight: "800" },
      p: { color: "#c8d1df", fontSize: 14, lineHeight: 20 },
      small: { color: "#99a4b4", fontSize: 12, lineHeight: 18 },
      section: { backgroundColor: "#111923", borderRadius: 14, borderWidth: 1, borderColor: "#263241", padding: 12, gap: 8 },
      code: { backgroundColor: "#0c1420", borderRadius: 8, padding: 8, color: "#b8c2d1", fontSize: 13 },
      box: { marginTop: 4, marginBottom: 4, padding: 10, borderRadius: 10, borderWidth: 1, borderLeftWidth: 4, backgroundColor: "#0b1f33", borderColor: "#4aa3ff" },
      warn: { backgroundColor: "#2b210b", borderColor: "#ffb84d" },
      success: { backgroundColor: "#09291c", borderColor: "#39d98a" },
      title: { color: "#7cc7ff", fontSize: 13, fontWeight: "700", marginBottom: 6 },
      warnTitle: { color: "#ffcf70" },
      successTitle: { color: "#6dffb2" },
      body: { color: "#e8eef7", fontSize: 14, lineHeight: 20 },
    };
    try { return RN?.StyleSheet?.create ? RN.StyleSheet.create(raw) : raw; } catch (_) { return raw; }
  }

  function createBox(React, RN, createElement) {
    const styles = makeStyles(RN);
    const h = createElement || React.createElement;
    return function Box(node, key) {
      const kind = getKind(node?.lang);
      if (!kind) return null;
      const warn = kind === "warn";
      const success = kind === "success";
      return h(
        RN.View,
        { key, style: [styles.box, warn && styles.warn, success && styles.success] },
        h(RN.Text, { style: [styles.title, warn && styles.warnTitle, success && styles.successTitle] }, warn ? "Warning" : success ? "Success" : "Info"),
        h(RN.Text, { style: styles.body }, String(node?.content || "")),
      );
    };
  }

  const api = {
    loaded: false,
    lastResult: "not loaded",
    lastError: null,

    patch() {
      const { md, React, RN } = getModules();
      if (!md || !React || !RN?.View || !RN?.Text) {
        api.lastResult = `missing md=${!!md} React=${!!React} RN=${!!RN}`;
        return false;
      }
      if (md[PATCH_KEY]?.loaded) {
        api.loaded = true;
        api.lastResult = "already patched";
        return true;
      }

      const store = {
        loaded: true,
        old: {},
        oldRuleReact: md.defaultRules?.codeBlock?.react,
        oldCreateElement: React.createElement,
        patchedRules: typeof WeakSet !== "undefined" ? new WeakSet() : null,
        createElementHits: 0,
      };
      const Box = createBox(React, RN, store.oldCreateElement);

      function customFromNode(node, key) {
        if (node?.type === "codeBlock") return Box(node, key);
        return null;
      }

      function patchRules(rules) {
        if (!rules?.codeBlock || typeof rules.codeBlock.react !== "function") return rules;
        if (store.patchedRules?.has(rules)) return rules;
        const oldReact = rules.codeBlock.react;
        rules.codeBlock.react = function patchedCodeBlock(node, output, state) {
          const custom = customFromNode(node, state?.key);
          return custom || oldReact.call(this, node, output, state);
        };
        store.patchedRules?.add(rules);
        return rules;
      }

      function patchAllRuleObjects() {
        try {
          Object.keys(md).forEach((key) => {
            const value = md[key];
            if (value?.codeBlock?.react) patchRules(value);
          });
        } catch (_) {}
        patchRules(md.defaultRules);
        patchRules(md.defaultReactRules);
      }

      function deepReplace(value) {
        if (Array.isArray(value)) return value.map(deepReplace);
        const node = value?.props?.node;
        const custom = customFromNode(node, value?.key);
        if (custom) return custom;
        const children = value?.props?.children;
        if (children && React.cloneElement) {
          const next = deepReplace(children);
          if (next !== children) {
            try { return React.cloneElement(value, value.props, next); } catch (_) {}
          }
        }
        return value;
      }

      function wrap(name, maker) {
        if (typeof md[name] !== "function") return;
        if (!store.old[name]) store.old[name] = md[name];
        md[name] = maker(store.old[name]);
      }

      patchAllRuleObjects();

      React.createElement = function patchedCreateElement(type, props, ...children) {
        const node = props?.node;
        const custom = customFromNode(node, props?.key);
        if (custom) {
          store.createElementHits++;
          return custom;
        }
        return store.oldCreateElement.call(this, type, props, ...children);
      };

      if (md.defaultRules?.codeBlock?.react) {
        md.defaultRules.codeBlock.react = function patchedDefault(node, output, state) {
          const custom = customFromNode(node, state?.key);
          return custom || store.oldRuleReact.call(this, node, output, state);
        };
      }

      wrap("createReactRules", (old) => function patchedCreateReactRules(...args) {
        const rules = old.apply(this, args);
        return patchRules(rules);
      });
      wrap("reactParserFor", (old) => function patchedReactParserFor(rules, ...rest) {
        patchRules(rules);
        const parser = old.call(this, rules, ...rest);
        return typeof parser === "function" ? function patchedParser(...args) { return deepReplace(parser.apply(this, args)); } : parser;
      });
      ["parse", "parseTopic", "parseVoiceChannelStatus", "parseEmbedTitle", "parseEmbedTitleWithoutLinks", "parseInlineReply", "parseGuildVerificationFormRule", "parseGuildEventDescription", "parseAutoModerationSystemMessage", "parseForumPostGuidelines"].forEach((name) => {
        wrap(name, (old) => function patchedMarkdownParser(...args) { return deepReplace(old.apply(this, args)); });
      });

      md[PATCH_KEY] = store;
      api.loaded = true;
      api.lastResult = "patched";
      return true;
    },

    restore() {
      const { md, React } = getModules();
      const store = md?.[PATCH_KEY];
      if (!md || !store) return false;
      for (const [name, fn] of Object.entries(store.old || {})) md[name] = fn;
      if (React && store.oldCreateElement) React.createElement = store.oldCreateElement;
      if (md.defaultRules?.codeBlock && store.oldRuleReact) md.defaultRules.codeBlock.react = store.oldRuleReact;
      delete md[PATCH_KEY];
      api.loaded = false;
      api.lastResult = "restored";
      return true;
    },

    debug() {
      const { metro, md, React, RN } = getModules();
      const store = md?.[PATCH_KEY];
      return [
        `loaded=${api.loaded}`,
        `result=${api.lastResult}`,
        `error=${api.lastError || "none"}`,
        `metro=${!!metro}`,
        `md=${!!md}`,
        `React=${!!React}`,
        `RN=${!!RN}`,
        `createReactRules=${typeof md?.createReactRules}`,
        `reactParserFor=${typeof md?.reactParserFor}`,
        `codeBlockReact=${typeof md?.defaultRules?.codeBlock?.react}`,
        `createElementHooked=${!!store?.oldCreateElement}`,
        `createElementHits=${store?.createElementHits || 0}`,
      ].join("\n");
    },
  };

  function onLoad() {
    try { api.patch(); } catch (e) {
      api.lastError = e?.stack || e?.message || String(e);
      console.error("[Nova Markdown Blocks] load failed", e);
    }
    try { root().__NovaMarkdownBlocks = api; } catch (_) {}
    console.log("[Nova Markdown Blocks]", api.lastResult);
  }

  function onUnload() {
    try { api.restore(); } catch (e) { console.error("[Nova Markdown Blocks] unload failed", e); }
  }

  function Settings() {
    const { React, RN } = getModules();
    if (!React || !RN?.View || !RN?.Text) return null;
    const styles = makeStyles(RN);
    const realCreateElement = React.__novaOriginalCreateElement || React.createElement;
    const Box = createBox(React, RN, realCreateElement);
    const Root = RN.ScrollView || RN.View;
    return realCreateElement(
      Root,
      { style: styles.root },
      realCreateElement(RN.Text, { style: styles.h1 }, "Nova Markdown Blocks"),
      realCreateElement(RN.Text, { style: styles.p }, "Custom local UI cards for Discord Markdown code blocks."),
      realCreateElement(RN.View, { style: styles.section },
        realCreateElement(RN.Text, { style: styles.h1 }, "Preview"),
        Box({ lang: "info", content: "Hello info box" }, "info-preview"),
        Box({ lang: "warn", content: "Cảnh báo test UI custom" }, "warn-preview"),
        Box({ lang: "success", content: "Patch hoạt động ngon" }, "success-preview"),
      ),
      realCreateElement(RN.View, { style: styles.section },
        realCreateElement(RN.Text, { style: styles.h1 }, "Markdown"),
        realCreateElement(RN.Text, { style: styles.code }, "```info\nHello info box\n```"),
        realCreateElement(RN.Text, { style: styles.code }, "```warn\nCảnh báo test UI custom\n```"),
        realCreateElement(RN.Text, { style: styles.code }, "```success\nPatch hoạt động ngon\n```"),
      ),
      realCreateElement(RN.View, { style: styles.section },
        realCreateElement(RN.Text, { style: styles.h1 }, "Status"),
        realCreateElement(RN.Text, { style: styles.small }, api.debug()),
      ),
      realCreateElement(RN.View, { style: styles.section },
        realCreateElement(RN.Text, { style: styles.h1 }, "Credits"),
        realCreateElement(RN.Text, { style: styles.p }, "Made by ChatGPT for Nova Hoang."),
      ),
    );
  }

  try { root().__NovaMarkdownBlocks = api; } catch (_) {}
  return { onLoad, onUnload, Settings, settings: Settings, api };
})()
