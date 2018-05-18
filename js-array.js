/*
 * An implementation of RQL for JavaScript arrays. For example:
 * require("./js-array").query("a=3", {}, [{a:1},{a:3}]) -> [{a:3}]
 *
 */

const { parseQuery } = require('./parser');
const each = require('./util/each');
const contains = require('./util/contains');

const { stringify } = JSON;

let nextId = 1;
exports.jsOperatorMap = {
	'eq' : '===',
	'ne' : '!==',
	'le' : '<=',
	'ge' : '>=',
	'lt' : '<',
	'gt' : '>'
};

exports.operators = {
	sort() {
		const terms = [];
		for(let i = 0; i < arguments.length; i++){
			const sortAttribute = arguments[i];
			const firstChar = sortAttribute.charAt(0);
			const term = {attribute: sortAttribute, ascending: true};
			if (firstChar == "-" || firstChar == "+") {
				if (firstChar == "-") {
					term.ascending = false;
				}
				term.attribute = term.attribute.substring(1);
			}
			terms.push(term);
		}
		this.sort((a, b) => {
			for (let i = 0; i < terms.length; i++) {
				const term = terms[i];
				if (a[term.attribute] != b[term.attribute]) {
					return term.ascending == a[term.attribute] > b[term.attribute] ? 1 : -1;
				}
			}
			return 0;
		});
		return this;
	},
	match: filter(function(value, regex){
		return new RegExp(regex).test(value);
	}),
	"in": filter(function(value, values){
		return contains(values, value);
	}),
	out: filter(function(value, values){
		return !contains(values, value);
	}),
	contains: filter(function(array, value){
		if(typeof value == "function"){
			return array instanceof Array && each(array, function(v){
				return value.call([v]).length;
			});
		}
		else{
			return array instanceof Array && contains(array, value);
		}
	}),
	excludes: filter(function(array, value){
		if (typeof value == "function") {
			return !each(array, function(v){
				return value.call([v]).length;
			});
		} else {
			return !contains(array, value);
		}
	}),
	or() {
		const items = [];
		const idProperty = "__rqlId" + nextId++;
		try{
			for(let i = 0; i < arguments.length; i++){
				const group = arguments[i].call(this);
				for(let j = 0, l = group.length;j < l;j++){
					const item = group[j];
					// use marker to do a union in linear time.
					if(!item[idProperty]){
						item[idProperty] = true;
						items.push(item);
					}
				}
			}
		}finally{
			// cleanup markers
			for(let i = 0, l = items.length; i < l; i++){
				delete items[idProperty];
			}
		}
		return items;
	},
	and() {
		let items = this;
		// TODO: use condition property
		for(let i = 0; i < arguments.length; i++){
			items = arguments[i].call(items);
		}
		return items;
	},
	select() {
		const args = arguments;
		const argc = arguments.length;
		return each(this, function(object, emit){
			const selected = {};
			for(let i = 0; i < argc; i++){
				const propertyName = args[i];
				const value = evaluateProperty(object, propertyName);
				if(typeof value != "undefined"){
					selected[propertyName] = value;
				}
			}
			emit(selected);
		});
	},
	unselect() {
		const args = arguments;
		const argc = arguments.length;
		return each(this, function(object, emit){
			const selected = {};
			for (const i in object) if (object.hasOwnProperty(i)) {
				selected[i] = object[i];
			}
			for (let i = 0; i < argc; i++) {
				delete selected[args[i]];
			}
			emit(selected);
		});
	},
	values(first) {
		if(arguments.length == 1){
			return each(this, function(object, emit){
				emit(object[first]);
			});
		}
		const args = arguments;
		const argc = arguments.length;
		return each(this, function(object, emit){
			const selected = [];
			if (argc === 0) {
				for(const i in object) if (object.hasOwnProperty(i)) {
					selected.push(object[i]);
				}
			} else {
				for(let i = 0; i < argc; i++){
					const propertyName = args[i];
					selected.push(object[propertyName]);
				}
			}
			emit(selected);
		});
	},
	limit(limit, start, maxCount) {
		const totalCount = this.length;
		start = start || 0;
		const sliced = this.slice(start, start + limit);
		if(maxCount){
			sliced.start = start;
			sliced.end = start + sliced.length - 1;
			sliced.totalCount = Math.min(totalCount, typeof maxCount === "number" ? maxCount : Infinity);
		}
		return sliced;
	},
	distinct() {
		const primitives = {};
		const needCleaning = [];
		const newResults = this.filter(function(value){
			if(value && typeof value == "object"){
				if(!value.__found__){
					value.__found__ = function(){};// get ignored by JSON serialization
					needCleaning.push(value);
					return true;
				}
			}else{
				if(!primitives[value]){
					primitives[value] = true;
					return true;
				}
			}
		});
		needCleaning.forEach((object) => {
			delete object.__found__;
		});
		return newResults;
	},
	recurse(property) {
		// TODO: this needs to use lazy-array
		const newResults = [];
		const doRecurse = (value) => {
			if (value instanceof Array){
				value.forEach(doRecurse);
			} else {
				newResults.push(value);
				if (property) {
					value = value[property];
					if (value && typeof value == "object") {
						doRecurse(value);
					}
				} else {
					for (const i in value) {
						if(value[i] && typeof value[i] == "object"){
							doRecurse(value[i]);
						}
					}
				}
			}
		};
		doRecurse(this);
		return newResults;
	},
	aggregate() {
		const distinctives = [];
		const aggregates = [];
		for(let i = 0; i < arguments.length; i++){
			const arg = arguments[i];
			if(typeof arg === "function"){
				aggregates.push(arg);
			}else{
				distinctives.push(arg);
			}
		}
		const distinctObjects = {};
		const dl = distinctives.length;
		this.forEach((object) => {
			let key = "";
			for(let i = 0; i < dl;i++){
				key += '/' + object[distinctives[i]];
			}
			let arrayForKey = distinctObjects[key];
			if(!arrayForKey){
				arrayForKey = distinctObjects[key] = [];
			}
			arrayForKey.push(object);
		});
		const al = aggregates.length;
		const newResults = [];
		for (const key in distinctObjects) {
			const arrayForKey = distinctObjects[key];
			const newObject = {};
			for(let i = 0; i < dl; i++){
				const property = distinctives[i];
				newObject[property] = arrayForKey[0][property];
			}
			for(let i = 0; i < al; i++){
				const aggregate = aggregates[i];
				newObject[i] = aggregate.call(arrayForKey);
			}
			newResults.push(newObject);
		}
		return newResults;
	},
	between: filter(function(value, range){
		return value >= range[0] && value < range[1];
	}),
	sum: reducer(function(a, b){
		return a + b;
	}),
	mean(property) {
		return this.sum(property)/this.length;
	},
	max: reducer(function(a, b){
		return Math.max(a, b);
	}),
	min: reducer(function(a, b){
		return Math.min(a, b);
	}),
	count() {
		return this.length;
	},
	first() {
		return this[0];
	},
	one() {
		if(this.length > 1){
			throw new TypeError("More than one object found");
		}
		return this[0];
	}
};

