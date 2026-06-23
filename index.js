(() => {
  const PATCH_KEY = "__novaMarkdownBlocksV2";

  function getRoot() {
    if (typeof globalThis !== "undefined") return globalThis;
    if (typeof window !== "undefined") return window;
    return {};
  }

  function getMetro() {
    const root = getRoot();
    return (
      (typeof vendetta !== "undefined" && vendetta?.metro) ||
      root?.bunny?.metro ||
      root?.vendetta?.metro ||
      root?.kettu?.metro ||
      root?.revenge?.metro ||
      null
    );
  }

  function findByProps(metro, ...props) {
    try {
      return metro?.findByProps?.(...props) || null;
    } catch (_) {
      return null;
    }
  }

  function getModules() {
    const metro = getMetro();
    const md =
      findByProps(metro, "createReactRules", "reactParserFor", "parse") ||
      findByProps(metro, "parse", "parseTopic");
    const React =
      findByProps(metro, "createElement", "cloneElement") ||
      findByProps(metro, "createElement", "useState");
    const RN =
      findByProps(metro, "View", "Text", "StyleSheet") ||
      findByProps(metro, "Text", "View");
    return { metro, md, React, RN };
  }

  function normalizeLang(lang) {
    const value = String(lang || "").trim().toLowerCase();
    if (value === "info" || value === "note") return "info";
    if (value === "warn" || value === "warning") return "warn";
    if (value === "success" || value === "ok") return "success";
    return null;
  }

  function createStyles(RN) {
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
      warn: {
        backgroundColor: "#2b210b",
        borderColor: "#ffb84d",
      },
      success: {
        backgroundColor: "#09291c",
        borderColor: "#39d98a",
      },
      title: {
        color: "#7cc7ff",
        fontSize: 13,
        fontWeight: "700",
        marginBottom: 6,
      },
      warnTitle: {
        color: "#ffcf70",
      },
      successTitle: {
        color: "#6dffb2",
      },
      body: {
        color: "#e8eef7",
        fontSize: 14,
        lineHeight: 20,
      },
      settingsRoot: {
        padding: 16,
        gap: 8,
      },
      settingsTitle: {
        color: "#ffffff",
        fontSize: 18,
        fontWeight: "700",
      },
      settingsText: {
        color: "#c7d0dd",
        fontSize: 14,
        lineHeight: 20,
      },
    };

    try {
      return RN?.StyleSheet?.create ? RN.StyleSheet.create(raw) : raw;
    } catch (_) {
      return raw;
    }
  }

  function buildBoxFactory(React, RN) {
    const styles = createStyles(RN);

    return function makeBox(node, key) {
      const kind = normalizeLang(node?.lang);
      if (!kind) return null;

      const isWarn = kind === "warn";
      const isSuccess = kind === "success";
      const title = isWarn ? "Warning" : isSuccess ? "Success" : "Info";

      return React.createElement(
        RN.View,
        {
          key,
          style: [styles.box, isWarn && styles.warn, isSuccess && styles.success],
        },
        React.createElement(
          RN.Text,
          {
            style: [styles.title, isWarn && styles.warnTitle, isSuccess && styles.successTitle],
          },
          title,
        ),
        React.createElement(
          RN.Text,
          {
            style: styles.body,
          },
          String(node?.content || ""),
        ),
      );
    };
  }

  function patchMarkdown() {
    const { md, React, RN } = getModules();

    if (!md || !React || !RN?.View || !RN?.Text) {
      return {
        ok: false,
        reason: `Missing module md=${!!md} React=${!!React} RN=${!!RN}`,
      };
    }

    if (md[PATCH_KEY]?.loaded) {
      return { ok: true, reason: "Already patched" };
    }

    const makeBox = buildBoxFactory(React, RN);
    const store = {
      loaded: true,
      old: {},
      oldRuleReact: md.defaultRules?.codeBlock?.react,
      patchedRules: typeof WeakSet !== "undefined" ? new WeakSet() : null,
    };

    function patchRules(rules) {
      if (!rules || !rules.codeBlock || typeof rules.codeBlock.react !== "function") {
        return rules;
      }

      if (store.patchedRules?.has(rules)) return rules;

      const oldReact = rules.codeBlock.react;
      rules.codeBlock.react = function patchedCodeBlockReact(node, output, state) {
        const box = makeBox(node, state?.key);
        if (box) return box;
        return oldReact.call(this, node, output, state);
      };

      store.patchedRules?.add(rules);
      return rules;
    }

    function deepReplace(value) {
      if (Array.isArray(value)) return value.map(deepReplace);

      const node = value?.props?.node;
      if (node?.type === "codeBlock") {
        const box = makeBox(node, value?.key);
        if (box) return box;
      }

      const children = value?.props?.children;
      if (children && React.cloneElement) {
        const nextChildren = deepReplace(children);
        if (nextChildren !== children) {
          try {
            return React.cloneElement(value, value.props, nextChildren);
          } catch (_) {
            return value;
          }
        }
      }

      return value;
    }

    function wrap(name, wrapper) {
      if (typeof md[name] !== "function") return;
      if (!store.old[name]) store.old[name] = md[name];
      md[name] = wrapper(store.old[name]);
    }

    if (md.defaultRules?.codeBlock?.react && !store.oldRuleReact) {
      store.oldRuleReact = md.defaultRules.codeBlock.react;
    }

    if (md.defaultRules?.codeBlock?.react) {
      md.defaultRules.codeBlock.react = function patchedDefaultCodeBlockReact(node, output, state) {
        const box = makeBox(node, state?.key);
        if (box) return box;
        return store.oldRuleReact.call(this, node, output, state);
      };
    }

    wrap("createReactRules", (old) => function patchedCreateReactRules(...args) {
      const rules = old.apply(this, args);
      return patchRules(rules);
    });

    wrap("reactParserFor", (old) => function patchedReactParserFor(rules, ...rest) {
      patchRules(rules);
      const parser = old.call(this, rules, ...rest);
      if (typeof parser !== "function") return parser;
      return function patchedReactParser(...args) {
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
      wrap(name, (old) => function patchedParser(...args) {
        return deepReplace(old.apply(this, args));
      });
    });

    md[PATCH_KEY] = store;
    return { ok: true, reason: "Patched Markdown codeBlock renderer" };
  }

  function restoreMarkdown() {
    const { md } = getModules();
    const store = md?.[PATCH_KEY];
    if (!md || !store) return false;

    for (const [name, fn] of Object.entries(store.old || {})) {
      md[name] = fn;
    }

    if (md.defaultRules?.codeBlock && store.oldRuleReact) {
      md.defaultRules.codeBlock.react = store.oldRuleReact;
    }

    delete md[PATCH_KEY];
    return true;
  }

  function Settings() {
    const { React, RN } = getModules();
    if (!React || !RN?.View || !RN?.Text) return null;

    const styles = createStyles(RN);
    return React.createElement(
      RN.View,
      { style: styles.settingsRoot },
      React.createElement(RN.Text, { style: styles.settingsTitle }, "Nova Markdown Blocks"),
      React.createElement(
        RN.Text,
        { style: styles.settingsText },
        "Use ```info, ```warn, or ```success blocks to render local custom cards. Restart Discord after enabling if chat renderer was cached.",
      ),
    );
  }

  return {
    onLoad() {
      const result = patchMarkdown();
      console.log("[Nova Markdown Blocks]", result.reason);
    },

    onUnload() {
      restoreMarkdown();
      console.log("[Nova Markdown Blocks] restored");
    },

    start() {
      return this.onLoad();
    },

    stop() {
      return this.onUnload();
    },

    Settings,
  };
})()
