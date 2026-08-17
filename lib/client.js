window.__ModuleLoader__.load({
	id: "dsh-wallpaper",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let React = require("react");

		/* ---------- 常量 ---------- */

		var LS_KEY = "dsh.wallpaper.v1";
		var OVERRIDE_SOURCE = "dsh-wallpaper";

		function defaultConfig() {
			return { enabled: true, current: "", shade: 42, glass: 50, fit: "cover" };
		}

		/* ---------- 配置 store（服务器持久化 + localStorage 兜底） ---------- */

		var store = {
			config: defaultConfig(),
			entries: [],
			listeners: new Set(),
			emit: function () {
				this.listeners.forEach(function (fn) { try { fn(); } catch (_) {} });
			},
			subscribe: function (fn) {
				this.listeners.add(fn);
				return function () { store.listeners.delete(fn); };
			},
			saveLocal: function () {
				try { localStorage.setItem(LS_KEY, JSON.stringify(this.config)); } catch (_) {}
			},
			saveRemote: function () {
				try {
					fetch("/wallpaper-api/config", {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify(this.config),
					}).catch(function () {});
				} catch (_) {}
			},
			set: function (patch) {
				Object.assign(this.config, patch);
				this.saveLocal();
				this.saveRemote();
				this.emit();
			},
			loadLocal: function () {
				try {
					var raw = localStorage.getItem(LS_KEY);
					if (raw) Object.assign(this.config, JSON.parse(raw));
				} catch (_) {}
			},
			loadRemote: function () {
				return fetch("/wallpaper-api/config")
					.then(function (res) { return res.ok ? res.json() : null; })
					.then(function (cfg) {
						if (cfg) Object.assign(store.config, cfg);
					})
					.catch(function () {});
			},
		};

		/* ---------- HTTP API ---------- */

		function api(pathname, options) {
			return fetch(pathname, options).then(function (res) {
				if (!res.ok) {
					return res.text().then(function (text) {
						var message = text;
						try {
							var parsed = JSON.parse(text);
							if (parsed && typeof parsed.error === "string") message = parsed.error;
						} catch (_) {}
						throw new Error(message || "HTTP " + res.status);
					});
				}
				return res.json();
			});
		}

		function apiList() { return api("/wallpaper-api/list"); }
		function apiScan() { return api("/wallpaper-api/scan-workshop"); }
		function apiUpload(file) {
			return api("/wallpaper-api/upload?name=" + encodeURIComponent(file.name), { method: "POST", body: file });
		}
		function apiImport(dir, file) {
			return api("/wallpaper-api/import", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ dir: dir, file: file }),
			});
		}
		function apiDelete(id) {
			return api("/wallpaper-api/delete", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ id: id }),
			});
		}
		function mediaUrl(id) { return "/wallpaper-media/" + encodeURIComponent(id); }

		/* ---------- 主题 token（面板透明度） ---------- */

		function buildTokens(glass01) {
			var g = Math.min(1, Math.max(0, glass01));
			var a = function (baseAlpha) { return 1 - (1 - baseAlpha) * g; };
			var w = function (baseAlpha) { return "rgba(255,255,255," + a(baseAlpha).toFixed(3) + ")"; };
			var b = function (r, gg, bb, baseAlpha) { return "rgba(" + r + "," + gg + "," + bb + "," + a(baseAlpha).toFixed(3) + ")"; };
			return {
				"--dsw-alias-bg-base": { light: "transparent", dark: "transparent" },
				"--dsw-alias-bg-layer-1": { light: w(0.60), dark: b(17, 26, 39, 0.58) },
				"--dsw-alias-bg-layer-2": { light: b(236, 242, 250, 0.50), dark: b(22, 33, 48, 0.52) },
				"--dsw-alias-bg-layer-3": { light: b(226, 235, 247, 0.45), dark: b(28, 42, 61, 0.48) },
				"--dsw-alias-bg-overlay": { light: b(220, 231, 244, 0.55), dark: b(34, 51, 74, 0.55) },
				"--dsw-alias-bg-module-platform": { light: w(0.55), dark: b(17, 26, 39, 0.55) },
				"--dsw-alias-bg-multi-select": { light: w(0.55), dark: b(22, 33, 48, 0.55) },
				"--dsw-specific-menu": { light: b(234, 241, 249, 0.55), dark: b(22, 33, 48, 0.55) },
				"--dsw-specific-selector": { light: b(234, 241, 249, 0.50), dark: b(28, 42, 61, 0.50) },
				"--dsw-specific-bubble": { light: b(240, 245, 252, 0.50), dark: b(18, 28, 42, 0.50) },
				"--dsw-specific-bubble-highlight": { light: b(220, 233, 251, 0.50), dark: b(26, 40, 58, 0.50) },
				"--dsw-specific-tip": { light: b(234, 241, 249, 0.55), dark: b(19, 29, 43, 0.55) },
				"--dsw-specific-input-major": { light: w(0.45), dark: b(16, 25, 39, 0.45) },
				"--dsw-specific-login-input": { light: b(240, 245, 251, 0.45), dark: b(13, 20, 31, 0.45) },
				"--dsw-specific-sidebar-fill": { light: "transparent", dark: "transparent" },
				"--dsw-alias-markdown-code-block": { light: b(240, 245, 251, 0.45), dark: b(13, 20, 31, 0.45) },
				"--dsw-alias-markdown-code-block-banner": { light: b(245, 248, 253, 0.50), dark: b(18, 27, 41, 0.50) },
				"--dsw-alias-markdown-inline-code": { light: b(228, 237, 248, 0.45), dark: b(23, 35, 52, 0.45) },
				"--dsw-alias-markdown-citation": { light: b(234, 241, 249, 0.50), dark: b(26, 37, 52, 0.50) },
				"--dsw-alias-markdown-tag": { light: b(228, 237, 248, 0.45), dark: b(22, 33, 48, 0.45) },
				"--dsw-alias-markdown-placeholder": { light: b(234, 241, 249, 0.50), dark: b(19, 29, 43, 0.50) },
				"--dsw-alias-toast-bg": { light: b(27, 50, 86, 0.85), dark: b(28, 42, 61, 0.85) },
				"--dsw-alias-tooltip-bg": { light: b(19, 36, 62, 0.88), dark: b(22, 33, 48, 0.88) },
			};
		}

		/* ---------- 壁纸层 ---------- */

		var kickDisposer = function () {};

		function removeBackdrop() {
			kickDisposer();
			kickDisposer = function () {};
			var nodes = document.querySelectorAll("[data-wp-backdrop]");
			for (var i = 0; i < nodes.length; i += 1) nodes[i].remove();
		}

		function renderBackdrop() {
			removeBackdrop();
			var cfg = store.config;
			if (!cfg.enabled) return;
			var entry = null;
			for (var i = 0; i < store.entries.length; i += 1) {
				if (store.entries[i].id === cfg.current) { entry = store.entries[i]; break; }
			}
			if (entry === null) return;
			var el;
			if (entry.kind === "video") {
				el = document.createElement("video");
				el.setAttribute("playsinline", "");
				el.muted = true;
				el.autoplay = true;
				el.loop = true;
				el.playsInline = true;
				var play = function () {
					var p = el.play();
					if (p !== undefined && typeof p.catch === "function") p.catch(function () {});
				};
				play();
				var kick = function () { play(); document.removeEventListener("pointerdown", kick); };
				document.addEventListener("pointerdown", kick);
				kickDisposer = function () { document.removeEventListener("pointerdown", kick); };
			} else {
				el = document.createElement("img");
				el.alt = "";
			}
			el.setAttribute("data-wp-backdrop", "media");
			el.setAttribute("aria-hidden", "true");
			el.src = mediaUrl(entry.id);
			Object.assign(el.style, {
				position: "fixed",
				inset: "0px",
				width: "100%",
				height: "100%",
				objectFit: cfg.fit,
				zIndex: "-1",
				pointerEvents: "none",
				backgroundColor: "#0b0e13",
			});
			document.body.appendChild(el);
			var shade = document.createElement("div");
			shade.setAttribute("data-wp-backdrop", "shade");
			shade.setAttribute("aria-hidden", "true");
			Object.assign(shade.style, {
				position: "fixed",
				inset: "0px",
				zIndex: "-1",
				pointerEvents: "none",
				background: "rgba(0, 0, 0, " + (cfg.shade / 100).toFixed(3) + ")",
			});
			document.body.appendChild(shade);
		}

		/* ---------- 启动：载入配置并应用 ---------- */

		function boot() {
			store.loadLocal();
			store.loadRemote().then(function () {
				store.emit();
				apiList().then(function (list) {
					store.entries = list;
					if (store.config.current === "" && list.length > 0) {
						store.set({ current: list[0].id });
					} else {
						store.emit();
					}
				}).catch(function () {});
			});
		}

		/* ---------- 设置页 UI ---------- */

		var ui = {
			page: { display: "flex", flexDirection: "column", gap: "16px", maxWidth: "560px", padding: "4px 0 24px 0" },
			group: { display: "flex", flexDirection: "column", gap: "10px" },
			row: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
			title: { fontSize: "13px", fontWeight: 600, margin: 0, color: "var(--dsw-alias-label-primary)" },
			hint: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", margin: 0 },
			label: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", minWidth: "64px" },
			button: {
				fontSize: "12px",
				padding: "5px 12px",
				borderRadius: "6px",
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-bg-layer-2)",
				color: "var(--dsw-alias-label-primary)",
				cursor: "pointer",
			},
			buttonActive: {
				fontSize: "12px",
				padding: "5px 12px",
				borderRadius: "6px",
				border: "1px solid var(--dsw-alias-state-business-primary)",
				background: "var(--dsw-alias-state-business-tertiary)",
				color: "var(--dsw-alias-label-primary)",
				cursor: "pointer",
				fontWeight: 600,
			},
			danger: {
				fontSize: "12px",
				padding: "5px 10px",
				borderRadius: "6px",
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "transparent",
				color: "var(--dsw-alias-label-secondary)",
				cursor: "pointer",
			},
			list: { display: "flex", flexDirection: "column", gap: "6px", maxHeight: "240px", overflowY: "auto" },
			item: {
				display: "flex",
				alignItems: "center",
				gap: "8px",
				padding: "7px 10px",
				borderRadius: "8px",
				border: "1px solid var(--dsw-alias-border-l2)",
				background: "var(--dsw-alias-bg-layer-2)",
			},
			itemName: {
				flex: "1",
				fontSize: "12px",
				color: "var(--dsw-alias-label-primary)",
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap",
			},
			itemMeta: { fontSize: "11px", color: "var(--dsw-alias-label-secondary)", whiteSpace: "nowrap" },
			error: { fontSize: "12px", color: "var(--dsw-alias-state-error-primary)", margin: 0 },
			busy: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", margin: 0 },
		};

		function fmtSize(n) {
			if (typeof n !== "number" || !isFinite(n)) return "";
			if (n > 1073741824) return (n / 1073741824).toFixed(1) + " GB";
			if (n > 1048576) return (n / 1048576).toFixed(1) + " MB";
			if (n > 1024) return Math.round(n / 1024) + " KB";
			return n + " B";
		}

		function h(type, props) {
			var children = [];
			for (var i = 2; i < arguments.length; i += 1) children.push(arguments[i]);
			if (children.length === 0) return React.createElement(type, props);
			return React.createElement.apply(null, [type, props].concat(children));
		}

		function Slider(props) {
			return h(
				"div",
				{ style: { display: "flex", alignItems: "center", gap: "10px" } },
				h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", minWidth: "88px" } }, props.label),
				h("input", {
					type: "range",
					min: props.min,
					max: props.max,
					step: 1,
					value: props.value,
					style: { flex: "1" },
					onChange: function (e) { props.onChange(Number(e.target.value)); },
				}),
				h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", minWidth: "32px", textAlign: "right" } }, String(props.value)),
			);
		}

		function WallpaperSettings() {
			var [, force] = React.useReducer(function (x) { return x + 1; }, 0);
			var [entries, setEntries] = React.useState(store.entries.slice());
			var [scan, setScan] = React.useState(null);
			var [busy, setBusy] = React.useState("");
			var [error, setError] = React.useState("");
			var fileRef = React.useRef(null);

			React.useEffect(function () {
				return store.subscribe(function () { setEntries(store.entries.slice()); force(); });
			}, []);

			var refresh = React.useCallback(function () {
				apiList().then(function (list) {
					store.entries = list;
					setEntries(list.slice());
					if (store.config.current === "" && list.length > 0) {
						store.set({ current: list[0].id });
					} else {
						store.emit();
					}
				}).catch(function (err) {
					setError(String((err && err.message) || err));
				});
			}, []);
			React.useEffect(function () { refresh(); }, [refresh]);

			var cfg = store.config;
			var current = null;
			for (var i = 0; i < entries.length; i += 1) {
				if (entries[i].id === cfg.current) { current = entries[i]; break; }
			}

			var runBusy = function (text, promise, then) {
				setBusy(text);
				setError("");
				promise.then(function (result) { then(result); }).catch(function (err) {
					setError(String((err && err.message) || err));
				}).finally(function () { setBusy(""); });
			};

			var onUpload = function (e) {
				var file = e.target.files && e.target.files[0];
				e.target.value = "";
				if (!file) return;
				runBusy("上传中…", apiUpload(file), function (result) {
					refresh();
					if (result && result.entry) store.set({ current: result.entry.id });
				});
			};

			var onImport = function (dir, file) {
				runBusy("导入中…", apiImport(dir, file), function (result) {
					setScan(null);
					refresh();
					if (result && result.entry) store.set({ current: result.entry.id });
				});
			};

			var onDelete = function (id) {
				if (!window.confirm("删除该壁纸？")) return;
				runBusy("删除中…", apiDelete(id), function () {
					if (store.config.current === id) store.set({ current: "" });
					refresh();
				});
			};

			var onScan = function () {
				runBusy("扫描中…", apiScan(), function (result) {
					setScan(result && result.items ? result.items : []);
				});
			};

			var fitOptions = [
				{ id: "cover", label: "填充" },
				{ id: "contain", label: "适应" },
				{ id: "fill", label: "拉伸" },
			];

			return h(
				"div",
				{ style: ui.page },
				h("div", { style: ui.group },
					h("p", { style: ui.title }, "动态壁纸"),
					h("p", { style: ui.hint }, "本地视频 / 图片全屏壁纸；文件存于 ~/.dsh/wallpapers，设置自动保存，永久生效。"),
					h("div", { style: ui.row },
						h("button", {
							style: cfg.enabled ? ui.buttonActive : ui.button,
							onClick: function () { store.set({ enabled: !cfg.enabled }); },
						}, cfg.enabled ? "已开启" : "已关闭")),
				),
				current !== null && h("p", { style: ui.hint }, "当前：" + current.name + "（" + (current.kind === "video" ? "视频" : "图片") + " · " + fmtSize(current.size) + "）"),
				h("div", { style: ui.group },
					h("p", { style: ui.title }, "壁纸库"),
					entries.length === 0
						? h("p", { style: ui.hint }, "壁纸库为空——上传一个文件，或从 Wallpaper Engine 工坊导入。")
						: h("div", { style: ui.list },
							entries.map(function (entry) {
								var active = entry.id === cfg.current;
								return h(
									"div",
									{ key: entry.id, style: active ? Object.assign({}, ui.item, { borderColor: "var(--dsw-alias-state-business-primary)" }) : ui.item },
									h("span", { style: ui.itemName }, entry.name),
									h("span", { style: ui.itemMeta }, (entry.kind === "video" ? "视频" : "图片") + " · " + fmtSize(entry.size)),
									h("button", {
										style: active ? ui.buttonActive : ui.button,
										onClick: function () { store.set({ current: entry.id }); },
									}, active ? "使用中" : "使用"),
									h("button", { style: ui.danger, onClick: function () { onDelete(entry.id); } }, "删除"),
								);
							})),
					h("div", { style: ui.row },
						h("input", { ref: fileRef, type: "file", accept: "video/*,image/*", style: { display: "none" }, onChange: onUpload }),
						h("button", { style: ui.button, onClick: function () { if (fileRef.current) fileRef.current.click(); } }, "上传本地文件…"),
						h("button", { style: ui.button, onClick: onScan }, scan === null ? "扫描工坊…" : "重新扫描工坊…")),
				),
				scan !== null && h("div", { style: ui.group },
					h("p", { style: ui.title }, "Wallpaper Engine 工坊（" + scan.length + " 个媒体）"),
					scan.length === 0
						? h("p", { style: ui.hint }, "未找到媒体文件。")
						: h("div", { style: ui.list },
							scan.slice(0, 60).map(function (item) {
								return h(
									"div",
									{ key: item.dir + "/" + item.file, style: ui.item },
									h("span", { style: ui.itemName }, item.title + " · " + item.file),
									h("span", { style: ui.itemMeta }, fmtSize(item.size)),
									h("button", { style: ui.button, onClick: function () { onImport(item.dir, item.file); } }, "导入"),
								);
							})),
				),
				h("div", { style: ui.group },
					h("p", { style: ui.title }, "效果调节"),
					h(Slider, { label: "遮罩暗度", min: 0, max: 75, value: cfg.shade, onChange: function (v) { store.set({ shade: v }); } }),
					h(Slider, { label: "面板透明度", min: 0, max: 100, value: cfg.glass, onChange: function (v) { store.set({ glass: v }); } }),
					h("div", { style: ui.row },
						h("span", { style: { fontSize: "12px", color: "var(--dsw-alias-label-secondary)", minWidth: "88px" } }, "缩放模式"),
						fitOptions.map(function (opt) {
							return h("button", {
								key: opt.id,
								style: cfg.fit === opt.id ? ui.buttonActive : ui.button,
								onClick: function () { store.set({ fit: opt.id }); },
							}, opt.label);
						})),
				),
				busy !== "" && h("p", { style: ui.busy }, busy),
				error !== "" && h("p", { style: ui.error }, error),
			);
		}

		/* ---------- 插件主体 ---------- */

		const name = "wallpaper";
		const inject = ["slots", "theme"];

		function apply(ctx) {
			const theme = ctx.get("theme");
			const slots = ctx.get("slots");
			if (theme === undefined || slots === undefined) return;

			let disposeTokens = function () {};
			const applyTokens = () => {
				disposeTokens();
				disposeTokens = theme.overrideTokens(OVERRIDE_SOURCE, buildTokens(store.config.glass / 100));
			};

			ctx.effect(() => {
				const unsubscribe = store.subscribe(function () {
					applyTokens();
					renderBackdrop();
				});
				applyTokens();
				renderBackdrop();
				boot();
				return function () {
					unsubscribe();
					disposeTokens();
					removeBackdrop();
				};
			}, "wallpaper: backdrop lifecycle");

			slots.inject("settings.section", () => slots.register(
				{
					name: "settings.section",
					id: "wallpaper",
					order: 160,
					label: () => "动态壁纸",
					inject: () => ({}),
				},
				WallpaperSettings,
			));
		}

		exports.name = name;
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	}
});
