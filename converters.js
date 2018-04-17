const autoConverted = {
	"true": true,
	"false": false,
	"null": null,
	"undefined": undefined,
	"Infinity": Infinity,
	"-Infinity": -Infinity
};

const converters = {
	jsonQueryCompatible: true,
	auto(string) {
		if(autoConverted.hasOwnProperty(string)){
			return autoConverted[string];
		}
		const number = +string;
		if(isNaN(number) || number.toString() !== string){
			// var isoDate = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(x);
			// if (isoDate) {
			//	date = new Date(Date.UTC(+isoDate[1], +isoDate[2] - 1, +isoDate[3], +isoDate[4], +isoDate[5], +isoDate[6], +isoDate[7] || 0));
			// }
			string = decodeURIComponent(string);
			if(this.jsonQueryCompatible){
				if(string.charAt(0) == "'" && string.charAt(string.length-1) == "'"){
					return JSON.parse('"' + string.substring(1,string.length-1) + '"');
				}
			}
			return string;
		}
		return number;
	},
	number(x) {
		const number = +x;
		if(isNaN(number)){
			throw new URIError("Invalid number " + number);
		}
		return number;
	},
	epoch(x) {
		const date = new Date(+x);
		if (isNaN(date.getTime())) {
			throw new URIError("Invalid date " + x);
		}
		return date;
	},
	isodate(x) {
		// four-digit year
		let date = '0000'.substr(0,4-x.length)+x;
		// pattern for partial dates
		date += '0000-01-01T00:00:00Z'.substring(date.length);
		return this.date(date);
	},
	date(x) {
		const isoDate = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/.exec(x);
		let date;
		if (isoDate) {
			date = new Date(Date.UTC(+isoDate[1], +isoDate[2] - 1, +isoDate[3], +isoDate[4], +isoDate[5], +isoDate[6], +isoDate[7] || 0));
		}else{
			date = new Date(x);
		}
		if (isNaN(date.getTime())){
			throw new URIError("Invalid date " + x);
		}
		return date;
	},
	boolean(x) {
		return x === "true";
	},
	string(string) {
		return decodeURIComponent(string);
	},
	re(x) {
		return new RegExp(decodeURIComponent(x), 'i');
	},
	RE(x) {
		return new RegExp(decodeURIComponent(x));
	},
	glob(x) {
		let s = decodeURIComponent(x).replace(/([\\|||(|)|[|{|^|$|*|+|?|.|<|>])/g, function(x){return '\\'+x;}).replace(/\\\*/g,'.*').replace(/\\\?/g,'.?');
		if (s.substring(0,2) !== '.*') s = '^'+s; else s = s.substring(2);
		if (s.substring(s.length-2) !== '.*') s = s+'$'; else s = s.substring(0, s.length-2);
		return new RegExp(s, 'i');
	}
};

// exports.converters["default"] can be changed to a different converter if you want
// a different default converter, for example:
// RP = require("rql/parser");
// RP.converters["default"] = RQ.converter.string;
converters.default = converters.auto;

module.exports = converters;
