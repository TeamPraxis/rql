/**
 * This module provides RQL parsing. For example:
 * var parsed = require("./parser").parse("b=3&le(c,5)");
 */
const contains = require('./util/contains');
const converters = require('./converters');
const { Query } = require('./query');

const operatorMap = {
	"=": "eq",
	"==": "eq",
	">": "gt",
	">=": "ge",
	"<": "lt",
	"<=": "le",
	"!=": "ne"
};

// exported to be configurable
exports.primaryKeyName = 'id';
exports.lastSeen = ['sort', 'select', 'values', 'limit'];
exports.jsonQueryCompatible = true;

const stringToValue = (string, parameters) => {
	let converter = converters.default;
	if(string.charAt(0) === "$"){
		const param_index = parseInt(string.substring(1)) - 1;
		return param_index >= 0 && parameters ? parameters[param_index] : undefined;
	}
	if(string.indexOf(":") > -1){
		const parts = string.split(":");
		converter = converters[parts[0]];
		if(!converter){
			throw new URIError("Unknown converter " + parts[0]);
		}
		string = parts.slice(1).join(':');
	}
	return converter(string);
};

const parse = function (/*String|Object*/query, parameters) {
	if (typeof query === "undefined" || query === null)
		query = '';
	let term = new Query();
	const topTerm = term;
	topTerm.cache = {}; // room for lastSeen params
	const topTermName = topTerm.name;
	topTerm.name = '';
	if(typeof query === "object"){
		if(query instanceof Query){
			return query;
		}
		for(const i in query){
			term = new Query();
			topTerm.args.push(term);
			term.name = "eq";
			term.args = [i, query[i]];
		}
		return topTerm;
	}
	if(query.charAt(0) == "?"){
		throw new URIError("Query must not start with ?");
	}
	if(exports.jsonQueryCompatible){
		query = query.replace(/%3C=/g,"=le=").replace(/%3E=/g,"=ge=").replace(/%3C/g,"=lt=").replace(/%3E/g,"=gt=");
	}
	if(query.indexOf("/") > -1){ // performance guard
		// convert slash delimited text to arrays
		query = query.replace(/[+*$\-:\w%._]*\/[+*$\-:\w%._/]*/g, function(slashed){
			return "(" + slashed.replace(/\//g, ",") + ")";
		});
	}
	// convert FIQL to normalized call syntax form
	//                     <---------       property        -----------><------  operator -----><----------------   value ------------------>
	query = query.replace(/(\([+*$\-:\w%._,]+\)|[+*$\-:\w%._]*|)([<>!]?=(?:[\w]*=)?|>|<)(\([+*$\-:\w%._,]+\)|[+*$\-:\w%._]*|)/g, function(t, property, operator, value) {
		if(operator.length < 3){
			if(!operatorMap[operator]){
				throw new URIError("Illegal operator " + operator);
			}
			operator = operatorMap[operator];
		}
		else{
			operator = operator.substring(1, operator.length - 1);
		}
		return operator + '(' + property + "," + value + ")";
	});
	if(query.charAt(0)=="?"){
		query = query.substring(1);
	}
	//                           <-closedParan->|<-delim-- propertyOrValue -----(> |
	const leftoverCharacters = query.replace(/(\))|([&|,])?([+*$\-:\w%._]*)(\(?)/g,
		function(t, closedParan, delim, propertyOrValue, openParan){
			if(delim){
				if(delim === "&"){
					setConjunction("and");
				}
				if(delim === "|"){
					setConjunction("or");
				}
			}
			if(openParan){
				const newTerm = new Query();
				newTerm.name = propertyOrValue;
				newTerm.parent = term;
				call(newTerm);
			}
			else if(closedParan){
				const isArray = !term.name;
				term = term.parent;
				if(!term){
					throw new URIError("Closing paranthesis without an opening paranthesis");
				}
				if(isArray){
					term.args.push(term.args.pop().args);
				}
			}
			else if(propertyOrValue || delim === ','){
				term.args.push(stringToValue(propertyOrValue, parameters));

				// cache the last seen sort(), select(), values() and limit()
				if (contains(exports.lastSeen, term.name)) {
					topTerm.cache[term.name] = term.args;
				}
				// cache the last seen id equality
				if (term.name === 'eq' && term.args[0] === exports.primaryKeyName) {
					let id = term.args[1];
					if (id && !(id instanceof RegExp)) id = id.toString();
					topTerm.cache[exports.primaryKeyName] = id;
				}
			}
			return "";
		});
	if(term.parent){
		throw new URIError("Opening paranthesis without a closing paranthesis");
	}
	if(leftoverCharacters){
		// any extra characters left over from the replace indicates invalid syntax
		throw new URIError("Illegal character in query string encountered " + leftoverCharacters);
	}

	function call(newTerm){
		term.args.push(newTerm);
		term = newTerm;
		// cache the last seen sort(), select(), values() and limit()
		if (contains(exports.lastSeen, term.name)) {
			topTerm.cache[term.name] = term.args;
		}
	}
	function setConjunction(operator){
		if(!term.name){
			term.name = operator;
		}
		else if(term.name !== operator){
			throw new Error("Can not mix conjunctions within a group, use paranthesis around each set of same conjuctions (& and |)");
		}
	}
	const removeParentProperty = (obj) => {
		if(obj && obj.args){
			delete obj.parent;
			const args = obj.args;
			for (let i = 0, l = args.length; i < l; i++) {
				removeParentProperty(args[i]);
			}
		}
		return obj;
	};
	removeParentProperty(topTerm);
	if (!topTerm.name) {
		topTerm.name = topTermName;
	}
	return topTerm;
};

exports.parse = exports.parseQuery = parse;

/* dumps undesirable exceptions to Query().error */
exports.parseGently = function() {
	let terms;
	try {
		terms = parse.apply(this, arguments);
	} catch(err) {
		terms = new Query();
		terms.error = err.message;
	}
	return terms;
}
