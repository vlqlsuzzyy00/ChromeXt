if (typeof Symbol.ChromeXt == "undefined") {
  const globalKeys = Object.keys(window);
  // Drop user-defined keys in the global context
  globalKeys.push(...Object.keys(EventTarget.prototype));

  const ArrayKeys = Object.getOwnPropertyNames(Array.prototype);
  const EventTargetKeys = Object.getOwnPropertyNames(EventTarget.prototype);
  const ChromeXtTargetKeys = ["commands", "cspRules", "filters", "scripts"];
  let unlock;

  const backup = {
    // Store some variables to avoid being hooked
    Error: TypeError,
    Event: CustomEvent,
    confirm: confirm.bind(window),
    parse: JSON.parse.bind(JSON),
    replace: String.prototype.replace,
    stringify: JSON.stringify.bind(JSON),
    REGEX: /\n {4}[^\n]+/,
  };

  const cachedTypes = {
	// Caching polices created by trustedTypes
    polices: new Set(),
    bypass: false,
    Error: class extends TypeError {
      constructor(name) {
        const msg =
          "Failed to execute 'createHTML' on 'TrustedTypePolicy': " +
          `Policy ${name}'s TrustedTypePolicyOptions did not specify a 'createHTML' member.`;
        super(msg);
        this.stack = backup.replace.apply(this.stack, [backup.REGEX, ""]);
      }
    },
  };

  trustedTypes.createPolicy = new Proxy(trustedTypes.createPolicy, {
    apply(target, thisArg, args) {
      const policyOptions = args[1] || {};
      const original = policyOptions.createHTML;
      function createHTML() {
        if (cachedTypes.bypass) {
          return arguments[0];
        } else {
          if (typeof original == "function") {
            return original.apply(policyOptions, arguments);
          } else {
            throw new cachedTypes.Error(args[0]);
          }
        }
      }

      args[1] = new Proxy(policyOptions, {
        get(_target, prop) {
          if (prop == "createHTML") return createHTML;
          return Reflect.get(...arguments);
        },
      });
      const result = target.apply(thisArg, args);
      cachedTypes.polices.add(result);
      return result;
    },
  });

  class SyncArray extends Array {
    #freeze;
    #key = null;
    #name;
    #sync;

    constructor(name, sync = true, freeze = false) {
      super();
      this.#name = name;
      this.#sync = sync;
      this.#freeze = freeze;

      ArrayKeys.forEach((m) => {
        if (typeof this[m] != "function") return;
        Object.defineProperty(this, m, {
          value: (...args) => {
            return this.#verify(args, m);
          },
        });
      });

      Object.defineProperty(this, "sync", {
        value: (data = this, ChromeXt = this.#key || ChromeXt) => {
          this.#key = null;
          if (this.#sync && typeof this.#name == "string") {
            const payload = {
              origin: window.location.origin,
              name: this.#name,
            };
            if (typeof data == "object" && Array.isArray(data)) {
              if (this.#freeze) data = data.filter((it) => Object.isFrozen(it));
              data = [...new Set(data)];
              if (data.length > 0) payload.data = data;
            }
            ChromeXt.dispatch("syncData", payload);
          }
        },
      });
    }

    /** @param {ChromeXtTarget} key */
    set ChromeXt(key) {
      this.#key = key;
      setTimeout(() => {
        this.#key = null;
      });
    }

    #verify(args, method) {
      if (this.#freeze) {
        let n = 0;
        if (method == "push") {
          n = args.length;
        } else if (method == "fill") {
          n = 1;
        }
        for (let i = 0; i < n; i++) {
          if (!Object.isFrozen(args[i]))
            throw new Error(`Element ${args[i]} is not frozen`);
        }
      }
      const result = super[method].apply(this, args);
      if (
        this.#key instanceof ChromeXtTarget &&
        !this.#key.isLocked() &&
        ["pop", "push", "fill", "splice"].includes(method)
      )
        this.sync();
      return result;
    }
  }

  class ChromeXtTarget {
    #debug;
    #key = null;
    #security;
    #target;

    #commands;
    #cspRules;
    #filters;
    #scripts;

    constructor(debug, target, security) {
      this.#check(security);
      if (typeof debug == "function" && target instanceof EventTarget) {
        this.#debug = debug;
        this.#target = target;
      } else {
        this.#target = new EventTarget();
        this.#debug = console.debug.bind(console);
      }

      EventTargetKeys.forEach((m) => {
        Object.defineProperty(this, m, {
          value: (...args) => {
            if (this.isLocked()) throw new Error("ChromeXt locked");
            return this.#target[m].apply(this.#target, args);
          },
        });
      });
      ChromeXtTargetKeys.forEach((p) => {
        const v = new SyncArray(
          p,
          p != "scripts" && p != "commands",
          p == "scripts"
        );
        this.#factory(p, v);
        Object.defineProperty(this, p, {
          set(v) {
            if (typeof unlock == "symbol" && v.ChromeXt[unlock] == ChromeXt) {
              this.#factory(p, v);
              return true;
            } else {
              throw Error(`Illegal access to the setter of ${p}`);
            }
          },
          get() {
            if (!this.isLocked()) {
              return this.#factory(p);
            } else {
              return [];
            }
          },
        });
      });
    }

    get globalKeys() {
      return globalKeys;
    }
    get trustedTypes() {
      return cachedTypes;
    }

    #blockConsole() {
      if (this.#security == "secure" || backup.debug !== undefined) return;
      const parse = backup.parse;
      backup.debug = console.debug;
      console.debug = new Proxy(this.#debug, {
        apply(_target, _this, argumentsList) {
          try {
            const data = parse(argumentsList.join(""));
            if ("action" in data) {
              console.warn("ChromeXt is under attack");
            } else {
              throw Error("Valid arguments");
            }
          } catch {
            Reflect.apply(...arguments);
          }
        },
      });
    }
    #check(security) {
      this.#security = security || "secure";
      if (this.#security == "secure") return;
      if (
        location.protocol.startsWith("http") &&
        location.pathname.endsWith(".user.js")
      ) {
        this.#security = "userscript";
        this.#blockConsole();
        fetch(location.href, { cache: "only-if-cached", mode: "same-origin" })
          .then((res) => {
            if (res.headers.get("Content-Type").startsWith("text/javascript")) {
              this.#security = "secure";
            } else {
              this.#setDanger();
            }
          })
          .catch(() => this.#setDanger());
      }
    }
    #confirmAction(action) {
      const msg = [
        "Current environment is insecure for ChromeXt.",
        `Please confirm (each time) to trust current page for the action: ${action}.`,
        "\n",
        "See details in https://github.com/JingMatrix/ChromeXt/issues/100.",
      ];
      return this.backup.confirm(msg.join("\n"));
    }
    #factory(p, v) {
      // Set or get private properties
      switch (p) {
        case "commands":
          if (v) this.#commands = v;
          return this.#commands;
        case "cspRules":
          if (v) this.#cspRules = v;
          return this.#cspRules;
        case "filters":
          if (v) this.#filters = v;
          return this.#filters;
        case "scripts":
          if (v) this.#scripts = v;
          return this.#scripts;
      }
      throw new Error(`Invalid field #${key}`);
    }
    #setDanger() {
      if (this.#security == "secure") return;
      console.warn(
        "Domain",
        location.host,
        "is dangerous for ChromeXt with security level",
        this.#security
      );
      this.#security = "danger";
    }

    dispatch(action, payload, key) {
      const error = new backup.Error(
        `ChromeXt called with security: ${this.#security}`
      );
      if (this.#security == "danger") throw error;
      let allowed = false;
      if (this.#security != "secure") {
        allowed = this.#confirmAction(action);
        if (!allowed) throw error;
      }
      if (this.isLocked() && key != this.#key)
        throw new Error("ChromeXt locked");
      if (typeof unlock == "symbol") key = Number(unlock.description);
      // Kotlin anchor
      this.#debug(backup.stringify({ action, payload, key }));
    }
    isLocked() {
      return this.#key != null;
    }
    lock(key, name) {
      if (
        !this.isLocked() &&
        name.length > 16 &&
        typeof key == "number" &&
        typeof unlock != "symbol"
      ) {
        this.#key = key;
        unlock = Symbol(key);
        delete Symbol.ChromeXt;
        Symbol = new Proxy(Symbol, {
          get(_target, prop) {
            if (prop == name) {
              return ChromeXt;
            } else {
              return Reflect.get(...arguments);
            }
          },
        });
        if (typeof userDefinedChromeXt != "undefined") {
          Symbol.ChromeXt = userDefinedChromeXt;
        }
        this.#security = "secure";
        if (typeof backup.debug == "function") console.debug = backup.debug;
      }
    }
    protect() {
      if (this.#security != "secure" && this.#security != "danger") {
        this.#security = "insecure";
      }
    }
    post(event, detail) {
      this.dispatchEvent(new backup.Event(event, { detail }));
    }
    unlock(key, apiOnly = true) {
      if (!this.isLocked()) {
        if (!["content://", "file://"].includes(location.origin))
          throw Error("ChromeXt is not locked");
        return this;
      }
      if (this.#key == key) {
        const UnLocked = new ChromeXtTarget(this.#debug, this.#target);
        if (!apiOnly) {
          UnLocked[unlock] = ChromeXt;
          ChromeXtTargetKeys.forEach((k) => {
            UnLocked[k] = new Proxy(this.#factory(k), {
              get(target, prop) {
                if (prop == "ChromeXt") return UnLocked;
                const value = target[prop];
                if (typeof value == "function") {
                  target.ChromeXt = UnLocked;
                }
                return Reflect.get(...arguments);
              },
            });
          });
        }
        return UnLocked;
      } else {
        throw new Error("Fail to unlock ChromeXtTarget");
      }
    }
  }

  const ChromeXt = new ChromeXtTarget();
  const userDefinedChromeXt = Symbol.ChromeXt;
  Object.freeze(ChromeXt);
  Symbol.ChromeXt = ChromeXt;
} else {
  throw Error("ChromeXt is already defined, cancel initialization");
}
// Kotlin separator

