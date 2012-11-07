(function (global) {
	var prefixPrefix = "Jsonary";
	var prefixCounter = 0;
	function RenderContext(elementIdPrefix) {
		var thisContext = this;
		this.elementLookup = {};

		if (elementIdPrefix == undefined) {
			elementIdPrefix = prefixPrefix + "." + (prefixCounter++) + ".";
		}
		var elementIdCounter = 0;
		this.getElementId = function () {
			return elementIdPrefix + (elementIdCounter++);
		};

		var renderDepth = 0;
		this.enhancementData = {};

		Jsonary.registerChangeListener(function (patch, document) {
			patch.each(function (index, operation) {
				var dataObjects = document.affectedData(operation);
				for (var i = 0; i < dataObjects.length; i++) {
					thisContext.update(dataObjects[i], operation);
				}
			});
		});
		Jsonary.registerSchemaChangeListener(function (data, schemas) {
			var uniqueId = data.uniqueId;
			var elementIds = thisContext.elementLookup[uniqueId];
			for (var elementId in elementIds) {
				var element = document.getElementById(elementId);
				if (element == undefined) {
					delete elementIds[elementId];
					continue;
				}
				var uiState = thisContext.decodeUiState(element.getAttribute("jsonary-ui-starting-state"));
				thisContext.render(element, data, uiState);
			}
		});
	}
	RenderContext.prototype = {
		encodeUiState: function (uiState) {
			return JSON.stringify(uiState);
		},
		decodeUiState: function (uiStateString) {
			return JSON.parse(uiStateString);
		},
		htmlEscapeSingleQuote: function (str) {
			return str.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("'", "&#39;");
		},
		render: function (element, data, uiStartingState) {
			var thisContext = this;
			if (typeof data == "string") {
				Jsonary.getData(data, function (actualData) {
					thisContext.render(element, actualData, uiStartingState);
				});
				return;
			}
			if (typeof uiStartingState != "object") {
				uiStartingState = {};
			}
			element.setAttribute("jsonary-ui-starting-state", this.encodeUiState(uiStartingState));

			if (element.id == undefined || element.id == "") {
				element.id = this.getElementId();
			}
			var previousId = element.getAttribute("jsonary-data-id");
			if (this.previousId) {
				var index = this.elementLookup[previousId].indexOf(element.id);
				if (index >= 0) {
					this.elementLookup[previousId].splice(index, 1);
				}
			}
			var uniqueId = data.uniqueId;
			element.setAttribute("jsonary-data-id", uniqueId);
			if (this.elementLookup[uniqueId] == undefined) {
				this.elementLookup[uniqueId] = [];
			}
			this.elementLookup[uniqueId].push(element.id);
			var renderer = selectRenderer(data, uiStartingState);
			if (renderer != undefined) {
				element.setAttribute("jsonary-renderer-id", renderer.uniqueId);
				renderer.render(element, data, this, uiStartingState);
			} else {
				element.innerHTML = "NO RENDERER FOUND";
			}
		},
		renderHtml: function (data, uiState) {
			if (typeof uiState != "object") {
				uiState = {};
			}
			var startingStateString = this.encodeUiState(uiState);
			var renderer = selectRenderer(data, uiState);
			var innerHtml = renderer.renderHtml(data, this, uiState);
			var stateString = this.encodeUiState(uiState);
			var elementId = this.getElementId();
			this.addEnhancement(elementId, data);
			return '<span id="' + elementId + '" jsonary-renderer-id="' + renderer.uniqueId + '" jsonary-data-id="' + data.uniqueId + '" jsonary-ui-starting-state=\'' + this.htmlEscapeSingleQuote(startingStateString) + '\' jsonary-ui-state=\'' + this.htmlEscapeSingleQuote(stateString) + '\'>' + innerHtml + '</span>';
		},
		update: function (data, operation) {
			var uniqueId = data.uniqueId;
			var elementIds = this.elementLookup[uniqueId];
			for (var i = 0; i < elementIds.length; i++) {
				var element = document.getElementById(elementIds[i]);
				if (element == undefined) {
					elementIds.splice(i, 1);
					i--;
					continue;
				}
				var prevRendererId = element.getAttribute("jsonary-renderer-id");
				var prevUiState = this.decodeUiState(element.getAttribute("jsonary-ui-state"));
				var renderer = selectRenderer(data, prevNamespace);
				if (renderer == prevRenderer) {
					renderer.update(element, data, operation);
				} else {
					render(element, data, prevNamespace);
				}
			}
		},
		addEnhancement: function(elementId, data) {
			this.enhancementData[elementId] = data;
		},
		enhanceElement: function (element) {
			var data = this.enhancementData[element.id];
			if (data != undefined) {
				delete this.enhancementData[element.id];
				var renderer = lookupRenderer(element.getAttribute("jsonary-renderer-id"));
				var uiState = this.decodeUiState(element.getAttribute("jsonary-ui-state"));
				if (renderer != undefined) {
					renderer.enhance(element, data, this, uiState);
				}
			}
			for (var i = 0; i < element.childNodes.length; i++) {
				if (element.childNodes[i].nodeType == 1) {
					this.enhanceElement(element.childNodes[i]);
				}
			}
		}
	};
	var pageContext = new RenderContext();

	function render(element, data, uiStartingState) {
		pageContext.render(element, data, uiStartingState);
		return this;
	}
	function renderHtml(data, uiStartingState) {
		return pageContext.renderHtml(data, uiStartingState);
	}

	render.empty = function (element) {
		try {
			global.jQuery(element).empty();
		} catch (e) {
		}
		element.innerHTML = "";
	};
	
	/**********/

	var rendererIdCounter = 0;
	
	function Renderer(sourceObj) {
		this.renderFunction = sourceObj.render;
		this.renderHtmlFunction = sourceObj.renderHtml;
		this.updateFunction = sourceObj.update;
		this.filterFunction = sourceObj.filter;
		this.actionFunction = sourceObj.action;
		for (var key in sourceObj) {
			if (this[key] == undefined) {
				this[key] = sourceObj[key];
			}
		}
		this.uniqueId = rendererIdCounter++;
	}
	Renderer.prototype = {
		render: function (element, data, context, uiState) {
			if (element[0] != undefined) {
				element = element[0];
			}
			render.empty(element);
			element.innerHTML = this.renderHtml(data, context, uiState);
			this.renderFunction(element, data, context, uiState);
			context.enhanceElement(element);
			return this;
		},
		renderHtml: function (data, context, uiState) {
			var innerHtml = "";
			if (this.renderHtmlFunction != undefined) {
				innerHtml = this.renderHtmlFunction(data, context, uiState);
			}
			return innerHtml;
		},
		enhance: function (element, data, context, uiState) {
			this.renderFunction(element, data, context, uiState);
			return this;
		},
		update: function (element, data, operation) {
			if (this.updateFunction != undefined) {
				this.updateFunction(element, data, operation);
			} else {
				this.defaultUpdate(element, data, operation);
			}
			return this;
		},
		action: function (actionName, data) {
			this.actionFunction(actionName, data);
		},
		actionHtml: function (actionName, data, innerHtml) {
			var thisRenderer = this;
			var elementId = ELEMENT_ID_PREFIX + (elementIdCounter++);
			enhancementList.push(function () {
				var target = document.getElementById(elementId);
				target.onclick = function () {
					thisRenderer.action(actionName, data);
					return false;
				};
				target = null;
			});
			return '<span id="' + elementId + '">' + innerHtml + '</span>';
		},
		canRender: function (data, schemas, uiState) {
			if (this.filterFunction != undefined) {
				return this.filterFunction(data, schemas, uiState);
			}
			return true;
		},
		defaultUpdate: function (element, data, operation) {
			var redraw = false;
			var checkChildren = operation.action() != "replace";
			var pointerPath = data.pointerPath();
			if (operation.subjectEquals(pointerPath) || (checkChildren && operation.subjectChild(pointerPath) !== false)) {
				redraw = true;
			} else if (operation.target() != undefined) {
				if (operation.targetEquals(pointerPath) || (checkChildren && operation.targetChild(pointerPath) !== false)) {
					redraw = true;
				}
			}
			if (redraw) {
				this.render(element, data);
			}
		}
	}

	var rendererLookup = {};
	var rendererList = [];
	function register(obj) {
		var renderer = new Renderer(obj);
		rendererLookup[renderer.uniqueId] = renderer;
		rendererList.push(renderer);
	}
	render.register = register;
	
	function lookupRenderer(rendererId) {
		return rendererLookup[rendererId];
	}

	function selectRenderer(data, uiStartingState) {
		var schemas = data.schemas();
		for (var i = rendererList.length - 1; i >= 0; i--) {
			var renderer = rendererList[i];
			if (renderer.canRender(data, schemas, uiStartingState)) {
				return renderer;
			}
		}
	}

	if (typeof global.jQuery != "undefined") {
		var jQueryRender = function (data, uiStartingState) {
			var element = this[0];
			if (element != undefined) {
				render(element, data, uiStartingState);
			}
			return this;
		};
		Jsonary.extendData({
			$renderTo: function (query, namespace) {
				if (typeof query == "string") {
					query = jQuery(query);
				}
				var element = query[0];
				if (element != undefined) {
					render(element, this, namespace);
				}
			}
		});
		jQueryRender.register = function (jQueryObj) {
			if (jQueryObj.render != undefined) {
				var oldRender = jQueryObj.render;
				jQueryObj.render = function (element, data) {
					var query = $(element);
					oldRender.call(this, query, data);
				}
			}
			if (jQueryObj.update != undefined) {
				var oldUpdate = jQueryObj.update;
				jQueryObj.update = function (element, data, operation) {
					var query = $(element);
					oldUpdate.call(this, query, data, operation);
				}
			}
			render.register(jQueryObj);
		};
		jQueryRender.empty = function (query) {
			query.each(function (index, element) {
				render.empty(element);
			});
		};
		jQuery.fn.extend({renderJson: jQueryRender});
		jQuery.extend({renderJson: jQueryRender});
	}

	Jsonary.extend({
		render: render,
		renderHtml: renderHtml
	});
	Jsonary.extendData({
		renderTo: function (element, namespace) {
			render(element, this, namespace);
		}
	});
})(this);