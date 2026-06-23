(() => {
  const PATCH_KEY = "__novaMarkdownBlocksV10";

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

  function unique(list) {
    const out = [];
    for (const x of list) if (x && !out.includes(x)) out.push(x);
    return out;
  }

  function isMarkdownModule(x) {
    return !!x && typeof x === "object" && (
      (typeof x.parse === "function" && (x.defaultRules || x.createReactRules || x.reactParserFor)) ||
      (typeof x.createReactRules === "function" && typeof x.reactParserFor === "function") ||
      !!x.defaultRules?.codeBlock?.react ||
      !!x.defaultReactRules?.codeBlock?.react
    );
  }

  function getAllMarkdownModules(metro) {
    const list = [];
    list.push(byProps(metro, "createReactRules", "reactParserFor", "parse"));
    list.push(byProps(metro, "parse", "parseTopic"));

    try {
      const ex = metro?.findAllExports?.((x) => isMarkdownModule(x)) || [];
      list.push(...ex);
    } catch (_) {}

    try {
      const mods = metro?.findAllModule?.((m) => {
        try {
          if (isMarkdownModule(m)) return true;
          if (isMarkdownModule(m?.defaultExport)) return true;
          if (isMarkdownModule(m?.default)) return true;
        } catch (_) {}
        return false;
      }) || [];
      for (const m of mods) {
        if (isMarkdownModule(m)) list.push(m);
        if (isMarkdownModule(m?.defaultExport)) list.push(m.defaultExport);
        if (isMarkdownModule(m?.default)) list.push(m.default);
      }
    } catch (_) {}

    return unique(list);
  }

  function getModules() {
    const metro = getMetro();
    return {
      metro,
      mds: getAllMarkdownModules(metro),
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

  function typeName(type) {
    try {
      if (typeof type === "string") return type;
      return type?.displayName || type?.name || type?.render?.displayName || type?.render?.name || "";
    } catch (_) {
      return "";
    }
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
      const kind = getKind(node?.lang || node?.language);
      if (!kind) return null;
      const warn = kind === "warn";
      const success = kind === "success";
      return h(
        RN.View,
        { key, style: [styles.box, warn && styles.warn, success && styles.success] },
        h(RN.Text, { style: [styles.title, warn && styles.warnTitle, success && styles.successTitle] }, warn ? "Warning" : success ? "Success" : "Info"),
        h(RN.Text, { style: styles.body }, String(node?.content || node?.text || node?.value || "")),
      );
    };
  }

  const api = {
    loaded: false,
    lastResult: "not loaded",
    lastError: null,
    stores: [],
    factoryStore: null,

    patch() {
      const { metro, mds, React, RN } = getModules();
      if (!metro || !React || !RN?.View || !RN?.Text || !mds.length) {
        api.lastResult = `missing metro=${!!metro} mds=${mds.length} React=${!!React} RN=${!!RN}`;
        return false;
      }

      const realCreateElement = React.createElement;
      const Box = createBox(React, RN, realCreateElement);

      function nodeFromProps(type, props) {
        const node = props?.node;
        if (node?.type === "codeBlock") return node;
        const name = typeName(type).toLowerCase();
        const lang = props?.lang || props?.language || props?.syntax || props?.lexer;
        const content = props?.content || props?.text || props?.value || props?.children;
        if (lang && getKind(lang) && content && name.includes("code")) return { type: "codeBlock", lang, content };
        return null;
      }

      function customFromNode(node, key, store) {
        if (node?.type !== "codeBlock") return null;
        const custom = Box(node, key);
        if (custom && store) store.ruleHits++;
        return custom;
      }

      function makeDeepReplace(store) {
        return function deepReplace(value) {
          if (Array.isArray(value)) return value.map(deepReplace);

          if (value?.type === "codeBlock") {
            const custom = customFromNode(value, undefined, store);
            if (custom) return custom;
          }

          const direct = customFromNode(value?.props?.node, value?.key, store) || customFromNode(nodeFromProps(value?.type, value?.props), value?.key, store);
          if (direct) return direct;

          const children = value?.props?.children;
          if (children && React.cloneElement) {
            const next = deepReplace(children);
            if (next !== children) {
              try { return React.cloneElement(value, value.props, next); } catch (_) {}
            }
          }
          return value;
        };
      }

      function patchFactoryObject(obj, key, label) {
        if (!obj || typeof obj[key] !== "function") return;
        if (api.factoryStore?.patched?.some((x) => x.obj === obj && x.key === key)) return;
        if (!api.factoryStore) api.factoryStore = { patched: [], hits: 0, looseHits: 0 };

        const old = obj[key];
        obj[key] = function patchedFactory(type, props, ...rest) {
          try {
            const node = nodeFromProps(type, props);
            const custom = node?.type === "codeBlock" ? Box(node, props?.key) : null;
            if (custom) {
              api.factoryStore.hits++;
              if (!props?.node) api.factoryStore.looseHits++;
              return custom;
            }
          } catch (_) {}
          return old.apply(this, [type, props, ...rest]);
        };
        api.factoryStore.patched.push({ obj, key, old, label });
      }

      function patchFactories() {
        patchFactoryObject(React, "createElement", "React.createElement");
        try {
          const ex = metro?.findAllExports?.((x) => x && typeof x === "object" && (
            typeof x.createElement === "function" || typeof x.jsx === "function" || typeof x.jsxs === "function" || typeof x.jsxDEV === "function"
          )) || [];
          ex.forEach((obj, i) => {
            patchFactoryObject(obj, "createElement", `export.${i}.createElement`);
            patchFactoryObject(obj, "jsx", `export.${i}.jsx`);
            patchFactoryObject(obj, "jsxs", `export.${i}.jsxs`);
            patchFactoryObject(obj, "jsxDEV", `export.${i}.jsxDEV`);
          });
        } catch (_) {}
      }

      function patchMarkdownModule(md, index) {
        if (!md || md[PATCH_KEY]?.loaded) return md?.[PATCH_KEY] || null;

        const store = {
          loaded: true,
          index,
          md,
          old: {},
          patchedRules: typeof WeakSet !== "undefined" ? new WeakSet() : null,
          ruleHits: 0,
          parserHits: 0,
          rulesPatched: 0,
        };
        const deepReplace = makeDeepReplace(store);

        function patchRules(rules) {
          if (!rules?.codeBlock || typeof rules.codeBlock.react !== "function") return rules;
          if (store.patchedRules?.has(rules)) return rules;
          const oldReact = rules.codeBlock.react;
          rules.codeBlock.react = function patchedCodeBlock(node, output, state) {
            const custom = customFromNode(node, state?.key, store);
            return custom || oldReact.call(this, node, output, state);
          };
          store.patchedRules?.add(rules);
          store.rulesPatched++;
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
          patchRules(md.guildEventRules);
          patchRules(md.notifCenterV2MessagePreviewRules);
          patchRules(md.lockscreenWidgetMessageRules);
        }

        function wrap(name, maker) {
          if (typeof md[name] !== "function") return;
          if (!store.old[name]) store.old[name] = md[name];
          md[name] = maker(store.old[name]);
        }

        patchAllRuleObjects();

        wrap("createReactRules", (old) => function patchedCreateReactRules(...args) {
          const rules = old.apply(this, args);
          return patchRules(rules);
        });

        wrap("reactParserFor", (old) => function patchedReactParserFor(rules, ...rest) {
          patchRules(rules);
          const parser = old.call(this, rules, ...rest);
          return typeof parser === "function" ? function patchedParser(...args) { store.parserHits++; return deepReplace(parser.apply(this, args)); } : parser;
        });

        ["parse", "parseTopic", "parseVoiceChannelStatus", "parseEmbedTitle", "parseEmbedTitleWithoutLinks", "parseInlineReply", "parseGuildVerificationFormRule", "parseGuildEventDescription", "parseAutoModerationSystemMessage", "parseForumPostGuidelines"].forEach((name) => {
          wrap(name, (old) => function patchedMarkdownParser(...args) {
            store.parserHits++;
            return deepReplace(old.apply(this, args));
          });
        });

        md[PATCH_KEY] = store;
        api.stores.push(store);
        return store;
      }

      patchFactories();
      mds.forEach((md, i) => patchMarkdownModule(md, i));

      api.loaded = true;
      api.lastResult = `patched ${api.stores.length}/${mds.length} markdown modules`;
      return true;
    },

    restore() {
      for (const store of api.stores || []) {
        const md = store.md;
        for (const [name, fn] of Object.entries(store.old || {})) md[name] = fn;
        delete md[PATCH_KEY];
      }
      for (const item of api.factoryStore?.patched || []) {
        try { item.obj[item.key] = item.old; } catch (_) {}
      }
      api.stores = [];
      api.factoryStore = null;
      api.loaded = false;
      api.lastResult = "restored";
      return true;
    },

    debug() {
      const { metro, mds, React, RN } = getModules();
      const parserHits = api.stores.reduce((n, s) => n + (s.parserHits || 0), 0);
      const ruleHits = api.stores.reduce((n, s) => n + (s.ruleHits || 0), 0);
      const rulesPatched = api.stores.reduce((n, s) => n + (s.rulesPatched || 0), 0);
      return [
        `loaded=${api.loaded}`,
        `result=${api.lastResult}`,
        `error=${api.lastError || "none"}`,
        `metro=${!!metro}`,
        `markdownModulesFound=${mds.length}`,
        `markdownModulesPatched=${api.stores.length}`,
        `React=${!!React}`,
        `RN=${!!RN}`,
        `rulesPatched=${rulesPatched}`,
        `parserHits=${parserHits}`,
        `ruleHits=${ruleHits}`,
        `factoriesPatched=${api.factoryStore?.patched?.length || 0}`,
        `factoryHits=${api.factoryStore?.hits || 0}`,
        `looseHits=${api.factoryStore?.looseHits || 0}`,
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
    const h = React.createElement;
    const Box = createBox(React, RN, h);
    const Root = RN.ScrollView || RN.View;
    return h(
      Root,
      { style: styles.root },
      h(RN.Text, { style: styles.h1 }, "Nova Markdown Blocks"),
      h(RN.Text, { style: styles.p }, "Custom local UI cards for Discord Markdown code blocks."),
      h(RN.View, { style: styles.section },
        h(RN.Text, { style: styles.h1 }, "Preview"),
        Box({ lang: "info", content: "Hello info box" }, "info-preview"),
        Box({ lang: "warn", content: "Cảnh báo test UI custom" }, "warn-preview"),
        Box({ lang: "success", content: "Patch hoạt động ngon" }, "success-preview"),
      ),
      h(RN.View, { style: styles.section },
        h(RN.Text, { style: styles.h1 }, "Markdown"),
        h(RN.Text, { style: styles.code }, "```info\nHello info box\n```"),
        h(RN.Text, { style: styles.code }, "```warn\nCảnh báo test UI custom\n```"),
        h(RN.Text, { style: styles.code }, "```success\nPatch hoạt động ngon\n```"),
      ),
      h(RN.View, { style: styles.section },
        h(RN.Text, { style: styles.h1 }, "Status"),
        h(RN.Text, { style: styles.small }, api.debug()),
      ),
      h(RN.View, { style: styles.section },
        h(RN.Text, { style: styles.h1 }, "Credits"),
        h(RN.Text, { style: styles.p }, "Made by ChatGPT for Nova Hoang."),
      ),
    );
  }

  try { root().__NovaMarkdownBlocks = api; } catch (_) {}
  return { onLoad, onUnload, Settings, settings: Settings, api };
})()
