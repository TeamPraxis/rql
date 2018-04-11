function each (array, callback) {
	let emit;
	let result;
	if (callback.length > 1) {
		// can take a second param, emit
		result = [];
		emit = (value) => {
			result.push(value);
		};
	}
	for (let i = 0, l = array.length; i < l; i++) {
		if (callback(array[i], emit)) {
			return result || true;
		}
	}
	return result;
}

module.exports = each;