exports.filter = filter;
function filter(condition) {
	// convert to boolean right now
	const filter = function (property, second){
		if(typeof second == "undefined"){
			second = property;
			property = undefined;
		}
		const filtered = [];
		for(let i = 0, length = this.length; i < length; i++){
			const item = this[i];
			if(condition(evaluateProperty(item, property), second)){
				filtered.push(item);
			}
		}
		return filtered;
	};
	filter.condition = condition;
	return filter;
}
function reducer(func) {
	return function(property) {
		let result = this[0];
		if(property){
			result = result && result[property];
			for(let i = 1, l = this.length; i < l; i++) {
				result = func(result, this[i][property]);
			}
		} else {
			for(let i = 1, l = this.length; i < l; i++) {
				result = func(result, this[i]);
			}
		}
		return result;
	}
}
exports.evaluateProperty = evaluateProperty;
function evaluateProperty(object, property){
	if(property instanceof Array){
		property.forEach((part) => {
			object = object[decodeURIComponent(part)];
		});
		return object;
	}else if(typeof property == "undefined"){
		return object;
	}else{
		return object[decodeURIComponent(property)];
	}
}

// exports.conditionEvaluator = function () {
//	let js = "";
//	const jsOperator = exports.jsOperatorMap[term.name];
//	if(jsOperator){
//		js += "(function(item){return item." + term[0] + jsOperator + "parameters[" + (index -1) + "][1];});";
//	}
//	else{
//		js += "operators['" + term.name + "']";
//	}
//	return eval(js);
// };

exports.executeQuery = function(query, options, target){
	return exports.query(query, options, target);
}
exports.query = query;
exports.missingOperator = function(operator){
	throw new Error("Operator " + operator + " is not defined");
}
function query(query, options = {}, target) {
	query = parseQuery(query, options.parameters);

	const t = function () {}
	t.prototype = exports.operators;
	const operators = new t();

	// inherit from exports.operators
	for(const i in options.operators){
		operators[i] = options.operators[i];
	}
	// used in stringified function below
	// eslint-disable-next-line
	function op(name){
		return operators[name]||exports.missingOperator(name);
	}
	function queryToJS(value){
		if(value && typeof value === "object" && !(value instanceof RegExp)){
			if(value instanceof Array){
				return '[' + each(value, function(value, emit){
					emit(queryToJS(value));
				}) + ']';
			}else{
				const jsOperator = exports.jsOperatorMap[value.name];
				if(jsOperator){
					// item['foo.bar'] ==> (item && item.foo && item.foo.bar && ...)
					const path = value.args[0];
					let target = value.args[1];
					let item;
					if (typeof target == "undefined"){
						item = "item";
						target = path;
					}else if(path instanceof Array){
						item = "item";
						const escaped = [];
						for(let i = 0;i < path.length; i++){
							escaped.push(stringify(path[i]));
							item +="&&item[" + escaped.join("][") + ']';
						}
					}else{
						item = "item&&item[" + stringify(path) + "]";
					}
					// use native Array.prototype.filter if available
					const condition = item + jsOperator + queryToJS(target);
					if (typeof Array.prototype.filter === 'function') {
						return "(function(){return this.filter(function(item){return " + condition + "})})";
						//???return "this.filter(function(item){return " + condition + "})";
					} else {
						return "(function(){var filtered = []; for(var i = 0, length = this.length; i < length; i++){var item = this[i];if(" + condition + "){filtered.push(item);}} return filtered;})";
					}
				}else{
					if (value instanceof Date){
						return value.valueOf();
					}
					return "(function(){return op('" + value.name + "').call(this" +
						(value && value.args && value.args.length > 0
							? (", " + each(value.args, function(value, emit){
								emit(queryToJS(value));
							}).join(","))
							: ""
						) +
						")})";
				}
			}
		} else {
			return typeof value === "string" ? stringify(value) : value;
		}
	}
	const evaluator = eval("(1&&function(target){return " + queryToJS(query) + ".call(target);})");
	return target ? evaluator(target) : evaluator;
}

exports.maxIterations = 10000;