try {
  if (eruda._isInit) {
    eruda.hide();
    eruda.destroy();
  } else {
    eruda.init();
    eruda.show();
  }
} catch (e) {
  if (typeof define == "function") define.amd = false;
  Symbol.ChromeXt.unlock(ChromeXtUnlockKeyForEruda).dispatch("loadEruda");
}
// Kotlin separator

if (Symbol.ChromeXt.cspRules.length > 0) {
  Symbol.ChromeXt.cspRules.forEach((rule) => {
    if (rule.length == 0) return;
    // Skip empty cspRules
    const meta = document.createElement("meta");
    meta.setAttribute("http-equiv", "Content-Security-Policy");
    meta.setAttribute("content", rule);
    try {
      document.head.append(meta);
    } catch {
      setTimeout(() => {
        document.head.append(meta);
      }, 0);
    }
  });
}
// Kotlin separator

if (Symbol.ChromeXt.filters.length > 0) {
  const filter = Symbol.ChromeXt.filters.join(", ");
  let GM_addStyle = (css) => {
    const style = document.createElement("style");
    style.textContent = css;
    if (document.head) {
      document.head.appendChild(style);
    } else {
      setTimeout(() => document.head.appendChild(style));
    }
  };
  GM_addStyle(filter + " {display: none !important;}");
  window.addEventListener("load", () => {
    document.querySelectorAll(filter).forEach((node) => {
      node.hidden = true;
      node.style.display = "none";
    });
  });
  const amp = "amp-ad,amp-embed,amp-sticky-ad,amp-analytics,amp-auto-ads";
  document.querySelectorAll(amp).forEach((node) => node.remove());
}
