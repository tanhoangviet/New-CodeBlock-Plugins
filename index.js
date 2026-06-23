const NovaMarkdownBlocks = (() => {
  const PATCH_KEY = "__novaMarkdownBlocksV3";

  function root() {
    if (typeof globalThis !== "undefined") return globalThis;
    if (typeof window !== "undefined") return window;
    return {};
  }

  function metro() {
    const g = root();
    return (
      (typeof bunny !== "undefined" && bunny?.metro) ||
      (typeof vendetta !== "undefined" && vendetta?.metro) ||
      (typeof kettu !== "undefined" && kettu?.metro) ||
      g?.bunny?.metro ||
      g?.vendetta?.metro ||
      g?.kettu?.metro ||
      g?.revenge?.metro ||
      null
    );
  }

  function byProps(m, ...props) {
    try {
      return m?.findByProps?.(...props) || null;
    } catch (_) {
      return null;
    }
  }

  function modules() {
    const m = metro();
    const md =
      byProps(m, "createReactRules", "reactParserFor", "parse") ||
      byProps(m, "parse", "parseTopic");
    const React =
      byProps(m, "createElement", "cloneElement") ||
      byProps(m, "createElement", "useState");
    const RN =
      byProps(m, "View", "Text", "StyleSheet") ||
      byProps(m, "Text", "View");
    return { m, md, React, RN };
  }

  function kind(lang) {
    const s = String(lang || "").trim().toLowerCase();
    if (s === "info" || s === "note") return "info";
    if (s === "warn" || s === "warning") return "warn";
    if (s === "success" || s === "ok") return "success";
    return null;
  }

  function styles(RN) {
    const raw = {
      box: {
        marginTop: 4,
        marginBottom: 4,
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderLeftWidth: 4,
        backgroundColor: "#0b1f33",
        borderColor: "#4aa3ff",
      },
      warn: { backgroundColor: "#2b210b", borderColor: "#ffb84d" },
      success: { backgroundColor: "#09291c", borderColor: "#39d98a" },
      title: { color: "#7cc7ff", fontSize: 13, fontWeight: "700", marginBottom: 6 },
      warnTitle: { color: "#ffcf70" },
      successTitle: { color: "#6dffb2" },
      body: { color: "#e8eef7", fontSize: 14, lineHeight: 20 },
      settingsRoot: { padding: 16, gap: 8 },
      settingsTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
      settingsText: { color: "#c7d0dd", fontSize: 14, lineHeight: 20 },
    };
    try {
      return RN?.StyleSheet?.create ? RN.StyleSheet.create(raw) : raw;
    } catch (_) {
      return raw;
    }
  }

  function boxFactory(React, RN) {
    const s = styles(RN);
    return function makeBox(node, key) {
      const k = kind(node?.lang);
      if (!k) return null;
      const isWarn = k === "warn";
      const isSuccess = k === "success";
      return React.createElement(
        RN.View,
        { key, style: [s.box, isWarn && s.warn, isSuccess && s.success] },
        React.createElement(
          RN.Text,
          { style: [s.title, isWarn && s.warnTitle, isSuccess && s.successTitle] },
          isWarn ? "Warning" : isSuccess ? "Success" : "Info",
        ),
        React.createElement(RN.Text, { style: s.body }, String(node?.content || "")),
      );
    };
  }

  const api = {
    loaded: false,
    lastResult: "not loaded",
    lastError: null,

    patch() {
      const { md, React, RN } = modules();
      if (!md || !React || !RN?.View || !RN?.Text) {
        api.lastResult = `missing md=${!!md} React=${!!React} RN=${!!RN}`;
        return false;
      }
      if (md[PATCH_KEY]?.loaded) {
        api.loaded = true;
        api.lastResult = "already patched";
        return true;
      }

      const makeBox = boxFactory(React, RN);
      const store = {
        loaded: true,
        old: {},
        oldRuleReact: md.defaultRules?.codeBlock?.react,
        patchedRules: typeof WeakSet !== "undefined" ? new WeakSet() : null,
      };

      function patchRules(rules) {
        if (!rules?.codeBlock || typeof rules.codeBlock.react !== "function") return rules;
        if (store.patchedRules?.has(rules)) return rules;
        const oldReact = rules.codeBlock.react;
        rules.codeBlock.react = function patchedCodeBlock(node, output, state) {
          const custom = makeBox(node, state?.key);
          if (custom) return custom;
          return oldReact.call(this, node, output, state);
        };
        store.patchedRules?.add(rules);
        return rules;
      }

      function deepReplace(v) {
        if (Array.isArray(v)) return v.map(deepReplace);
        const node = v?.props?.node;
        if (node?.type === "codeBlock") {
          const custom = makeBox(node, v?.key);
          if (custom) return custom;
        }
        const children = v?.props?.children;
        if (children && React.cloneElement) {
          const next = deepReplace(children);
          if (next !== children) {
            try {
              return React.cloneElement(v, v.props, next);
            } catch (_) {}
          }
        }
        return v;
      }

      function wrap(name, maker) {
        if (typeof md[name] !== "function") return false;
        if (!store.old[name]) store.old[name] = md[name];
        md[name] = maker(store.old[name]);
        return true;
      }

      if (md.defaultRules?.codeBlock?.react) {
        md.defaultRules.codeBlock.react = function patchedDefault(node, output, state) {
          const custom = makeBox(node, state?.key);
          if (custom) return custom;
          return store.oldRuleReact.call(this, node, output, state);
        };
      }

      wrap("createReactRules", (old) => function (...args) {
        return patchRules(old.apply(this, args));
      });

      wrap("reactParserFor", (old) => function (rules, ...rest) {
        patchRules(rules);
        const parser = old.call(this, rules, ...rest);
        if (typeof parser !== "function") return parser;
        return function (...args) {
          return deepReplace(parser.apply(this, args));
        };
      });

      [
        "parse",
        "parseTopic",
        "parseVoiceChannelStatus",
        "parseEmbedTitle",
        "parseEmbedTitleWithoutLinks",
        "parseInlineReply",
        "parseGuildVerificationFormRule",
        "parseGuildEventDescription",
        "parseAutoModerationSystemMessage",
        "parseForumPostGuidelines",
      ].forEach((name) => {
        wrap(name, (old) => function (...args) {
          return deepReplace(old.apply(this, args));
        });
      });

      md[PATCH_KEY] = store;
      api.loaded = true;
      api.lastResult = "patched";
      return true;
    },

    restore() {
      const { md } = modules();
      const store = md?.[PATCH_KEY];
      if (!md || !store) return false;
      for (const [name, fn] of Object.entries(store.old || {})) md[name] = fn;
      if (md.defaultRules?.codeBlock && store.oldRuleReact) {
        md.defaultRules.codeBlock.react = store.oldRuleReact;
      }
      delete md[PATCH_KEY];
      api.loaded = false;
      api.lastResult = "restored";
      return true;
    },

    debug() {
      const { m, md, React, RN } = modules();
      return [
        `apiLoaded=${api.loaded}`,
        `lastResult=${api.lastResult}`,
        `lastError=${api.lastError || "none"}`,
        `metro=${!!m}`,
        `md=${!!md}`,
        `React=${!!React}`,
        `RN=${!!RN}`,
        `hasCreateReactRules=${typeof md?.createReactRules}`,
        `hasReactParserFor=${typeof md?.reactParserFor}`,
        `hasCodeBlockReact=${typeof md?.defaultRules?.codeBlock?.react}`,
      ].join("\n");
    },

    onLoad() {
      try {
        api.patch();
      } catch (e) {
        api.lastError = e?.stack || e?.message || String(e);
        console.error("[Nova Markdown Blocks] load failed", e);
      }
      console.log("[Nova Markdown Blocks]", api.lastResult);
    },

    onUnload() {
      api.restore();
      console.log("[Nova Markdown Blocks] restored");
    },

    start() { return api.onLoad(); },
    stop() { return api.onUnload(); },

    Settings() {
      const { React, RN } = modules();
      if (!React || !RN?.View || !RN?.Text) return null;
      const s = styles(RN);
      return React.createElement(
        RN.View,
        { style: s.settingsRoot },
        React.createElement(RN.Text, { style: s.settingsTitle }, "Nova Markdown Blocks"),
        React.createElement(RN.Text, { style: s.settingsText }, api.debug()),
      );
    },
  };

  try { root().__NovaMarkdownBlocks = api; } catch (_) {}
  return api;
})();

try { if (typeof module !== "undefined") module.exports = NovaMarkdownBlocks; } catch (_) {}
try { if (typeof exports !== "undefined") exports.default = NovaMarkdownBlocks; } catch (_) {}
NovaMarkdownBlocks;
